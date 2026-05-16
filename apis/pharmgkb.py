"""PharmGKB-style panel lookups — 64-SNP genotype-matched annotations."""

from __future__ import annotations

from typing import Any

from apis.pgx_panel import (
    PANEL_RSIDS,
    annotations_for_genes,
    annotations_for_profile,
    lookup_panel_annotation,
)

# Back-compat alias for tests / imports
PHARMGKB_STATIC = {rsid: {"rsid": rsid} for rsid in PANEL_RSIDS}


def lookup_pgx_annotation(rsid: str, genotype: str) -> dict | None:
    """Return panel annotation when patient genotype is clinically actionable."""
    return lookup_panel_annotation(rsid, genotype)


def get_pharmgkb(rsid: str) -> dict:
    meta = lookup_panel_annotation(rsid, "AG")  # placeholder; prefer lookup with real genotype
    if meta:
        return {k: v for k, v in meta.items() if k != "genotype"}
    return {
        "source": "PharmGKB",
        "rsid": rsid,
        "gene": "unknown",
        "drug": "unknown",
        "evidence_level": "unknown",
        "finding": "No annotation for this rsID in the GIRA panel.",
        "pmid": "",
    }


def fetch_pharmgkb(
    genes: list[str] | str | None = None,
    snp_profile: dict | None = None,
    **_kwargs: Any,
) -> list[dict]:
    """
    Return genotype-matched annotations from the 64-SNP panel.
    With snp_profile, returns every actionable variant (up to 64 rows).
  """
    if snp_profile:
        if genes:
            if isinstance(genes, str):
                genes = [genes]
            return annotations_for_genes(genes, snp_profile)
        return annotations_for_profile(snp_profile)
    if not genes:
        return []
    if isinstance(genes, str):
        genes = [genes]
    return annotations_for_genes(genes, snp_profile or {})
