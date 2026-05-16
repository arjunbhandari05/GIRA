"""Structured agent brief assembly (generate_brief tool output)."""

import os
from datetime import datetime, timezone
from typing import Any

from apis.pubmed import fetch_pubmed_articles_for_pmids
from reasoning.pgx import build_relevant_snp_rows
from reasoning.pgx_synthesis import synthesize_pgx_evidence
from schemas.patient_intake import format_intake_for_llm, intake_has_clinical_data

CATEGORY_LABELS = {
    "t2d_risk": "T2D Disease Risk",
    "metformin": "Metformin Response",
    "glp1": "GLP-1 & Incretin Response",
    "safety": "Drug Safety & Metabolism",
    "complications": "Complication Prediction",
    "sglt2": "SGLT2 & Newer Drug Response",
}

T2D_RISK_RSIDS = [
    "rs7903146",
    "rs4402960",
    "rs10811661",
    "rs1111875",
    "rs7754840",
    "rs13266634",
    "rs1387153",
    "rs10830963",
    "rs7578597",
    "rs4607103",
    "rs10923931",
    "rs4430796",
    "rs1799884",
    "rs7961581",
]

T2D_UNFAVORABLE_GENOTYPES = {
    "rs7903146": {"TT"},
    "rs4402960": {"TT", "CT", "TC"},
    "rs10811661": {"TT"},
    "rs1111875": {"TT", "CT", "TC"},
    "rs7754840": {"CC", "CT", "TC"},
    "rs13266634": {"CC"},
    "rs1387153": {"TT", "CT", "TC"},
    "rs10830963": {"GG", "GT", "TG"},
    "rs7578597": {"TT", "CT", "TC"},
    "rs4607103": {"GG", "GT", "TG"},
    "rs10923931": {"CC", "CT", "TC"},
    "rs4430796": {"CC", "CT", "TC"},
    "rs1799884": {"TT", "CT", "TC"},
    "rs7961581": {"CC", "CT", "TC"},
}


def compute_t2d_risk_score(snp_profile: dict) -> dict:
    count = 0
    for rsid in T2D_RISK_RSIDS:
        snp = snp_profile.get(rsid, {})
        gt = snp.get("genotype", "") if isinstance(snp, dict) else snp
        unfavorable = T2D_UNFAVORABLE_GENOTYPES.get(rsid, set())
        if gt and gt != "--" and gt in unfavorable:
            count += 1
    level = "high" if count >= 8 else "elevated" if count >= 4 else "standard"
    return {
        "unfavorable_count": count,
        "total_assessed": len(T2D_RISK_RSIDS),
        "level": level,
        "label": {
            "high": "Strong genetic T2D predisposition — aggressive early treatment indicated",
            "elevated": "Above-average genetic T2D burden — enhanced monitoring recommended",
            "standard": "Standard genetic T2D risk profile",
        }[level],
    }


def _enrich_snp_summary(snp_profile: dict, rows: list[dict]) -> list[dict]:
    enriched = []
    for row in rows:
        rsid = row.get("rsid", "")
        meta = snp_profile.get(rsid, {})
        if isinstance(meta, dict):
            category = meta.get("category", "other")
            enriched.append(
                {
                    **row,
                    "category": category,
                    "category_label": CATEGORY_LABELS.get(category, category),
                    "description": meta.get("description"),
                    "population_freq": meta.get("population_freq"),
                    "population_label": meta.get("population_label"),
                }
            )
        else:
            enriched.append(row)
    enriched.sort(key=lambda r: (r.get("category", ""), r.get("gene", ""), r.get("rsid", "")))
    return enriched


