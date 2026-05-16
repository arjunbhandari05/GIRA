"""Load local WHOOP demo data and compute Round 2 wearable analytics."""

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WHOOP_DIR = ROOT / "data" / "whoop"

PATIENT_FILES = {
    "PT-001": "patient_a.json",
    "PT-002": "patient_b.json",
    "PT-003": "patient_c.json",
}

METRICS = ("hrv_ms", "rhr_bpm", "spo2_pct", "skin_temp_c", "recovery_score")


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _round(value: float) -> float:
    return round(value, 1)


def _wow_pct(series: list[float]) -> float:
    if len(series) < 14:
        return 0.0
    previous_7 = _mean(series[-14:-7])
    if previous_7 == 0:
        return 0.0
    last_7 = _mean(series[-7:])
    return _round(((last_7 - previous_7) / previous_7) * 100)


def _trend(wow_pct: float) -> str:
    if wow_pct < -5:
        return "declining"
    if wow_pct > 5:
        return "improving"
    return "stable"


def _metric_summary(series: list[float]) -> dict[str, float | str | None]:
    if not series:
        return {
            "avg_30d": None,
            "wow_pct": 0.0,
            "trend": "stable",
            "last_value": None,
        }

    window = series[-30:]
    wow = _wow_pct(window)
    return {
        "avg_30d": _round(_mean(window)),
        "wow_pct": wow,
        "trend": _trend(wow),
        "last_value": series[-1],
    }


def _whoop_candidate_paths(patient_id: str) -> list[Path]:
    """Match server.patient_files.whoop_path (slug) plus legacy demo names."""
    pid = patient_id.strip()
    slug = pid.lower().replace("-", "_")
    candidates = [
        WHOOP_DIR / f"{slug}.json",
        WHOOP_DIR / f"{pid.lower()}.json",
    ]
    legacy = PATIENT_FILES.get(pid)
    if legacy:
        candidates.append(WHOOP_DIR / legacy)
    seen: set[str] = set()
    out: list[Path] = []
    for path in candidates:
        key = str(path)
        if key not in seen:
            seen.add(key)
            out.append(path)
    return out


def _coerce_whoop_raw(raw: dict[str, Any]) -> dict[str, Any]:
    """Map bundled demo WHOOP JSON (summary + daily[]) into legacy metric series."""
    if any(isinstance(raw.get(metric), list) and raw.get(metric) for metric in METRICS):
        return raw

    daily = raw.get("daily")
    if not isinstance(daily, list) or not daily:
        return raw

    dates: list[str] = []
    series = {metric: [] for metric in METRICS}
    field_map = {
        "hrv_ms": "hrv_rmssd",
        "rhr_bpm": "resting_hr",
        "spo2_pct": "spo2",
        "skin_temp_c": "skin_temp_c",
        "recovery_score": "recovery_score",
    }

    for row in daily:
        if not isinstance(row, dict):
            continue
        dates.append(str(row.get("date") or ""))
        for metric, source_key in field_map.items():
            value = row.get(source_key)
            if value is None:
                continue
            try:
                series[metric].append(float(value))
            except (TypeError, ValueError):
                continue

    summary = raw.get("summary") if isinstance(raw.get("summary"), dict) else {}
    if summary and not series["hrv_ms"] and summary.get("avg_hrv_rmssd") is not None:
        avg = float(summary["avg_hrv_rmssd"])
        series["hrv_ms"] = [avg] * min(len(daily), 30)
    if summary and not series["rhr_bpm"] and summary.get("avg_resting_hr") is not None:
        avg = float(summary["avg_resting_hr"])
        series["rhr_bpm"] = [avg] * min(len(daily), 30)
    if summary and not series["recovery_score"] and summary.get("avg_recovery_score") is not None:
        avg = float(summary["avg_recovery_score"])
        series["recovery_score"] = [avg] * min(len(daily), 30)

    return {**raw, "dates": dates or raw.get("dates", []), **series}


def _load_whoop_file(patient_id: str) -> dict[str, Any]:
    for path in _whoop_candidate_paths(patient_id):
        if path.is_file():
            with path.open("r", encoding="utf-8") as handle:
                return _coerce_whoop_raw(json.load(handle))
    raise FileNotFoundError(_whoop_candidate_paths(patient_id)[0])


def _hypoglycemia_signal(raw_series: dict[str, list[float]]) -> bool:
    hrv = raw_series.get("hrv_ms", [])
    rhr = raw_series.get("rhr_bpm", [])
    if not hrv or not rhr:
        return False

    hrv_baseline = _mean(hrv[-30:])
    rhr_baseline = _mean(rhr[-30:])
    for hrv_value, rhr_value in zip(hrv, rhr):
        hrv_spike = hrv_baseline > 0 and hrv_value > hrv_baseline * 1.20
        rhr_spike = rhr_baseline > 0 and rhr_value > rhr_baseline * 1.10
        if hrv_spike and rhr_spike:
            return True
    return False


def load_whoop(patient_id: str) -> dict:
    """Tool-facing alias used by the agent's tool registry."""
    try:
        return get_whoop_analytics(patient_id)
    except FileNotFoundError as exc:
        return {"error": f"no whoop data for {patient_id}", "expected_path": str(exc)}


def get_whoop_analytics(patient_id: str) -> dict:
    raw = _load_whoop_file(patient_id)
    raw_series = {"dates": raw.get("dates", [])}

    for metric in METRICS:
        raw_series[metric] = [float(value) for value in raw.get(metric, [])]

    metrics = {
        metric: _metric_summary(raw_series[metric])
        for metric in METRICS
    }

    return {
        "patient_id": raw.get("patient_id", patient_id),
        "metrics": metrics,
        "hypoglycemia_signal": _hypoglycemia_signal(raw_series),
        "raw_series": raw_series,
    }
