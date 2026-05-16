"""Shared NCBI E-utilities query parameters (PubMed, ClinVar, etc.)."""

from __future__ import annotations

import os


def ncbi_params(extra: dict | None = None) -> dict:
    """
    Build params for esearch / esummary / efetch.

    Set NCBI_EMAIL and NCBI_API_KEY in .env — the API key raises the rate
    limit from 3 to 10 requests/second per NCBI policy.
    """
    out: dict = {
        "email": os.getenv("NCBI_EMAIL", "glycoagent@example.com"),
        "tool": "glycoagent",
        **(extra or {}),
    }
    key = os.getenv("NCBI_API_KEY", "").strip()
    if key:
        out["api_key"] = key
    return out
