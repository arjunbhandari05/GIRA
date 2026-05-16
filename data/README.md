# data/

Synthetic patient inputs for the 3 demo profiles. **Never put real PHI here.**

Generate everything by running:

```bash
python scripts/build_patient_file.py    # writes data/genomes/patient_{a,b,c}.txt
python scripts/build_whoop_data.py      # writes data/whoop/patient_{a,b,c}.json
```

## Layout

```
data/
  genomes/
    patient_a.txt   PT-001 · Alex Rivera  · partial responder
    patient_b.txt   PT-002 · Jordan Kim   · non-responder
    patient_c.txt   PT-003 · Morgan Chen  · safety flags
  whoop/
    patient_a.json  30d HRV trending up
    patient_b.json  30d HRV flat
    patient_c.json  30d normal + SpO₂ dips < 94% on 7 nights
```
