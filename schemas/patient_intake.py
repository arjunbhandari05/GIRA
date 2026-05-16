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
        "visitNotes": {
            "chiefComplaint": "",
            "painSymptoms": "",
            "sleepEnergy": "",
            "moodFeeling": "",
        },
        "clinicianNotes": "",
    }


def _match_option(value: str, options: list[str]) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    lower = text.lower()
    for opt in options:
        ol = opt.lower()
        if lower == ol or ol in lower or lower in ol:
            return opt
    return None


def _normalize_goals(raw_goals: Any) -> list[str]:
    out: list[str] = []
    if not isinstance(raw_goals, list):
        return out
    for item in raw_goals:
        text = str(item).strip()
        if not text:
            continue
        matched = _match_option(text, GOAL_OPTIONS)
        if matched:
            if matched not in out:
                out.append(matched)
            continue
        lower = text.lower()
        keyword_map = (
            ("reduce hba1c", "Reduce HbA1c"),
            ("a1c", "Reduce HbA1c"),
            ("weight", "Lose weight"),
            ("cardiovascular", "Reduce cardiovascular risk"),
            ("blood pressure", "Reduce cardiovascular risk"),
            ("energy", "Improve energy"),
            ("sleep", "Improve energy"),
            ("hypogly", "Avoid hypoglycemia"),
            ("injection", "Minimize injections"),
            ("pill", "Minimize pill burden"),
            ("cost", "Cost-conscious"),
        )
        for needle, option in keyword_map:
            if needle in lower and option not in out:
                out.append(option)
                break
    return out


def _normalize_side_effects(raw_side: Any) -> list[str]:
    out: list[str] = []
    if not isinstance(raw_side, list):
        return out
    for item in raw_side:
        if isinstance(item, dict):
            effect = str(item.get("effect") or item.get("name") or "").strip()
            med = str(item.get("medication") or "").strip()
            blob = f"{med} {effect}".lower()
            if any(k in blob for k in ("gi", "nausea", "vomit", "diarrhea")):
                label = "GI discomfort/nausea"
            elif "muscle" in blob:
                label = "Muscle pain"
            elif "fatigue" in blob or "tired" in blob:
                label = "Fatigue"
            elif "hypogly" in blob:
                label = "Hypoglycemia"
            elif "swell" in blob:
                label = "Swelling"
            elif "uti" in blob or "urinary" in blob:
                label = "UTIs"
            elif "weight gain" in blob:
                label = "Weight gain"
            elif "headache" in blob:
                label = "Headaches"
            else:
                label = None
            if label and label not in out:
                out.append(label)
        else:
            matched = _match_option(str(item), SIDE_EFFECT_OPTIONS)
            if matched and matched not in out:
                out.append(matched)
    return out


def _normalize_comorbidities(raw_items: Any) -> list[str]:
    out: list[str] = []
    if not isinstance(raw_items, list):
        return out
    for item in raw_items:
        text = str(item).strip()
        if not text:
            continue
        matched = _match_option(text, COMORBIDITY_OPTIONS)
        if matched:
            if matched not in out:
                out.append(matched)
            continue
        lower = text.lower()
        if "hypertension" in lower and "Hypertension" not in out:
            out.append("Hypertension")
        elif ("obesity" in lower or "bmi" in lower) and "Obesity BMI>=30" not in out:
            out.append("Obesity BMI>=30")
        elif any(k in lower for k in ("heart", "cad", "coronary")) and "Heart disease" not in out:
            out.append("Heart disease")
        elif any(k in lower for k in ("kidney", "ckd", "nephro")) and "Kidney disease" not in out:
            out.append("Kidney disease")
        elif "sleep apnea" in lower and "Sleep apnea" not in out:
            out.append("Sleep apnea")
        elif "neuropathy" in lower and "Neuropathy" not in out:
            out.append("Neuropathy")
        elif "depression" in lower and "Depression" not in out:
            out.append("Depression")
    return out


def _normalize_family_history(raw_items: Any) -> list[str]:
    out: list[str] = []
    if not isinstance(raw_items, list):
        return out
    for item in raw_items:
        text = str(item).strip()
        if not text:
            continue
        matched = _match_option(text, FAMILY_HISTORY_OPTIONS)
        if matched:
            if matched not in out:
                out.append(matched)
            continue
        lower = text.lower()
        if "diabetes" in lower and "Type 2 diabetes" not in out:
            out.append("Type 2 diabetes")
        elif any(k in lower for k in ("heart", "stroke", "attack", "cad")) and "Heart attack/stroke" not in out:
            out.append("Heart attack/stroke")
        elif "kidney" in lower and "Kidney disease" not in out:
            out.append("Kidney disease")
        elif "statin" in lower and "Statin intolerance" not in out:
            out.append("Statin intolerance")
    return out


