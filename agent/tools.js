/**
 * agent/tools.js
 *
 * JS mirror of the GlycoAgent tool registry. The Python side
 * (agent/tools.py) holds the canonical TOOL_DEFINITIONS that
 * reasoning.nemotron.run_with_tools actually executes.
 *
 * This file exists so heartbeat.js and any future JS-only orchestrators
 * can introspect the tool surface without invoking Python. Each tool's
 * `fn` shells out to a Python module via a stdin JSON bridge.
 */

import { execSync } from 'child_process'
import 'dotenv/config'

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

function callPython(modulePath, fnName, args) {
  const moduleDot = modulePath.replace(/\//g, '.').replace(/\.py$/, '')
  const payload = JSON.stringify({ args: args || {} })
  const script = `
import sys, json
sys.path.insert(0, '.')
from ${moduleDot} import ${fnName}
payload = json.loads(sys.stdin.read())
args = payload.get('args') or {}
result = ${fnName}(**args) if isinstance(args, dict) else ${fnName}(args)
sys.stdout.write(json.dumps(result, default=str))
`
  const stdout = execSync(`${PYTHON} -c ${JSON.stringify(script)}`, {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return JSON.parse(stdout)
}

export const TOOL_DEFINITIONS = [
  {
    name: 'get_snp_profile',
    description:
      "Extract the 10 pharmacogenomic rsIDs from a patient's 23andMe genome file. Always call this first.",
    parameters: { patient_id: 'string' },
    fn: (p) => callPython('parsers/snp_parser', 'get_snp_profile', p),
  },
  {
    name: 'fetch_whoop',
    description:
      'Get 30-day biometric data — HRV trend, RHR, recovery, SpO2. Confirms whether medication is producing physiological improvement.',
    parameters: { patient_id: 'string' },
    fn: (p) => callPython('parsers/whoop_client', 'load_whoop', p),
  },
  {
    name: 'fetch_glucose',
    description:
      'Get 30-day CGM glucose data — time in range, avg glucose, GMI, trend direction, hypoglycemic events. Time in range below 70% = poor control. Call alongside fetch_whoop.',
    parameters: { patient_id: 'string' },
    fn: (p) => callPython('parsers/glucose_client', 'load_glucose', p),
  },
  {
    name: 'fetch_pharmgkb',
    description:
      'Get drug-gene interaction evidence for a list of genes. Returns evidence level 1A-4, drug, effect, mechanism. Call after get_snp_profile.',
    parameters: { genes: 'array of gene name strings' },
    fn: (p) => callPython('apis/pharmgkb', 'fetch_pharmgkb', p),
  },
  {
    name: 'fetch_clinvar',
    description:
      'Get clinical significance for a list of rsIDs — pathogenic, benign, risk factor, or VUS.',
    parameters: { rsids: 'array of rsID strings' },
    fn: (p) => callPython('apis/clinvar', 'fetch_clinvar', p),
  },
  {
    name: 'fetch_pubmed',
    description:
      'Get top abstracts and real PMIDs for a gene-drug pair. Call this for every claim you make. Never output a recommendation without a citation.',
    parameters: { gene: 'string', drug: 'string' },
    fn: (p) => callPython('apis/pubmed', 'fetch_pubmed', p),
  },
  {
    name: 'fetch_rxnorm',
    description:
      'Check current medications for genotype-driven contraindications. Call before any recommendation that changes medications.',
    parameters: { current_meds: 'array', snp_profile: 'object' },
    fn: (p) => callPython('apis/rxnorm', 'fetch_rxnorm', p),
  },
  {
    name: 'fetch_trials',
    description:
      'Find active recruiting trials matching a gene and zip code. Call if you find TCF7L2 TT, FTO AA, or APOE4.',
    parameters: { gene: 'string', zip_code: 'string' },
    fn: (p) => callPython('apis/clinical_trials', 'fetch_trials', p),
  },
  {
    name: 'check_safety_flags',
    description:
      'Mandatory safety check — SLCO1B1 TT statin myopathy, CYP2C19 AA clopidogrel, VKORC1 AA warfarin. MUST be called before generate_brief.',
    parameters: { snp_profile: 'object', current_meds: 'array' },
    fn: (p) => callPython('reasoning/safety_flags', 'check', p),
  },
  {
    name: 'generate_brief',
    description:
      'Generate the final clinician brief. Only callable after check_safety_flags. Returns action_required, safety_flags, snp_summary, recommendation, wearable_insight, glucose_insight, trial_matches, citations, patient_summary.',
    parameters: { all_findings: 'object' },
    fn: (p) => callPython('output/brief_builder', 'assemble_brief', p),
  },
]

export default TOOL_DEFINITIONS
