"""GlycoAgent API — Round 1: patients DB and 23andMe upload parsing."""

import json
import os
import random
import sqlite3
import string
import tempfile
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List

import aiohttp
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from agent.memory import read as agent_read_patient
from agent.tools import TOOL_DEFINITIONS
from apis.clinvar import get_clinvar
from apis.pharmgkb import get_pharmgkb
from apis.pubmed import get_pubmed
from output.brief_builder import build_brief
from parsers.glucose_client import load_glucose
from parsers.snp_parser import parse_genome
from parsers.whoop_client import get_whoop_analytics
from reasoning.nemotron import run_nemotron, run_with_tools
from reasoning.prompts import build_context_prompt
from reasoning.safety_flags import check_safety_flags

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
    """Cache table for agentic briefs so the UI doesn't pay the LLM cost twice."""
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


def _pharmgkb_for_snps(snps: dict) -> dict:
    return {
        rsid: get_pharmgkb(rsid)
        for rsid in snps.keys()
    }


async def _run_api_annotations(snps: dict) -> dict:
    rsids = list(snps.keys())
    timeout = aiohttp.ClientTimeout(total=90)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        clinvar = {}
        for index, rsid in enumerate(rsids):
            if index > 0:
                await asyncio.sleep(1)
            clinvar[rsid] = await get_clinvar(rsid, session)

        queries = []
        for rsid in rsids:
            annotation = get_pharmgkb(rsid)
            if annotation.get("finding") == "No annotation available.":
                continue
            gene = annotation.get("gene")
            drug = annotation.get("drug")
            if gene and drug:
                queries.append(f"{gene} {drug} pharmacogenomics")
            if len(queries) == 3:
                break

        pubmed_results = await asyncio.gather(
            *(get_pubmed(query, session) for query in queries)
        )
        pubmed = {
            query: result
            for query, result in zip(queries, pubmed_results)
        }

    return {"clinvar": clinvar, "pubmed": pubmed}


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


@app.get("/apis/{patient_id}")
async def get_api_annotations(patient_id: str) -> dict:
    patient, snps = _load_patient_and_snps(patient_id)
    if not patient:
        return {"clinvar": {}, "pubmed": {}}
    return await _run_api_annotations(snps)


@app.get("/brief/{patient_id}")
async def get_brief(patient_id: str) -> dict:
    patient, snps = _load_patient_and_snps(patient_id)
    if not patient:
        return {"error": "patient not found"}

    wearable = get_whoop_analytics(patient_id)
    safety_flags = check_safety_flags(snps)
    pharmgkb = _pharmgkb_for_snps(snps)
    api_results = await _run_api_annotations(snps)
    clinvar = api_results["clinvar"]
    pubmed = api_results["pubmed"]
    context_prompt = build_context_prompt(
        patient,
        snps,
        wearable,
        pharmgkb,
        clinvar,
        pubmed,
        safety_flags,
    )
    nemotron_text = await run_nemotron(context_prompt)
    brief_md = build_brief(
        patient,
        snps,
        wearable,
        pharmgkb,
        clinvar,
        safety_flags,
        nemotron_text,
    )

    generated_at = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(_db_path())
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO briefs (
            patient_id, generated_at, brief_md, wearable_snapshot_json
        ) VALUES (?, ?, ?, ?)
        """,
        (
            patient_id,
            generated_at,
            brief_md,
            json.dumps(wearable),
        ),
    )
    conn.commit()
    conn.close()

    return {
        "brief_md": brief_md,
        "safety_flags": safety_flags,
        "patient": patient,
        "wearable": wearable,
    }


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
async def get_agent_brief(patient_id: str, refresh: bool = False) -> dict:
    """
    Run the Nemotron tool-calling agent for this patient. Returns the
    structured brief plus `_trace` (every tool the model called, in order).
    Cached in the agent_briefs table so the second click is instant; pass
    ?refresh=true to force a re-run.
    """
    if not refresh:
        cached = _read_cached_agent_brief(patient_id)
        if cached:
            return cached

    patient = agent_read_patient(patient_id)
    if not patient:
        return {"error": f"patient {patient_id} not found"}

    brief = await run_with_tools(patient_id, patient, TOOL_DEFINITIONS)
    if isinstance(brief, dict):
        brief.setdefault("generated_at", datetime.now(timezone.utc).isoformat())
        brief["cached"] = False
        _write_cached_agent_brief(patient_id, brief)
    return brief


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
