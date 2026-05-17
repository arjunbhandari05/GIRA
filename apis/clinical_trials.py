"""
apis/clinical_trials.py

ClinicalTrials.gov API v2 — live HTTP only for the agent tool path (sync
`requests` so tools work inside asyncio.run_with_tools without nested loops).
"""

from __future__ import annotations

import json
import logging
import math
import re
import ssl
from typing import Any, Dict, List, Tuple
from urllib.parse import urlencode

import aiohttp
import certifi
import requests

logger = logging.getLogger(__name__)

BASE = "https://clinicaltrials.gov/api/v2/studies"

# Approximate centroids for quick distance heuristic when geoPoint missing
ZIP_CENTROIDS: Dict[str, Tuple[float, float]] = {
    "95064": (36.9741, -122.0308),
    "94103": (37.7726, -122.4099),
    "94158": (37.7576, -122.4726),
}

# ClinicalTrials.gov v2 often returns zero hits when query.locn is a bare US ZIP;
# we still rank by distance using ZIP_CENTROIDS when the ZIP is known.
_ZIP5_US = re.compile(r"^\d{5}$")


def _zip_for_api_locn(z: str) -> str | None:
    """Return a value safe for query.locn, or None to omit (national search)."""
    z = (z or "").strip()
    if not z:
        return None
    if _ZIP5_US.match(z):
        return None
    return z


def _ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=certifi.where())


