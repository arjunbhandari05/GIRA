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


def _get_genotype(snp_profile: dict, rsid: str) -> str:
    snp = snp_profile.get(rsid, {})
    if isinstance(snp, dict):
        return snp.get("genotype", "") or ""
    if isinstance(snp, str):
        return snp
    return ""


def _check_warfarin_triad(snp_profile: dict, current_meds: list) -> dict | None:
    on_warfarin = any("warfarin" in m.lower() for m in current_meds)
    if not on_warfarin:
        return None

    reductions = []
    increases = []

    def gt(rsid):
        return _get_genotype(snp_profile, rsid)

    if gt("rs9923231") == "AA":
        reductions.append("VKORC1 AA: 30-40% reduction")
    if gt("rs1799853") in ("AC", "CA"):
        reductions.append("CYP2C9*2: additional 20% reduction")
    if gt("rs1057910") in ("AC", "CA"):
        reductions.append("CYP2C9*3: additional 30% reduction")
    if gt("rs2108622") in ("CT", "TT"):
        increases.append("CYP4F2: 5-10% upward offset")

    if not reductions:
        return None

    detail = "; ".join(reductions)
    if increases:
        detail += f". Partially offset by: {'; '.join(increases)}"

    return {
        "gene": "VKORC1 + CYP2C9 + CYP4F2",
        "rsid": "rs9923231 + rs1799853 + rs1057910 + rs2108622",
        "severity": "critical",
        "flag": f"Warfarin triad analysis — combined sensitivity: {detail}",
        "action": "Estimated therapeutic dose well below standard 5mg/day. Pharmacist dose calculation required before dispensing. Do not use standard dosing.",
        "drug": "warfarin",
        "currently_prescribed": True,
    }


def _check_metformin_transporters(snp_profile: dict, current_meds: list) -> dict | None:
    on_metformin = any("metformin" in m.lower() for m in current_meds)
    if not on_metformin:
        return None

    unfavorable = 0
    details = []

    def gt(rsid):
        return _get_genotype(snp_profile, rsid)

    if gt("rs622342") == "AA":
        unfavorable += 2
        details.append("SLC22A1 AA: 60% reduced OCT1 absorption (primary)")
    if gt("rs2289669") in ("TT", "TC"):
        unfavorable += 1
        details.append("SLC47A1: MATE1 efflux impaired")
    if gt("rs12943590") in ("TT", "TC"):
        unfavorable += 1
        details.append("SLC47A2: MATE2 efflux reduced")
    if gt("rs11212617") == "CC":
        unfavorable += 1
        details.append("ATM CC: AMPK activation pathway impaired")
    if gt("rs8187710") in ("GG",):
        unfavorable += 1
        details.append("SLC22A3: OCT3 hepatic uptake reduced")

    if unfavorable >= 3:
        return {
            "gene": "Metformin transporter panel",
            "rsid": "rs622342 + rs2289669 + rs11212617",
            "severity": "warning",
            "flag": f"Cumulative metformin pathway failure ({unfavorable} unfavorable variants): {'; '.join(details)}",
            "action": "Multiple transport pathway variants indicate systemic metformin non-response. Consider switching to GLP-1 agonist or SGLT2 inhibitor. Confirm with WHOOP/CGM trend.",
            "drug": "metformin",
            "currently_prescribed": True,
        }
    return None


def _check_apoe_complete(snp_profile: dict, current_meds: list) -> dict | None:
    def gt(rsid):
        return _get_genotype(snp_profile, rsid)

    rs429358 = gt("rs429358")
    rs7412 = gt("rs7412")

    if rs429358 == "TT" and rs7412 == "CC":
        return {
            "gene": "APOE",
            "rsid": "rs429358 + rs7412",
            "severity": "warning",
            "flag": "APOE4/4 homozygous — highest cardiovascular risk genotype. Affects ~2% of population.",
            "action": "SGLT2 inhibitor (empagliflozin/dapagliflozin) provides cardioprotection — prioritize over other drug classes if eGFR permits. Discuss cardiovascular monitoring with cardiologist.",
            "drug": "SGLT2 inhibitor",
            "currently_prescribed": False,
        }
    return None


def check_safety_flags(snp_profile: dict, current_meds: list | None = None) -> list:
    flags = []
    for rule in SAFETY_RULES:
        genotype = _get_genotype(snp_profile, rule["rsid"])
        if genotype == rule["risk_genotype"]:
            flags.append(rule.copy())

    meds = current_meds or []
    for fn in (_check_warfarin_triad, _check_metformin_transporters, _check_apoe_complete):
        result = fn(snp_profile, meds)
        if result:
            flags.append(result)
    return flags


def check(snp_profile: dict | None = None, current_meds: list | None = None, **_kwargs) -> list:
    """
    Tool entrypoint. Same deterministic gates as check_safety_flags, but
    annotated with whether the patient is actually exposed to the relevant
    drug class via current_meds. The annotation is informational — the
    flag fires either way so the downstream brief always sees it.
    """
    flags = check_safety_flags(snp_profile or {}, current_meds)
    meds = [m.lower() for m in (current_meds or [])]
    for flag in flags:
        if "currently_prescribed" in flag:
            continue
        drug = (flag.get("drug") or "").lower()
        flag["currently_prescribed"] = bool(drug) and any(drug in m for m in meds)
    return flags