def _group_snp_summary_by_category(rows: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        label = row.get("category_label") or row.get("category") or "Other"
        grouped.setdefault(label, []).append(row)
    return grouped


def assemble_brief(all_findings: dict[str, Any] | None = None, **_kwargs) -> dict[str, Any]:
    """
    Tool entrypoint for the agent. `all_findings` is the dict of every
    tool result accumulated during run_with_tools. Returns a structured
    brief in the shape scripts/test_agent.py expects:

      {
        action_required, safety_flags, snp_summary, recommendation,
        wearable_insight, glucose_insight, trial_matches, citations,
        patient_summary
      }
    """
    findings = all_findings or {}
    snp_profile = _extract_snp_profile(findings)
    safety_flags = findings.get("check_safety_flags") or []
    glucose = findings.get("fetch_glucose") or {}
    whoop = findings.get("fetch_whoop") or {}
    pubmed_hits = _flatten_pubmed(findings)
    rxnorm_hits = _as_list(findings.get("fetch_rxnorm"))
    trials_raw = findings.get("fetch_trials")
    trials = _trials_list(trials_raw)
    trial_meta = _trials_meta(trials_raw)
    patient = findings.get("patient") or {}
    current_meds = patient.get("current_meds") or patient.get("meds") or []
    clinvar_raw = findings.get("fetch_clinvar")
    cpic_raw = findings.get("fetch_cpic")

    snp_summary = _enrich_snp_summary(
        snp_profile,
        build_relevant_snp_rows(
            snp_profile, safety_flags, current_meds, clinvar_raw, cpic_raw
        ),
    )
    t2d_risk_score = compute_t2d_risk_score(snp_profile)
    snp_summary_by_category = _group_snp_summary_by_category(snp_summary)
    recommendation = _recommendation(
        snp_profile, current_meds, glucose, whoop, safety_flags, rxnorm_hits
    )
    fast_brief = bool(
        _kwargs.get("skip_pgx_synthesis") or findings.get("_fast_brief")
    )
    citations = _build_citations(
        safety_flags,
        pubmed_hits,
        recommendation,
        snp_summary,
    )

    used_pmids = [str(c.get("pmid")) for c in citations if c.get("pmid")]
    skip_synthesis = fast_brief or os.getenv("PGX_SYNTHESIS", "0").strip().lower() not in (
        "1",
        "true",
        "yes",
    )
    synthesis = (
        None
        if skip_synthesis
        else synthesize_pgx_evidence(findings, snp_summary, used_pmids)
    )
    citation_inferences: dict[str, str] = {}
    if synthesis:
        snp_summary = synthesis.get("snp_summary") or snp_summary
        citation_inferences = synthesis.get("citation_inferences") or {}
        citations = _apply_citation_inferences(citations, citation_inferences, pubmed_hits)

    glucose_insight = _glucose_insight(glucose)
    wearable_insight = _wearable_insight(whoop)
    trial_matches = _trial_matches(trials)

    out: dict[str, Any] = {
        "action_required": bool(safety_flags) or recommendation.get("switch_required", False),
        "safety_flags": [
            {
                "gene": f.get("gene"),
                "rsid": f.get("rsid"),
                "severity": f.get("severity"),
                "flag": f.get("flag"),
                "action": f.get("action"),
                "drug": f.get("drug"),
                "pmid": f.get("pmid"),
                "currently_prescribed": f.get("currently_prescribed", False),
            }
            for f in safety_flags
        ],
        "snp_summary": snp_summary,
        "snp_summary_by_category": snp_summary_by_category,
        "t2d_risk_score": t2d_risk_score,
        "recommendation": recommendation,
        "wearable_insight": wearable_insight,
        "glucose_insight": glucose_insight,
        "trial_matches": trial_matches,
        "trial_search_meta": trial_meta,
        "citations": citations,
        "patient_summary": _patient_summary(
            patient, snp_profile, glucose, safety_flags, recommendation
        ),
        "intake_summary": _intake_summary(patient),
        "cpic_recommendations": _cpic_list(cpic_raw),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    from output.patient_context import write_patient_context

    patient_id = str(patient.get("patient_id") or patient.get("id") or "")
    if patient_id:
        write_patient_context(
            patient_id=patient_id,
            brief=_brief_for_patient_context(out, findings, patient, glucose, whoop),
            intake=_intake_for_patient_context(patient),
            genome_profile=_genome_profile_for_context(snp_profile),
            glucose_summary=_glucose_summary_for_context(glucose, glucose_insight),
            wearable_summary=_wearable_summary_for_context(whoop, wearable_insight),
        )
    return out


def _parse_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).replace("%", "").strip())
    except (TypeError, ValueError):
        return None


