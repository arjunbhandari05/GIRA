#!/usr/bin/env python3
"""Create glycoagent.db and seed demo patients."""

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

DB_PATH = os.environ.get("MEMORY_DB_PATH", "glycoagent.db")
if not os.path.isabs(DB_PATH):
    DB_PATH = str(ROOT / DB_PATH)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.executescript(
        """
        DROP TABLE IF EXISTS briefs;
        DROP TABLE IF EXISTS patients;

        CREATE TABLE patients (
            patient_id TEXT PRIMARY KEY,
            name TEXT,
            zip TEXT,
            meds TEXT,
            next_appointment_iso TEXT,
            snp_profile_json TEXT,
            parsed_at TEXT
        );

        CREATE TABLE briefs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT,
            generated_at TEXT,
            brief_md TEXT,
            wearable_snapshot_json TEXT
        );
        """
    )

    patients = [
        {
            "patient_id": "PT-001",
            "name": "Alex Rivera",
            "zip": "95060",
            "meds": ["metformin 500mg"],
            "next_appointment_iso": "2026-05-20T14:00:00+00:00",
            "snps": {
                "rs7903146": {"gene": "TCF7L2", "genotype": "CT"},
                "rs622342": {"gene": "SLC22A1", "genotype": "AG"},
                "rs5219": {"gene": "KCNJ11", "genotype": "CT"},
                "rs1801282": {"gene": "PPARG", "genotype": "CG"},
                "rs757110": {"gene": "ABCC8", "genotype": "AG"},
                "rs9939609": {"gene": "FTO", "genotype": "AT"},
                "rs4149056": {"gene": "SLCO1B1", "genotype": "TC"},
                "rs429358": {"gene": "APOE", "genotype": "CT"},
                "rs4244285": {"gene": "CYP2C19", "genotype": "GA"},
                "rs9923231": {"gene": "VKORC1", "genotype": "GA"},
            },
        },
        {
            "patient_id": "PT-002",
            "name": "Jordan Kim",
            "zip": "94103",
            "meds": ["metformin 500mg", "atorvastatin 20mg"],
            "next_appointment_iso": "2026-05-21T15:30:00+00:00",
            "snps": {
                "rs7903146": {"gene": "TCF7L2", "genotype": "TT"},
                "rs622342": {"gene": "SLC22A1", "genotype": "AA"},
                "rs5219": {"gene": "KCNJ11", "genotype": "TT"},
                "rs1801282": {"gene": "PPARG", "genotype": "CC"},
                "rs757110": {"gene": "ABCC8", "genotype": "AA"},
                "rs9939609": {"gene": "FTO", "genotype": "AA"},
                "rs4149056": {"gene": "SLCO1B1", "genotype": "TC"},
                "rs429358": {"gene": "APOE", "genotype": "CT"},
                "rs4244285": {"gene": "CYP2C19", "genotype": "GA"},
                "rs9923231": {"gene": "VKORC1", "genotype": "GA"},
            },
        },
        {
            "patient_id": "PT-003",
            "name": "Morgan Chen",
            "zip": "94102",
            "meds": ["atorvastatin 20mg", "clopidogrel 75mg", "warfarin 5mg"],
            "next_appointment_iso": "2026-05-22T09:00:00+00:00",
            "snps": {
                "rs7903146": {"gene": "TCF7L2", "genotype": "CC"},
                "rs622342": {"gene": "SLC22A1", "genotype": "AG"},
                "rs5219": {"gene": "KCNJ11", "genotype": "CC"},
                "rs1801282": {"gene": "PPARG", "genotype": "CG"},
                "rs757110": {"gene": "ABCC8", "genotype": "AG"},
                "rs9939609": {"gene": "FTO", "genotype": "AT"},
                "rs4149056": {"gene": "SLCO1B1", "genotype": "TT"},
                "rs429358": {"gene": "APOE", "genotype": "TT"},
                "rs4244285": {"gene": "CYP2C19", "genotype": "AA"},
                "rs9923231": {"gene": "VKORC1", "genotype": "AA"},
            },
        },
    ]

    parsed_at = _now_iso()
    for p in patients:
        cur.execute(
            """
            INSERT INTO patients (
                patient_id, name, zip, meds, next_appointment_iso,
                snp_profile_json, parsed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                p["patient_id"],
                p["name"],
                p["zip"],
                json.dumps(p["meds"]),
                p["next_appointment_iso"],
                json.dumps(p["snps"]),
                parsed_at,
            ),
        )

    conn.commit()
    conn.close()
    print(f"Seeded database at {DB_PATH}")


if __name__ == "__main__":
    main()
