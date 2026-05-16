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
    "rs7903146": "TCF7L2",
    "rs622342": "SLC22A1",
    "rs5219": "KCNJ11",
    "rs1801282": "PPARG",
    "rs757110": "ABCC8",
    "rs9939609": "FTO",
    "rs4149056": "SLCO1B1",
    "rs429358": "APOE",
    "rs4244285": "CYP2C19",
    "rs9923231": "VKORC1",
}


def _normalize_line_to_fields(line: str):
    """Turn a data line into tab-separated fields, then split."""
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    # Collapse any run of whitespace (spaces/tabs) to a single tab, then split
    normalized = re.sub(r"\s+", "\t", stripped)
    parts = normalized.split("\t")
    return parts


def parse_genome(path: str) -> dict:
    """
    Parse a 23andMe raw .txt file and extract TARGET_SNPS.

    Returns a dict keyed by rsID with gene, genotype, chrom, and pos.
    Missing rsIDs use placeholder '--' values.
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
                    gene = TARGET_SNPS[rsid]
                    found[rsid] = {
                        "gene": gene,
                        "genotype": genotype,
                        "chrom": chrom,
                        "pos": pos,
                    }
                except (OSError, UnicodeError):
                    continue
                except Exception:
                    # Malformed line — skip without crashing
                    continue
    except OSError:
        pass

    result = {}
    for rsid, gene in TARGET_SNPS.items():
        if rsid in found:
            result[rsid] = found[rsid]
        else:
            result[rsid] = {
                "gene": gene,
                "genotype": "--",
                "chrom": "--",
                "pos": "--",
            }
    return result


def get_snp_profile(patient_id: str) -> dict:
    """
    Tool entrypoint for the agent. Resolves a patient_id to its 23andMe
    file under data/genomes and returns the parsed profile.

    Falls back to whatever is stored in the SQLite memory if no file exists.
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
            return patient["snp_profile"]
    except Exception:
        pass

    return {
        rsid: {"gene": gene, "genotype": "--", "chrom": "--", "pos": "--"}
        for rsid, gene in TARGET_SNPS.items()
    }