def _parse_bp(bp: str) -> tuple[int | None, int | None]:
    if not bp or "/" not in str(bp):
        return None, None
    parts = str(bp).split("/", 1)
    try:
        return int(float(parts[0].strip())), int(float(parts[1].strip()))
    except (TypeError, ValueError):
        return None, None


def _intake_for_patient_context(patient: dict[str, Any]) -> dict[str, Any]:
    intake = dict(patient.get("intake") or {})
    vitals = dict(intake.get("vitals") or {})
    weight = _parse_float(vitals.get("weight"))
    height = _parse_float(vitals.get("height"))
    bmi = None
    if weight and height and height > 0:
        height_m = height / 100 if height > 3 else height
        if height_m > 0:
            bmi = round(weight / (height_m**2), 1)
    sys_bp, dia_bp = _parse_bp(vitals.get("bloodPressure", ""))
    return {
        **intake,
        "name": patient.get("name") or intake.get("name") or "Unknown",
        "vitals": {
            **vitals,
            "weight_kg": weight,
            "height_cm": height,
            "bmi": bmi,
            "hba1c_pct": _parse_float(vitals.get("hba1c")),
            "systolic_bp": sys_bp,
            "diastolic_bp": dia_bp,
            "egfr": _parse_float(vitals.get("egfr")),
        },
    }


def _genome_profile_for_context(snp_profile: dict[str, dict]) -> dict[str, Any]:
    snps: dict[str, str] = {}
    for rsid, row in (snp_profile or {}).items():
        if isinstance(row, dict):
            genotype = row.get("genotype")
            if genotype:
                snps[str(rsid)] = str(genotype)
        elif isinstance(row, str):
            snps[str(rsid)] = row
    return {"snps": snps, "total_snps_parsed": len(snps)}


def _glucose_summary_for_context(
    glucose: dict[str, Any], glucose_insight: dict[str, Any]
) -> dict[str, Any]:
    daily = glucose.get("daily_summaries") or [] if isinstance(glucose, dict) else []
    peak_vals = [
        d.get("avg_mgdl")
        for d in daily
        if isinstance(d, dict) and d.get("avg_mgdl") is not None
    ]
    peak = max(peak_vals) if peak_vals else None
    hypo_events = glucose.get("hypoglycemic_events") if isinstance(glucose, dict) else 0
    return {
        "avg_fasting": glucose.get("avg_glucose_mgdl") if isinstance(glucose, dict) else None,
        "avg_postprandial_rise": glucose.get("trend_delta_mgdl") if isinstance(glucose, dict) else None,
        "time_in_range_pct": glucose_insight.get("time_in_range_pct"),
        "time_high_pct": glucose.get("time_above_range_pct") if isinstance(glucose, dict) else None,
        "time_low_pct": glucose.get("time_below_range_pct") if isinstance(glucose, dict) else None,
        "peak_glucose": peak,
        "glucose_variability_cv": glucose_insight.get("cv_pct") or glucose.get("cv_pct"),
        "nocturnal_lows": bool(hypo_events),
        "dawn_phenomenon": False,
        "dawn_phenomenon_days": None,
        "interpretation": glucose.get("clinical_note") if isinstance(glucose, dict) else "",
    }


