/**
 * agent/memory.js
 *
 * Persistent SQLite-backed memory for GlycoAgent.
 *
 * Schema (created on first import):
 *
 *   patients(
 *     id TEXT PRIMARY KEY,            -- e.g. "PT-001"
 *     name TEXT,
 *     zip TEXT,
 *     meds_json TEXT,                 -- JSON array of current drugs
 *     snp_json TEXT,                  -- JSON dict of 10 rsIDs → genotype
 *     next_appointment_iso TEXT,
 *     created_at TEXT DEFAULT CURRENT_TIMESTAMP
 *   )
 *
 *   briefs(
 *     id INTEGER PRIMARY KEY AUTOINCREMENT,
 *     patient_id TEXT REFERENCES patients(id),
 *     generated_at TEXT,
 *     flagged INTEGER,                -- 0/1
 *     brief_json TEXT                 -- full output/brief_builder dict
 *   )
 *
 *   wearable_baseline(
 *     patient_id TEXT REFERENCES patients(id),
 *     metric TEXT,                    -- "hrv" | "rhr" | "spo2" | "sleep"
 *     rolling_mean REAL,
 *     rolling_std REAL,
 *     updated_at TEXT
 *   )
 *
 *   symptom_log(
 *     id INTEGER PRIMARY KEY AUTOINCREMENT,
 *     patient_id TEXT REFERENCES patients(id),
 *     ts TEXT,
 *     symptom TEXT,
 *     severity INTEGER                -- 1..5
 *   )
 *
 * Owner: <unassigned>
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import 'dotenv/config';

const DB_PATH = process.env.MEMORY_DB_PATH || path.resolve('./memory.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    ensureSchema(db);
  }
  return db;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT,
      zip TEXT,
      meds_json TEXT,
      snp_json TEXT,
      next_appointment_iso TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS briefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id TEXT REFERENCES patients(id),
      generated_at TEXT,
      flagged INTEGER,
      brief_json TEXT
    );

    CREATE TABLE IF NOT EXISTS wearable_baseline (
      patient_id TEXT,
      metric TEXT,
      rolling_mean REAL,
      rolling_std REAL,
      updated_at TEXT,
      PRIMARY KEY (patient_id, metric)
    );

    CREATE TABLE IF NOT EXISTS symptom_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id TEXT,
      ts TEXT,
      symptom TEXT,
      severity INTEGER
    );
  `);
}

export async function read(patientId) {
  // TODO: return { id, name, zip, meds, snp, next_appointment, history: [last N briefs] }
  throw new Error('TODO: memory.read');
}

export async function upsertPatient(patient) {
  // TODO: upsert into patients table
  throw new Error('TODO: memory.upsertPatient');
}

export async function writeBrief(patientId, brief) {
  // TODO: insert into briefs table; stringify brief
  throw new Error('TODO: memory.writeBrief');
}

export async function updateBaseline(patientId, whoop) {
  // TODO: roll baselines forward for hrv/rhr/spo2/sleep
  throw new Error('TODO: memory.updateBaseline');
}

export async function appendSymptom(patientId, symptom, severity) {
  // TODO: insert row into symptom_log
  throw new Error('TODO: memory.appendSymptom');
}

export default { getDb, read, upsertPatient, writeBrief, updateBaseline, appendSymptom };
