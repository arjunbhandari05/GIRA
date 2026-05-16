"""
agent/memory.py

Python-side persistent memory.

Mirrors the JS memory.js contract but reads from the same SQLite database
seeded by scripts/seed_db.py — `patients(patient_id, name, zip, meds,
next_appointment_iso, snp_profile_json, parsed_at)` plus the `briefs` table.

Used by:
  - reasoning.nemotron.run_with_tools  (loads patient context)
  - scripts/test_agent.py              (verification harness)
  - agent/claw.js                      (via subprocess bridge)
"""

from __future__ import annotations

import json
import os
import sqlite3
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
        "history": _recent_briefs(d.get("patient_id")),
    }


def _recent_briefs(patient_id: str | None, limit: int = 3) -> list[dict[str, Any]]:
    if not patient_id:
        return []
    try:
        conn = _connect()
        cur = conn.cursor()
        cur.execute(
            "SELECT generated_at, brief_md FROM briefs "
            "WHERE patient_id = ? ORDER BY generated_at DESC LIMIT ?",
            (patient_id, limit),
        )
        rows = cur.fetchall()
        conn.close()
        return [{"generated_at": r["generated_at"], "brief_md": r["brief_md"]} for r in rows]
    except sqlite3.Error:
        return []


def read(patient_id: str) -> dict[str, Any] | None:
    """Look up a patient by id. Returns the enriched dict or None if missing."""
    try:
        conn = _connect()
        cur = conn.cursor()
        cur.execute(
            "SELECT patient_id, name, zip, meds, next_appointment_iso, "
            "snp_profile_json, parsed_at FROM patients WHERE patient_id = ?",
            (patient_id,),
        )
        row = cur.fetchone()
        conn.close()
    except sqlite3.Error:
        return None
    if not row:
        return None
    return _row_to_patient(row)


def write_brief(patient_id: str, brief: dict[str, Any]) -> None:
    """Persist an agentic brief into the briefs table."""
    generated_at = datetime.now(timezone.utc).isoformat()
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO briefs (patient_id, generated_at, brief_md, wearable_snapshot_json)
        VALUES (?, ?, ?, ?)
        """,
        (
            patient_id,
            generated_at,
            json.dumps(brief, default=str),
            json.dumps(brief.get("wearable_insight") or {}, default=str),
        ),
    )
    conn.commit()
    conn.close()
