"""
output/patient_summary.py

Plain-language summary for patients (≤300 words).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List


def _words(text: str) -> int:
    return len(re.findall(r"\w+", text))


def build_patient_summary(
    patient_name: str,
    safety_flags: List[Dict[str, Any]],
    wearable_note: str,
    snp_hints: List[str],
) -> str:
    """
    Deterministic, cautious copy — avoids raw rsIDs/genotypes in prose.
    """
    chunks: List[str] = [f"Hello {patient_name.split()[0] if patient_name else 'there'},"]

    if safety_flags:
        chunks.append(
            "Our scan found important genetic safety alerts that your care team should review before your visit. "
            "These alerts are based on standard pharmacist guidelines, not on guesses."
        )
        for flag in safety_flags[:3]:
            sev = flag.get("severity", "").lower()
            gene = flag.get("gene", "a key gene")
            if gene == "SLCO1B1":
                chunks.append(
                    "Your DNA pattern can make certain cholesterol medicines harder for your body to handle. "
                    "Your doctor may switch you to a gentler option or watch you more closely."
                )
            elif gene == "CYP2C19":
                chunks.append(
                    "Your DNA pattern can change how well a common blood thinner pill works for you. "
                    "Your doctor may pick a different medicine that fits your body better."
                )
            elif gene == "VKORC1":
                chunks.append(
                    "Your DNA pattern can make a common blood thinner extra strong for you. "
                    "Doses often need careful adjustment and extra INR checks."
                )
            else:
                chunks.append(
                    f"There is a {sev} alert related to {gene}. Please bring this up early in the appointment."
                )
    else:
        chunks.append(
            "We did not see the highest-priority genetic safety switches that GlycoAgent watches for on this panel."
        )

    if snp_hints:
        chunks.append(" ".join(snp_hints))

    chunks.append(
        f"Wearable summary: {wearable_note} "
        "This is supportive information only and does not diagnose low blood sugar by itself."
    )

    chunks.append("Bring this summary to your appointment")

    text = " ".join(chunks)
    words = _words(text)
    if words > 300:
        trimmed = text[:1800] + ("…" if len(text) > 1800 else "")
        # coarse trim to ~280 words
        tokens = trimmed.split()
        text = " ".join(tokens[:280])
        text += " Bring this summary to your appointment."
    return text


def build_patient_summary_from_context(ctx: Dict[str, Any]) -> str:
    patient = ctx.get("patient") or {}
    wearable = ctx.get("wearable") or {}
    flags = ctx.get("safety_flags") or []
    snps = ctx.get("snps") or {}

    hints: List[str] = []
    met = _meds_lower(patient.get("meds") or [])
    tcf = _gt(snps, "rs7903146")
    slc = _gt(snps, "rs622342")
    if "metformin" in met and tcf == "TT" and slc == "AA":
        hints.append(
            "For diabetes care, your genetic pattern suggests metformin may not work as well for you as it does for many people. "
            "Your doctor may discuss a different pill class (for example, a sulfonylurea) or a closer glucose check plan."
        )
        legacy_hrv = (wearable.get("legacy_trend") or {}).get("hrv")
        if legacy_hrv in {"flat", "down"}:
            hints.append(
                "Your wearable recovery line has been flat to drifting, which matches the story of reduced expected benefit from your current metformin dose."
            )
    elif "metformin" in met and tcf != "--" and slc != "--":
        if not flags and tcf != "TT" and slc != "AA":
            hints.append(
                "Your genes in the metformin pathway look typical, so continuing your current diabetes plan is reasonable "
                "if your blood sugars are on target and you feel well."
            )
        else:
            hints.append(
                "For diabetes care, your doctor can use your genetic and glucose information together to judge if metformin is the best fit."
            )

    if wearable.get("metrics", {}).get("hrv_ms", {}).get("trend") == "declining" and "metformin" in met and not (
        tcf == "TT" and slc == "AA"
    ):
        hints.append(
            "Your recovery signals from the past month look flat or drifting the wrong way, which matches the story above."
        )

    hypo = bool(wearable.get("hypoglycemia_signal"))
    note = "A watch flagged a pattern that can sometimes line up with stress or glucose swings." if hypo else "No special overnight alert pattern was flagged."

    return build_patient_summary(patient.get("name", ""), flags, note, hints)


def _meds_lower(meds: List[str]) -> str:
    return " ".join(m.lower() for m in meds)


def _gt(snps: Dict[str, Any], rsid: str) -> str:
    entry = snps.get(rsid) or {}
    g = entry.get("genotype") if isinstance(entry, dict) else None
    if not g or g == "--":
        return "--"
    return str(g).upper().replace(" ", "")
