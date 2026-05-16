"""
agent/tools.py

Python-side tool registry consumed by reasoning.nemotron.run_with_tools
and scripts/test_agent.py.

Each entry has:
  - name: tool identifier the LLM emits
  - description: surface area for the system prompt
  - parameters: schema hint shown to the model
  - fn: real Python callable invoked with the LLM's args dict

The mirrored JS file (agent/tools.js) carries the same names and
descriptions for the heartbeat / claw side of the codebase.
"""

from __future__ import annotations

from typing import Any, Callable

from apis.clinical_trials import fetch_trials
from apis.clinvar import fetch_clinvar
from apis.pharmgkb import fetch_pharmgkb
from apis.pubmed import fetch_pubmed
from apis.rxnorm import fetch_rxnorm
from output.brief_builder import assemble_brief
from parsers.glucose_client import load_glucose
from parsers.snp_parser import get_snp_profile
from parsers.whoop_client import load_whoop
from reasoning.safety_flags import check as check_safety_flags


ToolFn = Callable[..., Any]


def _wrap(fn: ToolFn) -> Callable[[dict], Any]:
    """
    Adapter: the agent passes a dict of args coming from the LLM. Some
    LLMs emit args under a wrong key, or pass a list where we want a
    single string. We unwrap kwargs but never crash.
    """

    def caller(args: Any = None) -> Any:
        if args is None:
            return fn()
        if isinstance(args, dict):
            return fn(**args)
        return fn(args)

    return caller


TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "get_snp_profile",
        "description": (
            "Extract the 10 pharmacogenomic rsIDs from a patient's 23andMe genome file. "
            "Always call this first."
        ),
        "parameters": {"patient_id": "string"},
        "fn": _wrap(get_snp_profile),
    },
    {
        "name": "fetch_whoop",
        "description": (
            "Get 30-day biometric data — HRV trend, RHR, recovery, SpO2. "
            "Call this to confirm whether medication is producing physiological improvement."
        ),
        "parameters": {"patient_id": "string"},
        "fn": _wrap(load_whoop),
    },
    {
        "name": "fetch_glucose",
        "description": (
            "Get 30-day continuous glucose monitor data — time in range, average glucose, "
            "GMI, glycemic variability CV, trend direction over 30 days, and hypoglycemic "
            "event count. Time in range below 70% for a T2D patient indicates poor glycemic "
            "control. Call alongside fetch_whoop to confirm whether current T2D medication "
            "is working."
        ),
        "parameters": {"patient_id": "string"},
        "fn": _wrap(load_glucose),
    },
    {
        "name": "fetch_pharmgkb",
        "description": (
            "Get drug-gene interaction evidence for a list of genes. Returns evidence "
            "level (1A-4), drug, effect, and PMID. Call after get_snp_profile to "
            "understand what each variant means clinically."
        ),
        "parameters": {"genes": "array of gene name strings"},
        "fn": _wrap(fetch_pharmgkb),
    },
    {
        "name": "fetch_clinvar",
        "description": (
            "Get clinical significance for rsIDs from live NCBI ClinVar (esearch+esummary). "
            "Returns variants plus _meta with API status — never invent pathogenicity."
        ),
        "parameters": {"rsids": "array of rsID strings"},
        "fn": _wrap(fetch_clinvar),
    },
    {
        "name": "fetch_pubmed",
        "description": (
            "Live PubMed search for a gene + drug pair (NCBI E-utilities). "
            "Returns articles with PMIDs, titles, and evidence_note. "
            "Use for citations; do not invent PMIDs."
        ),
        "parameters": {"gene": "string", "drug": "string"},
        "fn": _wrap(fetch_pubmed),
    },
    {
        "name": "fetch_rxnorm",
        "description": (
            "Check current medications for genotype-driven contraindications and "
            "pairwise drug interactions. Call before any recommendation that changes "
            "medications."
        ),
        "parameters": {"current_meds": "array", "snp_profile": "object"},
        "fn": _wrap(fetch_rxnorm),
    },
    {
        "name": "fetch_trials",
        "description": (
            "Live ClinicalTrials.gov search: recruiting type-2-diabetes studies, "
            "optionally near zip_code, filtered to studies mentioning the requested gene(s). "
            "Returns trials plus _meta (status ok|empty|error). Never fabricate NCT numbers."
        ),
        "parameters": {"gene": "string", "zip_code": "string"},
        "fn": _wrap(fetch_trials),
    },
    {
        "name": "check_safety_flags",
        "description": (
            "Mandatory safety check — SLCO1B1 TT statin myopathy, CYP2C19 AA "
            "clopidogrel poor metabolizer, VKORC1 AA warfarin hypersensitivity. "
            "MUST be called before generate_brief. Policy enforces this."
        ),
        "parameters": {"snp_profile": "object", "current_meds": "array"},
        "fn": _wrap(check_safety_flags),
    },
    {
        "name": "generate_brief",
        "description": (
            "Generate the final clinician brief. Only callable after check_safety_flags "
            "has been called. Returns action_required, safety_flags, snp_summary, "
            "recommendation, wearable_insight, glucose_insight, trial_matches, "
            "citations, patient_summary."
        ),
        "parameters": {"all_findings": "object"},
        "fn": _wrap(assemble_brief),
    },
]
