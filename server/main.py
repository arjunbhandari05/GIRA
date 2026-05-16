"""GIRA FastAPI backend — patients, intake, genomics, agentic briefs."""

import asyncio
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
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel

from agent.memory import (
    create_patient,
    ensure_schema,
    patient_exists,
    read as agent_read_patient,
    register_patient,
    update_genome,
    verify_patient_login,
    write_intake,
)
from server.patient_files import (
    glucose_path,
    has_intake_file,
    intake_file_path,
    patient_assets_status,
    save_json,
    whoop_path,
)
from parsers.intake_client import attach_intake_to_patient, load_intake
from agent.tools import TOOL_DEFINITIONS
from parsers.glucose_client import load_glucose
from parsers.snp_parser import parse_genome
from parsers.whoop_client import get_whoop_analytics
from reasoning.nemotron import run_parallel_tool_plan, run_with_tools
from reasoning.safety_flags import check_safety_flags
from schemas.patient_intake import (
    empty_intake,
    intake_has_clinical_data,
    medications_to_strings,
)

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=True)

app = FastAPI(title="GIRA")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _db_path() -> str:
    path = os.environ.get("MEMORY_DB_PATH", "memory.db")
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


@app.post("/patients")
def post_patient(payload: dict) -> dict:
    """Create a patient shell by display name; upload genome and metrics separately."""
    name = (payload or {}).get("name") or ""
    if not str(name).strip():
        return {"error": "name is required"}
    patient = create_patient(str(name).strip())
    pid = patient.get("patient_id")
    snps = patient.get("snp_profile") or {}
    return {
        "patient_id": pid,
        "name": patient.get("name"),
        "assets": patient_assets_status(pid, snps if isinstance(snps, dict) else {}),
    }


@app.post("/patients/register")
def post_patient_register(payload: dict) -> dict:
    """Self-service patient sign-up with password (stored hashed in SQLite)."""
    body = payload or {}
    name = str(body.get("name") or "").strip()
    password = str(body.get("password") or "")
    zip_code = str(body.get("zip") or "").strip()

    if not name:
        return {"error": "name is required"}
    if len(password) < 6:
        return {"error": "password must be at least 6 characters"}

    patient = register_patient(name, password=password, zip_code=zip_code)
    pid = patient.get("patient_id")
    snps = patient.get("snp_profile") or {}
    return {
        "patient_id": pid,
        "name": patient.get("name"),
        "zip": patient.get("zip") or zip_code,
        "assets": patient_assets_status(pid, snps if isinstance(snps, dict) else {}),
    }


@app.post("/patients/login")
def post_patient_login(payload: dict) -> dict:
    """Verify patient ID and password."""
    body = payload or {}
    patient_id = str(body.get("patient_id") or "").strip().upper()
    password = str(body.get("password") or "")

    if not patient_id:
        return {"error": "patient_id is required"}

    if not patient_exists(patient_id):
        return {"error": "patient not found"}

    if not verify_patient_login(patient_id, password):
        return {"error": "invalid password"}

    patient = agent_read_patient(patient_id)
    return {
        "ok": True,
        "patient_id": patient_id,
        "name": (patient or {}).get("name"),
    }


