"""Parse 23andMe raw genome exports for pharmacogenomics target SNPs."""

import re
from pathlib import Path
from typing import Dict

ROOT = Path(__file__).resolve().parents[1]
GENOME_DIR = ROOT / "data" / "genomes"

PATIENT_GENOME_FILES = {
    "PT-001": "patient_a.txt",
    "PT-002": "patient_b.txt",
    "PT-003": "patient_c.txt",
}

TARGET_SNPS = {
    # ── CATEGORY 1: T2D Disease Risk & Insulin Biology ──────────────────
    "rs7903146": {
        "gene": "TCF7L2",
        "category": "t2d_risk",
        "description": "Most studied T2D gene — 2.4x risk — GLP-1 signaling impaired",
    },
    "rs1801282": {
        "gene": "PPARG",
        "category": "t2d_risk",
        "description": "Insulin sensitivity — Pro/Pro = highest resistance, strongest TZD response",
    },
    "rs5219": {
        "gene": "KCNJ11",
        "category": "t2d_risk",
        "description": "KATP channel — beta cell insulin secretion — sulfonylurea response",
    },
    "rs757110": {
        "gene": "ABCC8",
        "category": "t2d_risk",
        "description": "SUR1 sulfonylurea binding site — dosing ceiling guidance",
    },
    "rs4402960": {
        "gene": "IGF2BP2",
        "category": "t2d_risk",
        "description": "1.14x T2D risk — insulin mRNA stability affected",
    },
    "rs10811661": {
        "gene": "CDKN2A",
        "category": "t2d_risk",
        "description": "1.2x T2D risk — beta cell mass reduction over time",
    },
    "rs1111875": {
        "gene": "HHEX",
        "category": "t2d_risk",
        "description": "1.13x T2D risk — pancreatic development transcription factor",
    },
    "rs7754840": {
        "gene": "CDKAL1",
        "category": "t2d_risk",
        "description": "1.15x T2D risk — impairs proinsulin processing",
    },
    "rs13266634": {
        "gene": "SLC30A8",
        "category": "t2d_risk",
        "description": "1.12x T2D risk — zinc transporter in insulin-secreting beta cells",
    },
    "rs1387153": {
        "gene": "MTNR1B",
        "category": "t2d_risk",
        "description": "1.09x T2D risk — melatonin receptor disrupts glucose-stimulated insulin",
    },
    "rs10830963": {
        "gene": "MTNR1B",
        "category": "t2d_risk",
        "description": "Elevated fasting glucose — circadian rhythm disruption of beta cells",
    },
    "rs2383208": {
        "gene": "ANPEP",
        "category": "t2d_risk",
        "description": "T2D susceptibility locus — aminopeptidase N pathway",
    },
    "rs7578597": {
        "gene": "THADA",
        "category": "t2d_risk",
        "description": "1.15x T2D risk — thyroid adenoma associated — calcium signaling",
    },
    "rs8042680": {
        "gene": "PRC1",
        "category": "t2d_risk",
        "description": "T2D risk — cell cycle regulation — beta cell proliferation",
    },
    "rs1153188": {
        "gene": "DCD",
        "category": "t2d_risk",
        "description": "Dermcidin — insulin secretion regulation",
    },
    "rs4607103": {
        "gene": "ADAMTS9",
        "category": "t2d_risk",
        "description": "1.09x T2D risk — extracellular matrix — adipogenesis",
    },
    "rs10923931": {
        "gene": "NOTCH2",
        "category": "t2d_risk",
        "description": "T2D risk — Notch signaling — pancreatic development",
    },
    "rs4430796": {
        "gene": "HNF1B",
        "category": "t2d_risk",
        "description": "HNF1B — MODY5 related — renal cysts + diabetes — metformin response reduced",
    },
    # ── CATEGORY 2: Metformin Response (full transporter panel) ──────────
    "rs622342": {
        "gene": "SLC22A1",
        "category": "metformin",
        "description": "OCT1 — primary metformin intestinal absorption transporter",
    },
    "rs316019": {
        "gene": "SLC22A2",
        "category": "metformin",
        "description": "OCT2 — renal metformin excretion — accumulation risk if eGFR low",
    },
    "rs8187710": {
        "gene": "SLC22A3",
        "category": "metformin",
        "description": "OCT3 — third metformin transporter — hepatic uptake",
    },
    "rs2289669": {
        "gene": "SLC47A1",
        "category": "metformin",
        "description": "MATE1 — metformin renal exit transporter — efficacy regulator",
    },
    "rs12943590": {
        "gene": "SLC47A2",
        "category": "metformin",
        "description": "MATE2 — works with MATE1 — complete metformin exit picture",
    },
    "rs11212617": {
        "gene": "ATM",
        "category": "metformin",
        "description": "ATM kinase — metformin activates AMPK via ATM — CC = AMPK impaired",
    },
    "rs2787897": {
        "gene": "SLC2A2",
        "category": "metformin",
        "description": "GLUT2 — hepatic glucose transporter — metformin hepatic action",
    },
    "rs3817334": {
        "gene": "MTNR1B",
        "category": "metformin",
        "description": "Melatonin receptor — metformin timing interaction — evening dose better",
    },
    # ── CATEGORY 3: GLP-1 & Incretin Response ────────────────────────────
    "rs9939609": {
        "gene": "FTO",
        "category": "glp1",
        "description": "Strongest obesity variant — 40% greater weight loss on GLP-1 agonists",
    },
    "rs6923761": {
        "gene": "GLP1R",
        "category": "glp1",
        "description": "GLP-1 receptor gene — direct semaglutide binding — AA reduces affinity",
    },
    "rs4664447": {
        "gene": "GLP1R",
        "category": "glp1",
        "description": "Second GLP-1 receptor variant — compound effect with rs6923761",
    },
    "rs1800437": {
        "gene": "GIPR",
        "category": "glp1",
        "description": "GIP receptor — tirzepatide (dual GIP/GLP-1) response prediction",
    },
    "rs10305492": {
        "gene": "GLP2R",
        "category": "glp1",
        "description": "GLP-2 receptor — gut absorption and incretin axis",
    },
    "rs2237892": {
        "gene": "KCNQ1",
        "category": "glp1",
        "description": "KCNQ1 — potassium channel — incretin-stimulated insulin secretion",
    },
    "rs163184": {
        "gene": "KCNQ1",
        "category": "glp1",
        "description": "Second KCNQ1 variant — beta cell GLP-1 response amplification",
    },
    "rs1799884": {
        "gene": "GCK",
        "category": "glp1",
        "description": "Glucokinase — glucose sensing — GLP-1 secretion threshold",
    },
    # ── CATEGORY 4: Drug Safety & Metabolism — SAFETY GATES ──────────────
    "rs4149056": {
        "gene": "SLCO1B1",
        "category": "safety",
        "description": "16.9x statin myopathy — atorvastatin/simvastatin UNSAFE — SAFETY GATE",
    },
    "rs2306283": {
        "gene": "SLCO1B1",
        "category": "safety",
        "description": "Second SLCO1B1 variant — haplotype completion for full myopathy risk",
    },
    "rs4244285": {
        "gene": "CYP2C19",
        "category": "safety",
        "description": "Clopidogrel poor metabolizer — zero antiplatelet effect — FDA Black Box",
    },
    "rs4986893": {
        "gene": "CYP2C19",
        "category": "safety",
        "description": "CYP2C19*3 — completes poor metabolizer typing — Asian populations",
    },
    "rs9923231": {
        "gene": "VKORC1",
        "category": "safety",
        "description": "Warfarin hypersensitivity — 30-40% dose reduction required — SAFETY GATE",
    },
    "rs1799853": {
        "gene": "CYP2C9",
        "category": "safety",
        "description": "CYP2C9*2 — warfarin over-anticoagulation — additional 20% reduction",
    },
    "rs1057910": {
        "gene": "CYP2C9",
        "category": "safety",
        "description": "CYP2C9*3 — strongest warfarin sensitivity — SAFETY GATE",
    },
    "rs2108622": {
        "gene": "CYP4F2",
        "category": "safety",
        "description": "Vitamin K metabolism — completes warfarin triad — slight upward adjustment",
    },
    "rs1045642": {
        "gene": "ABCB1",
        "category": "safety",
        "description": "P-glycoprotein — broad drug absorption and distribution",
    },
    "rs2032582": {
        "gene": "ABCB1",
        "category": "safety",
        "description": "Second P-gp variant — drug efflux across multiple drug classes",
    },
    # ── CATEGORY 5: Diabetic Complication Prediction ──────────────────────
    "rs429358": {
        "gene": "APOE",
        "category": "complications",
        "description": "APOE4 — highest CVD risk — SGLT2 inhibitor cardioprotection indicated",
    },
    "rs7412": {
        "gene": "APOE",
        "category": "complications",
        "description": "Completes APOE2/3/4 full typing — APOE2 is cardioprotective",
    },
    "rs1800629": {
        "gene": "TNF",
        "category": "complications",
        "description": "TNF-alpha inflammation — diabetic nephropathy progression risk",
    },
    "rs1799752": {
        "gene": "ACE",
        "category": "complications",
        "description": "ACE ins/del — diabetic kidney disease — ACEi response prediction",
    },
    "rs5186": {
        "gene": "AGTR1",
        "category": "complications",
        "description": "Angiotensin receptor — hypertension in T2D — ARB vs ACEi matching",
    },
    "rs5443": {
        "gene": "GNB3",
        "category": "complications",
        "description": "G-protein — hypertension + obesity + metabolic syndrome cluster",
    },
    "rs1800795": {
        "gene": "IL6",
        "category": "complications",
        "description": "IL-6 inflammation — peripheral neuropathy acceleration risk",
    },
    "rs1800896": {
        "gene": "IL10",
        "category": "complications",
        "description": "Anti-inflammatory IL-10 — retinopathy protection signal",
    },
    "rs2010963": {
        "gene": "VEGF",
        "category": "complications",
        "description": "Vascular endothelial growth factor — diabetic retinopathy risk",
    },
    "rs3025039": {
        "gene": "VEGF",
        "category": "complications",
        "description": "Second VEGF variant — stronger retinopathy signal than rs2010963 alone",
    },
    "rs762551": {
        "gene": "CYP1A2",
        "category": "complications",
        "description": "Caffeine metabolism — some diabetes drug interactions",
    },
    "rs1801133": {
        "gene": "MTHFR",
        "category": "complications",
        "description": "MTHFR C677T — homocysteine elevation — nephropathy and neuropathy",
    },
    "rs1801131": {
        "gene": "MTHFR",
        "category": "complications",
        "description": "MTHFR A1298C — compound effect with C677T — folate supplementation",
    },
    # ── CATEGORY 6: SGLT2 & Newer Drug Response ──────────────────────────
    "rs10933431": {
        "gene": "SLC5A2",
        "category": "sglt2",
        "description": "SGLT2 transporter gene — empagliflozin/dapagliflozin efficacy directly",
    },
    "rs9934438": {
        "gene": "VKORC1",
        "category": "sglt2",
        "description": "Additional VKORC1 variant for complete warfarin picture",
    },
    "rs3758674": {
        "gene": "PPARA",
        "category": "sglt2",
        "description": "PPAR-alpha — fibrate response — triglyceride management in T2D",
    },
    "rs4253778": {
        "gene": "PPARA",
        "category": "sglt2",
        "description": "Second PPARA variant — fenofibrate efficacy prediction",
    },
    "rs1801260": {
        "gene": "CLOCK",
        "category": "sglt2",
        "description": "Circadian clock — metformin 15-20% better efficacy with evening dose",
    },
    "rs17584499": {
        "gene": "PTPRD",
        "category": "sglt2",
        "description": "Tyrosine phosphatase — SGLT2 inhibitor glycemic response modifier",
    },
    "rs7961581": {
        "gene": "TSPAN8",
        "category": "sglt2",
        "description": "Tetraspanin 8 — beta cell function — insulin secretion under SGLT2",
    },
}

