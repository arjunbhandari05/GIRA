"""Prompt builders for Round 5 (single-shot) and Round 6 (agentic) Nemotron."""


GLUCOSE_RULES = """
GLUCOSE DATA INTERPRETATION (fetch_glucose results):
- time_in_range_pct >= 70% = adequate glycemic control
- time_in_range_pct 54-69% = suboptimal, medication adjustment likely needed
- time_in_range_pct < 54% = poor control, medication change indicated
- gmi_pct maps to estimated HbA1c — gmi > 8% = poorly controlled
- cv_pct > 36% = high glycemic variability, erratic control
- trend_direction == "flat" after 30+ days on medication = non-response confirmed
- hypoglycemic_events > 3 = overcorrection risk; dose adjustment or drug switch needed
- controlled == true means T2D is managed — do not recommend a T2D drug switch
  for these patients; their danger is somewhere else (e.g. statin or antiplatelet).

CROSS-REFERENCE WITH WHOOP:
- flat HRV + flat glucose trend + time_in_range < 54% = three-signal non-response confirmation
- stable HRV + time_in_range >= 70% = medication is working despite genomic risk prediction
"""


AGENT_SYSTEM_PRELUDE = """\
You are GlycoAgent, a tool-using clinical pharmacogenomics agent.

Your job is to call tools to gather evidence, then call generate_brief to
emit a structured clinician brief. You do not narrate. You do not chain
your reasoning out loud. You output exactly one JSON object per turn.

OUTPUT CONTRACT (every turn):
- Either: {"tool_call": {"name": "tool_name", "args": {...}}}
- Or:     {"done": true}
- No prose, no markdown, no commentary, no chain-of-thought.

POLICY:
- Always call get_snp_profile first.
- check_safety_flags MUST be called before generate_brief.
- Cite a PMID for every recommendation (use fetch_pubmed + fetch_clinvar; brief PGx text is synthesized from those, not static tables).
- fetch_pharmgkb is optional reference only — do not treat it as the evidence source for findings.
- Never call the same tool more than 3 times.
- Stop after generate_brief returns; do not call further tools.

TOOLS AVAILABLE:
"""


def build_agentic_system_prompt(tool_descriptions: str) -> str:
    return f"{AGENT_SYSTEM_PRELUDE}{tool_descriptions}\n\n{GLUCOSE_RULES}"


def build_system_prompt() -> str:
    return (
        "You are a clinical pharmacogenomics assistant. Generate a physician-facing clinical brief.\n\n"
        "Your response must begin with the exact characters: ## Safety Flags\n"
        "Do not restate instructions. Do not explain how you will answer. Do not describe your plan.\n\n"
        "STRICT RULES:\n"
        "1. Return ONLY the final physician-facing brief. No planning text. No \"we need to\". No \"let's\". No chain-of-thought. No reasoning traces. If you catch yourself writing planning text, stop and delete it.\n"
        "2. Output exactly these four sections with these exact headers:\n"
        "   ## Safety Flags\n"
        "   ## Pharmacogenomic Findings\n"
        "   ## Wearable Confirmation\n"
        "   ## Clinical Recommendations\n"
        "3. Every finding must match the patient's ACTUAL genotype. If the patient genotype is TC, say TC — never describe TT findings for a TC patient.\n"
        "4. Every claim ends with an evidence tag: [Level 1A / PharmGKB] or [PMID: XXXXX]\n"
        "5. Each finding is one sentence. No bullet nested under bullet. No paragraphs.\n"
        "6. If a variant has no annotation for this patient's genotype, write \"No current pharmacogenomic annotation for this genotype.\"\n"
        "7. Safety flags first, always. If none fired, write \"No critical safety flags for this genotype panel.\""
    )


RISK_GENOTYPES = {
    "rs7903146": "TT",
    "rs622342": "AA",
    "rs5219": "TT",
    "rs1801282": "CC",
    "rs757110": "AA",
    "rs9939609": "AA",
    "rs4149056": "TT",
    "rs429358": "TT",
    "rs4244285": "AA",
    "rs9923231": "AA",
}


GENOTYPE_FINDINGS = {
    ("rs7903146", "TT"): "TT genotype associated with reduced metformin efficacy",
    ("rs622342", "AA"): "AA genotype reduces OCT1 metformin transport ~50%",
    ("rs5219", "TT"): "TT genotype — better sulfonylurea response",
    ("rs1801282", "CC"): "CC genotype — reduced TZD response",
    ("rs757110", "AA"): "AA genotype — alters sulfonylurea receptor binding",
    ("rs9939609", "AA"): "AA genotype — obesity risk, enhanced GLP-1 weight response",
    ("rs4149056", "TC"): "TC genotype — intermediate statin transport, moderate myopathy risk",
    ("rs4149056", "TT"): "TT genotype — high statin myopathy risk",
    ("rs429358", "CT"): "CT genotype — one APOE4 allele, moderate CVD risk",
    ("rs429358", "TT"): "TT genotype — APOE4-associated elevated cardiovascular risk",
    ("rs4244285", "GA"): "GA genotype — intermediate metabolizer, reduced clopidogrel efficacy",
    ("rs4244285", "AA"): "AA genotype — poor metabolizer, clopidogrel has zero antiplatelet effect",
    ("rs9923231", "GA"): "GA genotype — intermediate warfarin sensitivity",
    ("rs9923231", "AA"): "AA genotype — warfarin hypersensitivity",
}


