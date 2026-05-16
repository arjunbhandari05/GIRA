"""Structured agent brief assembly (generate_brief tool output)."""

from datetime import datetime, timezone
from typing import Any

from apis.pubmed import fetch_pubmed_articles_for_pmids
from reasoning.pgx import build_relevant_snp_rows
from reasoning.pgx_synthesis import synthesize_pgx_evidence
from schemas.patient_intake import intake_has_clinical_data


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

    snp_summary = build_relevant_snp_rows(
        snp_profile, safety_flags, current_meds, clinvar_raw
    )
    recommendation = _recommendation(
        snp_profile, current_meds, glucose, whoop, safety_flags, rxnorm_hits
    )
    citations = _citation_set_used_only(
        safety_flags, pubmed_hits, recommendation
    )

    used_pmids = [str(c.get("pmid")) for c in citations if c.get("pmid")]
    synthesis = synthesize_pgx_evidence(findings, snp_summary, used_pmids)
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
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    return out


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
        "rationale": [],
        "supporting_pmids": [],
    }

    is_metformin_nonresponse = (
        on_metformin
        and isinstance(tir, (int, float))
        and tir < 54
        and trend in (None, "flat", "worsening")
        and (tcf7l2 == "TT" or slc22a1 == "AA")
    )

    if is_metformin_nonresponse:
        rec["switch_required"] = True
        rec["discontinue"] = "metformin"
        rec["start"] = "semaglutide"
        rec["rationale"].append(
            f"TCF7L2 {tcf7l2} + SLC22A1 {slc22a1} predict reduced metformin response; "
            f"glucose TIR {tir}% with trend '{trend}' confirms non-response after 30 days."
        )
        rec["supporting_pmids"].extend(["38421109", "29326107", "21378095"])
        if fto == "AA":
            rec["rationale"].append(
                "FTO AA suggests enhanced GLP-1-mediated weight loss response."
            )
            rec["supporting_pmids"].append("23334450")

    statin_meds = [m for m in meds_lower if any(s in m for s in ("statin",))]
    slco = (snp_profile.get("rs4149056") or {}).get("genotype", "")
    if statin_meds and slco == "TT":
        rec["switch_required"] = True
        rec["discontinue"] = rec["discontinue"] or statin_meds[0]
        rec["start"] = rec["start"] or "pravastatin"
        rec["rationale"].append(
            "SLCO1B1 TT — statin myopathy risk 16.9x; pravastatin or rosuvastatin preferred."
        )
        rec["supporting_pmids"].append("18987363")

    cyp = (snp_profile.get("rs4244285") or {}).get("genotype", "")
    if any("clopidogrel" in m for m in meds_lower) and cyp == "AA":
        rec["switch_required"] = True
        rec["discontinue"] = rec["discontinue"] or "clopidogrel"
        rec["start"] = rec["start"] or "prasugrel"
        rec["rationale"].append(
            "CYP2C19 *2/*2 — clopidogrel ineffective; switch to prasugrel or ticagrelor."
        )
        rec["supporting_pmids"].append("19106084")

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


def _citation_set_used_only(
    safety_flags: list,
    pubmed_hits: list[dict],
    recommendation: dict[str, Any],
) -> list[dict]:
    """
    Only PMIDs that materially support this brief: recommendation.supporting_pmids
    plus safety-flag PMIDs. No bulk PubMed dump of unrelated articles.
    """
    used: list[str] = []
    seen: set[str] = set()

    for pmid in recommendation.get("supporting_pmids") or []:
        s = str(pmid).strip()
        if s and s not in seen:
            seen.add(s)
            used.append(s)

    for flag in safety_flags:
        s = str(flag.get("pmid") or "").strip()
        if s and s not in seen:
            seen.add(s)
            used.append(s)

    by_pmid: dict[str, dict] = {}
    for article in pubmed_hits:
        p = str(article.get("pmid") or "").strip()
        if p:
            by_pmid[p] = article

    missing = [p for p in used if p not in by_pmid or not (by_pmid[p].get("title"))]
    if missing:
        extra = fetch_pubmed_articles_for_pmids(missing)
        for row in extra.get("articles") or []:
            if isinstance(row, dict):
                p = str(row.get("pmid") or "").strip()
                if p:
                    by_pmid[p] = {**by_pmid.get(p, {}), **row}

    out: list[dict] = []
    for pmid in used:
        row = by_pmid.get(pmid) or {
            "pmid": pmid,
            "title": "",
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        }
        note = row.get("evidence_note") or _citation_inference(
            pmid, recommendation, safety_flags, pubmed_hits
        )
        out.append(
            {
                "pmid": pmid,
                "title": row.get("title") or "",
                "url": row.get("url") or f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                "inference": note,
            }
        )
    return out


def _intake_summary(patient: dict) -> dict[str, Any]:
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
        "text": format_intake_for_llm(intake),
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
