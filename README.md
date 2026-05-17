# GIRA

**Genomic Inference Rx Agent** — pharmacogenomic clinical decision support for Type 2 diabetes. Combines 23andMe-style genotypes, clinician intake, synthetic CGM/WHOOP signals, live ClinVar/PubMed/ClinicalTrials.gov lookups, and an agentic pipeline that produces a structured clinician brief.

**Frontend:** Next.js provider UI in `web/` (login, patient roster, Setup uploads, Brief, Metrics, Intake, Genome tabs).

---

## Stack

| Layer | Technology |
|--------|------------|
| API | FastAPI (`server/main.py`) |
| Agent | GIRA pipeline; LLM via NVIDIA NIM Nemotron / OpenRouter / Ollama (`reasoning/nemotron.py`) |
| Tools | Python registry (`agent/tools.py`) |
| Storage | SQLite (`MEMORY_DB_PATH`, default `./memory.db`) |
| Clinical APIs | ClinVar, PubMed, ClinicalTrials.gov, RxNorm (live HTTP) |
| PGx reference | Static PharmGKB-style table (optional tool only) |

---

## Quick start

```bash
cp .env.example .env
# Set NVIDIA_API_KEY (recommended) and NCBI_EMAIL

python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Demo data (optional)
python scripts/build_patient_file.py
python scripts/build_whoop_data.py
python scripts/build_glucose_data.py
python scripts/seed_db.py

uvicorn server.main:app --reload --port 8000
# OpenAPI docs: http://127.0.0.1:8000/docs

cd web && npm install && npm run dev
# UI: http://127.0.0.1:3000  (set NEXT_PUBLIC_API_URL in web/.env.local)
```

Verify the agent:

```bash
python scripts/test_agent.py PT-002
```

---

## HTTP API (for v0 / external UI)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness |
| `GET` | `/patients` | List patients |
| `POST` | `/upload` | Upload 23andMe raw file → new `patient_id` + SNP profile |
| `GET` | `/intake/{id}` | Patient intake form (DB + `data/intake/` fallback) |
| `PUT` | `/intake/{id}` | Save intake (syncs meds for safety tools) |
| `GET` | `/safety/{id}` | Deterministic PGx safety flags |
| `GET` | `/wearable/{id}` | WHOOP 30-day summary |
| `GET` | `/glucose/{id}` | CGM 30-day summary |
| `GET` | `/agent_brief/{id}` | Run agent (or return cache). Query: `refresh=true`, `cache_only=true` |
| `GET` | `/brief/{id}` | Alias of `/agent_brief` |
| `DELETE` | `/agent_brief/{id}` | Clear cached brief |

**Agent brief response** (JSON): `safety_flags`, `snp_summary`, `recommendation`, `glucose_insight`, `wearable_insight`, `trial_matches`, `citations`, `intake_summary`, `patient_summary`, `_trace` (each step may include `reason` and `agent_role`), `_backend`, optional `_llm_model` (when Nemotron ran on NIM/OpenRouter/Ollama).

Brief generation streams live tool-call events immediately; local demo runs are bounded by `AGENT_TIMEOUT_SEC`.

---

## Patient intake schema

Structured intake lives in `schemas/patient_intake.py` and is stored as JSON on the patient row (`intake_json`) or under `data/intake/{patient_id}.json`.

Fields: **medications** (name, dose, frequency), **vitals**, **goals**, **sideEffects**, **lifestyle**, **comorbidities**, **familyHistory**, **clinicianNotes**.

The agent loads intake at the start of every run and uses it for med matching, goals, and PGx synthesis context.

---

## Repo layout

```
GIRA/
  server/           # FastAPI app
  agent/            # tools.py, memory.py
  reasoning/        # nemotron loop, safety_flags, pgx, prompts
  output/           # assemble_brief (generate_brief tool)
  parsers/          # genome, WHOOP, glucose, intake
  apis/             # ClinVar, PubMed, trials, RxNorm, PharmGKB stub
  schemas/          # intake form types
  scripts/          # seed, reset, test_agent, data builders
  data/             # synthetic genomes, whoop, glucose, intake (no PHI)
```

---

## Hack-a-Claw / Nemotron track

GIRA is positioned as an **autonomous clinical PGx agent**: Nemotron (or deterministic fallback) drives a **tool loop** with live APIs. Defaults in `.env.example` match submission guidance:

- `AGENT_MODE=llm` — Nemotron-visible ReAct loop (`run_with_tools` in `reasoning/nemotron.py`).
- `PGX_SYNTHESIS=1` — optional **writer** pass over SNP text + citations from ClinVar/PubMed only (`reasoning/pgx_synthesis.py`).

**Demo patient:** `PT-003` — SLCO1B1 + CYP2C19 safety, CPIC, and citations (see `scripts/demo_hackathon.sh`).

**Devpost-ready copy:** `DEVPOST.md`.

### Agent modes (appendix)

| `AGENT_MODE` | Behavior |
|---------------|----------|
| `llm` (default) | Nemotron issues JSON `tool_call` / `done` turns; tools execute server-side; trace shows model-driven order when LLM is reachable. |
| `parallel` | Phased asyncio **script** of the same tools — optimized for latency and NCBI rate limits. With `PGX_SYNTHESIS=1`, brief assembly can still invoke the Nemotron **synthesis** pass unless `skip_pgx_synthesis` is forced. |

**Models:** NIM `NIM_MODEL` (default `nvidia/llama-3.3-nemotron-super-49b-v1.5`) or OpenRouter `OPENROUTER_MODEL` / `OPENROUTER_AGENT_MODEL` (default Super 120B free slug). Override `OPENROUTER_AGENT_MODEL` if the default is throttled.

---

## Demo patients

| ID | Story |
|----|--------|
| `PT-001` | Partial metformin responder, adequate CGM |
| `PT-002` | Metformin non-responder → switch narrative (TCF7L2 TT + SLC22A1 AA) |
| `PT-003` | Safety focus: SLCO1B1 TT statin + CYP2C19 AA clopidogrel |

After `seed_db.py`, intake JSON is loaded from `data/intake/PT-00X.json`.

---

## Safety gates

Deterministic checks in `reasoning/safety_flags.py` (always run before brief assembly):

- `SLCO1B1` rs4149056 **TT** → statin myopathy risk  
- `CYP2C19` rs4244285 **AA** → clopidogrel poor metabolizer  
- `VKORC1` rs9923231 **AA** → warfarin hypersensitivity  
- `SLC22A1` rs622342 **AA** → metformin reduced efficacy  

---

## Environment

See `.env.example`. Minimum for production-like runs:

- `AGENT_MODE=llm` and `PGX_SYNTHESIS=1` — Nemotron-visible loop + optional synthesis (defaults in `.env.example`)
- `NVIDIA_API_KEY` — LLM backend (Nemotron on NIM)  
- `NCBI_EMAIL` — PubMed / ClinVar (optional `NCBI_API_KEY` for higher rate limits)  
- `USE_SYNTHETIC_WHOOP=true`, `USE_SYNTHETIC_GLUCOSE=true` — demo wearable data  

---

## Disclaimer

Research and demonstration only. Not a substitute for licensed clinical judgment. All outputs require physician review.
