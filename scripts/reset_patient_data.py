#!/usr/bin/env python3
"""
Wipe all patient-linked data so you can onboard from scratch.

Clears:
  - SQLite: patients, briefs, agent_briefs
  - data/uploads/* (uploaded genome copies)
  - data/genomes/* (demo + uploaded genome files)
  - data/whoop/* and data/glucose/* (synthetic wearable/CGM)

Keeps data/README.md and recreates empty dirs.

Usage:
    python scripts/reset_patient_data.py
    python scripts/reset_patient_data.py --yes   # non-interactive
"""

from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

DATA_DIRS = (
    ROOT / "data" / "uploads",
    ROOT / "data" / "genomes",
    ROOT / "data" / "whoop",
    ROOT / "data" / "glucose",
)


def _db_path() -> Path:
    raw = os.environ.get("MEMORY_DB_PATH", "memory.db")
    p = Path(raw)
    return p if p.is_absolute() else ROOT / p


def _clear_sqlite(db: Path) -> dict[str, int]:
    if not db.exists():
        return {}
    conn = sqlite3.connect(db)
    counts: dict[str, int] = {}
    for table in ("agent_briefs", "briefs", "patients"):
        try:
            counts[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        except sqlite3.OperationalError:
            counts[table] = 0
    conn.execute("DELETE FROM agent_briefs")
    conn.execute("DELETE FROM briefs")
    conn.execute("DELETE FROM patients")
    conn.execute("DELETE FROM sqlite_sequence WHERE name='briefs'")
    conn.commit()
    conn.close()
    return counts


def _clear_data_files() -> list[str]:
    removed: list[str] = []
    for directory in DATA_DIRS:
        directory.mkdir(parents=True, exist_ok=True)
        for path in directory.iterdir():
            if path.name == "README.md" and path.parent.name == "data":
                continue
            if path.is_file():
                path.unlink()
                removed.append(str(path.relative_to(ROOT)))
    return removed


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset all GlycoAgent patient data")
    parser.add_argument(
        "--yes", "-y", action="store_true", help="Skip confirmation prompt"
    )
    args = parser.parse_args()

    db = _db_path()
    if not args.yes:
        print("This will DELETE:")
        print(f"  - SQLite rows in {db} (patients, briefs, agent_briefs)")
        print("  - All files under data/uploads, genomes, whoop, glucose")
        confirm = input("Type RESET to continue: ").strip()
        if confirm != "RESET":
            print("Aborted.")
            return 1

    before = _clear_sqlite(db)
    files = _clear_data_files()

    print(f"Cleared database {db}:")
    for table, n in before.items():
        print(f"  {table}: removed {n} row(s)")
    print(f"Removed {len(files)} file(s) under data/")
    print("\nNext steps:")
    print("  1. Upload a new 23andMe raw file in the UI")
    print("  2. Add WHOOP + CGM JSON for that patient_id (see data/README.md)")
    print("  3. Update patient zip/meds in DB if needed, then Run Agent with refresh")
    return 0


if __name__ == "__main__":
    sys.exit(main())
