"""Markdown brief builder for Round 5."""

from datetime import datetime, timezone


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
