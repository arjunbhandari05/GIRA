"""LLM synthesis of PGx findings and citation inferences from live evidence."""

from __future__ import annotations

import json
from typing import Any

from reasoning.nemotron import _call_model, _detect_backend, _log, _safe_json


def synthesize_pgx_evidence(
    findings: dict[str, Any],
    snp_rows: list[dict],
    citation_pmids: list[str],
) -> dict[str, Any] | None:
    """
    Use Nemotron to rewrite PGx finding sentences and per-PMID inference notes
    from ClinVar + PubMed tool results only (no static PharmGKB paste).
  Returns {"snp_summary": [...], "citation_inferences": {pmid: str}} or None.
    """
    if not snp_rows:
        return None
    backend = _detect_backend()
    if backend == "none":
        return None

    context = _evidence_context(findings, snp_rows, citation_pmids)
    messages = [
        {
            "role": "system",
            "content": (
                "You are a clinical pharmacogenomics writer. Use ONLY the evidence "
                "blocks provided (ClinVar, PubMed). Do not invent PMIDs, genotypes, "
                "or odds ratios. Every finding must describe the patient's ACTUAL "
                "genotype shown in the SNP list. Return a single JSON object."
            ),
        },
        {
            "role": "user",
            "content": (
                f"{context}\n\n"
                "Return JSON:\n"
                "{\n"
                '  "snp_summary": [\n'
                "    {\n"
                '      "rsid": "...", "gene": "...", "genotype": "...",\n'
                '      "drug": "..." or null, "evidence_level": "1A"|"2A"|"2B"|null,\n'
                '      "finding": "one sentence for THIS genotype",\n'
                '      "pmid": "digits or null", "source": "literature_inference"\n'
                "    }\n"
                "  ],\n"
                '  "citation_inferences": {"PMID": "one sentence tying that paper to this patient"}\n'
                "}\n"
                "Include only rsIDs from the SNP list. Omit variants with no support in the evidence."
            ),
        },
    ]

    try:
        raw = _call_model(messages, backend, json_mode=True)
        parsed = _safe_json(raw)
        if not isinstance(parsed, dict):
            return None
        return _validate_synthesis(parsed, snp_rows, citation_pmids)
    except Exception as exc:
        _log(f"[pgx_synthesis] skipped: {exc!r}")
        return None


def _evidence_context(
    findings: dict[str, Any],
    snp_rows: list[dict],
    citation_pmids: list[str],
) -> str:
    patient = findings.get("patient") or {}
    meds = patient.get("current_meds") or patient.get("meds") or []
    lines = [
        f"PATIENT MEDS: {json.dumps(meds)}",
        "",
        "PATIENT INTAKE (goals, side effects, vitals — honor in findings):",
        patient.get("intake_text") or "(no intake)",
        "",
        "SNPs TO INTERPRET (genotype is fixed — do not change it):",
    ]
    for row in snp_rows:
        lines.append(
            f"- {row.get('rsid')} | {row.get('gene')} | genotype {row.get('genotype')} | "
            f"draft: {row.get('finding') or 'n/a'}"
        )

    lines.extend(["", "CLINVAR:"])
    clinvar = findings.get("fetch_clinvar")
    indexed: dict[str, dict] = {}
    if isinstance(clinvar, dict) and "variants" in clinvar:
        for v in clinvar.get("variants") or []:
            if isinstance(v, dict) and v.get("rsid"):
                indexed[str(v["rsid"])] = v
    elif isinstance(clinvar, list):
        for v in clinvar:
            if isinstance(v, dict) and v.get("rsid"):
                indexed[str(v["rsid"])] = v
    for rsid in [r.get("rsid") for r in snp_rows]:
        row = indexed.get(str(rsid))
        if row:
            lines.append(
                f"- {rsid}: {row.get('clinical_significance')} | {row.get('condition')}"
            )
        else:
            lines.append(f"- {rsid}: not in ClinVar results")

    lines.extend(["", "PUBMED (use only these PMIDs):"])
    pubmed = findings.get("fetch_pubmed")
    articles: list[dict] = []
    if isinstance(pubmed, dict):
        articles = [a for a in (pubmed.get("articles") or []) if isinstance(a, dict)]
    elif isinstance(pubmed, list):
        articles = [a for a in pubmed if isinstance(a, dict)]
    wanted = {str(p) for p in citation_pmids}
    shown = 0
    for art in articles:
        pmid = str(art.get("pmid") or "")
        if wanted and pmid not in wanted:
            continue
        lines.append(
            f"- PMID {pmid}: {art.get('title', '')[:240]} | note: {art.get('evidence_note', '')[:200]}"
        )
        shown += 1
    if not shown:
        lines.append("- (no PubMed articles in tool results — write conservative genotype-only findings)")

    flags = findings.get("check_safety_flags") or []
    if flags:
        lines.extend(["", "SAFETY FLAGS (deterministic — must stay consistent):"])
        for f in flags:
            lines.append(
                f"- {f.get('severity')} {f.get('gene')} {f.get('rsid')}: {f.get('flag')}"
            )
    return "\n".join(lines)


def _validate_synthesis(
    parsed: dict[str, Any],
    snp_rows: list[dict],
    citation_pmids: list[str],
) -> dict[str, Any]:
    allowed = {str(r.get("rsid")): r for r in snp_rows}
    out_rows: list[dict] = []
    for row in parsed.get("snp_summary") or []:
        if not isinstance(row, dict):
            continue
        rsid = str(row.get("rsid") or "")
        base = allowed.get(rsid)
        if not base:
            continue
        genotype = base.get("genotype")
        if row.get("genotype") and row.get("genotype") != genotype:
            row["genotype"] = genotype
        merged = {**base, **row}
        merged["genotype"] = genotype
        merged["source"] = "literature_inference"
        out_rows.append(merged)

    if not out_rows:
        out_rows = snp_rows

    inferences = parsed.get("citation_inferences") or {}
    if not isinstance(inferences, dict):
        inferences = {}
    clean_inf = {
        str(k): str(v)[:500]
        for k, v in inferences.items()
        if str(k) in {str(p) for p in citation_pmids}
    }

    return {"snp_summary": out_rows, "citation_inferences": clean_inf}