@app.get("/patients/{patient_id}/assets")
def get_patient_assets(patient_id: str) -> dict:
    patient, snps = _load_patient_and_snps(patient_id)
    if not patient:
        return {"error": f"patient {patient_id} not found"}
    return patient_assets_status(patient_id, snps)


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
    """Return merged intake (DB + uploaded JSON from Setup)."""
    patient = agent_read_patient(patient_id)
    if not patient:
        intake = load_intake(patient_id)
        if intake_has_clinical_data(intake):
            return {
                "patient_id": patient_id,
                "intake": intake,
                "medications_flat": medications_to_strings(intake),
                "source": "file",
            }
        return {"error": f"patient {patient_id} not found"}
    enriched = attach_intake_to_patient(patient)
    intake = enriched.get("intake") or empty_intake(patient_id)
    source = "db"
    if has_intake_file(patient_id) and intake_has_clinical_data(intake):
        source = "merged"
    return {
        "patient_id": patient_id,
        "intake": intake,
        "medications_flat": enriched.get("current_meds") or [],
        "has_clinical_data": intake_has_clinical_data(intake),
        "source": source,
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


def _brief_cache_reads_enabled() -> bool:
    """When false, GET /agent_brief never returns a stale DB brief unless ?cache_only=true."""
    return os.getenv("AGENT_BRIEF_CACHE", "false").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


async def _run_agent_brief(
    patient_id: str,
    *,
    refresh: bool = False,
    cache_only: bool = False,
    on_trace_step: Any | None = None,
) -> dict:
    """Single brief pipeline: GIRA tool loop → assemble_brief (+ PGx synthesis)."""
    if cache_only:
        if not _brief_cache_reads_enabled():
            return {"error": "not_cached", "cached": False}
        cached = _read_cached_agent_brief(patient_id)
        if cached:
            return cached
        return {"error": "not_cached", "cached": False}

    if not refresh and _brief_cache_reads_enabled():
        cached = _read_cached_agent_brief(patient_id)
        if cached:
            return cached

    patient = agent_read_patient(patient_id)
    if not patient:
        return {"error": f"patient {patient_id} not found"}

    agent_mode = os.getenv("AGENT_MODE", "parallel").strip().lower()
    if agent_mode == "llm":
        brief = await run_with_tools(
            patient_id, patient, TOOL_DEFINITIONS, on_trace_step=on_trace_step
        )
    else:
        brief = await run_parallel_tool_plan(
            patient_id, patient, TOOL_DEFINITIONS, on_trace_step=on_trace_step
        )
    if isinstance(brief, dict) and _brief_cache_reads_enabled():
        brief.setdefault("generated_at", datetime.now(timezone.utc).isoformat())
        brief["cached"] = False
        _write_cached_agent_brief(patient_id, brief)
    elif isinstance(brief, dict):
        brief.setdefault("generated_at", datetime.now(timezone.utc).isoformat())
        brief["cached"] = False
    return brief


class FollowupRequest(BaseModel):
    messages: list[dict]


@app.post("/followup/{patient_id}")
async def followup_endpoint(patient_id: str, body: FollowupRequest) -> dict:
    from reasoning.nemotron import followup

    reply = followup(patient_id=patient_id, messages=body.messages)
    return {"reply": reply}


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
    Run the GIRA agent for this patient. Returns the
    structured brief plus `_trace` (every tool the model called, in order).
    Cached in agent_briefs; ?refresh=true forces a re-run; ?cache_only=true
  returns without running when nothing is cached.
    """
    return await _run_agent_brief(
        patient_id, refresh=refresh, cache_only=cache_only
    )


def _sse_payload(payload: dict) -> str:
    try:
        body = json.dumps(payload, default=str)
    except (TypeError, ValueError) as exc:
        body = json.dumps(
            {"event": "error", "message": f"Could not encode brief for stream: {exc}"}
        )
    return f"data: {body}\n\n"


_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@app.get("/agent_brief/{patient_id}/stream")
async def stream_agent_brief(
    patient_id: str,
    refresh: bool = False,
    cache_only: bool = False,
):
    """Server-sent events: one event per GIRA pipeline step, then the full brief."""

    async def replay_cached(cached: dict):
        yield _sse_payload({"event": "start", "patient_id": patient_id, "cached": True})
        for step in cached.get("_trace") or []:
            yield _sse_payload({"event": "step", "step": step})
        yield _sse_payload({"event": "complete", "brief": cached})

    if not refresh and _brief_cache_reads_enabled():
        cached = _read_cached_agent_brief(patient_id)
        if cached:
            return StreamingResponse(
                replay_cached(cached),
                media_type="text/event-stream",
                headers=_SSE_HEADERS,
            )

    if cache_only:
        async def not_cached():
            yield _sse_payload({"event": "error", "message": "not_cached"})

        return StreamingResponse(
            not_cached(), media_type="text/event-stream", headers=_SSE_HEADERS
        )

    patient = agent_read_patient(patient_id)
    if not patient:

        async def missing():
            yield _sse_payload(
                {"event": "error", "message": f"patient {patient_id} not found"}
            )

        return StreamingResponse(
            missing(), media_type="text/event-stream", headers=_SSE_HEADERS
        )

    queue: asyncio.Queue = asyncio.Queue()

    def on_trace_step(step: dict) -> None:
        try:
            queue.put_nowait({"event": "step", "step": step})
        except asyncio.QueueFull:
            pass

    async def run_agent():
        timeout_sec = float(os.getenv("AGENT_TIMEOUT_SEC", "60"))
        try:
            brief = await asyncio.wait_for(
                _run_agent_brief(
                    patient_id, refresh=True, on_trace_step=on_trace_step
                ),
                timeout=timeout_sec,
            )
            if isinstance(brief, dict) and brief.get("error"):
                await queue.put({"event": "error", "message": brief["error"]})
            else:
                await queue.put({"event": "complete", "brief": brief})
        except asyncio.TimeoutError:
            await queue.put({
                "event": "error",
                "message": f"Brief generation exceeded the {timeout_sec:.0f} second demo timeout.",
            })
        except Exception as exc:
            await queue.put({"event": "error", "message": str(exc)})
        finally:
            await queue.put(None)

    async def event_generator():
        yield _sse_payload({"event": "start", "patient_id": patient_id})
        task = asyncio.create_task(run_agent())
        while True:
            item = await queue.get()
            if item is None:
                break
            yield _sse_payload(item)
        await task

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@app.delete("/agent_brief/{patient_id}")
def delete_agent_brief(patient_id: str) -> dict:
    conn = sqlite3.connect(_db_path())
    conn.execute("DELETE FROM agent_briefs WHERE patient_id = ?", (patient_id,))
    conn.commit()
    conn.close()
    ctx_dir = ROOT / "output" / "patient_contexts"
    ctx_path = ctx_dir / f"{patient_id}_context.json"
    if ctx_path.is_file():
        ctx_path.unlink()
    return {"deleted": patient_id}


@app.delete("/agent_briefs")
def delete_all_agent_briefs() -> dict:
    """Clear every cached brief and patient context file (demo reset)."""
    conn = sqlite3.connect(_db_path())
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM agent_briefs")
    count = int(cur.fetchone()[0])
    conn.execute("DELETE FROM agent_briefs")
    conn.commit()
    conn.close()
    ctx_dir = ROOT / "output" / "patient_contexts"
    removed_ctx = 0
    if ctx_dir.is_dir():
        for path in ctx_dir.glob("*_context.json"):
            path.unlink(missing_ok=True)
            removed_ctx += 1
    return {"deleted_briefs": count, "deleted_context_files": removed_ctx}


def _new_upload_patient_id() -> str:
    alphabet = string.ascii_uppercase + string.digits
    suffix = "".join(random.choices(alphabet, k=6))
    return f"PT-UP-{suffix}"


async def _parse_genome_upload(file: UploadFile) -> dict:
    content = await file.read()
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".txt", prefix="gira_upload_")
        with os.fdopen(fd, "wb") as tmp:
            tmp.write(content)
        return parse_genome(tmp_path)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


@app.post("/patients/{patient_id}/genome")
async def upload_patient_genome(patient_id: str, file: UploadFile = File(...)) -> dict:
    """Upload a 23andMe-style raw file for an existing patient."""
    if not patient_exists(patient_id):
        return {"error": f"patient {patient_id} not found"}
    snps = await _parse_genome_upload(file)
    meta = update_genome(patient_id, snps)
    return {
        **meta,
        "snps": snps,
        "assets": patient_assets_status(patient_id, snps),
    }


@app.post("/patients/{patient_id}/wearable")
async def upload_patient_wearable(patient_id: str, file: UploadFile = File(...)) -> dict:
    """Store synthetic WHOOP JSON at data/whoop/{patient_id}.json"""
    if not patient_exists(patient_id):
        return {"error": f"patient {patient_id} not found"}
    raw = await file.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {"error": "invalid JSON file"}
    if not isinstance(payload, dict):
        return {"error": "WHOOP file must be a JSON object"}
    payload.setdefault("patient_id", patient_id)
    path = whoop_path(patient_id)
    save_json(path, payload)
    return {"patient_id": patient_id, "path": str(path), "saved": True}


@app.post("/patients/{patient_id}/glucose")
async def upload_patient_glucose(patient_id: str, file: UploadFile = File(...)) -> dict:
    """Store synthetic CGM JSON at data/glucose/{patient_id}.json"""
    if not patient_exists(patient_id):
        return {"error": f"patient {patient_id} not found"}
    raw = await file.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {"error": "invalid JSON file"}
    if not isinstance(payload, dict):
        return {"error": "glucose file must be a JSON object"}
    payload.setdefault("patient_id", patient_id)
    path = glucose_path(patient_id)
    save_json(path, payload)
    return {"patient_id": patient_id, "path": str(path), "saved": True}


@app.post("/patients/{patient_id}/intake-file")
async def upload_patient_intake_file(patient_id: str, file: UploadFile = File(...)) -> dict:
    """Upload intake form JSON; persists to disk and SQLite."""
    if not patient_exists(patient_id):
        return {"error": f"patient {patient_id} not found"}
    raw = await file.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {"error": "invalid JSON file"}
    if not isinstance(payload, dict):
        return {"error": "intake file must be a JSON object"}
    path = intake_file_path(patient_id)
    save_json(path, payload)
    try:
        saved = write_intake(patient_id, payload)
    except ValueError:
        return {"error": f"patient {patient_id} not found"}
    return {
        "patient_id": patient_id,
        "path": str(path),
        "saved": True,
        "intake": saved,
        "has_clinical_data": intake_has_clinical_data(saved),
    }


@app.post("/upload")
async def upload_genome(file: UploadFile = File(...)) -> dict:
    """Legacy: create a new patient from genome upload only."""
    content = await file.read()
    patient_id = _new_upload_patient_id()
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".txt", prefix="gira_upload_")
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
