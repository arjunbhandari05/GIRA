"""Per-patient synthetic file paths (WHOOP, CGM, intake JSON on disk)."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WHOOP_DIR = ROOT / "data" / "whoop"
GLUCOSE_DIR = ROOT / "data" / "glucose"
INTAKE_DIR = ROOT / "data" / "intake"


def _slug(patient_id: str) -> str:
    return patient_id.strip().lower().replace("-", "_")


def whoop_path(patient_id: str) -> Path:
    return WHOOP_DIR / f"{_slug(patient_id)}.json"


def glucose_path(patient_id: str) -> Path:
    return GLUCOSE_DIR / f"{_slug(patient_id)}.json"


def intake_file_path(patient_id: str) -> Path:
    return INTAKE_DIR / f"{patient_id.strip()}.json"


def has_whoop(patient_id: str) -> bool:
    return whoop_path(patient_id).is_file()


def has_glucose(patient_id: str) -> bool:
    return glucose_path(patient_id).is_file()


def has_intake_file(patient_id: str) -> bool:
    return intake_file_path(patient_id).is_file()


def save_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def patient_assets_status(patient_id: str, snp_profile: dict | None) -> dict:
    intake_ready = has_intake_file(patient_id)
    if not intake_ready:
        try:
            from agent.memory import read as agent_read_patient
            from parsers.intake_client import attach_intake_to_patient, load_intake
            from schemas.patient_intake import intake_has_clinical_data

            patient = agent_read_patient(patient_id)
            if patient:
                enriched = attach_intake_to_patient(patient)
                intake = enriched.get("intake") or {}
            else:
                intake = load_intake(patient_id) or {}
            intake_ready = intake_has_clinical_data(intake)
        except Exception:
            pass
    return {
        "patient_id": patient_id,
        "genome": bool(snp_profile),
        "wearable": has_whoop(patient_id),
        "glucose": has_glucose(patient_id),
        "intake_file": intake_ready,
    }
