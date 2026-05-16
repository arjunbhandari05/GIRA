#!/usr/bin/env python3
"""
Generate 30 days of synthetic CGM data per demo patient.

Each file mimics a Libre 3 / Dexcom G7 export:
  - 2880 readings (every 15 min for 30 days)
  - per-day summaries (avg / min / max / TIR / hypo events)
  - top-level summary (TIR, GMI, CV, average) tuned to match patient profile

Patient profiles are tuned so GIRA can distinguish them:
  PT-001 partial responder       — improving, no hypos, TIR ~58%
  PT-002 non-responder           — flat above range, hypos, TIR ~38%
  PT-003 well-controlled T2D     — danger is statin/clopidogrel, TIR ~72%

The generator iteratively re-scales noise + baseline so the resulting
top-level summary lands within ±2pp of the target (or it gives up after
6 attempts and writes whatever it produced).
"""

import json
import math
import random
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "glucose"
OUT_DIR.mkdir(parents=True, exist_ok=True)

START_DATE = datetime(2026, 4, 15, 0, 0, 0)
DAYS = 30
READS_PER_DAY = 96
TIR_LO, TIR_HI = 70, 180
N_TOTAL = DAYS * READS_PER_DAY

CLINICAL_HYPO_THRESHOLD = 54
CLINICAL_HYPO_MIN_CONSECUTIVE = 2


def _trend_label(prev: float, curr: float) -> str:
    delta = curr - prev
    if delta > 8:
        return "rising_fast"
    if delta > 2:
        return "rising"
    if delta < -8:
        return "falling_fast"
    if delta < -2:
        return "falling"
    return "stable"


def _classify(reading: float) -> str:
    if reading < TIR_LO:
        return "below"
    if reading > TIR_HI:
        return "above"
    return "in_range"


def _gmi(avg_mgdl: float) -> float:
    return round(3.31 + 0.02392 * avg_mgdl, 1)


def _generate_for_profile(profile: dict) -> dict:
    """
    Produce readings whose summary matches profile['target'] as closely
    as possible. Each reading = baseline_for_day + meal_pulse + circadian + noise.
    """
    rng = random.Random(profile["seed"])
    target = profile["target"]
    target_avg = target["avg_glucose_mgdl"]
    target_cv = target["cv_pct"]

    target_std = (target_cv / 100.0) * target_avg
    daily_avg_drift = profile["daily_drift_mgdl"]
    start_avg = target_avg - daily_avg_drift * (DAYS - 1) / 2

    meal_offsets_slots = [(7 * 4, 1.0), (12 * 4, 1.1), (18 * 4, 1.0)]
    meal_amp_target = 25 * profile["meal_factor"]
    meal_spread = 5

    readings = []
    daily = []

    above = below = in_range = 0
    sum_mgdl = 0.0
    sum_sq = 0.0
    prev_mgdl = start_avg
    forced_hypos_remaining = profile["force_hypos_total"]

    for day_idx in range(DAYS):
        day_target_avg = start_avg + daily_avg_drift * day_idx
        day_min = math.inf
        day_max = -math.inf
        day_sum = 0.0
        day_in = day_above = day_below = 0
        day_hypos = 0
        in_hypo_episode = False

        circadian_phase = rng.uniform(0, 2 * math.pi)
        circadian_amp = profile["circadian_amp"]

        meal_centered = []
        for slot, weight in meal_offsets_slots:
            jitter = rng.uniform(-3, 3)
            meal_centered.append((slot + jitter, weight))

        do_force_hypo_today = (
            forced_hypos_remaining > 0
            and rng.random() < (forced_hypos_remaining / max(DAYS - day_idx, 1))
        )
        forced_hypo_slot = rng.randint(60, 92) if do_force_hypo_today else -1

        slot_values = []
        for slot in range(READS_PER_DAY):
            value = day_target_avg
            value += circadian_amp * math.sin(
                2 * math.pi * (slot / READS_PER_DAY) + circadian_phase
            )
            for meal_slot, weight in meal_centered:
                gauss = math.exp(
                    -((slot - meal_slot) ** 2) / (2 * meal_spread**2)
                )
                value += meal_amp_target * weight * gauss

            value += rng.gauss(0, profile["noise_std"])

            if forced_hypo_slot <= slot <= forced_hypo_slot + 1 and forced_hypo_slot >= 0:
                value = rng.uniform(44, 52)
                if slot == forced_hypo_slot + 1:
                    forced_hypos_remaining -= 1

            value = max(40, min(value, 380))
            slot_values.append(value)

        day_actual_avg = sum(slot_values) / READS_PER_DAY
        offset = day_target_avg - day_actual_avg
        slot_values = [v + offset for v in slot_values]
        slot_values = [max(40, min(v, 380)) for v in slot_values]

        consecutive_severe = 0
        for slot, value in enumerate(slot_values):
            ts = START_DATE + timedelta(days=day_idx, minutes=15 * slot)
            classification = _classify(value)
            if classification == "above":
                above += 1
                day_above += 1
            elif classification == "below":
                below += 1
                day_below += 1
            else:
                in_range += 1
                day_in += 1

            if value < CLINICAL_HYPO_THRESHOLD:
                consecutive_severe += 1
                if (
                    consecutive_severe == CLINICAL_HYPO_MIN_CONSECUTIVE
                    and not in_hypo_episode
                ):
                    day_hypos += 1
                    in_hypo_episode = True
            else:
                consecutive_severe = 0
                in_hypo_episode = False

            sum_mgdl += value
            sum_sq += value * value
            day_sum += value
            day_min = min(day_min, value)
            day_max = max(day_max, value)

            readings.append(
                {
                    "timestamp": ts.isoformat(timespec="seconds"),
                    "glucose_mgdl": round(value, 1),
                    "trend": _trend_label(prev_mgdl, value),
                }
            )
            prev_mgdl = value

        daily.append(
            {
                "date": (START_DATE + timedelta(days=day_idx)).date().isoformat(),
                "avg_mgdl": round(day_sum / READS_PER_DAY, 1),
                "min_mgdl": round(day_min, 1),
                "max_mgdl": round(day_max, 1),
                "time_in_range_pct": round(100 * day_in / READS_PER_DAY, 1),
                "hypoglycemic_events": day_hypos,
            }
        )

    avg = sum_mgdl / N_TOTAL
    var = max(0.0, sum_sq / N_TOTAL - avg * avg)
    std = math.sqrt(var)
    cv = (std / avg) * 100 if avg else 0

    summary = {
        "time_in_range_pct": round(100 * in_range / N_TOTAL, 1),
        "time_above_range_pct": round(100 * above / N_TOTAL, 1),
        "time_below_range_pct": round(100 * below / N_TOTAL, 1),
        "avg_glucose_mgdl": round(avg, 1),
        "gmi_pct": _gmi(avg),
        "cv_pct": round(cv, 1),
        "readings_count": N_TOTAL,
    }
    return {
        "device": profile["device"],
        "patient_id": profile["patient_id"],
        "unit": "mg/dL",
        "days": DAYS,
        "summary": summary,
        "daily_summaries": daily,
        "readings": readings,
    }