def _wearable_summary_for_context(
    whoop: dict[str, Any], wearable_insight: dict[str, Any]
) -> dict[str, Any]:
    metrics = whoop.get("metrics") or {} if isinstance(whoop, dict) else {}
    return {
        "avg_recovery_pct": wearable_insight.get("recovery_avg"),
        "avg_resting_hr": wearable_insight.get("rhr_avg"),
        "avg_hrv_ms": wearable_insight.get("hrv_ms_avg"),
        "avg_strain": None,
        "sleep_score_pct": None,
        "deep_sleep_pct": None,
        "avg_sleep_hrs": None,
        "interpretation": (
            "HRV trend: "
            f"{wearable_insight.get('hrv_trend', 'unknown')}; "
            f"recovery avg {wearable_insight.get('recovery_avg')}%"
            if wearable_insight.get("available")
            else ""
        ),
    }


def _map_safety_flag_for_context(flag: dict[str, Any], snp_profile: dict[str, dict]) -> dict[str, Any]:
    rsid = flag.get("rsid") or ""
    genotype = (snp_profile.get(rsid) or {}).get("genotype", "")
    severity = str(flag.get("severity") or "").upper()
    mapped_severity = "flag" if severity == "CRITICAL" else "warn" if severity == "WARNING" else "ok"
    return {
        "gene": flag.get("gene"),
        "rsid": rsid,
        "variant": rsid,
        "genotype": genotype,
        "impact": flag.get("flag") or flag.get("action") or "",
        "severity": mapped_severity,
    }


def _trace_dict_for_context(findings: dict[str, Any]) -> dict[str, Any]:
    tools_called = [
        k
        for k in findings
        if k not in ("patient", "_fast_brief") and not str(k).startswith("_")
    ]
    pubmed = findings.get("fetch_pubmed")
    pubmed_articles: list[Any] = []
    if isinstance(pubmed, dict) and isinstance(pubmed.get("articles"), list):
        pubmed_articles = pubmed["articles"]
    elif isinstance(pubmed, list):
        pubmed_articles = pubmed

    clinvar = findings.get("fetch_clinvar")
    clinvar_hits = []
    if isinstance(clinvar, dict):
        clinvar_hits = clinvar.get("variants") or clinvar.get("hits") or []

    rxnorm = findings.get("fetch_rxnorm")
    rxnorm_hits = rxnorm if isinstance(rxnorm, list) else []

    pharmgkb = findings.get("fetch_pharmgkb")
    pharmgkb_hits = pharmgkb if isinstance(pharmgkb, list) else []

    return {
        "tools_called": tools_called,
        "tool_summaries": [
            {"tool": name, "has_data": bool(findings.get(name))} for name in tools_called
        ],
        "reasoning_steps": [],
        "tokens_used": None,
        "pubmed_abstracts": pubmed_articles,
        "clinvar_hits": clinvar_hits if isinstance(clinvar_hits, list) else [],
        "rxnorm_interactions": rxnorm_hits,
        "pharmgkb_hits": pharmgkb_hits if isinstance(pharmgkb_hits, list) else [],
    }


