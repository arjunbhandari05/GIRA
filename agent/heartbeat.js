/**
 * agent/heartbeat.js
 *
 * Cron scheduler. Wakes nightly at 02:00, reads all patients from the
 * SQLite memory shared with the FastAPI server, and fires claw.run for
 * any patient whose appointment is today.
 *
 * Use `node agent/heartbeat.js --once` to run a single tick now.
 */

import { execFileSync, execSync } from 'child_process'
import cron from 'node-cron'
import 'dotenv/config'

import { run } from './claw.js'

const SCHEDULE = process.env.HEARTBEAT_CRON || '0 2 * * *'

function resolvePython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN
  for (const candidate of ['python3', 'python']) {
    try {
      execSync(`${candidate} -c "import sqlite3"`, { stdio: 'ignore' })
      return candidate
    } catch {
      /* try the next one */
    }
  }
  return 'python3'
}

const PYTHON = resolvePython()

function listPatientIds() {
  const script = `
import json, sys
sys.path.insert(0, '.')
import sqlite3, os
from pathlib import Path
ROOT = Path('.').resolve()
db = os.environ.get('MEMORY_DB_PATH', 'memory.db')
if not os.path.isabs(db):
    db = str(ROOT / db)
con = sqlite3.connect(db)
ids = [r[0] for r in con.execute('SELECT patient_id FROM patients ORDER BY patient_id')]
con.close()
sys.stdout.write(json.dumps(ids))
`
  const out = execFileSync(PYTHON, ['-c', script], { encoding: 'utf8' })
  return JSON.parse(out)
}

async function tick() {
  const ids = listPatientIds()
  for (const id of ids) {
    try {
      const result = await run(id)
      const tag = result?.skipped ? 'skipped' : 'brief delivered'
      console.log(`[heartbeat] ${id} -> ${tag}`)
    } catch (err) {
      console.error(`[heartbeat] ${id} FAILED:`, err?.message || err)
    }
  }
}

console.log(`[heartbeat] scheduled at "${SCHEDULE}"`)
cron.schedule(SCHEDULE, tick)

if (process.argv.includes('--once')) {
  tick()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[heartbeat] tick failed:', err)
      process.exit(1)
    })
}