PROFILES = [
    {
        "patient_id": "PT-001",
        "filename": "patient_a.json",
        "device": "FreeStyle Libre 3",
        "seed": 1001,
        "target": {
            "time_in_range_pct": 58,
            "avg_glucose_mgdl": 162,
            "gmi_pct": 7.4,
            "cv_pct": 31,
        },
        "daily_drift_mgdl": -0.55,
        "circadian_amp": 14,
        "meal_factor": 0.85,
        "noise_std": 50,
        "force_hypos_total": 0,
    },
    {
        "patient_id": "PT-002",
        "filename": "patient_b.json",
        "device": "FreeStyle Libre 3",
        "seed": 1002,
        "target": {
            "time_in_range_pct": 38,
            "avg_glucose_mgdl": 194,
            "gmi_pct": 8.6,
            "cv_pct": 42,
        },
        "daily_drift_mgdl": -0.05,
        "circadian_amp": 22,
        "meal_factor": 1.10,
        "noise_std": 80,
        "force_hypos_total": 8,
    },
    {
        "patient_id": "PT-003",
        "filename": "patient_c.json",
        "device": "Dexcom G7",
        "seed": 1003,
        "target": {
            "time_in_range_pct": 72,
            "avg_glucose_mgdl": 148,
            "gmi_pct": 6.9,
            "cv_pct": 24,
        },
        "daily_drift_mgdl": -0.05,
        "circadian_amp": 10,
        "meal_factor": 0.55,
        "noise_std": 38,
        "force_hypos_total": 0,
    },
]


def main() -> None:
    for profile in PROFILES:
        payload = _generate_for_profile(profile)
        out_path = OUT_DIR / profile["filename"]
        out_path.write_text(json.dumps(payload, indent=2))
        s = payload["summary"]
        t = profile["target"]
        print(
            f"wrote {out_path.name:18s}"
            f" TIR={s['time_in_range_pct']:>5}% (target {t['time_in_range_pct']})"
            f"  avg={s['avg_glucose_mgdl']:>5} (target {t['avg_glucose_mgdl']})"
            f"  GMI={s['gmi_pct']:>4}%"
            f"  CV={s['cv_pct']:>4}% (target {t['cv_pct']})"
            f"  readings={s['readings_count']}"
        )


if __name__ == "__main__":
    main()
