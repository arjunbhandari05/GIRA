# data/

Synthetic patient files only. **Do not store real PHI here.**

## Fresh start

```bash
python scripts/reset_patient_data.py --yes
```

## Onboarding a new patient

1. **`POST /upload`** — 23andMe raw `.txt` → `PT-UP-XXXXXX` + SNP profile in SQLite  
2. **Intake** — `PUT /intake/{patient_id}` with JSON (see `schemas/patient_intake.py`) **or** copy a template:  
   `data/intake/PT-001.json` → `data/intake/PT-UP-xxxxx.json`  
3. **Wearables** — for patient id `PT-UP-ABC123`:

| Data | Path |
|------|------|
| WHOOP | `data/whoop/pt-up-abc123.json` |
| Glucose | `data/glucose/pt_up_abc123.json` |

Use `scripts/build_whoop_data.py` / `scripts/build_glucose_data.py` as structure references.

4. **`GET /agent_brief/{patient_id}?refresh=true`** — run the GIRA agent

## Demo trio (regenerate)

```bash
python scripts/build_patient_file.py
python scripts/build_whoop_data.py
python scripts/build_glucose_data.py
python scripts/seed_db.py   # also loads data/intake/PT-001..003.json
```

## Intake files

| File | Patient |
|------|---------|
| `intake/PT-001.json` | Alex Rivera — controlled, metformin |
| `intake/PT-002.json` | Jordan Kim — non-responder, GI side effects |
| `intake/PT-003.json` | Morgan Chen — statin muscle pain, antiplatelet stack |
