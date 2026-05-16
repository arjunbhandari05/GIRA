"""
scripts/build_whoop_data.py

Generate synthetic 30-day WHOOP time series for the 3 demo patients.

Patient A — HRV trending UP (34 → 42 ms), RHR declining (72 → 67)
Patient B — HRV flat (~31 ms), RHR stuck (~75)
Patient C — HRV stable (~38 ms), RHR ~68, SpO2 dips < 94% on 7 nights

Output: data/whoop/patient_a.json | patient_b.json | patient_c.json

Owner: <unassigned>
"""

from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path


OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "whoop"
N_DAYS = 30


def _trend(start: float, end: float, jitter: float, n: int = N_DAYS) -> list[float]:
    """Linear-ish trajectory + Gaussian noise."""
    step = (end - start) / (n - 1)
    return [round(start + step * i + random.gauss(0, jitter), 1) for i in range(n)]


def _flat(mean: float, jitter: float, n: int = N_DAYS) -> list[float]:
    return [round(mean + random.gauss(0, jitter), 1) for _ in range(n)]


def _spo2_with_dips(n_dips: int, n: int = N_DAYS) -> list[float]:
    series = _flat(96.5, 0.4, n)
    dip_idxs = random.sample(range(n), n_dips)
    for i in dip_idxs:
        series[i] = round(random.uniform(91.5, 93.8), 1)
    return series


def _dates(n: int = N_DAYS) -> list[str]:
    today = date.today()
    return [(today - timedelta(days=n - 1 - i)).isoformat() for i in range(n)]


def _trend_label(series: list[float]) -> str:
    delta = series[-1] - series[0]
    if delta >= 2:
        return "up"
    if delta <= -2:
        return "down"
    return "flat"


def patient_a() -> dict:
    random.seed(1)
    hrv  = _trend(34, 42, 1.2)
    rhr  = _trend(72, 67, 0.8)
    spo2 = _flat(96.8, 0.3)
    sleep = _flat(7.2, 0.5)
    return _bundle("PT-001", hrv, rhr, spo2, sleep)


def patient_b() -> dict:
    random.seed(2)
    hrv  = _flat(31, 1.0)
    rhr  = _flat(75, 0.8)
    spo2 = _flat(96.7, 0.3)
    sleep = _flat(6.4, 0.7)
    return _bundle("PT-002", hrv, rhr, spo2, sleep)


def patient_c() -> dict:
    random.seed(3)
    hrv  = _flat(38, 1.1)
    rhr  = _flat(68, 0.7)
    spo2 = _spo2_with_dips(n_dips=7)
    sleep = _flat(6.8, 0.6)
    return _bundle("PT-003", hrv, rhr, spo2, sleep)


def _bundle(pid: str, hrv, rhr, spo2, sleep) -> dict:
    return {
        "patient_id": pid,
        "window_days": N_DAYS,
        "dates": _dates(),
        "hrv_ms": hrv,
        "rhr_bpm": rhr,
        "spo2_pct": spo2,
        "sleep_hr": sleep,
        "trend": {
            "hrv": _trend_label(hrv),
            "rhr": _trend_label(rhr),
            "spo2_dips_below_94": sum(1 for v in spo2 if v < 94.0),
        },
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for fname, bundle in (
        ("patient_a.json", patient_a()),
        ("patient_b.json", patient_b()),
        ("patient_c.json", patient_c()),
    ):
        path = OUT_DIR / fname
        path.write_text(json.dumps(bundle, indent=2))
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
