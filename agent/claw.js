/**
 * agent/claw.js
 *
 * OpenClaw agent loop:  think → act → reason → check → remember → deliver
 *
 * The agent itself does no clinical reasoning. It orchestrates tool calls,
 * hands the bundled evidence to Nemotron, then runs the deterministic
 * post-inference safety check before persisting + delivering the brief.
 *
 * Tools live behind the FastAPI server (server/main.py) — this file POSTs
 * to local endpoints so Python/JS stay loosely coupled.
 *
 * Owner: <unassigned>
 */

import axios from 'axios';
import 'dotenv/config';

import memory from './memory.js';
import policy from './policy.json' with { type: 'json' };

const API = process.env.API_BASE || 'http://localhost:8000';

function isAppointmentToday(patient) {
  if (!patient?.next_appointment_iso) return false;
  const target = new Date(patient.next_appointment_iso);
  const now = new Date();
  return target.toDateString() === now.toDateString();
}

/**
 * Run the full pipeline for one patient.
 */
export async function run(patientId) {
  const patient = await memory.read(patientId);
  if (!isAppointmentToday(patient)) {
    return { skipped: true, reason: 'no appointment today' };
  }

  // THINK + ACT — fan out all 7 tools in parallel.
  const [snp, whoop, clinvar, pharmgkb, pubmed, trials, rxnorm] = await Promise.all([
    tools.snp(patientId),
    tools.whoop(patientId),
    tools.clinvar(patient.snp_rsids),
    tools.pharmgkb(patient.snp_genes),
    tools.pubmed(patient.gene_drug_pairs),
    tools.trials(patient.zip, patient.snp_genes),
    tools.rxnorm(patient.meds),
  ]);

  // REASON — hand the evidence bundle to Nemotron.
  const nemotron = await tools.nemotron({
    snp, whoop, clinvar, pharmgkb, pubmed, trials, rxnorm,
    memory: patient.history,
    policy,
  });

  // CHECK — deterministic safety gates always run after the model.
  const checked = await tools.safetyCheck({ brief: nemotron, snp, rxnorm });

  // REMEMBER
  await memory.writeBrief(patientId, checked);
  await memory.updateBaseline(patientId, whoop);

  // DELIVER
  await tools.deliver(patientId, checked);

  return checked;
}

const tools = {
  snp:         (pid)             => axios.post(`${API}/tools/snp`,           { patient_id: pid }).then(r => r.data),
  whoop:       (pid)             => axios.post(`${API}/tools/whoop`,         { patient_id: pid }).then(r => r.data),
  clinvar:     (rsids)           => axios.post(`${API}/tools/clinvar`,       { rsids }).then(r => r.data),
  pharmgkb:    (genes)           => axios.post(`${API}/tools/pharmgkb`,      { genes }).then(r => r.data),
  pubmed:      (pairs)           => axios.post(`${API}/tools/pubmed`,        { pairs }).then(r => r.data),
  trials:      (zip, genes)      => axios.post(`${API}/tools/trials`,        { zip, genes }).then(r => r.data),
  rxnorm:      (meds)            => axios.post(`${API}/tools/rxnorm`,        { meds }).then(r => r.data),
  nemotron:    (ctx)             => axios.post(`${API}/tools/nemotron`,      ctx).then(r => r.data),
  safetyCheck: (payload)         => axios.post(`${API}/tools/safety_check`,  payload).then(r => r.data),
  deliver:     (pid, brief)      => axios.post(`${API}/deliver/${pid}`,      brief).then(r => r.data),
};

export default { run };
