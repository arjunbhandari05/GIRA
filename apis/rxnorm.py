"""
apis/rxnorm.py

RxNav approximate match + pairwise interaction lookup.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple

import aiohttp

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


async def fetch_rxnorm(meds: List[str]) -> List[dict]:
    clean = [m.strip() for m in meds if m and m.strip()]
    if len(clean) < 1:
        return []

    timeout = aiohttp.ClientTimeout(total=40)
    resolved: Dict[str, Tuple[str, str]] = {}  # lower_name -> (original, rxcui)
    interactions: List[dict] = []

    async with aiohttp.ClientSession(timeout=timeout) as session:
        for med in clean:
            rxcui = await _resolve_rxcui(session, med)
            if rxcui:
                resolved[med.lower()] = (med, rxcui)

        names = list(resolved.keys())
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                a_name, a_cui = resolved[names[i]]
                b_name, b_cui = resolved[names[j]]
                pairs = await _pair_interactions(session, a_cui, b_cui, a_name, b_name)
                interactions.extend(pairs)

    interactions.sort(key=lambda row: SEVERITY_RANK.get(row["severity"], 9))
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
