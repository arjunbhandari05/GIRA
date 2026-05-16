"""
64-SNP pharmacogenomic panel — genotype-specific annotations for GIRA briefs.

Curated high-confidence rows (PharmGKB-style evidence levels) plus panel-wide
coverage derived from parsers.snp_parser.TARGET_SNPS.
"""

from __future__ import annotations

from parsers.snp_parser import TARGET_SNPS

CATEGORY_DRUG: dict[str, str] = {
    "t2d_risk": "type 2 diabetes",
    "metformin": "metformin",
    "glp1": "GLP-1 agonist",
    "safety": "drug safety",
    "complications": "diabetic complications",
    "sglt2": "SGLT2 inhibitor",
}

CATEGORY_EVIDENCE: dict[str, str] = {
    "t2d_risk": "3",
    "metformin": "2A",
    "glp1": "2B",
    "safety": "1A",
    "complications": "2B",
    "sglt2": "2B",
}

# Curated (rsid, genotype) → annotation (evidence 1A–3, PMIDs where known)
CURATED: dict[tuple[str, str], dict] = {
    ("rs7903146", "TT"): {
        "finding": "TT genotype associated with reduced metformin efficacy and increased T2D risk via impaired GLP-1 signaling.",
        "drug": "metformin",
        "evidence_level": "2A",
        "pmid": "29326107",
    },
    ("rs7903146", "CT"): {
        "finding": "CT genotype — intermediate TCF7L2 risk; monitor glycemic response to metformin.",
        "drug": "metformin",
        "evidence_level": "2B",
        "pmid": "29326107",
    },
    ("rs622342", "AA"): {
        "finding": "AA genotype reduces OCT1 hepatic metformin transporter expression by ~50%, impairing drug uptake.",
        "drug": "metformin",
        "evidence_level": "1A",
        "pmid": "21378095",
    },
    ("rs5219", "TT"): {
        "finding": "TT genotype associated with better sulfonylurea response via KATP channel sensitivity.",
        "drug": "sulfonylurea",
        "evidence_level": "2A",
        "pmid": "17327445",
    },
    ("rs1801282", "CC"): {
        "finding": "CC genotype associated with reduced TZD insulin-sensitizing response.",
        "drug": "thiazolidinedione",
        "evidence_level": "2B",
        "pmid": "15983207",
    },
    ("rs757110", "AA"): {
        "finding": "AA genotype alters sulfonylurea receptor binding, affecting dosing ceiling.",
        "drug": "sulfonylurea",
        "evidence_level": "2A",
        "pmid": "16936230",
    },
    ("rs9939609", "AA"): {
        "finding": "AA genotype associated with obesity risk and enhanced weight loss response to GLP-1 agonists.",
        "drug": "GLP-1 agonist",
        "evidence_level": "2B",
        "pmid": "23334450",
    },
    ("rs4149056", "TC"): {
        "finding": "TC genotype — intermediate SLCO1B1 function; moderate statin myopathy risk.",
        "drug": "statin",
        "evidence_level": "1A",
        "pmid": "18987363",
    },
    ("rs4149056", "CT"): {
        "finding": "TC genotype — intermediate SLCO1B1 function; moderate statin myopathy risk.",
        "drug": "statin",
        "evidence_level": "1A",
        "pmid": "18987363",
    },
    ("rs4149056", "TT"): {
        "finding": "TT genotype increases statin myopathy risk 16.9x by impairing hepatic statin transport.",
        "drug": "statin",
        "evidence_level": "1A",
        "pmid": "18987363",
    },
    ("rs429358", "CT"): {
        "finding": "CT genotype — one APOE4 allele; elevated cardiovascular risk in T2D.",
        "drug": "statin",
        "evidence_level": "2A",
        "pmid": "19706793",
    },
    ("rs429358", "TC"): {
        "finding": "CT genotype — one APOE4 allele; elevated cardiovascular risk in T2D.",
        "drug": "statin",
        "evidence_level": "2A",
        "pmid": "19706793",
    },
    ("rs429358", "TT"): {
        "finding": "TT genotype (APOE ε4/ε4 context with rs7412) — highest cardiovascular risk; prioritize cardioprotective therapy.",
        "drug": "SGLT2 inhibitor",
        "evidence_level": "2A",
        "pmid": "19706793",
    },
    ("rs4244285", "GA"): {
        "finding": "GA genotype — CYP2C19 intermediate metabolizer; reduced clopidogrel active metabolite.",
        "drug": "clopidogrel",
        "evidence_level": "1A",
        "pmid": "19106084",
    },
    ("rs4244285", "AG"): {
        "finding": "GA genotype — CYP2C19 intermediate metabolizer; reduced clopidogrel active metabolite.",
        "drug": "clopidogrel",
        "evidence_level": "1A",
        "pmid": "19106084",
    },
    ("rs4244285", "AA"): {
        "finding": "AA genotype (*2/*2) — poor metabolizer; clopidogrel has minimal antiplatelet effect.",
        "drug": "clopidogrel",
        "evidence_level": "1A",
        "pmid": "19106084",
    },
    ("rs4986893", "AA"): {
        "finding": "CYP2C19*3 homozygous — contributes to poor metabolizer status with rs4244285.",
        "drug": "clopidogrel",
        "evidence_level": "1A",
        "pmid": "19106084",
    },
    ("rs9923231", "GA"): {
        "finding": "GA genotype — intermediate warfarin sensitivity; lower dose range likely.",
        "drug": "warfarin",
        "evidence_level": "1A",
        "pmid": "17898316",
    },
    ("rs9923231", "AG"): {
        "finding": "GA genotype — intermediate warfarin sensitivity; lower dose range likely.",
        "drug": "warfarin",
        "evidence_level": "1A",
        "pmid": "17898316",
    },
    ("rs9923231", "AA"): {
        "finding": "AA genotype causes warfarin hypersensitivity — standard dose risks bleeding. Reduce 25–50%.",
        "drug": "warfarin",
        "evidence_level": "1A",
        "pmid": "17898316",
    },
    ("rs1799853", "AC"): {
        "finding": "CYP2C9*2 carrier — warfarin dose reduction ~20% typically required.",
        "drug": "warfarin",
        "evidence_level": "1A",
        "pmid": "17898316",
    },
    ("rs1799853", "CA"): {
        "finding": "CYP2C9*2 carrier — warfarin dose reduction ~20% typically required.",
        "drug": "warfarin",
        "evidence_level": "1A",
        "pmid": "17898316",
    },
    ("rs1057910", "AC"): {
        "finding": "CYP2C9*3 carrier — warfarin sensitivity; additional dose reduction.",
        "drug": "warfarin",
        "evidence_level": "1A",
        "pmid": "17898316",
    },
    ("rs1057910", "CA"): {
        "finding": "CYP2C9*3 carrier — warfarin sensitivity; additional dose reduction.",
        "drug": "warfarin",
        "evidence_level": "1A",
        "pmid": "17898316",
    },
    ("rs2289669", "TT"): {
        "finding": "MATE1 TT — reduced metformin renal efflux; accumulation risk if eGFR borderline.",
        "drug": "metformin",
        "evidence_level": "2A",
        "pmid": "21378095",
    },
    ("rs2289669", "TC"): {
        "finding": "MATE1 variant carrier — monitor metformin tolerance and renal function.",
        "drug": "metformin",
        "evidence_level": "2B",
        "pmid": "",
    },
    ("rs12943590", "TT"): {
        "finding": "MATE2 variant — metformin exit pathway reduced; contributes to transporter panel risk.",
        "drug": "metformin",
        "evidence_level": "2B",
        "pmid": "",
    },
    ("rs11212617", "CC"): {
        "finding": "ATM CC — AMPK activation impaired; metformin mechanism partially blunted.",
        "drug": "metformin",
        "evidence_level": "2B",
        "pmid": "",
    },
    ("rs6923761", "AA"): {
        "finding": "GLP1R AA — reduced receptor affinity; may blunt semaglutide/liraglutide response.",
        "drug": "GLP-1 agonist",
        "evidence_level": "2B",
        "pmid": "",
    },
    ("rs1800437", "CC"): {
        "finding": "GIPR variant — may affect tirzepatide dual incretin response.",
        "drug": "tirzepatide",
        "evidence_level": "3",
        "pmid": "",
    },
    ("rs1799752", "DD"): {
        "finding": "ACE D/D — higher ACE activity; diabetic nephropathy risk; ACE inhibitor response predictor.",
        "drug": "ACE inhibitor",
        "evidence_level": "2B",
        "pmid": "",
    },
    ("rs1799752", "ID"): {
        "finding": "ACE I/D heterozygote — intermediate ACE activity.",
        "drug": "ACE inhibitor",
        "evidence_level": "3",
        "pmid": "",
    },
    ("rs1801133", "TT"): {
        "finding": "MTHFR C677T homozygous — elevated homocysteine; nephropathy/neuropathy modifier in T2D.",
        "drug": "folate",
        "evidence_level": "2B",
        "pmid": "",
    },
    ("rs10933431", "TT"): {
        "finding": "SLC5A2 variant — may modulate empagliflozin/dapagliflozin glycemic efficacy.",
        "drug": "SGLT2 inhibitor",
        "evidence_level": "3",
        "pmid": "",
    },
}

