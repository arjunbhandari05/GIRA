"""GlycoAgent FastAPI backend — patients, intake, genomics, agentic briefs."""

import json
import os
import random
import sqlite3
import string
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from agent.memory import ensure_schema, read as agent_read_patient, write_intake
from parsers.intake_client import load_intake
from agent.tools import TOOL_DEFINITIONS
from parsers.glucose_client import load_glucose
from parsers.snp_parser import parse_genome
from parsers.whoop_client import get_whoop_analytics
from reasoning.nemotron import run_with_tools
from reasoning.safety_flags import check_safety_flags
from schemas.patient_intake import intake_has_clinical_data

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=True)

app = FastAPI(title="GlycoAgent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _db_path() -> str:
    path = os.environ.get("MEMORY_DB_PATH", "glycoagent.db")
    if not os.path.isabs(path):
        return str(ROOT / path)
    return path


def _ensure_agent_briefs_table() -> None:
    """Cache table for agentic briefs (avoids re-running the LLM on repeat requests)."""
    conn = sqlite3.connect(_db_path())
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


_ensure_agent_briefs_table()
ensure_schema()


def _row_to_patient(row: sqlite3.Row) -> dict:
    d = dict(row)
    if d.get("meds"):
        try:
            d["meds"] = json.loads(d["meds"])
        except json.JSONDecodeError:
            pass
    if d.get("snp_profile_json"):
        try:
            d["snp_profile_json"] = json.loads(d["snp_profile_json"])
        except json.JSONDecodeError:
            pass
    return d


def _load_patient_and_snps(patient_id: str) -> tuple[dict | None, dict]:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        "SELECT patient_id, name, zip, meds, next_appointment_iso, "
        "snp_profile_json, parsed_at FROM patients WHERE patient_id = ?",
        (patient_id,),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        return None, {}
    patient = _row_to_patient(row)
    snps = patient.get("snp_profile_json") or {}
    return patient, snps


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/patients")
def list_patients() -> List[dict[str, Any]]:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        "SELECT patient_id, name, zip, meds, next_appointment_iso, "
        "snp_profile_json, parsed_at FROM patients ORDER BY patient_id"
    )
    rows = [_row_to_patient(r) for r in cur.fetchall()]
    conn.close()
    return rows


@app.get("/wearable/{patient_id}")
def get_wearable(patient_id: str) -> dict:
    try:
        return get_whoop_analytics(patient_id)
    except FileNotFoundError:
        return {"error": "no wearable data"}


@app.get("/glucose/{patient_id}")
def get_glucose(patient_id: str) -> dict:
    """Synthetic CGM dataset summary — TIR, GMI, CV, trend, hypos."""
    return load_glucose(patient_id)


@app.get("/safety/{patient_id}")
def get_safety(patient_id: str) -> list:
    patient, snps = _load_patient_and_snps(patient_id)
    if not patient:
        return []
    return check_safety_flags(snps)


@app.get("/intake/{patient_id}")
def get_intake(patient_id: str) -> dict:
    """Return merged intake (DB + synthetic file fallback)."""
    patient = agent_read_patient(patient_id)
    if not patient:
        intake = load_intake(patient_id)
        if intake_has_clinical_data(intake):
            return {"patient_id": patient_id, "intake": intake, "source": "file"}
        return {"error": f"patient {patient_id} not found"}
    return {
        "patient_id": patient_id,
        "intake": patient.get("intake"),
        "medications_flat": patient.get("current_meds") or [],
    }


@app.put("/intake/{patient_id}")
def put_intake(patient_id: str, payload: dict) -> dict:
    """Save clinician intake form; syncs meds list used by safety/RxNorm tools."""
    from schemas.patient_intake import intake_has_clinical_data

    try:
        saved = write_intake(patient_id, payload or {})
    except ValueError:
        return {"error": f"patient {patient_id} not found"}
    return {
        "patient_id": patient_id,
        "intake": saved,
        "saved": True,
        "has_clinical_data": intake_has_clinical_data(saved),
    }


