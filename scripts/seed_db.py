#!/usr/bin/env python3
"""Create memory.db and seed demo patients from data/genomes + data/intake/."""

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from schemas.patient_intake import normalize_intake

DB_PATH = os.environ.get("MEMORY_DB_PATH", "memory.db")
if not os.path.isabs(DB_PATH):
    DB_PATH = str(ROOT / DB_PATH)

GENOME_DIR = ROOT / "data" / "genomes"
INTAKE_DIR = ROOT / "data" / "intake"

PATIENT_IDS = ["PT-001", "PT-002", "PT-003"]

DEMO_PATIENTS = {
    "PT-001": {
        "name": "Alex Rivera",
        "zip": "95060",
        "next_appointment_iso": "2026-05-20T14:00:00+00:00",
    },
    "PT-002": {
        "name": "Jordan Kim",
        "zip": "94103",
        "next_appointment_iso": "2026-05-21T15:30:00+00:00",
    },
    "PT-003": {
        "name": "Morgan Chen",
        "zip": "94102",
        "next_appointment_iso": "2026-05-22T09:00:00+00:00",
    },
}

DEMO_VISIT_NOTES = {
    "PT-001": {
        "visitNotes": {
            "chiefComplaint": "HbA1c still above goal on metformin; wants to discuss add-on or dose change.",
            "painSymptoms": "Mild evening GI cramping after metformin; no chest pain or neuropathy.",
            "sleepEnergy": "Sleeps 6–7 hours most nights with one brief awakening; energy fair during the day.",
            "moodFeeling": "Motivated and cooperative; mild frustration that numbers are not at target yet.",
        },
        "clinicianNotes": (
            "Modest A1c improvement on metformin 500mg BID; lifestyle adherence good. "
            "Consider add-on if labs remain above target at next visit."
        ),
    },
    "PT-002": {
        "visitNotes": {
            "chiefComplaint": "Persistent hyperglycemia despite maximum metformin; feels diabetes is uncontrolled.",
            "painSymptoms": "Evening tingling in both feet; no chest pain or exertional symptoms.",
            "sleepEnergy": "Poor sleep (~5–6 hours), frequent awakenings, significant daytime fatigue.",
            "moodFeeling": "Frustrated and anxious since cardiac stent; worried about another event.",
        },
        "clinicianNotes": (
            "Long-standing T2D with inadequate glycemic control on max metformin. "
            "Post-PCI on clopidogrel and warfarin — verify CYP2C19 and warfarin sensitivity before any changes."
        ),
    },
    "PT-003": {
        "visitNotes": {
            "chiefComplaint": "Severe muscle pain on atorvastatin; worried about heart protection after NSTEMI.",
            "painSymptoms": "Bilateral proximal thigh myalgia, difficulty rising from a chair; pain worsened over 6 weeks.",
            "sleepEnergy": "Fragmented sleep, often wakes due to leg discomfort; feels exhausted most days.",
            "moodFeeling": "Discouraged and frightened after hospitalization; feels weak and dependent on family.",
        },
        "clinicianNotes": (
            "Critical PGx safety case: SLCO1B1 TT on atorvastatin 40mg with symptomatic myalgia and elevated CK; "
            "CYP2C19 AA on clopidogrel with elevated platelet reactivity. Resolve statin and antiplatelet issues "
            "before intensifying diabetes therapy."
        ),
    },
}

