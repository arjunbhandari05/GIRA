"""Load and persist patient intake forms (DB + optional synthetic JSON files)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from schemas.patient_intake import (
    empty_intake,
    format_intake_for_llm,
    intake_has_clinical_data,
    medications_to_strings,
    normalize_intake,
)

ROOT = Path(__file__).resolve().parents[1]
INTAKE_DIR = ROOT / "data" / "intake"

# Demo genome file aliases → patient ids
_FILE_ALIASES = {
    "patient_a": "PT-001",
    "patient_b": "PT-002",
    "patient_c": "PT-003",
}


def _intake_paths(patient_id: str) -> list[Path]:
    pid = patient_id.strip()
    paths = [INTAKE_DIR / f"{pid}.json"]
    lower = pid.lower().replace("-", "_")
    paths.append(INTAKE_DIR / f"{lower}.json")
    alias = _FILE_ALIASES.get(lower)
    if alias:
        paths.append(INTAKE_DIR / f"{alias}.json")
    return paths


def load_intake_file(patient_id: str) -> dict[str, Any] | None:
    for path in _intake_paths(patient_id):
        if path.is_file():
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                return normalize_intake(raw, patient_id)
            except (OSError, json.JSONDecodeError):
                continue
    return None


def load_intake(
    patient_id: str,
    db_intake: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """DB intake wins; else synthetic file; else empty template."""
    if isinstance(db_intake, dict) and intake_has_clinical_data(db_intake):
        return normalize_intake(db_intake, patient_id)
    from_file = load_intake_file(patient_id)
    if from_file and intake_has_clinical_data(from_file):
        return from_file
    if isinstance(db_intake, dict):
        return normalize_intake(db_intake, patient_id)
    return empty_intake(patient_id)


def attach_intake_to_patient(patient: dict[str, Any]) -> dict[str, Any]:
    """Merge intake onto patient dict and sync current_meds for tools."""
    pid = patient.get("patient_id") or patient.get("id") or ""
    db_raw = patient.get("intake")
    if isinstance(db_raw, str):
        try:
            db_raw = json.loads(db_raw)
        except json.JSONDecodeError:
            db_raw = None

    intake = load_intake(pid, db_raw if isinstance(db_raw, dict) else None)
    patient = dict(patient)
    patient["intake"] = intake
    patient["intake_text"] = format_intake_for_llm(intake)

    med_strings = medications_to_strings(intake)
    if med_strings:
        patient["current_meds"] = med_strings
        patient["meds"] = med_strings
    return patient


def get_patient_intake(patient_id: str, **_kwargs) -> dict[str, Any]:
    """Agent tool entrypoint."""
    from agent.memory import read

    patient = read(patient_id)
    if not patient:
        return {"error": f"patient {patient_id} not found"}
    enriched = attach_intake_to_patient(patient)
    return {
        "patient_id": patient_id,
        "intake": enriched.get("intake"),
        "medications_flat": enriched.get("current_meds") or [],
        "has_clinical_data": intake_has_clinical_data(enriched.get("intake") or {}),
    }
