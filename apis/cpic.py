"""Live CPIC clinical recommendations via api.cpicpgx.org (PostgREST, no API key)."""

from __future__ import annotations

from typing import Any

import requests

CPIC_BASE = "https://api.cpicpgx.org/v1"
TIMEOUT = 25

# Genotype → CPIC phenotype labels (subset used in T2D / CV polypharmacy)
CYP2C19_PHENOTYPE: dict[str, str] = {
    "AA": "Poor Metabolizer",
    "AG": "Intermediate Metabolizer",
    "GA": "Intermediate Metabolizer",
    "GG": "Normal Metabolizer",
}

CYP2C9_WARFARIN_PHENOTYPE: dict[str, str] = {
    "AA": "Normal Metabolizer",
    "AC": "Intermediate Metabolizer",
    "CA": "Intermediate Metabolizer",
    "CC": "Poor Metabolizer",
}

VKORC1_WARFARIN_SENSITIVITY: dict[str, str] = {
    "AA": "Increased sensitivity",
    "AG": "Intermediate sensitivity",
    "GA": "Intermediate sensitivity",
    "GG": "Normal sensitivity",
}

SLCO1B1_STATIN_PHENOTYPE: dict[str, str] = {
    "TT": "Increased function (normal myopathy risk)",
    "TC": "Decreased function",
    "CT": "Decreased function",
    "CC": "Decreased function (high myopathy risk)",
}

GENE_PHENOTYPE_FROM_GENOTYPE: dict[str, dict[str, str]] = {
    "CYP2C19": CYP2C19_PHENOTYPE,
    "CYP2C9": CYP2C9_WARFARIN_PHENOTYPE,
    "VKORC1": VKORC1_WARFARIN_SENSITIVITY,
    "SLCO1B1": SLCO1B1_STATIN_PHENOTYPE,
}

# Patient med token → (gene, drug name for CPIC recommendation_view)
MED_CPIC_PAIRS: list[tuple[str, str, str]] = [
    ("clopidogrel", "CYP2C19", "clopidogrel"),
    ("warfarin", "VKORC1", "warfarin"),
    ("simvastatin", "SLCO1B1", "simvastatin"),
    ("atorvastatin", "SLCO1B1", "atorvastatin"),
    ("pravastatin", "SLCO1B1", "pravastatin"),
    ("rosuvastatin", "SLCO1B1", "rosuvastatin"),
    ("lovastatin", "SLCO1B1", "simvastatin"),
]


def _normalize_genotype(genotype: str) -> str:
    return (genotype or "").upper().replace(" ", "")


def infer_phenotype(gene: str, genotype: str) -> str | None:
    table = GENE_PHENOTYPE_FROM_GENOTYPE.get(gene.upper())
    if not table:
        return None
    return table.get(_normalize_genotype(genotype))


def _get_json(path: str, params: dict | None = None) -> list | dict:
    url = f"{CPIC_BASE}{path}"
    resp = requests.get(url, params=params or {}, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def _cpic_recommendations_for_drug(drug_name: str, gene: str, phenotype: str | None) -> list[dict]:
    drug_rows = _get_json("/drug", params={"name": f"eq.{drug_name.lower()}"})
    if not drug_rows:
        return []

    drugid = drug_rows[0].get("drugid")
    if not drugid:
        return []

    pairs = _get_json(
        "/pair",
        params={
            "genesymbol": f"eq.{gene}",
            "drugid": f"eq.{drugid}",
            "usedforrecommendation": "eq.true",
        },
    )
    if not pairs:
        return []

    recs = _get_json(
        "/recommendation_view",
        params={"drugname": f"eq.{drug_name.lower()}", "limit": "40"},
    )
    if not isinstance(recs, list):
        return []

    gene_key = gene.upper()
    matched: list[dict] = []
    for row in recs:
        lookup = row.get("lookupkey") or {}
        phenos = row.get("phenotypes") or {}
        label = str(lookup.get(gene_key) or phenos.get(gene_key) or "")
        if phenotype and phenotype.lower() not in label.lower():
            continue
        if row.get("classification") == "No Recommendation":
            continue
        matched.append(
            {
                "source": "CPIC",
                "gene": gene,
                "drug": drug_name,
                "phenotype": label or phenotype,
                "cpic_classification": row.get("classification"),
                "recommendation": row.get("drugrecommendation"),
                "implications": row.get("implications"),
                "guideline": row.get("guidelinename"),
                "guideline_url": row.get("guidelineurl"),
                "population": row.get("population"),
            }
        )

    if not matched and phenotype:
        for row in recs:
            lookup = row.get("lookupkey") or {}
            if gene_key not in lookup:
                continue
            if row.get("classification") == "No Recommendation":
                continue
            matched.append(
                {
                    "source": "CPIC",
                    "gene": gene,
                    "drug": drug_name,
                    "phenotype": str(lookup.get(gene_key)),
                    "cpic_classification": row.get("classification"),
                    "recommendation": row.get("drugrecommendation"),
                    "implications": row.get("implications"),
                    "guideline": row.get("guidelinename"),
                    "guideline_url": row.get("guidelineurl"),
                    "population": row.get("population"),
                }
            )

    if matched:
        strong = [r for r in matched if r.get("cpic_classification") == "Strong"]
        return (strong or matched)[:1]
    return []


def fetch_cpic(
    current_meds: list | None = None,
    snp_profile: dict | None = None,
    gene: str | None = None,
    drug: str | None = None,
    **_kwargs: Any,
) -> dict[str, Any]:
    """
    Return live CPIC recommendations for gene–drug pairs tied to the patient's
    medications and genotypes.
    """
    meta: dict[str, Any] = {"source": "cpic_api", "status": "ok", "detail": None}
    profile = snp_profile or {}
    recommendations: list[dict] = []
    errors: list[str] = []

    def _gene_genotype(gene_symbol: str) -> str:
        for rsid, snp in profile.items():
            if not isinstance(snp, dict):
                continue
            if (snp.get("gene") or "").upper() == gene_symbol.upper():
                return snp.get("genotype") or ""
        return ""

    targets: list[tuple[str, str]] = []
    if gene and drug:
        targets.append((gene, drug))
    else:
        meds = [str(m).lower() for m in (current_meds or [])]
        for token, gene_symbol, drug_name in MED_CPIC_PAIRS:
            if any(token in m for m in meds):
                targets.append((gene_symbol, drug_name))

    if not targets:
        return {
            "recommendations": [],
            "_meta": {
                **meta,
                "status": "empty",
                "detail": "No CPIC gene–drug pairs matched current medications.",
            },
        }

    seen: set[str] = set()
    for gene_symbol, drug_name in targets:
        key = f"{gene_symbol}:{drug_name}"
        if key in seen:
            continue
        seen.add(key)
        genotype = _gene_genotype(gene_symbol)
        phenotype = infer_phenotype(gene_symbol, genotype)
        try:
            rows = _cpic_recommendations_for_drug(drug_name, gene_symbol, phenotype)
            for row in rows:
                row["patient_genotype"] = genotype
                row["inferred_phenotype"] = phenotype
            recommendations.extend(rows)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{gene_symbol}+{drug_name}:{exc}")

    if errors:
        meta["status"] = "partial" if recommendations else "error"
        meta["detail"] = "; ".join(errors)[:600]
    if not recommendations:
        meta["status"] = meta.get("status") or "empty"
        meta["detail"] = meta.get("detail") or "No CPIC recommendations matched phenotypes."

    return {"recommendations": recommendations, "_meta": meta}
