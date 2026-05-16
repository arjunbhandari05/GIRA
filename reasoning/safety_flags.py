"""Deterministic Round 3 pharmacogenomic safety flags."""

SAFETY_RULES = [
    {
        "rsid": "rs4149056",
        "gene": "SLCO1B1",
        "risk_genotype": "TT",
        "severity": "CRITICAL",
        "flag": "Statin myopathy risk 16.9x elevated",
        "action": "Discontinue or switch statin. Order CK levels immediately.",
        "drug": "statin",
        "pmid": "18987363",
    },
    {
        "rsid": "rs4244285",
        "gene": "CYP2C19",
        "risk_genotype": "AA",
        "severity": "CRITICAL",
        "flag": "Clopidogrel poor metabolizer — zero antiplatelet effect",
        "action": "Switch to prasugrel or ticagrelor immediately.",
        "drug": "clopidogrel",
        "pmid": "19106084",
    },
    {
        "rsid": "rs9923231",
        "gene": "VKORC1",
        "risk_genotype": "AA",
        "severity": "WARNING",
        "flag": "Warfarin hypersensitivity — standard dose risks bleeding",
        "action": "Reduce warfarin dose 25-50%. Monitor INR closely.",
        "drug": "warfarin",
        "pmid": "17898316",
    },
    {
        "rsid": "rs622342",
        "gene": "SLC22A1",
        "risk_genotype": "AA",
        "severity": "WARNING",
        "flag": "Metformin reduced efficacy — OCT1 transport impaired ~50%",
        "action": "Consider switching to sulfonylurea or GLP-1 agonist.",
        "drug": "metformin",
        "pmid": "21378095",
    },
]


def check_safety_flags(snp_profile: dict) -> list:
    flags = []
    for rule in SAFETY_RULES:
        genotype = snp_profile.get(rule["rsid"], {}).get("genotype")
        if genotype == rule["risk_genotype"]:
            flags.append(rule.copy())
    return flags


def check(snp_profile: dict | None = None, current_meds: list | None = None, **_kwargs) -> list:
    """
    Tool entrypoint. Same deterministic gates as check_safety_flags, but
    annotated with whether the patient is actually exposed to the relevant
    drug class via current_meds. The annotation is informational — the
    flag fires either way so the downstream brief always sees it.
    """
    flags = check_safety_flags(snp_profile or {})
    meds = [m.lower() for m in (current_meds or [])]
    for flag in flags:
        drug = (flag.get("drug") or "").lower()
        flag["currently_prescribed"] = bool(drug) and any(drug in m for m in meds)
    return flags
