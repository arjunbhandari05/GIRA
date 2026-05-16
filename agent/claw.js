/**
 * agent/claw.js
 *
 * OpenClaw agentic loop. Hands off to the Python tool-calling driver in
 * reasoning.nemotron.run_with_tools — which is where the real reasoning
 * lives — then persists the brief and prints it for terminal verification.
 *
 * Tools are defined twice on purpose:
 *   - agent/tools.py (Python, canonical, real fn callbacks)
 *   - agent/tools.js (JS mirror, descriptive only)
 *
 * The JS side is for surface-area introspection. Execution is Python.
 */

import { execFileSync, execSync } from 'child_process'
import 'dotenv/config'

const FORCE_RUN = process.env.FORCE_RUN === 'true'

function resolvePython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN
  for (const candidate of ['python3', 'python']) {
    try {
      execSync(`${candidate} -c "import dotenv, aiohttp, requests"`, {
        stdio: 'ignore',
      })
      return candidate
    } catch {
      /* try the next one */
    }
  }
  return 'python3'
}

const PYTHON = resolvePython()

function isAppointmentToday(patient) {
  if (!patient?.appointment_date) return false
  const today = new Date().toISOString().split('T')[0]
  return patient.appointment_date === today
}

function pythonReadPatient(patientId) {
  const script = `
import json, sys
sys.path.insert(0, '.')
from agent.memory import read
patient = read(${JSON.stringify(patientId)})
sys.stdout.write(json.dumps(patient, default=str))
`
  const out = execFileSync(PYTHON, ['-c', script], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  return JSON.parse(out)
}

function pythonRunAgent(patientId) {
  const script = `
import asyncio, json, sys
sys.path.insert(0, '.')
from agent.memory import read, write_brief
from agent.tools import TOOL_DEFINITIONS
from reasoning.nemotron import run_with_tools

patient = read(${JSON.stringify(patientId)})
if not patient:
    sys.stdout.write(json.dumps({"error": "patient not found"}))
    raise SystemExit(0)

brief = asyncio.run(run_with_tools(${JSON.stringify(patientId)}, patient, TOOL_DEFINITIONS))
write_brief(${JSON.stringify(patientId)}, brief)
sys.stdout.write(json.dumps(brief, default=str))
`
  const out = execFileSync(PYTHON, ['-c', script], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return JSON.parse(out)
}

export async function run(patientId) {
  const patient = pythonReadPatient(patientId)
  if (!patient) {
    console.error(`[claw] patient ${patientId} not found`)
    return null
  }

  if (!FORCE_RUN && !isAppointmentToday(patient)) {
    console.log(
      `[claw] no appointment today for ${patientId} (next: ${patient.appointment_date || 'unset'}) — skipping`
    )
    return { skipped: true, reason: 'no appointment today' }
  }

  console.log(`\n[claw] ── starting agentic run for ${patientId} ──`)
  const start = Date.now()
  const brief = pythonRunAgent(patientId)
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  const flagCount = brief?.safety_flags?.length ?? 0
  console.log(`[claw] ── complete in ${elapsed}s — ${flagCount} safety flags ──\n`)
  console.log(JSON.stringify(brief, null, 2))
  return brief
}

export default { run }

const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('agent/claw.js')

if (isDirectInvocation) {
  const target = process.argv[2]
  if (!target) {
    console.error('usage: node agent/claw.js <PT-XXX>')
    process.exit(1)
  }
  run(target).catch((err) => {
    console.error('[claw] failed:', err)
    process.exit(1)
  })
}
