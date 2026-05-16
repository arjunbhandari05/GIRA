"""Genotype-matched pharmacogenomic relevance for agent briefs."""

from __future__ import annotations

from typing import Any

from apis.pgx_panel import lookup_panel_annotation

# Legacy genotype rules (merged into panel; kept for explicit brief phrasing)
GENOTYPE_FINDINGS: dict[tuple[str, str], str] = {
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

_MED_GENE_HINTS: dict[str, tuple[str, ...]] = {
    "metformin": (
        "TCF7L2",
        "SLC22A1",
        "SLC22A2",
        "SLC22A3",
        "SLC47A1",
        "SLC47A2",
        "KCNJ11",
        "PPARG",
        "ABCC8",
        "ATM",
    ),
    "statin": ("SLCO1B1", "APOE"),
    "atorvastatin": ("SLCO1B1", "APOE"),
    "simvastatin": ("SLCO1B1",),
    "pravastatin": ("SLCO1B1",),
    "rosuvastatin": ("SLCO1B1",),
    "clopidogrel": ("CYP2C19",),
    "warfarin": ("VKORC1", "CYP2C9", "CYP4F2"),
    "semaglutide": ("FTO", "TCF7L2", "GLP1R"),
    "ozempic": ("FTO", "GLP1R"),
    "liraglutide": ("FTO", "GLP1R"),
    "tirzepatide": ("GIPR", "GLP1R"),
    "empagliflozin": ("SLC5A2",),
    "dapagliflozin": ("SLC5A2",),
    "jardiance": ("SLC5A2",),
    "farxiga": ("SLC5A2",),
}


def _meds_lower(current_meds: list | None) -> list[str]:
    return [str(m).lower() for m in (current_meds or [])]


def _genes_on_meds(current_meds: list | None) -> set[str]:
    genes: set[str] = set()
    for med in _meds_lower(current_meds):
        for token, gene_list in _MED_GENE_HINTS.items():
            if token in med:
                genes.update(gene_list)
    return genes


def _cpic_by_gene(cpic_hits: dict | list | None) -> dict[str, dict]:
    if isinstance(cpic_hits, dict):
        items = cpic_hits.get("recommendations") or []
    elif isinstance(cpic_hits, list):
        items = cpic_hits
    else:
        return {}
    out: dict[str, dict] = {}
    for row in items:
        if isinstance(row, dict) and row.get("gene"):
            out[str(row["gene"]).upper()] = row
    return out


def is_relevant_variant(
    rsid: str,
    genotype: str,
    *,
    safety_rsids: set[str],
    med_genes: set[str],
    gene: str,
    cpic_genes: set[str] | None = None,
) -> bool:
    if not genotype or genotype in ("--",):
        return False
    if rsid in safety_rsids:
        return True
    if (rsid, genotype) in GENOTYPE_FINDINGS:
        return True
    annotation = lookup_panel_annotation(rsid, genotype)
    if not annotation:
        return False
    if gene.upper() in (med_genes or set()):
        return True
    if gene.upper() in (cpic_genes or set()):
        return True
    if annotation.get("evidence_level") in ("1A", "1B", "2A"):
        return True
    if annotation.get("category") == "safety":
        return True
    return False


def build_relevant_snp_rows(
    snp_profile: dict[str, dict],
    safety_flags: list[dict],
    current_meds: list | None,
    clinvar_hits: dict[str, dict] | list[dict] | None = None,
    cpic_hits: dict[str, Any] | list | None = None,
) -> list[dict]:
    """
    Variants with panel annotations, fired safety gates, or live CPIC matches
    for genes on the patient's medications.
    """
    safety_rsids = {f.get("rsid") for f in safety_flags if f.get("rsid")}
    med_genes = _genes_on_meds(current_meds)
    cpic_by_gene = _cpic_by_gene(cpic_hits)
    cpic_genes = set(cpic_by_gene.keys())
    clinvar_by_rsid = _clinvar_index(clinvar_hits)

    rows: list[dict] = []
    for rsid, snp in snp_profile.items():
        if not isinstance(snp, dict):
            continue
        genotype = snp.get("genotype", "--")
        gene = snp.get("gene") or ""
        if not is_relevant_variant(
            rsid,
            genotype,
            safety_rsids=safety_rsids,
            med_genes=med_genes,
            gene=gene,
            cpic_genes=cpic_genes,
        ):
            continue

        annotation = lookup_panel_annotation(rsid, genotype)
        base_finding = GENOTYPE_FINDINGS.get((rsid, genotype))
        clinvar = clinvar_by_rsid.get(rsid) or {}
        cpic = cpic_by_gene.get(gene.upper()) or {}

        finding = base_finding
        drug = None
        evidence_level = None
        pmid = None
        if annotation:
            drug = annotation.get("drug")
            evidence_level = annotation.get("evidence_level")
            pmid = annotation.get("pmid")
            if not finding:
                finding = annotation.get("finding")

        for flag in safety_flags:
            if flag.get("rsid") == rsid:
                finding = flag.get("flag")
                drug = drug or flag.get("drug")
                pmid = pmid or flag.get("pmid")
                evidence_level = evidence_level or "1A"
                break

        row = {
            "rsid": rsid,
            "gene": gene,
            "genotype": genotype,
            "evidence_level": evidence_level,
            "finding": finding,
            "drug": drug,
            "pmid": pmid,
            "clinvar_significance": clinvar.get("clinical_significance"),
            "clinvar_condition": clinvar.get("condition"),
            "source": annotation.get("source", "genotype_rule") if annotation else "genotype_rule",
        }
        if cpic.get("recommendation"):
            row["cpic_recommendation"] = cpic.get("recommendation")
            row["cpic_classification"] = cpic.get("cpic_classification")
            row["cpic_guideline_url"] = cpic.get("guideline_url")
        rows.append(row)
    return rows


def _clinvar_index(clinvar_hits: dict[str, dict] | list[dict] | None) -> dict[str, dict]:
    if isinstance(clinvar_hits, dict):
        if "variants" in clinvar_hits:
            items = clinvar_hits.get("variants") or []
        else:
            items = list(clinvar_hits.values())
    elif isinstance(clinvar_hits, list):
        items = clinvar_hits
    else:
        return {}
    out: dict[str, dict] = {}
    for row in items:
        if isinstance(row, dict) and row.get("rsid"):
            out[str(row["rsid"])] = row
    return out
