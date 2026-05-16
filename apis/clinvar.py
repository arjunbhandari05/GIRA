"""ClinVar lookup via NCBI E-utilities."""

import asyncio
import os
from urllib.parse import urlencode

import aiohttp

CLINVAR_STATIC = {
    "rs7903146": {"clinical_significance": "risk factor", "condition": "Type 2 diabetes mellitus susceptibility"},
    "rs622342": {"clinical_significance": "drug response", "condition": "Metformin response, transporter"},
    "rs5219": {"clinical_significance": "risk factor", "condition": "Type 2 diabetes / sulfonylurea response"},
    "rs1801282": {"clinical_significance": "drug response", "condition": "Thiazolidinedione response"},
    "rs757110": {"clinical_significance": "drug response", "condition": "Sulfonylurea response (ABCC8/SUR1)"},
    "rs9939609": {"clinical_significance": "risk factor", "condition": "Obesity / GLP-1 weight response"},
    "rs4149056": {"clinical_significance": "drug response", "condition": "Statin-induced myopathy susceptibility"},
    "rs429358": {"clinical_significance": "risk factor", "condition": "APOE4 cardiovascular disease risk"},
    "rs4244285": {"clinical_significance": "drug response", "condition": "Clopidogrel poor metabolizer (CYP2C19*2)"},
    "rs9923231": {"clinical_significance": "drug response", "condition": "Warfarin sensitivity (VKORC1)"},
}

BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"


def _params(extra: dict) -> dict:
    return {
        "email": os.getenv("NCBI_EMAIL", "glycoagent@example.com"),
        "tool": "glycoagent",
        **extra,
    }


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
    try:
        search_url = BASE_URL + "esearch.fcgi?" + urlencode(
            _params({"db": "clinvar", "term": f"{rsid}[rs]", "retmode": "json"})
        )
        async with session.get(search_url) as resp:
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
            _params({"db": "clinvar", "id": uid, "retmode": "json"})
        )
        async with session.get(summary_url) as resp:
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


def fetch_clinvar(rsids: list[str] | str | None = None, **_kwargs) -> list[dict]:
    """
    Tool entrypoint. Synchronous, no network — uses the curated table above
    so the agent loop is fast and deterministic. The async `get_clinvar` is
    still available for FastAPI's /apis path that hits NCBI live.
    """
    if not rsids:
        return []
    if isinstance(rsids, str):
        rsids = [rsids]
    out: list[dict] = []
    for rsid in rsids:
        rs = rsid.strip()
        if not rs:
            continue
        info = CLINVAR_STATIC.get(rs)
        if info:
            out.append(
                {
                    "source": "ClinVar",
                    "rsid": rs,
                    "clinical_significance": info["clinical_significance"],
                    "condition": info["condition"],
                    "evidence_url": f"https://www.ncbi.nlm.nih.gov/clinvar/?term={rs}",
                }
            )
        else:
            out.append(_not_found(rs))
    return out


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
