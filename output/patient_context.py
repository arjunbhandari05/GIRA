"""
output/patient_context.py

Writes a structured context file for a specific patient after the GIRA agent run
completes. This file is loaded by the Nemotron reasoning loop at the START of every
follow-up Q&A call so the model has full grounded context and never hallucinates
patient-specific details.
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional

CONTEXT_DIR = os.environ.get("CONTEXT_DIR", "./output/patient_contexts")


def write_patient_context(
    patient_id: str,
    brief: dict,
    intake: dict,
    genome_profile: dict,
    glucose_summary: dict,
    wearable_summary: dict,
) -> str:
    os.makedirs(CONTEXT_DIR, exist_ok=True)
    ctx = _build_context(patient_id, brief, intake, genome_profile, glucose_summary, wearable_summary)
    path = os.path.join(CONTEXT_DIR, f"{patient_id}_context.json")
    with open(path, "w") as f:
        json.dump(ctx, f, indent=2, default=str)
    return path


def load_patient_context(patient_id: str) -> Optional[dict]:
    path = os.path.join(CONTEXT_DIR, f"{patient_id}_context.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def _build_context(patient_id, brief, intake, genome_profile, glucose_summary, wearable_summary):
    return {
        "meta": {
            "patient_id": patient_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "gira_version": "1.0",
            "backend": brief.get("_backend", "unknown"),
            "context_purpose": (
                "This file is the single source of truth for follow-up Q&A about "
                "this patient. It contains every data signal the GIRA agent used. "
                "NEVER fabricate or extrapolate values not present here. If a value "
                "is missing, say so explicitly."
            ),
        },
        "patient": {
            "id": patient_id,
            "name": intake.get("name", "Unknown"),
            "age": intake.get("age"),
            "sex": intake.get("sex"),
            "weight_kg": intake.get("vitals", {}).get("weight_kg"),
            "height_cm": intake.get("vitals", {}).get("height_cm"),
            "bmi": intake.get("vitals", {}).get("bmi"),
            "hba1c_pct": intake.get("vitals", {}).get("hba1c_pct"),
            "systolic_bp": intake.get("vitals", {}).get("systolic_bp"),
            "diastolic_bp": intake.get("vitals", {}).get("diastolic_bp"),
            "egfr": intake.get("vitals", {}).get("egfr"),
            "primary_condition": "Type 2 Diabetes",
            "comorbidities": intake.get("comorbidities", []),
            "family_history": intake.get("familyHistory", []),
            "goals": intake.get("goals", []),
            "lifestyle": intake.get("lifestyle", {}),
            "clinician_notes": intake.get("clinicianNotes", ""),
            "side_effects_reported": intake.get("sideEffects", []),
        },
        "current_medications": [
            {"name": m.get("name"), "dose": m.get("dose"), "frequency": m.get("frequency")}
            for m in intake.get("medications", [])
        ],
        "pharmacogenomics": {
            "source": "23andMe raw file parsed by parsers/genome.py",
            "snps": _extract_key_snps(genome_profile),
            "full_snp_count": genome_profile.get("total_snps_parsed", 0),
            "pgx_phenotypes": _derive_pgx_phenotypes(genome_profile),
        },
        "safety_flags": brief.get("safety_flags", []),
        "glucose_30d": {
            "source": "Synthetic CGM — 30-day summary via GET /glucose/{id}",
            "avg_fasting_mg_dl": glucose_summary.get("avg_fasting"),
            "avg_postprandial_rise_mg_dl": glucose_summary.get("avg_postprandial_rise"),
            "time_in_range_pct": glucose_summary.get("time_in_range_pct"),
            "time_high_pct": glucose_summary.get("time_high_pct"),
            "time_low_pct": glucose_summary.get("time_low_pct"),
            "peak_glucose_mg_dl": glucose_summary.get("peak_glucose"),
            "glucose_variability_cv_pct": glucose_summary.get("glucose_variability_cv"),
            "nocturnal_lows_detected": glucose_summary.get("nocturnal_lows", False),
            "dawn_phenomenon_present": glucose_summary.get("dawn_phenomenon", False),
            "dawn_phenomenon_days_of_30": glucose_summary.get("dawn_phenomenon_days"),
            "clinical_interpretation": glucose_summary.get("interpretation", ""),
        },
        "wearable_30d": {
            "source": "Synthetic WHOOP — 30-day summary via GET /wearable/{id}",
            "avg_recovery_pct": wearable_summary.get("avg_recovery_pct"),
            "avg_resting_hr_bpm": wearable_summary.get("avg_resting_hr"),
            "avg_hrv_ms": wearable_summary.get("avg_hrv_ms"),
            "avg_strain": wearable_summary.get("avg_strain"),
            "avg_sleep_score_pct": wearable_summary.get("sleep_score_pct"),
            "avg_deep_sleep_pct": wearable_summary.get("deep_sleep_pct"),
            "avg_sleep_duration_hrs": wearable_summary.get("avg_sleep_hrs"),
            "cardiovascular_stress_flag": wearable_summary.get("avg_hrv_ms", 99) < 30,
            "clinical_interpretation": wearable_summary.get("interpretation", ""),
        },
        "recommendation": {
            "drug_name": brief.get("recommendation", {}).get("drug_name"),
            "drug_class": brief.get("recommendation", {}).get("drug_class"),
            "evidence_level": brief.get("recommendation", {}).get("evidence_level"),
            "confidence": brief.get("recommendation", {}).get("confidence"),
            "rationale": brief.get("recommendation", {}).get("rationale", {}),
            "agent_narrative": brief.get("recommendation", {}).get("narrative", ""),
        },
        "brief_text": {
            "snp_summary": brief.get("snp_summary", ""),
            "glucose_insight": brief.get("glucose_insight", ""),
            "wearable_insight": brief.get("wearable_insight", ""),
            "intake_summary": brief.get("intake_summary", ""),
            "patient_summary": brief.get("patient_summary", ""),
            "full_recommendation_text": brief.get("recommendation", {}).get("full_text", ""),
        },
        "evidence": {
            "citations": brief.get("citations", []),
            "trial_matches": brief.get("trial_matches", []),
            "clinvar_variants": brief.get("_trace", {}).get("clinvar_hits", []),
            "pubmed_abstracts": brief.get("_trace", {}).get("pubmed_abstracts", []),
            "rxnorm_interactions": brief.get("_trace", {}).get("rxnorm_interactions", []),
            "pharmgkb_annotations": brief.get("_trace", {}).get("pharmgkb_hits", []),
        },
        "agent_trace": {
            "tools_called": brief.get("_trace", {}).get("tools_called", []),
            "tool_outputs_summary": brief.get("_trace", {}).get("tool_summaries", []),
            "reasoning_steps": brief.get("_trace", {}).get("reasoning_steps", []),
            "total_tokens_used": brief.get("_trace", {}).get("tokens_used"),
            "llm_backend": brief.get("_backend", "unknown"),
        },
    }


def _extract_key_snps(genome_profile: dict) -> list:
    key_rsids = {
        "rs622342":  {"gene": "SLC22A1", "relevance": "Metformin OCT1 transporter efficacy"},
        "rs7903146": {"gene": "TCF7L2",  "relevance": "Type 2 diabetes risk; incretin response"},
        "rs4149056": {"gene": "SLCO1B1", "relevance": "Statin myopathy risk (OATP1B1)"},
        "rs4244285": {"gene": "CYP2C19", "relevance": "Clopidogrel / PPI metabolism"},
        "rs9923231": {"gene": "VKORC1",  "relevance": "Warfarin hypersensitivity"},
        "rs1801133": {"gene": "MTHFR",   "relevance": "Folate metabolism; metformin B12 interaction"},
        "rs1045642": {"gene": "ABCB1",   "relevance": "Drug efflux transporter; broad medication relevance"},
        "rs2306283": {"gene": "SLCO1B1", "relevance": "Secondary statin transport variant"},
        "rs1799853": {"gene": "CYP2C9",  "relevance": "NSAID / sulfonylurea metabolism"},
        "rs1057910": {"gene": "CYP2C9",  "relevance": "Warfarin / sulfonylurea dose sensitivity"},
    }
    snps = genome_profile.get("snps", {})
    result = []
    for rsid, meta in key_rsids.items():
        genotype = snps.get(rsid)
        if genotype:
            result.append({
                "rsid": rsid,
                "gene": meta["gene"],
                "genotype": genotype,
                "relevance": meta["relevance"],
            })
    return result


def _derive_pgx_phenotypes(genome_profile: dict) -> dict:
    snps = genome_profile.get("snps", {})
    phenotypes = {}

    g = snps.get("rs622342")
    if g:
        phenotypes["SLC22A1_OCT1"] = {
            "genotype": g,
            "phenotype": (
                "Poor OCT1 function — metformin reduced efficacy" if g == "AA"
                else "Intermediate OCT1" if g == "AC"
                else "Normal OCT1 — metformin expected to work"
            ),
        }
    g = snps.get("rs4149056")
    if g:
        phenotypes["SLCO1B1_OATP1B1"] = {
            "genotype": g,
            "phenotype": (
                "High statin myopathy risk — avoid simvastatin >20mg" if g == "TT"
                else "Intermediate statin risk — caution with high-dose simvastatin" if g == "TC"
                else "Normal statin transport"
            ),
        }
    g = snps.get("rs4244285")
    if g:
        phenotypes["CYP2C19"] = {
            "genotype": g,
            "phenotype": (
                "Poor metabolizer — clopidogrel contraindicated" if g == "AA"
                else "Intermediate metabolizer — monitor clopidogrel response" if g == "AG"
                else "Normal CYP2C19 metabolizer"
            ),
        }
    g = snps.get("rs9923231")
    if g:
        phenotypes["VKORC1"] = {
            "genotype": g,
            "phenotype": (
                "High warfarin sensitivity — start at reduced dose" if g == "AA"
                else "Intermediate warfarin sensitivity" if g == "AG"
                else "Normal warfarin sensitivity"
            ),
        }
    g = snps.get("rs7903146")
    if g:
        phenotypes["TCF7L2"] = {
            "genotype": g,
            "phenotype": (
                "Highest T2D risk allele — impaired incretin response; GLP-1 agonist preferred" if g == "TT"
                else "Intermediate T2D risk" if g == "CT"
                else "Lower TCF7L2-associated risk"
            ),
        }
    return phenotypes


def build_followup_system_prompt(ctx: dict) -> str:
    if not ctx:
        return (
            "You are GIRA, a pharmacogenomic clinical decision support assistant. "
            "No patient context file is available for this session — the agent brief "
            "may not have run yet. Inform the user that the brief must be generated "
            "first. Do not fabricate any patient data."
        )

    p = ctx.get("patient", {})
    rec = ctx.get("recommendation", {})
    glucose = ctx.get("glucose_30d", {})
    wear = ctx.get("wearable_30d", {})
    pgx = ctx.get("pharmacogenomics", {})
    flags = ctx.get("safety_flags", [])
    evidence = ctx.get("evidence", {})
    brief_text = ctx.get("brief_text", {})
    meds = ctx.get("current_medications", [])
    meta = ctx.get("meta", {})

    flag_lines = "\n".join(
        f"  - {f.get('gene')} {f.get('rsid', f.get('variant', ''))} "
        f"{f.get('genotype')}: {f.get('impact')} [{f.get('severity', '').upper()}]"
        for f in flags
    ) or "  None detected."

    snp_lines = "\n".join(
        f"  - {s['rsid']} ({s['gene']}) genotype {s['genotype']}: {s['relevance']}"
        for s in pgx.get("snps", [])
    ) or "  Not available."

    phenotype_lines = "\n".join(
        f"  - {gene}: {v['genotype']} → {v['phenotype']}"
        for gene, v in pgx.get("pgx_phenotypes", {}).items()
    ) or "  Not available."

    med_lines = "\n".join(
        f"  - {m['name']} {m.get('dose', '')} {m.get('frequency', '')}".strip()
        for m in meds
    ) or "  None listed."

    trial_lines = "\n".join(
        f"  - {t.get('nct_id')}: {t.get('title')} [{t.get('status')}] {t.get('location', '')}"
        for t in evidence.get("trial_matches", [])
    ) or "  No matching trials found."

    citation_lines = "\n".join(
        f"  [{c.get('index', i+1)}] {c.get('text', '')}"
        for i, c in enumerate(evidence.get("citations", []))
    ) or "  No citations retrieved."

    comorbidities = ", ".join(p.get("comorbidities", [])) or "None listed"
    goals = "; ".join(p.get("goals", [])) or "Not specified"
    side_effects = ", ".join(p.get("side_effects_reported", [])) or "None reported"
    rationale = rec.get("rationale", {})

    return f"""
