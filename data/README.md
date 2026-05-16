# data/

Patient inputs for GlycoAgent. **Never put real PHI here.**

## Fresh start

```bash
python scripts/reset_patient_data.py --yes   # wipes DB + all files below
```

Then upload a genome in the UI (`POST /upload` → `PT-UP-XXXXXX`).

## After upload — add synthetic wearable + CGM

For patient id `PT-UP-ABC123`:

| Data | Path |
|------|------|
| WHOOP | `data/whoop/pt-up-abc123.json` |
| Glucose | `data/glucose/pt_up_abc123.json` |

Copy structure from `scripts/build_whoop_data.py` / `scripts/build_glucose_data.py` output, or duplicate and edit a prior JSON.

## Regenerate demo trio (optional)

```bash
python scripts/build_patient_file.py
python scripts/build_whoop_data.py
python scripts/build_glucose_data.py
python scripts/seed_db.py
```