# Genotypes considered unfavorable / actionable per rsID (panel + T2D risk loci)
ACTIONABLE_GENOTYPES: dict[str, frozenset[str]] = {
    "rs7903146": frozenset({"TT", "CT", "TC"}),
    "rs1801282": frozenset({"CC", "CG", "GC"}),
    "rs5219": frozenset({"TT", "CT", "TC"}),
    "rs757110": frozenset({"AA", "AG", "GA"}),
    "rs4402960": frozenset({"TT", "CT", "TC"}),
    "rs10811661": frozenset({"TT"}),
    "rs1111875": frozenset({"TT", "CT", "TC"}),
    "rs7754840": frozenset({"CC", "CT", "TC"}),
    "rs13266634": frozenset({"CC"}),
    "rs1387153": frozenset({"TT", "CT", "TC"}),
    "rs10830963": frozenset({"GG", "GT", "TG"}),
    "rs7578597": frozenset({"TT", "CT", "TC"}),
    "rs4607103": frozenset({"GG", "GT", "TG"}),
    "rs10923931": frozenset({"CC", "CT", "TC"}),
    "rs4430796": frozenset({"CC", "CT", "TC"}),
    "rs622342": frozenset({"AA", "AG", "GA"}),
    "rs316019": frozenset({"AA", "AG", "GA"}),
    "rs8187710": frozenset({"GG", "GA", "AG"}),
    "rs2289669": frozenset({"TT", "TC", "CT"}),
    "rs12943590": frozenset({"TT", "TC", "CT"}),
    "rs11212617": frozenset({"CC"}),
    "rs9939609": frozenset({"AA", "AT", "TA"}),
    "rs6923761": frozenset({"AA", "AG", "GA"}),
    "rs4664447": frozenset({"TT", "CT", "TC"}),
    "rs1800437": frozenset({"CC", "CT", "TC"}),
    "rs2237892": frozenset({"CC", "CT", "TC"}),
    "rs163184": frozenset({"TT", "CT", "TC"}),
    "rs1799884": frozenset({"TT", "CT", "TC"}),
    "rs4149056": frozenset({"TT", "TC", "CT"}),
    "rs2306283": frozenset({"TT", "CT", "TC"}),
    "rs4244285": frozenset({"AA", "AG", "GA"}),
    "rs4986893": frozenset({"AA"}),
    "rs9923231": frozenset({"AA", "AG", "GA"}),
    "rs1799853": frozenset({"AC", "CA", "CC"}),
    "rs1057910": frozenset({"AC", "CA", "CC"}),
    "rs2108622": frozenset({"CT", "TT", "TC"}),
    "rs429358": frozenset({"CT", "TC", "TT"}),
    "rs7412": frozenset({"CC"}),
    "rs1800629": frozenset({"GG", "GA", "AG"}),
    "rs1799752": frozenset({"DD", "ID", "DI"}),
    "rs5186": frozenset({"CC", "CT", "TC"}),
    "rs5443": frozenset({"TT"}),
    "rs1800795": frozenset({"GG"}),
    "rs2010963": frozenset({"CC", "CT", "TC"}),
    "rs3025039": frozenset({"CC", "CT", "TC"}),
    "rs1801133": frozenset({"TT", "CT", "TC"}),
    "rs1801131": frozenset({"CC", "CT", "TC"}),
    "rs10933431": frozenset({"TT", "CT", "TC"}),
    "rs3758674": frozenset({"GG", "GA", "AG"}),
    "rs1801260": frozenset({"CC", "CT", "TC"}),
    "rs17584499": frozenset({"TT", "CT", "TC"}),
    "rs7961581": frozenset({"CC", "CT", "TC"}),
}