You are GIRA, a pharmacogenomic clinical decision support assistant. You have already
completed a full agent run for the patient below. Your job now is to answer follow-up
questions from the clinician or patient interface.

CRITICAL RULES:
- Ground EVERY answer in the data below. Do not invent values, drug doses, genotypes,
  trial IDs, or citation details not present in this context.
- If information is missing, say "That information was not captured in this patient's
  brief" — never guess.
- Always note that outputs require physician review.
- For patient-facing questions, use plain language, explain gene names, never blame
  the patient for their genetics.
- Cite from the evidence section by index number when relevant.
- Do not repeat this entire context back to the user. Use it to inform answers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATIENT: {p.get('name', 'Unknown')} ({p.get('id', 'unknown')})
Generated: {meta.get('generated_at', 'unknown')} | Backend: {meta.get('backend', 'unknown')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DEMOGRAPHICS & VITALS
  Age: {p.get('age')} | Sex: {p.get('sex')}
  Weight: {p.get('weight_kg')} kg | Height: {p.get('height_cm')} cm | BMI: {p.get('bmi')}
  HbA1c: {p.get('hba1c_pct')}% | BP: {p.get('systolic_bp')}/{p.get('diastolic_bp')} mmHg
  eGFR: {p.get('egfr')} mL/min/1.73m²
  Comorbidities: {comorbidities}
  Family history: {', '.join(p.get('family_history', [])) or 'Not specified'}
  Patient goals: {goals}
  Side effects reported: {side_effects}
  Lifestyle: {json.dumps(p.get('lifestyle', {}), default=str)}
  Clinician notes: {p.get('clinician_notes') or 'None'}

CURRENT MEDICATIONS
{med_lines}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHARMACOGENOMICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Key SNPs ({pgx.get('full_snp_count', '?')} total parsed):
{snp_lines}

PGx phenotypes:
{phenotype_lines}

Safety flags (deterministic):
{flag_lines}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CGM / GLUCOSE — 30-DAY SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Avg fasting glucose:     {glucose.get('avg_fasting_mg_dl')} mg/dL
  Time in range (70–180):  {glucose.get('time_in_range_pct')}%
  Time above 180:          {glucose.get('time_high_pct')}%
  Time below 70:           {glucose.get('time_low_pct')}%
  Peak glucose:            {glucose.get('peak_glucose_mg_dl')} mg/dL
  Avg postprandial rise:   +{glucose.get('avg_postprandial_rise_mg_dl')} mg/dL
  Glucose variability CV:  {glucose.get('glucose_variability_cv_pct')}%
  Nocturnal lows:          {'Yes' if glucose.get('nocturnal_lows_detected') else 'No'}
  Dawn phenomenon:         {'Present' if glucose.get('dawn_phenomenon_present') else 'Absent'}{f" — {glucose.get('dawn_phenomenon_days_of_30')}/30 days" if glucose.get('dawn_phenomenon_present') else ''}

Agent interpretation: {brief_text.get('glucose_insight', 'Not available.')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WEARABLE — WHOOP 30-DAY SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Avg recovery:       {wear.get('avg_recovery_pct')}%
  Avg resting HR:     {wear.get('avg_resting_hr_bpm')} bpm
  Avg HRV:            {wear.get('avg_hrv_ms')} ms {'⚠ Low — autonomic stress' if wear.get('cardiovascular_stress_flag') else ''}
  Avg strain:         {wear.get('avg_strain')}
  Sleep score:        {wear.get('avg_sleep_score_pct')}%
  Deep sleep:         {wear.get('avg_deep_sleep_pct')}%
  Sleep duration:     {wear.get('avg_sleep_duration_hrs')} hrs

Agent interpretation: {brief_text.get('wearable_insight', 'Not available.')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGENT RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Drug:            {rec.get('drug_name')}
  Class:           {rec.get('drug_class')}
  Evidence level:  {rec.get('evidence_level')}
  Confidence:      {rec.get('confidence')}

Genomic rationale:  {rationale.get('genomic', 'Not provided.')}
CGM rationale:      {rationale.get('cgm', 'Not provided.')}
Wearable rationale: {rationale.get('wearable', 'Not provided.')}
Safety note:        {rationale.get('safety_note', 'None.')}

Full narrative: {brief_text.get('full_recommendation_text') or brief_text.get('snp_summary', 'Not available.')}
Patient summary: {brief_text.get('patient_summary', 'Not available.')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIVE EVIDENCE FROM AGENT RUN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Citations:
{citation_lines}

Clinical trials:
{trial_lines}

RxNorm interactions checked: {len(evidence.get('rxnorm_interactions', []))} pairs
PharmGKB annotations: {len(evidence.get('pharmgkb_annotations', []))} records
ClinVar variants: {len(evidence.get('clinvar_variants', []))} lookups
PubMed abstracts: {len(evidence.get('pubmed_abstracts', []))} retrieved

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DISCLAIMER: Research and demonstration only. All outputs require physician review.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""".strip()
