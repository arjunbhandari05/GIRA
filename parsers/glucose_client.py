"""
parsers/glucose_client.py

Load 30-day CGM data for a patient and compute the analytics that downstream
reasoning relies on (time in range, GMI, CV, week-over-week trend, hypo count).

Synthetic mode reads from data/glucose/<patient>.json. Live mode raises
NotImplementedError because the LibreView OAuth dance isn't wired up yet.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
GLUCOSE_DIR = ROOT / "data" / "glucose"

PATIENT_FILES = {
    "PT-001": "patient_a.json",
    "PT-002": "patient_b.json",
    "PT-003": "patient_c.json",
}

TARGET_RANGE = (70, 180)


def _use_synthetic() -> bool:
    return os.getenv("USE_SYNTHETIC_GLUCOSE", "true").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _resolve_path(patient_id: str) -> Path:
    filename = PATIENT_FILES.get(patient_id)
    if not filename:
        filename = f"{patient_id.lower().replace('-', '_')}.json"
    return GLUCOSE_DIR / filename


def load_glucose(patient_id: str) -> dict[str, Any]:
    """
    Tool entry point. Returns the analytics dict the LLM will reason over.
    """
    if not _use_synthetic():
        return _fetch_libre_api(patient_id)

    path = _resolve_path(patient_id)
    if not path.exists():
        return {
            "error": f"no glucose data for {patient_id}",
            "expected_path": str(path),
            "controlled": False,
        }
    with path.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    return _parse(raw)


def _parse(raw: dict[str, Any]) -> dict[str, Any]:
    summary = raw.get("summary", {})
    daily = raw.get("daily_summaries", []) or []

    if len(daily) >= 14:
        first_week = daily[:7]
        last_week = daily[-7:]
        first_avg = sum(d["avg_mgdl"] for d in first_week) / len(first_week)
        last_avg = sum(d["avg_mgdl"] for d in last_week) / len(last_week)
        delta = last_avg - first_avg
        if delta < -5:
            trend_direction = "improving"
        elif delta > 5:
            trend_direction = "worsening"
        else:
            trend_direction = "flat"
        trend_delta_mgdl = round(delta, 1)
    else:
        trend_direction = "unknown"
        trend_delta_mgdl = 0.0

    hypo_events = sum(int(d.get("hypoglycemic_events", 0)) for d in daily)
    tir_pct = float(summary.get("time_in_range_pct") or 0)
    avg = summary.get("avg_glucose_mgdl")
    gmi = summary.get("gmi_pct")
    cv = summary.get("cv_pct")

    return {
        "source": raw.get("device", "CGM"),
        "patient_id": raw.get("patient_id"),
        "days": raw.get("days", len(daily)),
        "unit": raw.get("unit", "mg/dL"),
        "time_in_range_pct": tir_pct,
        "time_above_range_pct": summary.get("time_above_range_pct"),
        "time_below_range_pct": summary.get("time_below_range_pct"),
        "avg_glucose_mgdl": avg,
        "gmi_pct": gmi,
        "cv_pct": cv,
        "trend_direction": trend_direction,
        "trend_delta_mgdl": trend_delta_mgdl,
        "hypoglycemic_events": hypo_events,
        "controlled": tir_pct >= 70,
        "first_week_avg_mgdl": round(first_avg, 1) if len(daily) >= 14 else None,
        "last_week_avg_mgdl": round(last_avg, 1) if len(daily) >= 14 else None,
    }


def _fetch_libre_api(patient_id: str) -> dict[str, Any]:
    raise NotImplementedError(
        "Libre / LibreView OAuth not yet implemented — set "
        "USE_SYNTHETIC_GLUCOSE=true to use the bundled demo files"
    )


if __name__ == "__main__":
    import sys

    targets = sys.argv[1:] or list(PATIENT_FILES.keys())
    for pid in targets:
        result = load_glucose(pid)
        print(f"\n=== {pid} ===")
        print(json.dumps(result, indent=2, default=str))