POPULATION_FREQ = {
    "rs7903146": {"freq": 0.30, "label": "~30% of people carry this variant"},
    "rs1801282": {"freq": 0.75, "label": "~75% of people — Pro/Pro most common"},
    "rs5219": {"freq": 0.35, "label": "~35% carry at least one risk allele"},
    "rs757110": {"freq": 0.30, "label": "~30% population frequency"},
    "rs4402960": {"freq": 0.28, "label": "~28% carry the risk allele"},
    "rs10811661": {"freq": 0.80, "label": "~80% population — TT risk genotype ~17%"},
    "rs1111875": {"freq": 0.55, "label": "~55% carry at least one risk allele"},
    "rs7754840": {"freq": 0.37, "label": "~37% carry risk allele"},
    "rs13266634": {"freq": 0.75, "label": "~75% carry the C allele"},
    "rs1387153": {"freq": 0.29, "label": "~29% carry the T risk allele"},
    "rs10830963": {"freq": 0.30, "label": "~30% population frequency"},
    "rs2383208": {"freq": 0.40, "label": "~40% population frequency"},
    "rs7578597": {"freq": 0.20, "label": "~20% carry risk allele"},
    "rs8042680": {"freq": 0.50, "label": "~50% population frequency"},
    "rs1153188": {"freq": 0.25, "label": "~25% population frequency"},
    "rs4607103": {"freq": 0.75, "label": "~75% carry risk allele"},
    "rs10923931": {"freq": 0.10, "label": "~10% carry risk allele"},
    "rs4430796": {"freq": 0.45, "label": "~45% carry risk allele"},
    "rs622342": {"freq": 0.20, "label": "~20% carry AA — primary non-responder genotype"},
    "rs316019": {"freq": 0.15, "label": "~15% carry variant allele"},
    "rs8187710": {"freq": 0.20, "label": "~20% population frequency"},
    "rs2289669": {"freq": 0.45, "label": "~45% carry at least one variant"},
    "rs12943590": {"freq": 0.35, "label": "~35% carry variant allele"},
    "rs11212617": {"freq": 0.40, "label": "~40% carry CC — AMPK activation impaired"},
    "rs2787897": {"freq": 0.30, "label": "~30% population frequency"},
    "rs3817334": {"freq": 0.25, "label": "~25% carry variant"},
    "rs9939609": {"freq": 0.16, "label": "~16% are AA — strongest obesity genotype"},
    "rs6923761": {"freq": 0.35, "label": "~35% carry at least one A allele"},
    "rs4664447": {"freq": 0.25, "label": "~25% population frequency"},
    "rs1800437": {"freq": 0.40, "label": "~40% carry variant — affects tirzepatide response"},
    "rs10305492": {"freq": 0.20, "label": "~20% population frequency"},
    "rs2237892": {"freq": 0.55, "label": "~55% carry risk allele"},
    "rs163184": {"freq": 0.45, "label": "~45% carry variant"},
    "rs1799884": {"freq": 0.30, "label": "~30% carry variant allele"},
    "rs4149056": {"freq": 0.05, "label": "~5% are TT — rare but serious"},
    "rs2306283": {"freq": 0.40, "label": "~40% carry at least one variant"},
    "rs4244285": {"freq": 0.15, "label": "~15% are AA poor metabolizers in Europeans"},
    "rs4986893": {"freq": 0.05, "label": "~5% in East Asian populations"},
    "rs9923231": {"freq": 0.10, "label": "~10% are AA — warfarin sensitive"},
    "rs1799853": {"freq": 0.13, "label": "~13% carry CYP2C9*2"},
    "rs1057910": {"freq": 0.07, "label": "~7% carry CYP2C9*3"},
    "rs2108622": {"freq": 0.25, "label": "~25% carry variant allele"},
    "rs1045642": {"freq": 0.50, "label": "~50% carry at least one T allele"},
    "rs2032582": {"freq": 0.45, "label": "~45% population frequency"},
    "rs429358": {"freq": 0.15, "label": "~15% carry at least one APOE4 allele"},
    "rs7412": {"freq": 0.08, "label": "~8% carry the APOE2 protective allele"},
    "rs1800629": {"freq": 0.30, "label": "~30% carry risk allele"},
    "rs1799752": {"freq": 0.50, "label": "~50% are DD — ACE deletion homozygous"},
    "rs5186": {"freq": 0.25, "label": "~25% carry variant"},
    "rs5443": {"freq": 0.30, "label": "~30% are TT"},
    "rs1800795": {"freq": 0.40, "label": "~40% carry GG risk allele"},
    "rs1800896": {"freq": 0.50, "label": "~50% carry AA protective allele"},
    "rs2010963": {"freq": 0.45, "label": "~45% carry at least one C allele"},
    "rs3025039": {"freq": 0.25, "label": "~25% carry variant"},
    "rs762551": {"freq": 0.35, "label": "~35% are AA rapid caffeine metabolizers"},
    "rs1801133": {"freq": 0.10, "label": "~10% are TT — thermolabile MTHFR"},
    "rs1801131": {"freq": 0.12, "label": "~12% are CC — compound MTHFR risk"},
    "rs10933431": {"freq": 0.30, "label": "~30% carry variant — SGLT2 efficacy signal"},
    "rs9934438": {"freq": 0.35, "label": "~35% population frequency"},
    "rs3758674": {"freq": 0.40, "label": "~40% carry variant allele"},
    "rs4253778": {"freq": 0.25, "label": "~25% population frequency"},
    "rs1801260": {"freq": 0.35, "label": "~35% carry CLOCK variant"},
    "rs17584499": {"freq": 0.20, "label": "~20% population frequency"},
    "rs7961581": {"freq": 0.30, "label": "~30% carry risk allele"},
}


