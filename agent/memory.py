"""
agent/memory.py

SQLite persistence for patients, intake forms, and cached agent briefs.
"""

from __future__ import annotations

import hashlib
import json
import os
import random
import secrets
import sqlite3
import string
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=False)


def _db_path() -> str:
    path = os.environ.get("MEMORY_DB_PATH", "memory.db")
    if not os.path.isabs(path):
        return str(ROOT / path)
    return path


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
    )
    return f"{salt}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000
    )
    return secrets.compare_digest(digest.hex(), expected)


def ensure_schema() -> None:
    """Add columns/tables introduced after initial seed without dropping data."""
    conn = _connect()
    cols = {r[1] for r in conn.execute("PRAGMA table_info(patients)").fetchall()}
    if "intake_json" not in cols:
        conn.execute("ALTER TABLE patients ADD COLUMN intake_json TEXT")
    if "password_hash" not in cols:
        conn.execute("ALTER TABLE patients ADD COLUMN password_hash TEXT")
    if "created_at" not in cols:
        conn.execute("ALTER TABLE patients ADD COLUMN created_at TEXT")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS agent_briefs (
            patient_id TEXT PRIMARY KEY,
            generated_at TEXT,
            brief_json TEXT
        )
        """
    )
    conn.commit()
    conn.close()


def _parse_intake_json(raw: Any) -> dict[str, Any] | None:
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except (TypeError, json.JSONDecodeError):
        return None


def _row_to_patient(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    if d.get("meds"):
        try:
            d["meds"] = json.loads(d["meds"])
        except (TypeError, json.JSONDecodeError):
            pass
    if d.get("snp_profile_json"):
        try:
            d["snp_profile_json"] = json.loads(d["snp_profile_json"])
        except (TypeError, json.JSONDecodeError):
            pass
    intake_raw = _parse_intake_json(d.get("intake_json"))

    meds = d.get("meds") or []
    snp_profile = d.get("snp_profile_json") or {}
    next_iso = d.get("next_appointment_iso") or ""
    appointment_date = next_iso[:10] if isinstance(next_iso, str) else ""

    return {
        "patient_id": d.get("patient_id"),
        "name": d.get("name"),
        "zip": d.get("zip"),
        "zip_code": d.get("zip"),
        "current_meds": meds,
        "meds": meds,
        "next_appointment_iso": next_iso,
        "appointment_date": appointment_date,
        "snp_profile": snp_profile,
        "snp_rsids": list(snp_profile.keys()) if isinstance(snp_profile, dict) else [],
        "snp_genes": sorted(
            {
                snp.get("gene")
                for snp in (snp_profile.values() if isinstance(snp_profile, dict) else [])
                if isinstance(snp, dict) and snp.get("gene")
            }
        ),
        "parsed_at": d.get("parsed_at"),
        "intake": intake_raw,
    }


def read(patient_id: str) -> dict[str, Any] | None:
    """Look up a patient by id. Returns the enriched dict or None if missing."""
    try:
        ensure_schema()
        conn = _connect()
        cur = conn.cursor()
        cur.execute(
            "SELECT patient_id, name, zip, meds, next_appointment_iso, "
            "snp_profile_json, parsed_at, intake_json FROM patients WHERE patient_id = ?",
            (patient_id,),
        )
        row = cur.fetchone()
        conn.close()
    except sqlite3.Error:
        return None
    if not row:
        return None
    patient = _row_to_patient(row)
    from parsers.intake_client import attach_intake_to_patient

    return attach_intake_to_patient(patient)


def _new_patient_id() -> str:
    alphabet = string.ascii_uppercase + string.digits
    suffix = "".join(random.choices(alphabet, k=6))
    return f"PT-{suffix}"


def create_patient(name: str) -> dict[str, Any]:
    """Create an empty patient row (name only); genome and intake added later."""
    return register_patient(name, password=None, zip_code="")


def register_patient(
    name: str,
    password: str | None = None,
    zip_code: str = "",
) -> dict[str, Any]:
    """Create a patient account with optional password and empty intake shell."""
    from schemas.patient_intake import empty_intake

    ensure_schema()
    patient_id = _new_patient_id()
    display_name = (name or "").strip() or "New patient"
    zip_val = (zip_code or "").strip()
    created_at = datetime.now(timezone.utc).isoformat()
    intake = empty_intake(patient_id, submitted_by="patient")
    password_hash = _hash_password(password) if password else None

    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO patients (
            patient_id, name, zip, meds, next_appointment_iso,
            snp_profile_json, parsed_at, intake_json, password_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            patient_id,
            display_name,
            zip_val,
            json.dumps([]),
            "",
            json.dumps({}),
            None,
            json.dumps(intake),
            password_hash,
            created_at,
        ),
    )
    conn.commit()
    conn.close()
    row = read(patient_id)
    return row or {"patient_id": patient_id, "name": display_name}


def get_password_hash(patient_id: str) -> str | None:
    ensure_schema()
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        "SELECT password_hash FROM patients WHERE patient_id = ?",
        (patient_id,),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return row[0]


def verify_patient_login(patient_id: str, password: str) -> bool:
    """Registered accounts require password; legacy demo rows allow ID-only sign-in."""
    if not patient_exists(patient_id):
        return False
    stored = get_password_hash(patient_id)
    if not stored:
        return True
    if not (password or "").strip():
        return False
    return _verify_password(password, stored)


def update_genome(patient_id: str, snp_profile: dict[str, Any]) -> dict[str, Any]:
    """Attach parsed SNP profile to an existing patient."""
    ensure_schema()
    parsed_at = datetime.now(timezone.utc).isoformat()
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE patients
        SET snp_profile_json = ?, parsed_at = ?
        WHERE patient_id = ?
        """,
        (json.dumps(snp_profile), parsed_at, patient_id),
    )
    if cur.rowcount == 0:
        conn.close()
        raise ValueError(f"patient {patient_id} not found")
    conn.commit()
    conn.close()
    return {"patient_id": patient_id, "parsed_at": parsed_at, "snp_count": len(snp_profile)}


def patient_exists(patient_id: str) -> bool:
    ensure_schema()
    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM patients WHERE patient_id = ?", (patient_id,))
    found = cur.fetchone() is not None
    conn.close()
    return found


def write_intake(patient_id: str, intake: dict[str, Any]) -> dict[str, Any]:
    """Persist intake JSON; sync meds column for legacy callers."""
    from schemas.patient_intake import medications_to_strings, normalize_intake

    ensure_schema()
    normalized = normalize_intake(intake, patient_id)
    normalized["submittedAt"] = datetime.now(timezone.utc).isoformat()
    med_strings = medications_to_strings(normalized)
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE patients
        SET intake_json = ?, meds = ?
        WHERE patient_id = ?
        """,
        (json.dumps(normalized), json.dumps(med_strings), patient_id),
    )
    if cur.rowcount == 0:
        conn.close()
        raise ValueError(f"patient {patient_id} not found")
    conn.commit()
    conn.close()
    return normalized