PANEL_RSIDS: tuple[str, ...] = tuple(TARGET_SNPS.keys())


def _norm_genotype(genotype: str) -> str:
    return (genotype or "").upper().replace(" ", "")


def _is_actionable(rsid: str, genotype: str) -> bool:
    g = _norm_genotype(genotype)
    if not g or g == "--":
        return False
    action = ACTIONABLE_GENOTYPES.get(rsid)
    if action:
        return g in action
    return len(g) >= 2


def _panel_fallback(rsid: str, genotype: str) -> dict | None:
    if not _is_actionable(rsid, genotype):
        return None
    meta = TARGET_SNPS.get(rsid)
    if not meta:
        return None
    category = meta.get("category", "other")
    return {
        "source": "GIRA panel",
        "rsid": rsid,
        "gene": meta.get("gene", ""),
        "genotype": _norm_genotype(genotype),
        "drug": CATEGORY_DRUG.get(category, "T2D pharmacotherapy"),
        "evidence_level": CATEGORY_EVIDENCE.get(category, "3"),
        "finding": meta.get("description", "Panel variant with potential clinical relevance."),
        "pmid": "",
        "category": category,
    }


def lookup_panel_annotation(rsid: str, genotype: str) -> dict | None:
    """Genotype-specific PGx row for any rsID in the 64-SNP panel."""
    g = _norm_genotype(genotype)
    if not g or g == "--":
        return None

    curated = CURATED.get((rsid, g))
    meta = TARGET_SNPS.get(rsid, {})
    gene = meta.get("gene", "")
    category = meta.get("category", "")

    if curated:
        return {
            "source": "PharmGKB",
            "rsid": rsid,
            "gene": gene,
            "genotype": g,
            "category": category,
            **curated,
        }

    fallback = _panel_fallback(rsid, g)
    if fallback:
        return fallback
    return None


def annotations_for_profile(snp_profile: dict) -> list[dict]:
    """All panel annotations matching patient genotypes (up to 64 rows)."""
    out: list[dict] = []
    for rsid in PANEL_RSIDS:
        snp = snp_profile.get(rsid) or {}
        genotype = snp.get("genotype", "--") if isinstance(snp, dict) else str(snp)
        row = lookup_panel_annotation(rsid, genotype)
        if row:
            out.append(row)
    return out


def annotations_for_genes(
    genes: list[str],
    snp_profile: dict | None = None,
) -> list[dict]:
    wanted = {g.upper() for g in genes if g}
    if not wanted:
        return []
    profile = snp_profile or {}
    out: list[dict] = []
    for rsid in PANEL_RSIDS:
        meta = TARGET_SNPS.get(rsid, {})
        if meta.get("gene", "").upper() not in wanted:
            continue
        snp = profile.get(rsid) or {}
        genotype = snp.get("genotype", "--") if isinstance(snp, dict) else str(snp)
        row = lookup_panel_annotation(rsid, genotype)
        if row:
            out.append(row)
    return out
