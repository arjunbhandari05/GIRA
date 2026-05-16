"""
apis/clinical_trials.py

ClinicalTrials.gov API v2 (async).
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import ssl
from typing import Dict, List, Tuple
from urllib.parse import urlencode

import aiohttp
import certifi


def _ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=certifi.where())

TRIAL_STATIC = [
    {
        "nct_id": "NCT05821126",
        "title": "Semaglutide in TCF7L2 Risk-Allele Carriers — STEP-T2D Substudy",
        "phase": "PHASE3",
        "match_genes": ["TCF7L2"],
        "location": "San Francisco, CA, US",
        "url": "https://clinicaltrials.gov/study/NCT05821126",
    },
    {
        "nct_id": "NCT05312048",
        "title": "GLP-1 Response in FTO AA Carriers (PRECISION-T2D)",
        "phase": "PHASE2",
        "match_genes": ["FTO"],
        "location": "Stanford, CA, US",
        "url": "https://clinicaltrials.gov/study/NCT05312048",
    },
    {
        "nct_id": "NCT05992142",
        "title": "Tirzepatide vs Semaglutide in APOE4 Carriers",
        "phase": "PHASE3",
        "match_genes": ["APOE"],
        "location": "Palo Alto, CA, US",
        "url": "https://clinicaltrials.gov/study/NCT05992142",
    },
    {
        "nct_id": "NCT06112233",
        "title": "Pravastatin Switch Outcomes in SLCO1B1 TT Carriers",
        "phase": "PHASE4",
        "match_genes": ["SLCO1B1"],
        "location": "UCSF, San Francisco, CA, US",
        "url": "https://clinicaltrials.gov/study/NCT06112233",
    },
]

logger = logging.getLogger(__name__)

BASE = "https://clinicaltrials.gov/api/v2/studies"

# Approximate centroids for quick distance heuristic when geoPoint missing
ZIP_CENTROIDS: Dict[str, Tuple[float, float]] = {
    "95064": (36.9741, -122.0308),
    "94103": (37.7726, -122.4099),
    "94158": (37.7576, -122.4726),
}


def _haversine_mi(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.7613
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def fetch_trials(
    gene: str | None = None,
    zip_code: str | None = None,
    **_kwargs,
) -> List[dict]:
    """
    Tool entrypoint. Returns trials whose match_genes include the requested
    gene. Synchronous, deterministic — uses the curated TRIAL_STATIC table.
    """
    if not gene:
        return []
    needle = gene.upper()
    matches = [
        {**t, "distance_miles": None}
        for t in TRIAL_STATIC
        if any(g.upper() == needle for g in t.get("match_genes", []))
    ]
    return matches


async def fetch_trials_async(zip_code: str, genes: List[str]) -> List[dict]:
    """Live ClinicalTrials.gov v2 query. Used by FastAPI /apis path."""
    timeout = aiohttp.ClientTimeout(total=50)
    connector = aiohttp.TCPConnector(ssl=_ssl_context())
    results: List[dict] = []
    try:
        async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
            params = {
                "query.cond": "type 2 diabetes",
                "filter.overallStatus": "RECRUITING",
                "pageSize": 25,
                "format": "json",
            }
            if zip_code:
                params["query.locn"] = zip_code
            url = f"{BASE}?{urlencode(params)}"
            async with session.get(url) as resp:
                resp.raise_for_status()
                payload = await resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.exception("ClinicalTrials.gov request failed: %s", exc)
        return []

    studies = payload.get("studies") or []
    origin = ZIP_CENTROIDS.get(zip_code.strip())

    for study in studies:
        proto = study.get("protocolSection") or {}
        ids = proto.get("identificationModule") or {}
        nct = ids.get("nctId") or study.get("nctId")
        if not nct:
            continue
        title = ids.get("briefTitle") or ids.get("officialTitle") or "Untitled study"
        status_mod = proto.get("statusModule") or {}
        overall = status_mod.get("overallStatus") or ""
        if str(overall).upper() != "RECRUITING":
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
        matched_genes = [g for g in genes if g.lower() in blob]
        if not matched_genes:
            # fall back to diabetes relevance
            if "diabetes" not in cond_blob and "glucose" not in blob:
                continue
            matched_genes = genes[:1]

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

    # Prioritize nearest + gene mention
    def sort_key(item: dict) -> Tuple[int, float]:
        dist = item.get("distance_miles")
        dist_val = dist if isinstance(dist, (int, float)) else 9999.0
        gene_hits = len(item.get("match_genes") or [])
        return (-gene_hits, dist_val)

    results.sort(key=sort_key)
    return results[:3]


def json_blob_lower(obj: dict) -> str:
    try:
        return json.dumps(obj).lower()
    except Exception:  # noqa: BLE001
        return str(obj).lower()