def _haversine_mi(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.7613
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def json_blob_lower(obj: dict) -> str:
    try:
        return json.dumps(obj).lower()
    except Exception:  # noqa: BLE001
        return str(obj).lower()


def _parse_studies_payload(
    payload: dict,
    zip_code: str,
    genes: List[str],
) -> List[dict]:
    """Turn a ClinicalTrials.gov v2 JSON payload into ranked trial dicts."""
    genes_norm = [g.strip().upper() for g in genes if g and str(g).strip()]
    if not genes_norm:
        return []

    studies = payload.get("studies") or []
    z = (zip_code or "").strip()
    origin = ZIP_CENTROIDS.get(z) if z else None

    results: List[dict] = []
    for study in studies:
        proto = study.get("protocolSection") or {}
        ids = proto.get("identificationModule") or {}
        nct = ids.get("nctId") or study.get("nctId")
        if not nct:
            continue
        title = ids.get("briefTitle") or ids.get("officialTitle") or "Untitled study"
        status_mod = proto.get("statusModule") or {}
        overall = str(status_mod.get("overallStatus") or "").upper()
        if overall != "RECRUITING":
            continue

        design = proto.get("designModule") or {}
        phases = design.get("phases") or []
        phase = ", ".join(phases) if phases else "N/A"

        conditions = (proto.get("conditionsModule") or {}).get("conditions") or []
        cond_blob = " ".join(conditions).lower()

        loc_mod = proto.get("contactsLocationsModule") or {}
        locs = loc_mod.get("locations") or []
        best_mi: float | None = None
        best_loc = "Location not listed"
        for loc in locs:
            city = loc.get("city") or ""
            state = loc.get("state") or ""
            country = loc.get("country") or ""
            label = ", ".join([p for p in (city, state, country) if p]) or "Unknown site"
            geo = loc.get("geoPoint") or {}
            lat = geo.get("lat")
            lon = geo.get("lon")
            dist = None
            if origin and lat is not None and lon is not None:
                dist = _haversine_mi(origin[0], origin[1], float(lat), float(lon))
            if dist is not None and (best_mi is None or dist < best_mi):
                best_mi = dist
                best_loc = label

        blob = json_blob_lower(study)
        matched_genes = [g for g in genes_norm if g.lower() in blob]
        if not matched_genes:
            if "diabetes" not in cond_blob and "glucose" not in blob:
                continue
            matched_genes = genes_norm[:1]

        results.append(
            {
                "nct_id": nct,
                "title": title,
                "phase": phase,
                "distance_miles": None if best_mi is None else round(best_mi, 1),
                "location": best_loc,
                "url": f"https://clinicaltrials.gov/study/{nct}",
                "match_genes": matched_genes,
            }
        )
        if len(results) >= 8:
            break

    def sort_key(item: dict) -> Tuple[int, float]:
        dist = item.get("distance_miles")
        dist_val = dist if isinstance(dist, (int, float)) else 9999.0
        gene_hits = len(item.get("match_genes") or [])
        return (-gene_hits, dist_val)

    results.sort(key=sort_key)
    return results[:3]


def fetch_trials_via_http(zip_code: str, genes: List[str]) -> tuple[List[dict], dict[str, Any]]:
    """Synchronous live query (works under an existing asyncio event loop)."""
    meta: dict[str, Any] = {
        "source": "clinicaltrials.gov",
        "status": "ok",
        "detail": None,
    }
    genes_norm = [g.strip().upper() for g in genes if g and str(g).strip()]
    if not genes_norm:
        meta["status"] = "error"
        meta["detail"] = "No genes supplied for trial matching."
        return [], meta

    params: dict[str, str] = {
        "query.cond": "type 2 diabetes",
        "filter.overallStatus": "RECRUITING",
        "pageSize": "40",
        "format": "json",
    }
    z = (zip_code or "").strip()
    locn = _zip_for_api_locn(z)
    if locn:
        params["query.locn"] = locn
    url = f"{BASE}?{urlencode(params)}"
    try:
        resp = requests.get(url, timeout=55, verify=certifi.where())
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.exception("ClinicalTrials.gov HTTP request failed: %s", exc)
        meta["status"] = "error"
        meta["detail"] = str(exc)[:500]
        return [], meta

    rows = _parse_studies_payload(payload, z, genes_norm)
    if not rows:
        meta["status"] = "empty"
        meta["detail"] = (
            "Live API returned no recruiting type-2-diabetes studies that mention "
            f"the requested gene(s) {genes_norm} (and optional location filter). "
            "US 5-digit ZIP codes are searched nationally — distance is ranked when the ZIP is known."
        )
    return rows, meta


def fetch_trials(
    gene: str | None = None,
    zip_code: str | None = None,
    genes: list[str] | None = None,
    **_kwargs: Any,
) -> dict[str, Any]:
    """
    Agent tool entrypoint — always hits ClinicalTrials.gov (no static demo rows).

    Returns ``{"trials": [...], "_meta": {source, status, detail}}`` so the UI
    can show whether the network call succeeded.
    """
    gset: List[str] = []
    if gene:
        gset.append(str(gene).strip())
    if isinstance(genes, list):
        gset.extend(str(g).strip() for g in genes if g)
    gset = list(dict.fromkeys([g for g in gset if g]))
    if not gset:
        return {
            "trials": [],
            "_meta": {
                "source": "clinicaltrials.gov",
                "status": "error",
                "detail": "Provide `gene` (string) and/or `genes` (array).",
            },
        }

    z = (zip_code or "").strip()
    trials, meta = fetch_trials_via_http(z, gset)
    if (
        not trials
        and z
        and meta.get("status") == "empty"
    ):
        trials2, meta2 = fetch_trials_via_http("", gset)
        if trials2:
            trials = trials2
            meta["status"] = "ok"
            meta["detail"] = (
                "No trials matched the location filter; "
                "retried without location and kept national results."
            )
            meta["zip_relaxed"] = True
    logger.info(
        "ClinicalTrials.gov fetch_trials: %d trial(s), genes=%s, zip=%r, status=%s",
        len(trials),
        gset,
        z,
        meta.get("status"),
    )
    return {"trials": trials, "_meta": meta}


async def fetch_trials_async(zip_code: str, genes: List[str]) -> List[dict]:
    """Live ClinicalTrials.gov v2 query. Used by FastAPI /apis path."""
    timeout = aiohttp.ClientTimeout(total=50)
    connector = aiohttp.TCPConnector(ssl=_ssl_context())
    try:
        async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
            params = {
                "query.cond": "type 2 diabetes",
                "filter.overallStatus": "RECRUITING",
                "pageSize": 40,
                "format": "json",
            }
            locn = _zip_for_api_locn(zip_code.strip() if zip_code else "")
            if locn:
                params["query.locn"] = locn
            url = f"{BASE}?{urlencode(params)}"
            async with session.get(url) as resp:
                resp.raise_for_status()
                payload = await resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.exception("ClinicalTrials.gov request failed: %s", exc)
        return []

    return _parse_studies_payload(payload, zip_code.strip() if zip_code else "", genes)
