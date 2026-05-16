"""
apis/rxnorm.py

RxNav approximate match + pairwise interaction lookup.

The async fetch_rxnorm_async preserves the live RxNav behavior used by
FastAPI's /apis route. The sync `fetch_rxnorm` below is the agent
entrypoint — it pairs current meds against the genotype to surface
genotype-driven contraindications without hitting the network.
"""

from __future__ import annotations

import asyncio
import logging
import ssl
from typing import Dict, List, Tuple

import aiohttp
import certifi


def _ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=certifi.where())

logger = logging.getLogger(__name__)

RXNAV = "https://rxnav.nlm.nih.gov/REST"

SEVERITY_RANK = {"contraindicated": 0, "serious": 1, "moderate": 2, "minor": 3}


def _normalize_severity(text: str) -> str:
    t = text.lower()
    if "contraindicated" in t or "contraindication" in t:
        return "contraindicated"
    if "serious" in t or "severe" in t or "major" in t:
        return "serious"
    if "moderate" in t:
        return "moderate"
    if "minor" in t or "mild" in t:
        return "minor"
    return "moderate"


GENOTYPE_FLAGS = {
    ("rs4149056", "TT"): {
        "drug_class": "statin",
        "severity": "contraindicated",
        "description": "SLCO1B1 TT — statin myopathy risk 16.9x. Switch to pravastatin or rosuvastatin.",
        "pmid": "18987363",
    },
    ("rs4244285", "AA"): {
        "drug_class": "clopidogrel",
        "severity": "contraindicated",
        "description": "CYP2C19 *2/*2 poor metabolizer — clopidogrel ineffective. Switch to prasugrel or ticagrelor.",
        "pmid": "19106084",
    },
    ("rs9923231", "AA"): {
        "drug_class": "warfarin",
        "severity": "serious",
        "description": "VKORC1 AA — reduce warfarin dose 25–50%, monitor INR closely.",
        "pmid": "17898316",
    },
    ("rs622342", "AA"): {
        "drug_class": "metformin",
        "severity": "moderate",
        "description": "SLC22A1 AA — OCT1 transport reduced ~50%; metformin response likely impaired.",
        "pmid": "21378095",
    },
}

DRUG_TO_RSID_CLASS = {
    "statin": [
        ("rs4149056", "TT"),
    ],
    "atorvastatin": [("rs4149056", "TT")],
    "rosuvastatin": [("rs4149056", "TT")],
    "simvastatin": [("rs4149056", "TT")],
    "clopidogrel": [("rs4244285", "AA")],
    "warfarin": [("rs9923231", "AA")],
    "metformin": [("rs622342", "AA")],
}


def _drug_class(med: str) -> str | None:
    lower = med.lower()
    for key in DRUG_TO_RSID_CLASS.keys():
        if key in lower:
            return key
    return None


def fetch_rxnorm(
    current_meds: List[str] | None = None,
    snp_profile: Dict[str, dict] | None = None,
    **_kwargs,
) -> List[dict]:
    """
    Tool entrypoint. Synchronous, deterministic. Cross-references the
    patient's current_meds against their genotype and returns any flagged
    interactions (genotype-driven contraindications) plus any pairwise
    drug interactions resolvable from RxNav (best-effort, network-optional).
    """
    meds = [m.strip() for m in (current_meds or []) if m and m.strip()]
    snp_profile = snp_profile or {}
    interactions: List[dict] = []

    for med in meds:
        klass = _drug_class(med)
        if not klass:
            continue
        for rsid, risk in DRUG_TO_RSID_CLASS.get(klass, []):
            genotype = (snp_profile.get(rsid) or {}).get("genotype")
            if genotype == risk:
                flag = GENOTYPE_FLAGS.get((rsid, risk), {}).copy()
                flag.update({"drug": med, "rsid": rsid, "genotype": genotype})
                interactions.append(flag)

    try:
        asyncio.get_running_loop()
        running_loop = True
    except RuntimeError:
        running_loop = False

    if not running_loop:
        try:
            live = asyncio.run(_fetch_rxnorm_async(meds))
            if live:
                interactions.extend(live)
        except Exception:
            pass

    interactions.sort(key=lambda row: SEVERITY_RANK.get(str(row.get("severity")), 9))
    return interactions