def _brief_for_patient_context(
    out: dict[str, Any],
    findings: dict[str, Any],
    patient: dict[str, Any],
    glucose: dict[str, Any],
    whoop: dict[str, Any],
) -> dict[str, Any]:
    brief = dict(out)
    rec = out.get("recommendation") or {}
    start = rec.get("start") or ""
    rationale_list = list(rec.get("rationale") or [])
    snp_rows = out.get("snp_summary") or []
    snp_text = "\n".join(
        f"{row.get('gene')} {row.get('rsid')} {row.get('genotype')}: {row.get('finding')}"
        for row in snp_rows
        if isinstance(row, dict)
    )

    brief["safety_flags"] = [
        _map_safety_flag_for_context(f, _extract_snp_profile(findings))
        for f in (out.get("safety_flags") or [])
        if isinstance(f, dict)
    ]
    brief["recommendation"] = {
        **rec,
        "drug_name": start or rec.get("discontinue"),
        "drug_class": "GLP-1 RA" if "semaglutide" in str(start).lower() else "Antidiabetic",
        "evidence_level": "CPIC + literature",
        "confidence": "High" if rec.get("switch_required") else "Medium",
        "rationale": {
            "genomic": rationale_list[0] if rationale_list else "See SNP findings.",
            "cgm": (
                f"TIR {glucose.get('time_in_range_pct')}% ({glucose.get('trend_direction', 'unknown')} trend)"
                if isinstance(glucose, dict) and glucose.get("time_in_range_pct") is not None
                else "CGM data summarized in brief."
            ),
            "wearable": (
                f"HRV avg {brief.get('wearable_insight', {}).get('hrv_ms_avg')} ms"
                if brief.get("wearable_insight", {}).get("available")
                else "Wearable data summarized in brief."
            ),
            "safety_note": "; ".join(
                f.get("impact", "")
                for f in brief.get("safety_flags", [])
                if f.get("severity") == "flag"
            )
            or None,
        },
        "narrative": out.get("patient_summary", ""),
        "full_text": " ".join(rationale_list),
    }
    brief["snp_summary"] = snp_text
    gi = out.get("glucose_insight") or {}
    wi = out.get("wearable_insight") or {}
    brief["glucose_insight"] = (
        f"TIR {gi.get('time_in_range_pct')}% · avg {gi.get('avg_glucose_mgdl')} mg/dL · CV {gi.get('cv_pct')}%"
        if gi.get("available")
        else ""
    )
    brief["wearable_insight"] = (
        f"HRV {wi.get('hrv_ms_avg')} ms · recovery {wi.get('recovery_avg')}% · RHR {wi.get('rhr_avg')} bpm"
        if wi.get("available")
        else ""
    )
    brief["intake_summary"] = (
        format_intake_for_llm(patient.get("intake") or {})
        if patient.get("intake")
        else str(out.get("intake_summary") or "")
    )
    brief["_trace"] = _trace_dict_for_context(findings)
    brief["citations"] = [
        {
            "index": i + 1,
            "text": f"{c.get('title', '')} (PMID {c.get('pmid', '')}): {c.get('inference', '')}",
        }
        for i, c in enumerate(out.get("citations") or [])
        if isinstance(c, dict)
    ]
    return brief


def _cpic_list(cpic_raw: Any) -> list[dict]:
    if isinstance(cpic_raw, dict):
        return [r for r in (cpic_raw.get("recommendations") or []) if isinstance(r, dict)]
    if isinstance(cpic_raw, list):
        return [r for r in cpic_raw if isinstance(r, dict)]
    return []


def _as_list(value: Any) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    return []


def _extract_snp_profile(findings: dict[str, Any]) -> dict[str, dict]:
    snp = findings.get("get_snp_profile")
    if isinstance(snp, dict):
        return snp
    patient = findings.get("patient") or {}
    return patient.get("snp_profile") or {}


def _apply_citation_inferences(
    citations: list[dict],
    inferences: dict[str, str],
    pubmed_hits: list[dict],
) -> list[dict]:
    if not inferences:
        return citations
    by_pmid = {str(a.get("pmid")): a for a in pubmed_hits if a.get("pmid")}
    out = []
    for row in citations:
        pmid = str(row.get("pmid") or "")
        note = inferences.get(pmid)
        if not note and pmid in by_pmid:
            art = by_pmid[pmid]
            note = art.get("evidence_note") or row.get("inference")
        out.append({**row, "inference": note or row.get("inference")})
    return out


def _trials_list(raw: Any) -> list[dict]:
    if isinstance(raw, dict):
        rows = raw.get("trials")
        if isinstance(rows, list):
            return [t for t in rows if isinstance(t, dict)]
        return []
    return _as_list(raw)


def _trials_meta(raw: Any) -> dict[str, Any] | None:
    if isinstance(raw, dict):
        meta = raw.get("_meta")
        if isinstance(meta, dict):
            return dict(meta)
    return None


