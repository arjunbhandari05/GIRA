# GlycoAgent

Pharmacogenomic clinical decision support agent for Type 2 diabetes patients.

Takes a patient's 23andMe raw genome file + WHOOP wearable data, runs it through 5 clinical APIs in parallel, feeds everything into a local Nemotron LLM, and generates a clinician brief before each appointment.

---

## Stack

- **Agent framework:** OpenClaw (JS) with persistent SQLite memory
- **LLM:** Nemotron-70B via Ollama (local) or NVIDIA NIM (cloud fallback)
- **Clinical APIs:** ClinVar, PharmGKB, PubMed, ClinicalTrials.gov v2, RxNorm
- **Wearable:** WHOOP API (OAuth2) or synthetic JSON fallback
- **Genomic input:** 23andMe raw .txt format
- **Frontend:** React + recharts
- **Backend:** Python (FastAPI) + Node.js (agent layer)

---

## Repo layout

```
glycoagent/
  agent/        # OpenClaw agent loop (JS)
  parsers/      # genome + wearable parsers (Python)
  apis/         # 5 clinical API clients (Python, async)
  reasoning/    # Nemotron prompt + inference + safety post-checks
  output/       # JSON → clinician brief + plain-English patient summary
  data/         # demo patient genomes (.txt) + synthetic WHOOP JSON
  scripts/      # data generators + DB seeders
  ui/           # React + recharts frontend
  server/       # FastAPI bridge between UI and agent
```

---

## Getting started

```bash
cp .env.example .env

pip install -r requirements.txt
npm install
cd ui && npm install && cd ..

python scripts/build_whoop_data.py
python scripts/build_patient_file.py
python scripts/seed_db.py

uvicorn server.main:app --reload --port 8000

node agent/heartbeat.js

cd ui && npm run dev
```

---

## Demo patients

| ID     | Name         | ZIP   | Meds                          | Story                                 |
|--------|--------------|-------|-------------------------------|---------------------------------------|
| PT-001 | Alex Rivera  | 95064 | metformin 1000mg              | partial responder, monitoring         |
| PT-002 | Jordan Kim   | 94103 | metformin 500mg + atorva 20mg | non-responder, switch to semaglutide  |
| PT-003 | Morgan Chen  | 94158 | atorva 40mg + clopidogrel 75mg| safety flags — statin + clopidogrel   |

---

## The 10 target SNPs

| rsID       | Gene    | Clinical relevance                            |
|------------|---------|-----------------------------------------------|
| rs7903146  | TCF7L2  | T2D risk + GLP-1 response                     |
| rs622342   | SLC22A1 | metformin OCT1 transport                      |
| rs5219     | KCNJ11  | beta-cell insulin secretion / sulfonylurea    |
| rs1801282  | PPARG   | insulin sensitivity / TZD response            |
| rs757110   | ABCC8   | SUR1 sulfonylurea binding                     |
| rs9939609  | FTO     | obesity risk / GLP-1 weight response          |
| rs4149056  | SLCO1B1 | statin myopathy risk (SAFETY GATE)            |
| rs429358   | APOE    | CVD risk / SGLT2 indication                   |
| rs4244285  | CYP2C19 | clopidogrel metabolism (SAFETY GATE)          |
| rs9923231  | VKORC1  | warfarin dose sensitivity (SAFETY GATE)       |

---

## Build order / ownership

| # | File                            | Owner | Status |
|---|---------------------------------|-------|--------|
| 1 | scripts/build_whoop_data.py     |       | stub   |
| 2 | scripts/build_patient_file.py   |       | stub   |
| 3 | scripts/seed_db.py              |       | stub   |
| 4 | parsers/snp_parser.py           |       | stub   |
| 5 | parsers/whoop_client.py         |       | stub   |
| 6 | agent/memory.js                 |       | stub   |
| 7 | apis/clinvar.py                 |       | stub   |
| 8 | apis/pharmgkb.py                |       | stub   |
| 9 | apis/pubmed.py                  |       | stub   |
| 10| apis/clinical_trials.py         |       | stub   |
| 11| apis/rxnorm.py                  |       | stub   |
| 12| reasoning/prompts.py            |       | stub   |
| 13| reasoning/nemotron.py           |       | stub   |
| 14| reasoning/safety_flags.py       |       | stub   |
| 15| agent/claw.js                   |       | stub   |
| 16| agent/heartbeat.js              |       | stub   |
| 17| agent/policy.json               |       | stub   |
| 18| server/main.py                  |       | stub   |
| 19| output/brief_builder.py         |       | stub   |
| 20| ui/                             |       | stub   |

Claim a row in your PR description.

---

## Safety gates (non-negotiable)

These post-inference checks run **after** Nemotron returns and override its output if they fire:

- `SLCO1B1` rs4149056 **TT** → flag any statin (recommend pravastatin)
- `CYP2C19` rs4244285 **AA** (*2/*2) → flag clopidogrel (FDA Black Box; switch to prasugrel/ticagrelor)
- `VKORC1`  rs9923231 **AA** → flag warfarin (dose reduction required)

See `reasoning/safety_flags.py`.

---

## Disclaimer

Research/demo only. Not a substitute for physician review. Every recommendation must be cited and reviewed.