def build_context_prompt(
    patient: dict,
    snps: dict,
    wearable: dict,
    pharmgkb: dict,
    clinvar: dict,
    pubmed: dict,
    safety_flags: list,
) -> str:
    meds = patient.get("meds", [])
    if isinstance(meds, str):
        meds = [meds]

    lines = [
        'IMPORTANT: Return only the physician brief. Do not show your reasoning. Do not write planning text. Start your response directly with "## Safety Flags".',
        "",
        f"PATIENT: {patient.get('name', 'Unknown')} | ZIP: {patient.get('zip', 'n/a')}",
        f"PATIENT MEDS: {', '.join(meds)}",
        "",
        "SNP PROFILE (use these exact values — do not say \"see context\"):",
    ]

    for rsid, snp in snps.items():
        pgx = pharmgkb.get(rsid, {})
        genotype = snp.get("genotype", "--")
        finding = GENOTYPE_FINDINGS.get((rsid, genotype))
        if not finding:
            finding = "No current pharmacogenomic annotation for this genotype"
        lines.append(
            f"{rsid} | {snp.get('gene')} | Genotype: {genotype} | "
            f"Finding: {finding} | Evidence: {pgx.get('evidence_level', 'unknown')} | "
            f"PMID: {pgx.get('pmid', '')}"
        )

    metrics = wearable.get("metrics", {})
    hrv = metrics.get("hrv_ms", {})
    rhr = metrics.get("rhr_bpm", {})
    recovery = metrics.get("recovery_score", {})
    hypo = "Signal detected" if wearable.get("hypoglycemia_signal") else "None detected"
    lines.extend(
        [
            "",
            "WEARABLE (use these exact values):",
            f"HRV: {hrv.get('avg_30d')} ms avg, {hrv.get('trend')} {hrv.get('wow_pct')}% WoW — confirms physiological stress",
            f"RHR: {rhr.get('avg_30d')} bpm, {rhr.get('trend')}",
            f"Recovery: {recovery.get('avg_30d')}, {recovery.get('trend')} {recovery.get('wow_pct')}% WoW",
            f"Hypoglycemia signal: {hypo}",
            "",
            "SAFETY FLAGS FIRED:",
        ]
    )
    if safety_flags:
        for flag in safety_flags:
            snp = snps.get(flag.get("rsid"), {})
            lines.append(
                f"{flag.get('severity')} — {flag.get('gene')} {snp.get('genotype', '--')} — "
                f"{flag.get('flag')} — {flag.get('action')} [PMID: {flag.get('pmid')}]"
            )
    else:
        lines.append("None")

    lines.extend(["", "ClinVar:"])
    for rsid, row in clinvar.items():
        lines.append(
            f"{rsid} | {row.get('clinical_significance', 'unknown')} | {row.get('condition', 'n/a')}"
        )

    lines.extend(["", "PubMed top hits:"])

    any_pubmed = False
    for articles in pubmed.values():
        for article in articles:
            any_pubmed = True
            lines.append(
                f"{article.get('pmid')} | {article.get('title')} | {article.get('url')}"
            )
    if not any_pubmed:
        lines.append("None")

    lines.extend(["", "FINAL BRIEF DRAFT (return this kind of content directly, not commentary):"])
    lines.extend(_draft_final_brief(snps, wearable, safety_flags, pharmgkb))

    lines.extend(
        [
            "",
            'Write the brief now. Start with ## Safety Flags. Use the exact SNP values above. Do not say "see context". Do not say "see wearable panel". Do not explain your reasoning. Do not write "we need to". Write every finding as a complete sentence with the actual clinical content.',
        ]
    )

    return "\n".join(lines)


def _draft_final_brief(snps: dict, wearable: dict, safety_flags: list, pharmgkb: dict) -> list:
    lines = ["## Safety Flags"]
    if safety_flags:
        for flag in safety_flags:
            snp = snps.get(flag.get("rsid"), {})
            lines.append(
                f"{flag.get('gene')} {snp.get('genotype', '--')}: {flag.get('flag')}; {flag.get('action')} [PMID: {flag.get('pmid')}]"
            )
    else:
        lines.append("No critical safety flags for this genotype panel. [Level internal / deterministic rule]")

    lines.extend(["", "## Pharmacogenomic Findings"])
    for rsid, snp in snps.items():
        genotype = snp.get("genotype", "--")
        gene = snp.get("gene")
        pgx = pharmgkb.get(rsid, {})
        finding = GENOTYPE_FINDINGS.get((rsid, genotype), "No current pharmacogenomic annotation for this genotype.")
        evidence = pgx.get("evidence_level", "unknown")
        lines.append(f"{gene} {genotype}: {finding}. [Level {evidence} / PharmGKB]")

    metrics = wearable.get("metrics", {})
    hrv = metrics.get("hrv_ms", {})
    rhr = metrics.get("rhr_bpm", {})
    recovery = metrics.get("recovery_score", {})
    hypo = "no hypoglycemia signal detected" if not wearable.get("hypoglycemia_signal") else "hypoglycemia signal detected"
    lines.extend(
        [
            "",
            "## Wearable Confirmation",
            f"HRV is {hrv.get('avg_30d')} ms with a {hrv.get('trend')} trend and {hrv.get('wow_pct')}% week-over-week change, supporting physiologic stress. [Wearable data]",
            f"Resting heart rate is {rhr.get('avg_30d')} bpm with a {rhr.get('trend')} trend. [Wearable data]",
            f"Recovery is {recovery.get('avg_30d')} with a {recovery.get('trend')} trend and {hypo}. [Wearable data]",
            "",
            "## Clinical Recommendations",
        ]
    )
    if safety_flags:
        for flag in safety_flags:
            lines.append(f"Review {flag.get('drug')} therapy because {flag.get('flag')}. [PMID: {flag.get('pmid')}]")
    else:
        lines.append("Continue routine medication review because no critical safety flags fired for this genotype panel. [Level internal / deterministic rule]")

    return lines
