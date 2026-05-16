"""ClinVar lookup via NCBI E-utilities."""

import asyncio
import os
import ssl
import time
from typing import Any
from urllib.parse import urlencode

import aiohttp
import certifi
import requests

from apis.ncbi_util import ncbi_params


def _ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=certifi.where())

BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"


def _rate_limited(status: int) -> bool:
    return status == 429


def _not_found(rsid: str) -> dict:
    return {
        "source": "ClinVar",
        "rsid": rsid,
        "clinical_significance": "not found",
        "condition": "n/a",
        "evidence_url": f"https://www.ncbi.nlm.nih.gov/clinvar/?term={rsid}",
    }


def _rate_limited_result(rsid: str) -> dict:
    return {
        "source": "ClinVar",
        "rsid": rsid,
        "clinical_significance": "rate limited",
        "condition": "retry later",
        "evidence_url": f"https://www.ncbi.nlm.nih.gov/clinvar/?term={rsid}",
    }


async def get_clinvar(rsid: str, session: aiohttp.ClientSession) -> dict:
    ssl_kwargs = {"ssl": _ssl_context()}
    try:
        search_url = BASE_URL + "esearch.fcgi?" + urlencode(
            ncbi_params({"db": "clinvar", "term": f"{rsid}[rs]", "retmode": "json"})
        )
        async with session.get(search_url, **ssl_kwargs) as resp:
            if _rate_limited(resp.status):
                return _rate_limited_result(rsid)
            if resp.status != 200:
                return _not_found(rsid)
            search_payload = await resp.json()

        uids = (search_payload.get("esearchresult") or {}).get("idlist") or []
        if not uids:
            return _not_found(rsid)

        await asyncio.sleep(1)

        uid = uids[0]
        summary_url = BASE_URL + "esummary.fcgi?" + urlencode(
            ncbi_params({"db": "clinvar", "id": uid, "retmode": "json"})
        )
        async with session.get(summary_url, **ssl_kwargs) as resp:
            if _rate_limited(resp.status):
                return _rate_limited_result(rsid)
            if resp.status != 200:
                return _not_found(rsid)
            summary_payload = await resp.json()

        result = (summary_payload.get("result") or {}).get(uid) or {}
        return {
            "source": "ClinVar",
            "rsid": rsid,
            "clinical_significance": _clinical_significance(result),
            "condition": _condition(result),
            "evidence_url": f"https://www.ncbi.nlm.nih.gov/clinvar/?term={rsid}",
        }
    except Exception:
        return {
            "source": "ClinVar",
            "rsid": rsid,
            "clinical_significance": "unknown",
            "condition": "n/a",
            "evidence_url": f"https://www.ncbi.nlm.nih.gov/clinvar/?term={rsid}",
        }


def _first_trait_name(result: dict) -> str:
    traits = result.get("trait_set") or []
    if not isinstance(traits, list):
        return ""
    for trait in traits:
        if isinstance(trait, dict) and trait.get("trait_name"):
            return str(trait["trait_name"])
    return ""


def _clinical_significance(result: dict) -> str:
    significance = result.get("clinical_significance")
    if isinstance(significance, dict):
        return str(significance.get("description") or "unknown")
    if significance:
        return str(significance)

    germline = result.get("germline_classification")
    if isinstance(germline, dict):
        return str(germline.get("description") or "unknown")
    if germline:
        return str(germline)

    return "unknown"


def _get_clinvar_http(rsid: str) -> dict:
    """One rsID via NCBI esearch + esummary (sync, ~2 HTTP round-trips)."""
    rs = rsid.strip()
    if not rs:
        return _not_found("")

    search_url = BASE_URL + "esearch.fcgi?" + urlencode(
        ncbi_params({"db": "clinvar", "term": f"{rs}[rs]", "retmode": "json"})
    )
    try:
        r = requests.get(search_url, timeout=35, verify=certifi.where())
        if _rate_limited(r.status_code):
            return _rate_limited_result(rs)
        if r.status_code != 200:
            return _not_found(rs)
        search_payload = r.json()
    except Exception:
        return {
            "source": "ClinVar",
            "rsid": rs,
            "clinical_significance": "unknown",
            "condition": "n/a",
            "evidence_url": f"https://www.ncbi.nlm.nih.gov/clinvar/?term={rs}",
        }

    uids = (search_payload.get("esearchresult") or {}).get("idlist") or []
    if not uids:
        return _not_found(rs)

    time.sleep(0.11)
    uid = uids[0]
    summary_url = BASE_URL + "esummary.fcgi?" + urlencode(
        ncbi_params({"db": "clinvar", "id": uid, "retmode": "json"})
    )
    try:
        r2 = requests.get(summary_url, timeout=35, verify=certifi.where())
        if _rate_limited(r2.status_code):
            return _rate_limited_result(rs)
        if r2.status_code != 200:
            return _not_found(rs)
        summary_payload = r2.json()
    except Exception:
        return {
            "source": "ClinVar",
            "rsid": rs,
            "clinical_significance": "unknown",
            "condition": "n/a",
            "evidence_url": f"https://www.ncbi.nlm.nih.gov/clinvar/?term={rs}",
        }

    result = (summary_payload.get("result") or {}).get(uid) or {}
    return {
        "source": "ClinVar",
        "rsid": rs,
        "clinical_significance": _clinical_significance(result),
        "condition": _condition(result),
        "evidence_url": f"https://www.ncbi.nlm.nih.gov/clinvar/?term={rs}",
    }


def fetch_clinvar(rsids: list[str] | str | None = None, **_kwargs: Any) -> dict[str, Any]:
    """
    Agent tool entrypoint — live NCBI ClinVar (no static lookup table).

    Returns ``{"variants": [...], "_meta": {source, status, detail}}``.
    """
    meta: dict[str, Any] = {"source": "ncbi_clinvar", "status": "ok", "detail": None}
    if not rsids:
        return {
            "variants": [],
            "_meta": {**meta, "status": "empty", "detail": "No rsids provided."},
        }
    seq = [rsids] if isinstance(rsids, str) else list(rsids)

    out: list[dict] = []
    errors: list[str] = []
    for raw in seq:
        rs = str(raw).strip()
        if not rs:
            continue
        try:
            row = _get_clinvar_http(rs)
            out.append(row)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{rs}:{exc}")
        time.sleep(0.11)

    if errors:
        meta["status"] = "partial" if out else "error"
        meta["detail"] = "; ".join(errors)[:800]
    if not out:
        meta["status"] = "empty" if not errors else meta["status"]
        meta["detail"] = meta.get("detail") or "No ClinVar variants returned."

    return {"variants": out, "_meta": meta}


def _condition(result: dict) -> str:
    if result.get("trait_name"):
        return str(result["trait_name"])

    significance = result.get("clinical_significance")
    if isinstance(significance, dict):
        trait = _first_trait_name(significance)
        if trait:
            return trait

    germline = result.get("germline_classification")
    if isinstance(germline, dict):
        trait = _first_trait_name(germline)
        if trait:
            return trait

    trait = _first_trait_name(result)
    return trait or "n/a"