def normalize_intake(raw: dict[str, Any] | None, patient_id: str) -> dict[str, Any]:
    """Coerce partial payloads into the canonical intake shape."""
    base = empty_intake(patient_id)
    if not isinstance(raw, dict):
        return base

    base["patientId"] = str(raw.get("patientId") or raw.get("patient_id") or patient_id)
    base["submittedAt"] = raw.get("submittedAt") or raw.get("intake_date") or base["submittedAt"]
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
            dose = str(m.get("dose") or "").strip()
            if not dose and m.get("dose_mg") is not None:
                dose = f"{m.get('dose_mg')}mg"
            meds_out.append(
                {
                    "id": str(m.get("id") or f"med-{i}-{uuid.uuid4().hex[:6]}"),
                    "name": name,
                    "dose": dose,
                    "frequency": str(m.get("frequency") or "").strip(),
                }
            )
    base["medications"] = meds_out

    vitals = dict(raw.get("vitals")) if isinstance(raw.get("vitals"), dict) else {}
    demo = raw.get("demographics") if isinstance(raw.get("demographics"), dict) else {}
    if demo.get("weight_kg") is not None:
        vitals.setdefault("weight", f"{demo['weight_kg']} kg")
    if demo.get("height_cm") is not None:
        vitals.setdefault("height", f"{demo['height_cm']} cm")

    labs = raw.get("labs_last_visit") if isinstance(raw.get("labs_last_visit"), dict) else {}
    labs_demo = raw.get("labs") if isinstance(raw.get("labs"), dict) else {}
    if labs_demo:
        if labs_demo.get("hba1c_pct") is not None:
            vitals.setdefault("hba1c", str(labs_demo["hba1c_pct"]))
        if labs_demo.get("fasting_glucose_mgdl") is not None:
            vitals.setdefault("fastingGlucose", str(labs_demo["fasting_glucose_mgdl"]))
        if labs_demo.get("egfr_ml_min") is not None:
            vitals.setdefault("egfr", str(labs_demo["egfr_ml_min"]))
    if labs:
        vitals.setdefault("hba1c", labs.get("hba1c"))
        vitals.setdefault("fastingGlucose", labs.get("fasting_glucose") or labs.get("fastingGlucose"))
        vitals.setdefault("egfr", labs.get("egfr"))
    vitals_lv = raw.get("vitals_last_visit") if isinstance(raw.get("vitals_last_visit"), dict) else {}
    if vitals_lv:
        if vitals_lv.get("weight_kg") is not None:
            vitals.setdefault("weight", f"{vitals_lv['weight_kg']} kg")
        if vitals_lv.get("height_cm") is not None:
            vitals.setdefault("height", f"{vitals_lv['height_cm']} cm")
        sys_ = vitals_lv.get("bp_systolic")
        dia_ = vitals_lv.get("bp_diastolic")
        if sys_ is not None and dia_ is not None:
            vitals.setdefault("bloodPressure", f"{sys_}/{dia_}")

    sys_v = vitals.get("bp_systolic_mmhg")
    dia_v = vitals.get("bp_diastolic_mmhg")
    if sys_v is not None and dia_v is not None:
        vitals.setdefault("bloodPressure", f"{sys_v}/{dia_v}")
    if vitals.get("weight_kg") is not None and not vitals.get("weight"):
        vitals["weight"] = f"{vitals['weight_kg']} kg"

    for key in base["vitals"]:
        base["vitals"][key] = str(vitals.get(key) or "").strip()

    base["goals"] = _normalize_goals(raw.get("goals"))
    base["sideEffects"] = _normalize_side_effects(raw.get("sideEffects"))
    base["comorbidities"] = _normalize_comorbidities(raw.get("comorbidities"))
    base["familyHistory"] = _normalize_family_history(raw.get("familyHistory"))
    visit = raw.get("visitNotes") if isinstance(raw.get("visitNotes"), dict) else {}
    base["visitNotes"] = {
        "chiefComplaint": str(
            visit.get("chiefComplaint")
            or raw.get("chief_complaint")
            or raw.get("chiefComplaint")
            or ""
        ).strip(),
        "painSymptoms": str(
            visit.get("painSymptoms") or raw.get("pain_symptoms") or ""
        ).strip(),
        "sleepEnergy": str(
            visit.get("sleepEnergy") or raw.get("sleep_energy") or ""
        ).strip(),
        "moodFeeling": str(
            visit.get("moodFeeling") or raw.get("mood_feeling") or ""
        ).strip(),
    }
    base["clinicianNotes"] = _clean_clinician_notes(
        str(raw.get("clinicianNotes") or "").strip()
    )

    if raw.get("family_history") and not base["familyHistory"]:
        fh_lines = [
            str(x).strip() for x in (raw.get("family_history") or []) if str(x).strip()
        ]
        if fh_lines:
            matched = _filter_options(
                [s.split(":")[0].strip() for s in fh_lines if "diabetes" in s.lower()],
                FAMILY_HISTORY_OPTIONS,
            )
            if matched:
                base["familyHistory"] = matched
            else:
                base["clinicianNotes"] = (
                    (base["clinicianNotes"] + "\n\n" if base["clinicianNotes"] else "")
                    + "Family history: "
                    + "; ".join(fh_lines)
                ).strip()

    life = raw.get("lifestyle") if isinstance(raw.get("lifestyle"), dict) else {}
    exercise = str(life.get("exercise") or life.get("physical_activity") or "").lower()
    if exercise and "activityLevel" not in life:
        if any(k in exercise for k in ("daily", "5x", "6x", "very active")):
            life = {**life, "activityLevel": "Very Active"}
        elif any(k in exercise for k in ("3x", "4x", "moderate", "gym")):
            life = {**life, "activityLevel": "Moderate"}
        elif any(k in exercise for k in ("walk", "1x", "2x", "light")):
            life = {**life, "activityLevel": "Light"}
        elif "sedentary" in exercise:
            life = {**life, "activityLevel": "Sedentary"}

    activity = life.get("activityLevel")
    if activity == "High":
        activity = "Very Active"
    base["lifestyle"]["activityLevel"] = (
        activity if activity in ACTIVITY_LEVELS else "Light"
    )

    diet = str(life.get("diet") or "")
    if diet and diet not in DIET_OPTIONS:
        dl = diet.lower()
        if "low-carb" in dl or "low carb" in dl:
            diet = "Low-carb"
        elif "mediterranean" in dl:
            diet = "Mediterranean"
        elif "vegetarian" in dl or "vegan" in dl:
            diet = "Vegetarian"
        else:
            diet = "Standard"
    base["lifestyle"]["diet"] = diet if diet in DIET_OPTIONS else "Standard"

    alcohol = life.get("alcohol")
    if alcohol is None and life.get("alcohol_drinks_per_week") is not None:
        try:
            drinks = float(life["alcohol_drinks_per_week"])
            alcohol = "None" if drinks <= 0 else "Occasional" if drinks <= 3 else "Regular" if drinks <= 7 else "Daily"
        except (TypeError, ValueError):
            alcohol = "None"
    base["lifestyle"]["alcohol"] = (
        alcohol if alcohol in ALCOHOL_OPTIONS else "None"
    )

    smoking = life.get("smoking") or life.get("smoking_status")
    if isinstance(smoking, str):
        sl = smoking.lower()
        if sl.startswith("never"):
            smoking = "Never"
        elif sl.startswith("former"):
            smoking = "Former"
        elif sl.startswith("current"):
            smoking = "Current"
    base["lifestyle"]["smoking"] = (
        smoking if smoking in SMOKING_OPTIONS else "Never"
    )

    try:
        if life.get("sleepQuality") is not None:
            sq = int(life["sleepQuality"])
        elif life.get("sleep_hours_per_night") is not None:
            hours = float(life["sleep_hours_per_night"])
            sq = max(1, min(10, round(hours)))
        else:
            sq = 5
        base["lifestyle"]["sleepQuality"] = max(1, min(10, sq))
    except (TypeError, ValueError):
        base["lifestyle"]["sleepQuality"] = 5

    return base