def _flatten_pubmed(findings: dict[str, Any]) -> list[dict]:
    hits = findings.get("fetch_pubmed")
    if isinstance(hits, dict) and "articles" in hits:
        return [h for h in (hits.get("articles") or []) if isinstance(h, dict)]
    if isinstance(hits, list):
        return [h for h in hits if isinstance(h, dict)]
    if isinstance(hits, dict):
        out = []
        for value in hits.values():
            if isinstance(value, list):
                out.extend(v for v in value if isinstance(v, dict))
        return out
    return []


def _glucose_insight(glucose: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(glucose, dict) or "error" in glucose:
        return {"available": False}
    return {
        "available": True,
        "time_in_range_pct": glucose.get("time_in_range_pct"),
        "avg_glucose_mgdl": glucose.get("avg_glucose_mgdl"),
        "gmi_pct": glucose.get("gmi_pct"),
        "cv_pct": glucose.get("cv_pct"),
        "trend_direction": glucose.get("trend_direction"),
        "hypoglycemic_events": glucose.get("hypoglycemic_events"),
        "controlled": glucose.get("controlled", False),
        "source": glucose.get("source"),
    }


def _wearable_insight(whoop: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(whoop, dict) or "error" in whoop:
        return {"available": False}
    metrics = whoop.get("metrics") or {}
    return {
        "available": True,
        "hrv_ms_avg": (metrics.get("hrv_ms") or {}).get("avg_30d"),
        "hrv_trend": (metrics.get("hrv_ms") or {}).get("trend"),
        "rhr_avg": (metrics.get("rhr_bpm") or {}).get("avg_30d"),
        "rhr_trend": (metrics.get("rhr_bpm") or {}).get("trend"),
        "recovery_avg": (metrics.get("recovery_score") or {}).get("avg_30d"),
        "hypoglycemia_signal": whoop.get("hypoglycemia_signal", False),
    }


def _trial_matches(trials: list[dict]) -> list[dict]:
    return [
        {
            "nct_id": t.get("nct_id"),
            "title": t.get("title"),
            "phase": t.get("phase"),
            "match_genes": t.get("match_genes"),
            "location": t.get("location"),
            "url": t.get("url"),
        }
        for t in trials
        if isinstance(t, dict)
    ]


def _recommendation(
    snp_profile: dict[str, dict],
    current_meds: list,
    glucose: dict[str, Any],
    whoop: dict[str, Any],
    safety_flags: list,
    rxnorm_hits: list[dict],
) -> dict[str, Any]:
    """
    Deterministic recommendation guard. The LLM still narrates the brief —
    this just makes the structural decision so safety contracts hold.
    """
    meds_lower = [str(m).lower() for m in (current_meds or [])]
    on_metformin = any("metformin" in m for m in meds_lower)
    tcf7l2 = (snp_profile.get("rs7903146") or {}).get("genotype", "")
    slc22a1 = (snp_profile.get("rs622342") or {}).get("genotype", "")
    fto = (snp_profile.get("rs9939609") or {}).get("genotype", "")

    tir = glucose.get("time_in_range_pct") if isinstance(glucose, dict) else None
    trend = glucose.get("trend_direction") if isinstance(glucose, dict) else None
    controlled = glucose.get("controlled") if isinstance(glucose, dict) else None

    rec: dict[str, Any] = {
        "switch_required": False,
        "discontinue": None,
        "start": None,
        "actions": [],
        "rationale": [],
        "supporting_pmids": [],
    }

    def _add_switch(
        discontinue: str,
        start: str,
        rationale: str,
        pmids: list[str],
    ) -> None:
        rec["switch_required"] = True
        rec["actions"].append(
            {
                "discontinue": discontinue,
                "start": start,
                "rationale": rationale,
                "pmids": pmids,
            }
        )
        if not rec["discontinue"]:
            rec["discontinue"] = discontinue
            rec["start"] = start
        rec["rationale"].append(rationale)
        for p in pmids:
            if p and p not in rec["supporting_pmids"]:
                rec["supporting_pmids"].append(p)

    is_metformin_nonresponse = (
        on_metformin
        and isinstance(tir, (int, float))
        and tir < 54
        and trend in (None, "flat", "worsening")
        and (tcf7l2 == "TT" or slc22a1 == "AA")
    )

    if is_metformin_nonresponse:
        rationale = (
            f"TCF7L2 {tcf7l2} + SLC22A1 {slc22a1} predict reduced metformin response; "
            f"glucose TIR {tir}% with trend '{trend}' confirms non-response after 30 days."
        )
        pmids = ["38421109", "29326107", "21378095"]
        if fto == "AA":
            rationale += " FTO AA suggests enhanced GLP-1-mediated weight loss response."
            pmids.append("23334450")
        _add_switch("metformin", "semaglutide", rationale, pmids)

    statin_meds = [m for m in meds_lower if any(s in m for s in ("statin", "atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "lovastatin"))]
    slco = (snp_profile.get("rs4149056") or {}).get("genotype", "")
    if statin_meds and slco == "TT":
        _add_switch(
            statin_meds[0],
            "pravastatin",
            "SLCO1B1 TT — statin myopathy risk 16.9x; pravastatin or rosuvastatin preferred.",
            ["18987363"],
        )

    cyp = (snp_profile.get("rs4244285") or {}).get("genotype", "")
    if any("clopidogrel" in m for m in meds_lower) and cyp == "AA":
        _add_switch(
            "clopidogrel",
            "prasugrel",
            "CYP2C19 *2/*2 — clopidogrel ineffective; switch to prasugrel or ticagrelor.",
            ["19106084"],
        )

    if not rec["switch_required"]:
        if controlled:
            rec["rationale"].append(
                "Glucose adequately controlled; no T2D medication change indicated."
            )
        else:
            rec["rationale"].append(
                "Continue current regimen; reassess at next visit."
            )

    rec["supporting_pmids"] = list(dict.fromkeys(rec["supporting_pmids"]))
    return rec


def _citation_inference(
    pmid: str,
    recommendation: dict[str, Any],
    safety_flags: list,
    pubmed_hits: list[dict],
) -> str:
    """One-sentence rationale tying a PMID to this brief (no static PGx paste)."""
    pmid_s = str(pmid)
    for art in pubmed_hits:
        if str(art.get("pmid") or "") == pmid_s and art.get("evidence_note"):
            return str(art["evidence_note"])[:400]

    rec_pmids = [str(p) for p in (recommendation.get("supporting_pmids") or [])]
    if pmid_s in rec_pmids:
        rec = recommendation
        parts = []
        if rec.get("discontinue") and rec.get("start"):
            parts.append(
                f"Supports switching from {rec.get('discontinue')} to {rec.get('start')} "
                "given the patient's PGx + CGM picture encoded in this recommendation."
            )
        elif rec.get("rationale"):
            parts.append(str(rec["rationale"][0])[:280])
        else:
            parts.append("Listed as a primary evidence PMID for this medication decision.")
        return " ".join(parts)

    for flag in safety_flags:
        if str(flag.get("pmid") or "") == pmid_s:
            return (
                f"Grounds the {flag.get('severity')} safety gate on {flag.get('gene')} "
                f"({flag.get('rsid')}): {str(flag.get('flag') or '')[:200]}"
            )

    return "Referenced in this brief as supporting literature."


def _build_citations(
    safety_flags: list,
    pubmed_hits: list[dict],
    recommendation: dict[str, Any],
    snp_summary: list[dict],
) -> list[dict]:
    """
    PubMed citations for the brief: decision PMIDs, safety-flag PMIDs, panel PMIDs,
    and articles returned by live gene+drug searches. Always resolves titles via NCBI.
    """
    used: list[str] = []
    seen: set[str] = set()

    def _add_pmid(raw: Any) -> None:
        s = str(raw or "").strip()
        if s and s not in seen:
            seen.add(s)
            used.append(s)

    for pmid in recommendation.get("supporting_pmids") or []:
        _add_pmid(pmid)
    for action in recommendation.get("actions") or []:
        if isinstance(action, dict):
            for pmid in action.get("pmids") or []:
                _add_pmid(pmid)
    for flag in safety_flags:
        _add_pmid(flag.get("pmid"))
    for row in snp_summary:
        if isinstance(row, dict):
            _add_pmid(row.get("pmid"))

    by_pmid: dict[str, dict] = {}
    for article in pubmed_hits:
        if not isinstance(article, dict):
            continue
        p = str(article.get("pmid") or "").strip()
        if p:
            by_pmid[p] = article
            _add_pmid(p)

    to_resolve = [p for p in used if p not in by_pmid or not (by_pmid.get(p) or {}).get("title")]
    if to_resolve:
        try:
            extra = fetch_pubmed_articles_for_pmids(to_resolve)
            for row in extra.get("articles") or []:
                if isinstance(row, dict):
                    p = str(row.get("pmid") or "").strip()
                    if p:
                        by_pmid[p] = {**by_pmid.get(p, {}), **row}
        except Exception:
            pass

    out: list[dict] = []
    for pmid in used:
        row = by_pmid.get(pmid) or {}
        title = (row.get("title") or "").strip() or f"PubMed record {pmid}"
        note = row.get("evidence_note") or _citation_inference(
            pmid, recommendation, safety_flags, pubmed_hits
        )
        out.append(
            {
                "pmid": pmid,
                "title": title,
                "url": row.get("url") or f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                "inference": note,
                "gene": row.get("gene"),
                "drug": row.get("drug"),
            }
        )
    return out


def _intake_summary(patient: dict) -> dict[str, Any]:
    from schemas.patient_intake import format_intake_for_llm as _format_intake

    intake = patient.get("intake") or {}
    if not intake_has_clinical_data(intake):
        return {"available": False}
    goals = intake.get("goals") or []
    side = intake.get("sideEffects") or []
    vitals = intake.get("vitals") or {}
    return {
        "available": True,
        "goals": goals,
        "side_effects": side,
        "hba1c": vitals.get("hba1c"),
        "fasting_glucose": vitals.get("fastingGlucose"),
        "medications": [
            f"{m.get('name')} {m.get('dose')}".strip()
            for m in (intake.get("medications") or [])
            if isinstance(m, dict)
        ],
        "clinician_notes": (intake.get("clinicianNotes") or "")[:300],
        "text": _format_intake(intake),
    }


def _patient_summary(
    patient: dict,
    snp_profile: dict[str, dict],
    glucose: dict[str, Any],
    safety_flags: list,
    recommendation: dict[str, Any],
) -> str:
    name = patient.get("name") or "Patient"
    lines = [name]
    intake = patient.get("intake") or {}
    if intake_has_clinical_data(intake):
        goals = ", ".join(intake.get("goals") or []) or "unspecified"
        lines.append(f"Intake goals: {goals}.")
        side = intake.get("sideEffects") or []
        if side:
            lines.append(f"Reported side effects: {', '.join(side)}.")
        hba1c = (intake.get("vitals") or {}).get("hba1c")
        if hba1c:
            lines.append(f"Chart HbA1c {hba1c}.")
    if glucose and "error" not in glucose:
        tir = glucose.get("time_in_range_pct")
        avg = glucose.get("avg_glucose_mgdl")
        trend = glucose.get("trend_direction")
        lines.append(
            f"30-day CGM: TIR {tir}%, avg {avg} mg/dL, trend {trend}."
        )
    if safety_flags:
        flag_names = ", ".join(f.get("gene", "?") for f in safety_flags)
        lines.append(f"Safety gates fired: {flag_names}.")
    if recommendation.get("switch_required"):
        lines.append(
            f"Recommend discontinue {recommendation.get('discontinue')}, "
            f"start {recommendation.get('start')}."
        )
    elif glucose.get("controlled"):
        lines.append("T2D control adequate; no medication change indicated.")
    return " ".join(lines)
