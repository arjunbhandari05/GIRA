"""Markdown brief builder for Round 5."""

from datetime import datetime, timezone
from typing import Any


def build_brief(patient, snps, wearable, pharmgkb, clinvar, safety_flags, nemotron_text) -> str:
    generated_at = datetime.now(timezone.utc).isoformat()
    meds = patient.get("meds", [])
    if isinstance(meds, str):
        meds = [meds]

    lines = [
        f"# GlycoAgent Clinical Brief — {patient.get('name', 'Unknown')}",
        "",
        f"- **Patient ID:** {patient.get('patient_id', patient.get('id', 'n/a'))}",
        f"- **Medications:** {', '.join(meds)}",
        f"- **Next appointment:** {patient.get('next_appointment_iso', 'n/a')}",
        f"- **Generated:** {generated_at}",
        "",
    ]

    if safety_flags:
        for flag in safety_flags:
            lines.extend(
                [
                    f"> **{flag.get('severity')} — {flag.get('gene')} / {flag.get('rsid')}**",
                    f"> {flag.get('flag')}",
                    f"> **Action:** {flag.get('action')}",
                    f"> **PMID:** {flag.get('pmid')}",
                    "",
                ]
            )
    else:
        lines.extend(["> **No deterministic safety flags fired.**", ""])

    lines.extend(["## Clinical Analysis", "", nemotron_text.strip(), "", "## Citation List", ""])

    citations = _citation_list(pharmgkb, clinvar, safety_flags)
    lines.extend(citations or ["No citations available."])
    return "\n".join(lines)


def _citation_list(pharmgkb, clinvar, safety_flags) -> list:
    seen = set()
    citations = []

    for flag in safety_flags:
        pmid = flag.get("pmid")
        if pmid and pmid not in seen:
            seen.add(pmid)
            citations.append(f"- [PMID {pmid}](https://pubmed.ncbi.nlm.nih.gov/{pmid}/)")

    for row in pharmgkb.values():
        pmid = row.get("pmid") if isinstance(row, dict) else None
        if pmid and pmid not in seen:
            seen.add(pmid)
            citations.append(f"- [PMID {pmid}](https://pubmed.ncbi.nlm.nih.gov/{pmid}/)")

    for rsid, row in clinvar.items():
        url = row.get("evidence_url") if isinstance(row, dict) else None
        if url:
            citations.append(f"- [ClinVar {rsid}]({url})")

    return citations


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
    pharmgkb_hits = _as_list(findings.get("fetch_pharmgkb"))
    pubmed_hits = _flatten_pubmed(findings)
    rxnorm_hits = _as_list(findings.get("fetch_rxnorm"))
    trials = _as_list(findings.get("fetch_trials"))
    patient = findings.get("patient") or {}
    current_meds = patient.get("current_meds") or patient.get("meds") or []

    snp_summary = _summarize_snps(snp_profile, pharmgkb_hits)
    recommendation = _recommendation(
        snp_profile, current_meds, glucose, whoop, safety_flags, pharmgkb_hits, rxnorm_hits
    )
    citations = _citation_set(safety_flags, pharmgkb_hits, pubmed_hits, recommendation)

    glucose_insight = _glucose_insight(glucose)
    wearable_insight = _wearable_insight(whoop)
    trial_matches = _trial_matches(trials)

    return {
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
        "citations": citations,
        "patient_summary": _patient_summary(
            patient, snp_profile, glucose, safety_flags, recommendation
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


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


def _summarize_snps(snp_profile: dict[str, dict], pharmgkb_hits: list[dict]) -> list[dict]:
    by_gene = {}
    for hit in pharmgkb_hits:
        if not isinstance(hit, dict):
            continue
        gene = (hit.get("gene") or "").upper()
        by_gene.setdefault(gene, hit)
    out = []
    for rsid, snp in snp_profile.items():
        gene = (snp.get("gene") or "").upper()
        finding = by_gene.get(gene, {})
        out.append(
            {
                "rsid": rsid,
                "gene": snp.get("gene"),
                "genotype": snp.get("genotype"),
                "evidence_level": finding.get("evidence_level"),
                "finding": finding.get("finding"),
                "drug": finding.get("drug"),
                "pmid": finding.get("pmid"),
            }
        )
    return out


def _flatten_pubmed(findings: dict[str, Any]) -> list[dict]:
    hits = findings.get("fetch_pubmed")
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
    pharmgkb_hits: list[dict],
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


def _citation_set(
    safety_flags: list,
    pharmgkb_hits: list[dict],
    pubmed_hits: list[dict],
    recommendation: dict[str, Any],
) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []

    def add(pmid: str, title: str | None = None) -> None:
        if not pmid or pmid in seen:
            return
        seen.add(pmid)
        out.append(
            {
                "pmid": pmid,
                "title": title or "",
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            }
        )

    for pmid in recommendation.get("supporting_pmids", []):
        add(pmid)
    for flag in safety_flags:
        add(flag.get("pmid", ""), flag.get("flag"))
    for hit in pharmgkb_hits:
        if isinstance(hit, dict):
            add(hit.get("pmid", ""), hit.get("finding"))
    for article in pubmed_hits:
        add(article.get("pmid", ""), article.get("title"))
    return out


def _patient_summary(
    patient: dict,
    snp_profile: dict[str, dict],
    glucose: dict[str, Any],
    safety_flags: list,
    recommendation: dict[str, Any],
) -> str:
    name = patient.get("name") or "Patient"
    lines = [name]
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