def _normalize_line_to_fields(line: str):
    """Turn a data line into tab-separated fields, then split."""
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    normalized = re.sub(r"\s+", "\t", stripped)
    parts = normalized.split("\t")
    return parts


def _snp_entry(
    rsid: str,
    genotype: str,
    chrom: str = "--",
    pos: str = "--",
) -> dict:
    """Merge TARGET_SNPS metadata with observed genotype and population frequency."""
    meta = TARGET_SNPS[rsid]
    freq = POPULATION_FREQ.get(rsid, {})
    return {
        "gene": meta["gene"],
        "category": meta["category"],
        "description": meta["description"],
        "genotype": genotype,
        "chrom": chrom,
        "pos": pos,
        "risk_allele": meta.get("risk_allele", ""),
        "population_freq": freq.get("freq"),
        "population_label": freq.get("label"),
    }


def parse_genome(path: str) -> dict:
    """
    Parse a 23andMe raw .txt file and extract TARGET_SNPS.

    Returns a dict keyed by rsID with gene, genotype, chrom, pos, category,
    description, risk_allele, population_freq, and population_label.
    """
    found: Dict[str, dict] = {}

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            for raw_line in handle:
                try:
                    parts = _normalize_line_to_fields(raw_line)
                    if parts is None:
                        continue
                    if len(parts) < 4:
                        continue
                    rsid = parts[0].strip()
                    chrom = parts[1].strip()
                    pos = parts[2].strip()
                    genotype = parts[3].strip()
                    if rsid not in TARGET_SNPS:
                        continue
                    found[rsid] = _snp_entry(rsid, genotype, chrom, pos)
                except (OSError, UnicodeError):
                    continue
                except Exception:
                    continue
    except OSError:
        pass

    result = {}
    for rsid in TARGET_SNPS:
        if rsid in found:
            result[rsid] = found[rsid]
        else:
            result[rsid] = _snp_entry(rsid, "--", "--", "--")
    return result