async def _run_agent_brief(
    patient_id: str,
    *,
    refresh: bool = False,
    cache_only: bool = False,
) -> dict:
    """Single brief pipeline: Nemotron tool loop → assemble_brief (+ PGx synthesis)."""
    if not refresh:
        cached = _read_cached_agent_brief(patient_id)
        if cached:
            return cached
        if cache_only:
            return {"error": "not_cached", "cached": False}

    patient = agent_read_patient(patient_id)
    if not patient:
        return {"error": f"patient {patient_id} not found"}

    brief = await run_with_tools(patient_id, patient, TOOL_DEFINITIONS)
    if isinstance(brief, dict):
        brief.setdefault("generated_at", datetime.now(timezone.utc).isoformat())
        brief["cached"] = False
        _write_cached_agent_brief(patient_id, brief)
    return brief


@app.get("/brief/{patient_id}")
async def get_brief(
    patient_id: str,
    refresh: bool = False,
    cache_only: bool = False,
) -> dict:
    """Alias for the agentic brief — same as GET /agent_brief."""
    return await _run_agent_brief(
        patient_id, refresh=refresh, cache_only=cache_only
    )


def _read_cached_agent_brief(patient_id: str) -> dict | None:
    conn = sqlite3.connect(_db_path())
    cur = conn.cursor()
    cur.execute(
        "SELECT generated_at, brief_json FROM agent_briefs WHERE patient_id = ?",
        (patient_id,),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    try:
        brief = json.loads(row[1])
    except (TypeError, json.JSONDecodeError):
        return None
    brief["generated_at"] = row[0]
    brief["cached"] = True
    return brief


def _write_cached_agent_brief(patient_id: str, brief: dict) -> None:
    conn = sqlite3.connect(_db_path())
    conn.execute(
        """
        INSERT INTO agent_briefs (patient_id, generated_at, brief_json)
        VALUES (?, ?, ?)
        ON CONFLICT(patient_id) DO UPDATE SET
            generated_at = excluded.generated_at,
            brief_json = excluded.brief_json
        """,
        (patient_id, brief.get("generated_at") or "", json.dumps(brief, default=str)),
    )
    conn.commit()
    conn.close()


@app.get("/agent_brief/{patient_id}")
async def get_agent_brief(
    patient_id: str,
    refresh: bool = False,
    cache_only: bool = False,
) -> dict:
    """
    Run the Nemotron tool-calling agent for this patient. Returns the
    structured brief plus `_trace` (every tool the model called, in order).
    Cached in agent_briefs; ?refresh=true forces a re-run; ?cache_only=true
  returns without running when nothing is cached.
    """
    return await _run_agent_brief(
        patient_id, refresh=refresh, cache_only=cache_only
    )


@app.delete("/agent_brief/{patient_id}")
def delete_agent_brief(patient_id: str) -> dict:
    conn = sqlite3.connect(_db_path())
    conn.execute("DELETE FROM agent_briefs WHERE patient_id = ?", (patient_id,))
    conn.commit()
    conn.close()
    return {"deleted": patient_id}


def _new_upload_patient_id() -> str:
    alphabet = string.ascii_uppercase + string.digits
    suffix = "".join(random.choices(alphabet, k=6))
    return f"PT-UP-{suffix}"


@app.post("/upload")
async def upload_genome(file: UploadFile = File(...)) -> dict:
    content = await file.read()
    patient_id = _new_upload_patient_id()
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".txt", prefix="glyco_upload_")
        with os.fdopen(fd, "wb") as tmp:
            tmp.write(content)
        snps = parse_genome(tmp_path)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    parsed_at = datetime.now(timezone.utc).isoformat()

    conn = sqlite3.connect(_db_path())
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO patients (
            patient_id, name, zip, meds, next_appointment_iso,
            snp_profile_json, parsed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            patient_id,
            "Uploaded patient",
            "",
            json.dumps([]),
            "",
            json.dumps(snps),
            parsed_at,
        ),
    )
    conn.commit()
    conn.close()

    return {"patient_id": patient_id, "snps": snps}