async def _fetch_rxnorm_async(meds: List[str]) -> List[dict]:
    clean = [m.strip() for m in meds if m and m.strip()]
    if len(clean) < 1:
        return []

    timeout = aiohttp.ClientTimeout(total=10)
    connector = aiohttp.TCPConnector(ssl=_ssl_context())
    resolved: Dict[str, Tuple[str, str]] = {}
    interactions: List[dict] = []

    try:
        async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
            for med in clean:
                rxcui = await _resolve_rxcui(session, med)
                if rxcui:
                    resolved[med.lower()] = (med, rxcui)

            names = list(resolved.keys())
            for i in range(len(names)):
                for j in range(i + 1, len(names)):
                    a_name, a_cui = resolved[names[i]]
                    b_name, b_cui = resolved[names[j]]
                    pairs = await _pair_interactions(
                        session, a_cui, b_cui, a_name, b_name
                    )
                    interactions.extend(pairs)
    except Exception:
        return interactions

    interactions.sort(key=lambda row: SEVERITY_RANK.get(row.get("severity", ""), 9))
    return interactions


async def _resolve_rxcui(session: aiohttp.ClientSession, med: str) -> str | None:
    try:
        url = f"{RXNAV}/rxcui/lookup.json?name={med}"
        async with session.get(url) as resp:
            if resp.status != 200:
                return None
            data = await resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("RxNorm resolve failed for %s: %s", med, exc)
        return None

    id_group = data.get("idGroup") or {}
    candidates = id_group.get("rxnormId") or []
    if isinstance(candidates, list) and candidates:
        return str(candidates[0])
    if isinstance(candidates, str):
        return candidates
    return None


async def _pair_interactions(
    session: aiohttp.ClientSession,
    rxcui_a: str,
    rxcui_b: str,
    drug_a: str,
    drug_b: str,
) -> List[dict]:
    """Try dedicated pairwise endpoint, then fall back to scanning A's interaction list."""
    out: List[dict] = []
    try:
        url = f"{RXNAV}/interaction/interaction.json?rxcui={rxcui_a}&rxcui={rxcui_b}"
        async with session.get(url) as resp:
            if resp.status == 200:
                data = await resp.json()
                parsed = _parse_interaction_payload(data, drug_a, drug_b)
                if parsed:
                    return parsed
    except Exception as exc:  # noqa: BLE001
        logger.debug("RxNorm pairwise endpoint failed (%s/%s): %s", drug_a, drug_b, exc)

    try:
        url = f"{RXNAV}/interaction/list.json?rxcui={rxcui_a}&sources=ONCHigh"
        async with session.get(url) as resp:
            if resp.status != 200:
                return out
            data = await resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.debug("RxNorm interaction list failed: %s", exc)
        return out

    types = data.get("fullInteractionTypeGroup") or {}
    blocks = types.get("fullInteractionType") or []
    if isinstance(blocks, dict):
        blocks = [blocks]
    needle = drug_b.lower()
    for block in blocks:
        pairs = block.get("interactionPair") or []
        if isinstance(pairs, dict):
            pairs = [pairs]
        for pair in pairs:
            desc = pair.get("description") or ""
            concepts = pair.get("interactionConcept") or []
            if isinstance(concepts, dict):
                concepts = [concepts]
            names = " ".join(
                str((c.get("minConceptItem") or {}).get("name") or "").lower() for c in concepts
            )
            if needle in names or needle in desc.lower():
                sev = _normalize_severity(str(desc) or "interaction")
                out.append(
                    {
                        "drug_a": drug_a,
                        "drug_b": drug_b,
                        "severity": sev,
                        "description": (desc or "Interaction listed in RxNav ONC High dataset.")[:800],
                    }
                )
    return out


def _parse_interaction_payload(data: dict, drug_a: str, drug_b: str) -> List[dict]:
    out: List[dict] = []
    group = data.get("interactionTypeGroup") or data.get("interactionTypeGroup")
    if isinstance(group, dict):
        blocks = group.get("interactionType") or []
    else:
        blocks = []
    if isinstance(blocks, dict):
        blocks = [blocks]
    for block in blocks:
        pairs = block.get("interactionPair") if isinstance(block, dict) else None
        if isinstance(pairs, dict):
            pairs = [pairs]
        for pair in pairs or []:
            desc = pair.get("description") or "Interaction noted in RxNav"
            sev = _normalize_severity(str(desc))
            out.append(
                {
                    "drug_a": drug_a,
                    "drug_b": drug_b,
                    "severity": sev,
                    "description": str(desc)[:800],
                }
            )
    return out
