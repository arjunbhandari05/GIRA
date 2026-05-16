/**
 * agent/heartbeat.js
 *
 * Cron scheduler. Wakes nightly at 02:00, reads all patients from memory,
 * and fires claw.run(patient_id) for any patient whose appointment is today.
 *
 * Owner: <unassigned>
 */

import cron from 'node-cron';
import 'dotenv/config';

import { run } from './claw.js';
import memory from './memory.js';

const SCHEDULE = process.env.HEARTBEAT_CRON || '0 2 * * *';

async function tick() {
  const db = memory.getDb();
  const rows = db.prepare('SELECT id FROM patients').all();
  for (const { id } of rows) {
    try {
      const result = await run(id);
      console.log(`[heartbeat] ${id} ->`, result?.skipped ? 'skipped' : 'brief delivered');
    } catch (err) {
      console.error(`[heartbeat] ${id} FAILED:`, err.message);
    }
  }
}

console.log(`[heartbeat] scheduled at "${SCHEDULE}"`);
cron.schedule(SCHEDULE, tick);

if (process.argv.includes('--once')) {
  tick().then(() => process.exit(0));
}
