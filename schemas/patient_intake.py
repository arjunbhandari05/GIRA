"""Patient intake form schema — medications, vitals, goals, lifestyle, comorbidities."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

GOAL_OPTIONS = [
    "Lose weight",
    "Maintain weight",
    "Reduce HbA1c",
    "Reduce cardiovascular risk",
    "Minimize injections",
    "Minimize pill burden",
    "Avoid hypoglycemia",
    "Improve energy",
    "Cost-conscious",
]

SIDE_EFFECT_OPTIONS = [
    "GI discomfort/nausea",
    "Muscle pain",
    "Fatigue",
    "Hypoglycemia",
    "Swelling",
    "UTIs",
    "Weight gain",
    "Headaches",
]

ACTIVITY_LEVELS = ("Sedentary", "Light", "Moderate", "Very Active")
DIET_OPTIONS = ("Standard", "Low-carb", "Mediterranean", "Vegetarian")
ALCOHOL_OPTIONS = ("None", "Occasional", "Regular", "Daily")
SMOKING_OPTIONS = ("Never", "Former", "Current")

COMORBIDITY_OPTIONS = [
    "Hypertension",
    "Obesity BMI>=30",
    "Heart disease",
    "Kidney disease",
    "Sleep apnea",
    "Liver disease",
    "Neuropathy",
    "Depression",
]

FAMILY_HISTORY_OPTIONS = [
    "Type 2 diabetes",
    "Heart attack/stroke",
    "Kidney disease",
    "Statin intolerance",
]


def empty_intake(patient_id: str, submitted_by: str = "clinician") -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "patientId": patient_id,
        "submittedAt": now,
        "submittedBy": submitted_by,
        "medications": [],
        "vitals": {
            "weight": "",
            "height": "",
            "bloodPressure": "",
            "fastingGlucose": "",
            "hba1c": "",
            "egfr": "",
        },
        "goals": [],
        "sideEffects": [],
        "lifestyle": {
            "activityLevel": "Light",
            "diet": "Standard",
            "alcohol": "None",
            "smoking": "Never",
            "sleepQuality": 5,
        },
        "comorbidities": [],
        "familyHistory": [],
        "clinicianNotes": "",
    }


def normalize_intake(raw: dict[str, Any] | None, patient_id: str) -> dict[str, Any]:
    """Coerce partial payloads into the canonical intake shape."""
    base = empty_intake(patient_id)
    if not isinstance(raw, dict):
        return base

    base["patientId"] = str(raw.get("patientId") or patient_id)
    base["submittedAt"] = raw.get("submittedAt") or base["submittedAt"]
    base["submittedBy"] = str(raw.get("submittedBy") or base["submittedBy"])

    meds_in = raw.get("medications") or []
    meds_out = []
    if isinstance(meds_in, list):
        for i, m in enumerate(meds_in):
            if not isinstance(m, dict):
                continue
            name = str(m.get("name") or "").strip()
            if not name:
                continue
            meds_out.append(
                {
                    "id": str(m.get("id") or f"med-{i}-{uuid.uuid4().hex[:6]}"),
                    "name": name,
                    "dose": str(m.get("dose") or "").strip(),
                    "frequency": str(m.get("frequency") or "").strip(),
                }
            )
    base["medications"] = meds_out

    vitals = raw.get("vitals") if isinstance(raw.get("vitals"), dict) else {}
    for key in base["vitals"]:
        base["vitals"][key] = str(vitals.get(key) or "").strip()

    base["goals"] = _filter_options(raw.get("goals"), GOAL_OPTIONS)
    base["sideEffects"] = _filter_options(raw.get("sideEffects"), SIDE_EFFECT_OPTIONS)
    base["comorbidities"] = _filter_options(raw.get("comorbidities"), COMORBIDITY_OPTIONS)
    base["familyHistory"] = _filter_options(raw.get("familyHistory"), FAMILY_HISTORY_OPTIONS)
    base["clinicianNotes"] = str(raw.get("clinicianNotes") or "").strip()

    life = raw.get("lifestyle") if isinstance(raw.get("lifestyle"), dict) else {}
    base["lifestyle"]["activityLevel"] = (
        life.get("activityLevel") if life.get("activityLevel") in ACTIVITY_LEVELS else "Light"
    )
    base["lifestyle"]["diet"] = (
        life.get("diet") if life.get("diet") in DIET_OPTIONS else "Standard"
    )
    base["lifestyle"]["alcohol"] = (
        life.get("alcohol") if life.get("alcohol") in ALCOHOL_OPTIONS else "None"
    )
    base["lifestyle"]["smoking"] = (
        life.get("smoking") if life.get("smoking") in SMOKING_OPTIONS else "Never"
    )
    try:
        sq = int(life.get("sleepQuality", 5))
        base["lifestyle"]["sleepQuality"] = max(1, min(10, sq))
    except (TypeError, ValueError):
        base["lifestyle"]["sleepQuality"] = 5

    return base


def _filter_options(values: Any, allowed: list[str]) -> list[str]:
    if not isinstance(values, list):
        return []
    allowed_set = set(allowed)
    out = []
    for v in values:
        s = str(v).strip()
        if s in allowed_set and s not in out:
            out.append(s)
    return out


def medications_to_strings(intake: dict[str, Any]) -> list[str]:
    """Flatten structured meds for safety/RxNorm string matching."""
    out: list[str] = []
    for m in intake.get("medications") or []:
        if not isinstance(m, dict):
            continue
        parts = [m.get("name"), m.get("dose"), m.get("frequency")]
        label = " ".join(str(p).strip() for p in parts if p and str(p).strip())
        if label:
            out.append(label)
    return out


def intake_has_clinical_data(intake: dict[str, Any]) -> bool:
    if medications_to_strings(intake):
        return True
    vitals = intake.get("vitals") or {}
    if any(str(vitals.get(k) or "").strip() for k in ("hba1c", "fastingGlucose", "egfr")):
        return True
    if intake.get("goals") or intake.get("sideEffects") or intake.get("comorbidities"):
        return True
    if str(intake.get("clinicianNotes") or "").strip():
        return True
    return False


def format_intake_for_llm(intake: dict[str, Any]) -> str:
    """Compact block for Nemotron prompts."""
    if not intake_has_clinical_data(intake):
        return "No patient intake form on file."

    lines = [
        f"Submitted: {intake.get('submittedAt', 'unknown')} by {intake.get('submittedBy', 'unknown')}",
        "",
        "Medications:",
    ]
    for m in intake.get("medications") or []:
        lines.append(
            f"  - {m.get('name')} {m.get('dose')} ({m.get('frequency')})"
        )
    if not intake.get("medications"):
        lines.append("  - (none listed)")

    v = intake.get("vitals") or {}
    lines.extend(
        [
            "",
            "Vitals:",
            f"  weight={v.get('weight')} height={v.get('height')} BP={v.get('bloodPressure')}",
            f"  fasting glucose={v.get('fastingGlucose')} HbA1c={v.get('hba1c')} eGFR={v.get('egfr')}",
            "",
            f"Goals: {', '.join(intake.get('goals') or []) or 'none'}",
            f"Side effects on current meds: {', '.join(intake.get('sideEffects') or []) or 'none'}",
            f"Comorbidities: {', '.join(intake.get('comorbidities') or []) or 'none'}",
            f"Family history: {', '.join(intake.get('familyHistory') or []) or 'none'}",
            "",
            "Lifestyle:",
            f"  activity={intake.get('lifestyle', {}).get('activityLevel')} "
            f"diet={intake.get('lifestyle', {}).get('diet')} "
            f"alcohol={intake.get('lifestyle', {}).get('alcohol')} "
            f"smoking={intake.get('lifestyle', {}).get('smoking')} "
            f"sleep={intake.get('lifestyle', {}).get('sleepQuality')}/10",
        ]
    )
    notes = str(intake.get("clinicianNotes") or "").strip()
    if notes:
        lines.extend(["", f"Clinician notes: {notes[:800]}"])
    return "\n".join(lines)
