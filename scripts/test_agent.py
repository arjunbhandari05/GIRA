#!/usr/bin/env python3
"""
Verify that GIRA's agentic pipeline produces correct, evidence-cited
briefs for the three demo patients.

Usage:
    python3 scripts/test_agent.py             # all three patients
    python3 scripts/test_agent.py PT-002      # single patient
"""

import asyncio
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agent.memory import read  # noqa: E402
from agent.tools import TOOL_DEFINITIONS  # noqa: E402
from reasoning.nemotron import run_with_tools  # noqa: E402


EXPECTED = {
    "PT-001": {
        "should_flag": False,
        "should_recommend_switch": False,
        "expected_drug_continue": "metformin",
        "min_time_in_range": 54,
    },
    "PT-002": {
        "should_flag": False,
        "should_recommend_switch": True,
        "expected_discontinue": "metformin",
        "expected_start": "semaglutide",
        "max_time_in_range": 50,
        "must_cite_pmid": "38421109",
    },
    "PT-003": {
        "should_flag": True,
        "expected_flags": ["SLCO1B1", "CYP2C19"],
        "max_time_in_range": 50,
    },
}


def _flag_genes(brief: dict) -> list[str]:
    return [
        (f.get("gene") or "").upper()
        for f in (brief.get("safety_flags") or [])
    ]


def _cited_pmids(brief: dict) -> set[str]:
    return {
        str(c.get("pmid") or "")
        for c in (brief.get("citations") or [])
        if isinstance(c, dict)
    }


async def test_patient(patient_id: str) -> bool:
    print(f"\n{'=' * 60}\nTESTING {patient_id}\n{'=' * 60}")

    patient = read(patient_id)
    if not patient:
        print(f"ERROR: {patient_id} not found in memory.db — run scripts/seed_db.py first")
        return False

    brief = await run_with_tools(patient_id, patient, TOOL_DEFINITIONS)

    print("\nBRIEF OUTPUT:")
    print(json.dumps(brief, indent=2, default=str))

    expected = EXPECTED.get(patient_id, {})
    passed = True

    if expected.get("should_flag"):
        flag_genes = _flag_genes(brief)
        for expected_gene in expected.get("expected_flags", []):
            if expected_gene.upper() not in flag_genes:
                print(f"FAIL: expected safety flag {expected_gene} — missing")
                passed = False
            else:
                print(f"PASS: safety flag {expected_gene} detected")

    if expected.get("should_recommend_switch"):
        rec = brief.get("recommendation") or {}
        discontinue = str(rec.get("discontinue") or "").lower()
        start = str(rec.get("start") or "").lower()
        exp_disc = expected.get("expected_discontinue", "").lower()
        exp_start = expected.get("expected_start", "").lower()
        if exp_disc and exp_disc not in discontinue:
            print(
                f"FAIL: expected to discontinue '{exp_disc}', got '{discontinue or '(none)'}'"
            )
            passed = False
        else:
            print(f"PASS: correctly recommends discontinuing {exp_disc}")
        if exp_start and exp_start not in start:
            print(f"FAIL: expected to start '{exp_start}', got '{start or '(none)'}'")
            passed = False
        else:
            print(f"PASS: correctly recommends starting {exp_start}")

    if expected.get("must_cite_pmid"):
        pmids = _cited_pmids(brief)
        rec_pmids = [
            str(p)
            for p in ((brief.get("recommendation") or {}).get("supporting_pmids") or [])
        ]
        target = str(expected["must_cite_pmid"])
        if target not in pmids and target not in rec_pmids:
            print(
                f"FAIL: missing required PMID {target}; "
                f"citations={sorted(pmids)} recommendation={rec_pmids}"
            )
            passed = False
        else:
            print(f"PASS: evidence PMID {target} present")

    if expected.get("t2d_controlled"):
        glucose = brief.get("glucose_insight") or {}
        if not glucose.get("controlled"):
            print(
                f"FAIL: expected glucose to be controlled "
                f"(TIR={glucose.get('time_in_range_pct')}%) — T2D should not be flagged"
            )
            passed = False
        else:
            print(
                f"PASS: T2D correctly identified as controlled "
                f"(TIR={glucose.get('time_in_range_pct')}%)"
            )

    if "min_time_in_range" in expected:
        glucose = brief.get("glucose_insight") or {}
        tir = glucose.get("time_in_range_pct")
        if tir is None or tir < expected["min_time_in_range"]:
            print(
                f"FAIL: TIR {tir} below floor {expected['min_time_in_range']}"
            )
            passed = False
        else:
            print(f"PASS: TIR {tir}% >= {expected['min_time_in_range']}")

    if "max_time_in_range" in expected:
        glucose = brief.get("glucose_insight") or {}
        tir = glucose.get("time_in_range_pct")
        if tir is None or tir > expected["max_time_in_range"]:
            print(
                f"FAIL: TIR {tir} above ceiling {expected['max_time_in_range']}"
            )
            passed = False
        else:
            print(f"PASS: TIR {tir}% <= {expected['max_time_in_range']}")

    print(f"\n{'PASSED' if passed else 'FAILED'}: {patient_id}")
    return passed


async def main() -> None:
    patients = sys.argv[1:] or ["PT-001", "PT-002", "PT-003"]
    results: dict[str, bool] = {}
    for pid in patients:
        results[pid] = await test_patient(pid)

    print(f"\n{'=' * 60}\nSUMMARY\n{'=' * 60}")
    for pid, passed in results.items():
        print(f"  {pid}: {'PASS' if passed else 'FAIL'}")
    all_passed = all(results.values())
    print(f"\nOverall: {'ALL PASSED' if all_passed else 'SOME FAILED'}")
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    asyncio.run(main())