def get_snp_profile(patient_id: str) -> dict:
    """
    Returns dict of rsID -> {
        gene, genotype, category, description,
        risk_allele (if known), population_freq, population_label,
        chrom, pos
    }
    Missing rsIDs return genotype "--" with all other fields populated from TARGET_SNPS.
    """
    filename = PATIENT_GENOME_FILES.get(patient_id) or (
        f"{patient_id.lower().replace('-', '_')}.txt"
    )
    path = GENOME_DIR / filename
    if path.exists():
        return parse_genome(str(path))

    try:
        from agent.memory import read as _read

        patient = _read(patient_id)
        if patient and patient.get("snp_profile"):
            stored = patient["snp_profile"]
            return _normalize_profile(stored)
    except Exception:
        pass

    return {rsid: _snp_entry(rsid, "--", "--", "--") for rsid in TARGET_SNPS}


def _normalize_profile(stored: dict) -> dict:
    """Upgrade legacy string-gene profiles to enriched panel shape."""
    out: dict = {}
    for rsid in TARGET_SNPS:
        raw = stored.get(rsid)
        if isinstance(raw, dict):
            genotype = raw.get("genotype", "--")
            chrom = raw.get("chrom", "--")
            pos = raw.get("pos", "--")
            entry = _snp_entry(rsid, genotype, chrom, pos)
            for key in ("category", "description", "risk_allele", "population_freq", "population_label"):
                if raw.get(key) is not None:
                    entry[key] = raw[key]
            out[rsid] = entry
        elif isinstance(raw, str):
            out[rsid] = _snp_entry(rsid, raw if raw else "--")
        else:
            out[rsid] = _snp_entry(rsid, "--", "--", "--")
    return out