def _clean_clinician_notes(text: str) -> str:
    """Drop wearable/CGM sentences from chart summary — those belong in device tools."""
    if not text:
        return ""
    import re

    sentences = re.split(r"(?<=[.!?])\s+", text)
    drop_markers = (
        "whoop",
        "hrv",
        "recovery avg",
        "recovery ",
        "tir ",
        "time in range",
        "time-in-range",
        "cgm",
        "avg glucose",
        "gmi ",
        "wearable",
        "rmssd",
    )
    kept = []
    for sentence in sentences:
        lower = sentence.lower()
        if any(m in lower for m in drop_markers):
            continue
        kept.append(sentence.strip())
    return " ".join(s for s in kept if s).strip()


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
        dose = m.get("dose")
        if not dose and m.get("dose_mg") is not None:
            dose = f"{m.get('dose_mg')}mg"
        parts = [m.get("name"), dose, m.get("frequency")]
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
    visit = intake.get("visitNotes") or {}
    if any(str(visit.get(k) or "").strip() for k in ("chiefComplaint", "painSymptoms", "sleepEnergy", "moodFeeling")):
        return True
    if str(intake.get("clinicianNotes") or "").strip():
        return True
    return False


def format_intake_for_llm(intake: dict[str, Any]) -> str:
    """Compact block for GIRA agent prompts."""
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
    visit = intake.get("visitNotes") or {}
    subjective = [
        ("Chief complaint", visit.get("chiefComplaint")),
        ("Pain / symptoms", visit.get("painSymptoms")),
        ("Sleep & energy", visit.get("sleepEnergy")),
        ("Mood / how patient feels", visit.get("moodFeeling")),
    ]
    if any(str(v or "").strip() for _, v in subjective):
        lines.extend(["", "Subjective (today's visit — use for counseling & inference):"])
        for label, value in subjective:
            text = str(value or "").strip()
            if text:
                lines.append(f"  {label}: {text}")

    notes = str(intake.get("clinicianNotes") or "").strip()
    if notes:
        lines.extend(["", f"Clinician chart summary (PGx-relevant, no wearables): {notes[:800]}"])
    return "\n".join(lines)