_LEGACY_GENOME_FILES = {
    "PT-001": "patient_a.txt",
    "PT-002": "patient_b.txt",
    "PT-003": "patient_c.txt",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _genome_path(patient_id: str) -> Path | None:
    slug = patient_id.lower().replace("-", "_")
    for name in (
        f"{slug}.txt",
        f"{patient_id}_genome.txt",
        _LEGACY_GENOME_FILES.get(patient_id, ""),
    ):
        if not name:
            continue
        path = GENOME_DIR / name
        if path.is_file():
            return path
    return None


def _load_intake(patient_id: str) -> tuple[str | None, dict | None]:
    for name in (f"{patient_id}.json", f"{patient_id}_intake.json"):
        path = INTAKE_DIR / name
        if path.is_file():
            raw = json.loads(path.read_text(encoding="utf-8"))
            return path.read_text(encoding="utf-8"), raw
    return None, None


def _meds_from_intake(raw: dict) -> list[str]:
    out: list[str] = []
    for m in raw.get("medications") or []:
        if not isinstance(m, dict):
            continue
        name = str(m.get("name") or "").strip()
        if not name:
            continue
        dose = m.get("dose_mg") if m.get("dose_mg") is not None else m.get("dose")
        if dose not in (None, ""):
            dose_s = str(dose).strip()
            if dose_s.lower().endswith("mg"):
                out.append(f"{name} {dose_s}")
            elif dose_s.isdigit() or (
                isinstance(dose, (int, float)) and str(int(dose)) == dose_s
            ):
                out.append(f"{name} {dose_s}mg")
            else:
                out.append(f"{name} {dose_s}")
        else:
            out.append(name)
    return out


def _snps_from_genome(patient_id: str) -> dict:
    path = _genome_path(patient_id)
    if not path:
        return {}
    from parsers.snp_parser import parse_genome

    profile = parse_genome(str(path))
    return {
        rsid: {"gene": entry["gene"], "genotype": entry["genotype"]}
        for rsid, entry in profile.items()
        if entry.get("genotype") not in (None, "", "--")
    }


def _seed_patient(patient_id: str) -> dict:
    meta = DEMO_PATIENTS[patient_id]
    intake_raw, intake_dict = _load_intake(patient_id)
    if intake_raw is None:
        intake_text = None
        intake_dict = {}
    else:
        merged = {**intake_dict, **DEMO_VISIT_NOTES.get(patient_id, {})}
        if DEMO_VISIT_NOTES.get(patient_id, {}).get("visitNotes"):
            merged["visitNotes"] = {
                **(intake_dict.get("visitNotes") or {}),
                **DEMO_VISIT_NOTES[patient_id]["visitNotes"],
            }
        normalized = normalize_intake(merged, patient_id)
        intake_text = json.dumps(normalized, indent=2)
        intake_dict = normalized

    meds = _meds_from_intake(intake_dict) if intake_dict else []
    if not meds:
        meds = []

    snps = _snps_from_genome(patient_id)
    genome_path = _genome_path(patient_id)

    next_visit = (intake_dict or {}).get("next_visit")
    next_appt = meta["next_appointment_iso"]
    if next_visit:
        nv = str(next_visit).strip()
        if "T" not in nv:
            next_appt = f"{nv}T14:00:00+00:00"
        else:
            next_appt = nv

    print(
        f"Seeding {patient_id}... "
        f"genome: {len(snps)} SNPs from {genome_path.name if genome_path else 'missing'}, "
        f"intake: {'loaded' if intake_text else 'missing'}"
    )
    return {
        "patient_id": patient_id,
        "name": meta["name"],
        "zip": meta["zip"],
        "meds": meds,
        "next_appointment_iso": next_appt,
        "snps": snps,
        "intake_json": intake_text,
    }


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.executescript(
        """
        DROP TABLE IF EXISTS agent_briefs;
        DROP TABLE IF EXISTS patients;

        CREATE TABLE patients (
            patient_id TEXT PRIMARY KEY,
            name TEXT,
            zip TEXT,
            meds TEXT,
            next_appointment_iso TEXT,
            snp_profile_json TEXT,
            parsed_at TEXT,
            intake_json TEXT
        );

        CREATE TABLE agent_briefs (
            patient_id TEXT PRIMARY KEY,
            generated_at TEXT,
            brief_json TEXT
        );
        """
    )

    parsed_at = _now_iso()
    for patient_id in PATIENT_IDS:
        p = _seed_patient(patient_id)
        cur.execute(
            """
            INSERT INTO patients (
                patient_id, name, zip, meds, next_appointment_iso,
                snp_profile_json, parsed_at, intake_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                p["patient_id"],
                p["name"],
                p["zip"],
                json.dumps(p["meds"]),
                p["next_appointment_iso"],
                json.dumps(p["snps"]),
                parsed_at,
                p["intake_json"],
            ),
        )

    conn.commit()
    conn.close()
    print(f"Seeded database at {DB_PATH}")


if __name__ == "__main__":
    main()
