"""Static PharmGKB-style lookup table (internal reference; agent brief uses live evidence)."""

PHARMGKB_STATIC = {
    "rs7903146": {
        "source": "PharmGKB",
        "rsid": "rs7903146",
        "gene": "TCF7L2",
        "risk_genotype": "TT",
        "drug": "metformin",
        "evidence_level": "2A",
        "finding": "TT genotype associated with reduced metformin efficacy and increased T2D risk via impaired GLP-1 signaling.",
        "pmid": "29326107",
    },
    "rs622342": {
        "source": "PharmGKB",
        "rsid": "rs622342",
        "gene": "SLC22A1",
        "risk_genotype": "AA",
        "drug": "metformin",
        "evidence_level": "1A",
        "finding": "AA genotype reduces OCT1 hepatic metformin transporter expression by ~50%, impairing drug uptake.",
        "pmid": "21378095",
    },
    "rs5219": {
        "source": "PharmGKB",
        "rsid": "rs5219",
        "gene": "KCNJ11",
        "risk_genotype": "TT",
        "drug": "sulfonylurea",
        "evidence_level": "2A",
        "finding": "TT genotype associated with better sulfonylurea response via KATP channel sensitivity.",
        "pmid": "17327445",
    },
    "rs1801282": {
        "source": "PharmGKB",
        "rsid": "rs1801282",
        "gene": "PPARG",
        "risk_genotype": "CC",
        "drug": "thiazolidinedione",
        "evidence_level": "2B",
        "finding": "CC genotype associated with reduced TZD insulin-sensitizing response.",
        "pmid": "15983207",
    },
    "rs757110": {
        "source": "PharmGKB",
        "rsid": "rs757110",
        "gene": "ABCC8",
        "risk_genotype": "AA",
        "drug": "sulfonylurea",
        "evidence_level": "2A",
        "finding": "AA genotype alters sulfonylurea receptor binding, affecting dosing ceiling.",
        "pmid": "16936230",
    },
    "rs9939609": {
        "source": "PharmGKB",
        "rsid": "rs9939609",
        "gene": "FTO",
        "risk_genotype": "AA",
        "drug": "GLP-1 agonist",
        "evidence_level": "2B",
        "finding": "AA genotype associated with obesity risk and enhanced weight loss response to GLP-1 agonists.",
        "pmid": "23334450",
    },
    "rs4149056": {
        "source": "PharmGKB",
        "rsid": "rs4149056",
        "gene": "SLCO1B1",
        "risk_genotype": "TT",
        "drug": "statin",
        "evidence_level": "1A",
        "finding": "TT genotype increases statin myopathy risk 16.9x by impairing hepatic statin transport.",
        "pmid": "18987363",
    },
    "rs429358": {
        "source": "PharmGKB",
        "rsid": "rs429358",
        "gene": "APOE",
        "risk_genotype": "TT",
        "drug": "statin",
        "evidence_level": "2A",
        "finding": "TT genotype (APOE4) associated with elevated cardiovascular risk and differential statin response.",
        "pmid": "19706793",
    },
    "rs4244285": {
        "source": "PharmGKB",
        "rsid": "rs4244285",
        "gene": "CYP2C19",
        "risk_genotype": "AA",
        "drug": "clopidogrel",
        "evidence_level": "1A",
        "finding": "AA genotype (*2/*2) = poor metabolizer, clopidogrel has zero antiplatelet effect.",
        "pmid": "19106084",
    },
    "rs9923231": {
        "source": "PharmGKB",
        "rsid": "rs9923231",
        "gene": "VKORC1",
        "risk_genotype": "AA",
        "drug": "warfarin",
        "evidence_level": "1A",
        "finding": "AA genotype causes warfarin hypersensitivity — standard dose risks bleeding. Reduce by 25-50%.",
        "pmid": "17898316",
    },
}


def lookup_pgx_annotation(rsid: str, genotype: str) -> dict | None:
    """Return static annotation only when patient genotype matches risk_genotype."""
    entry = PHARMGKB_STATIC.get(rsid)
    if not entry:
        return None
    if (genotype or "").upper() != (entry.get("risk_genotype") or "").upper():
        return None
    return dict(entry)


def get_pharmgkb(rsid: str) -> dict:
    return PHARMGKB_STATIC.get(
        rsid,
        {
            "source": "PharmGKB",
            "rsid": rsid,
            "gene": "unknown",
            "drug": "unknown",
            "evidence_level": "unknown",
            "finding": "No annotation available.",
            "pmid": "",
        },
    )


def fetch_pharmgkb(
    genes: list[str] | str | None = None,
    snp_profile: dict | None = None,
    **_kwargs,
) -> list[dict]:
    """
    Optional reference lookup. When snp_profile is provided, only returns rows
    whose risk_genotype matches the patient's genotype for that rsID.
    """
    if not genes:
        return []
    if isinstance(genes, str):
        genes = [genes]
    wanted = {g.upper() for g in genes if g}
    out: list[dict] = []
    for entry in PHARMGKB_STATIC.values():
        if entry.get("gene", "").upper() not in wanted:
            continue
        rsid = entry.get("rsid")
        if snp_profile and rsid:
            patient_geno = (snp_profile.get(rsid) or {}).get("genotype")
            if patient_geno and patient_geno != entry.get("risk_genotype"):
                continue
        out.append(dict(entry))
    return out
