#!/usr/bin/env bash
# Hack-a-Claw demo: PT-003 (SLCO1B1 statin + CYP2C19 clopidogrel + CPIC + citations).
# Usage: from repo root —  bash scripts/demo_hackathon.sh
# Requires: python venv + seed_db, optional NVIDIA_API_KEY or OPENROUTER_API_KEY for live Nemotron.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export AGENT_MODE="${AGENT_MODE:-llm}"
export PGX_SYNTHESIS="${PGX_SYNTHESIS:-1}"
export AGENT_LOG="${AGENT_LOG:-true}"

echo "AGENT_MODE=$AGENT_MODE PGX_SYNTHESIS=$PGX_SYNTHESIS"
echo "Running agent smoke test for PT-003..."
python3 scripts/test_agent.py PT-003
