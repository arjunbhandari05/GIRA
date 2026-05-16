import type {
  AgentBrief,
  BackendPatient,
  LogLine,
  MetricTrend,
  Patient,
  PatientStatus,
  SafetyFlag,
  SNPStatus,
  TraceStep,
  UiRecommendation,
} from "./types"

const DEMO_DISPLAY: Record<string, Partial<Patient>> = {
  "PT-001": { appointment: "Tomorrow 9:15am" },
  "PT-002": { appointment: "Tomorrow 10:30am" },
  "PT-003": { appointment: "Tomorrow 2:00pm" },
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "??"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function formatAppointment(iso?: string, patientId?: string): string {
  if (patientId && DEMO_DISPLAY[patientId]?.appointment) {
    return DEMO_DISPLAY[patientId].appointment!
  }
  if (!iso) return "Not scheduled"
  try {
    const d = new Date(iso)
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const isTomorrow =
      d.getDate() === tomorrow.getDate() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getFullYear() === tomorrow.getFullYear()
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    if (isTomorrow) return `Tomorrow ${time}`
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  } catch {
    return iso
  }
}

export function statusFromSafety(flags: SafetyFlag[]): {
  status: PatientStatus
  statusText: string
  badgeText: string
} {
  const critical = flags.filter((f) => (f.severity || "").toUpperCase() === "CRITICAL")
  const warning = flags.filter((f) => (f.severity || "").toUpperCase() === "WARNING")

  if (critical.length > 0) {
    return {
      status: "flag",
      statusText: "Action required",
      badgeText: "Alert",
    }
  }
  if (warning.length > 0) {
    return {
      status: "review",
      statusText: "Review recommended",
      badgeText: "Review",
    }
  }
  return {
    status: "ready",
    statusText: "No alerts",
    badgeText: "Ready",
  }
}

export function avatarColorForStatus(status: PatientStatus): string {
  switch (status) {
    case "flag":
      return "bg-[#C0392B]"
    case "review":
      return "bg-[#B45309]"
    default:
      return "bg-[#1A9E6E]"
  }
}

export async function mapBackendPatient(
  row: BackendPatient,
  safetyFlags?: SafetyFlag[]
): Promise<Patient> {
  const id = row.patient_id
  const name = row.name?.trim() || "Uploaded patient"
  const flags = safetyFlags ?? []
  const { status, statusText, badgeText } = statusFromSafety(flags)

  return {
    id,
    name,
    initials: initialsFromName(name),
    avatarColor: avatarColorForStatus(status),
    status,
    statusText,
    badgeText,
    appointment: formatAppointment(row.next_appointment_iso, id),
  }
}

export function snpStatusFromFlags(rsid: string, flags: SafetyFlag[]): SNPStatus {
  const hit = flags.find((f) => f.rsid === rsid)
  if (!hit) return "ok"
  return (hit.severity || "").toUpperCase() === "CRITICAL" ? "flag" : "warn"
}

export function wearableTrendToUi(trend?: string): MetricTrend {
  if (trend === "improving") return "up"
  if (trend === "declining") return "down"
  return "stable"
}

const TOOL_LABELS: Record<string, string> = {
  get_snp_profile: "Pharmacogenomic SNP profile",
  get_patient_intake: "Clinician intake & medications",
  fetch_pharmgkb: "PharmGKB drug–gene evidence",
  fetch_clinvar: "ClinVar variant lookup",
  fetch_pubmed: "PubMed literature search",
  fetch_trials: "Clinical trial scout",
  fetch_rxnorm: "RxNorm drug interactions",
  fetch_whoop: "WHOOP wearable analytics",
  fetch_glucose: "CGM glucose trends",
  check_safety_flags: "PGx safety gate review",
  generate_brief: "Assembling clinician brief",
}

/** Console display: tool_id → human label */
export const TOOL_CONSOLE_LABELS: Record<string, string> = {
  fetch_whoop: "WHOOP biometric analytics",
  fetch_pubmed: "PubMed literature search",
  fetch_clinvar: "ClinVar variant classification",
  fetch_trials: "ClinicalTrials.gov search",
  get_snp_profile: "Genomic SNP extraction",
  check_safety_flags: "Safety flag evaluation",
  generate_brief: "Brief synthesis",
  fetch_glucose: "CGM glucose trends",
  get_patient_intake: "Patient intake load",
  fetch_pharmgkb: "PharmGKB evidence",
  fetch_rxnorm: "RxNorm interactions",
}

export function toolConsoleLabel(tool: string): string {
  const human = TOOL_CONSOLE_LABELS[tool] || tool.replace(/_/g, " ")
  return `${tool} → ${human}`
}

function formatElapsedSeconds(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(1)
  if (m > 0) return `${String(m).padStart(2, "0")}:${s.padStart(4, "0")}`
  return `00:${s.padStart(4, "0")}`
}

function logTypeFromStep(step: TraceStep): LogLine["type"] {
  if (step.result_summary?.error || step.status === "error") return "error"
  if (step.partial || step.status === "partial") return "warning"
  if (step.tool === "fetch_pubmed") {
    const hits = Number(step.result_summary?.hits ?? 0)
    const status = step.result_summary?.pubmed_status as string | undefined
    if (hits === 0 || status === "empty") return "warning"
  }
  if (step.tool === "generate_brief") return "success"
  if (step.tool === "check_safety_flags") {
    const flags = (step.result_summary?.flags as { severity?: string }[]) || []
    if (flags.some((f) => (f.severity || "").toUpperCase() === "CRITICAL")) return "warning"
  }
  return "info"
}

function summarizeTraceResult(step: TraceStep): string {
  const s = step.result_summary
  if (!s) return ""
  if (s.error) return String(s.error)

  switch (step.tool) {
    case "get_snp_profile": {
      const n = Number(s.snp_count ?? 0)
      const genos = (s.genotypes as string[] | undefined) || []
      return genos.length ? `${n} SNPs · ${genos.slice(0, 4).join(", ")}` : `${n} SNPs loaded`
    }
    case "get_patient_intake": {
      const meds = Number(s.med_count ?? 0)
      return s.has_intake ? `${meds} medication(s) on chart` : "No clinical intake on file"
    }
    case "fetch_glucose": {
      const parts: string[] = []
      if (s.tir_pct != null) parts.push(`TIR ${s.tir_pct}%`)
      if (s.avg_mgdl != null) parts.push(`avg ${s.avg_mgdl} mg/dL`)
      if (s.trend) parts.push(String(s.trend))
      return parts.length ? parts.join(" · ") : "CGM data loaded"
    }
    case "fetch_whoop": {
      const parts: string[] = []
      if (s.hrv_avg != null) parts.push(`HRV ${s.hrv_avg} ms`)
      if (s.hrv_trend) parts.push(String(s.hrv_trend))
      if (s.hypoglycemia_signal) parts.push("hypoglycemia signal")
      return parts.length ? parts.join(" · ") : "Wearable metrics loaded"
    }
    case "fetch_pharmgkb":
      return `${s.hits ?? 0} PharmGKB hit(s)${s.genes ? ` · ${(s.genes as string[]).slice(0, 4).join(", ")}` : ""}`
    case "fetch_clinvar": {
      const hits = Number(s.hits ?? 0)
      const sig = (s.significance as string[] | undefined) || []
      return sig.length ? `${hits} variant(s) · ${sig.slice(0, 3).join("; ")}` : `${hits} ClinVar hit(s)`
    }
    case "fetch_pubmed": {
      const hits = Number(s.hits ?? 0)
      const pmids = (s.pmids as (string | number)[] | undefined) || []
      const gene = step.args_summary?.gene as string | undefined
      const drug = step.args_summary?.drug as string | undefined
      const pair = gene && drug ? `${gene} + ${drug}` : "query"
      if (hits === 0 || (s.pubmed_status as string) === "empty") {
        return `${pair}: no articles found`
      }
      const first = pmids[0]
      return first
        ? `${pair}: ${hits} article(s) · PMID ${first}${pmids.length > 1 ? ` +${pmids.length - 1}` : ""}`
        : `${pair}: ${hits} article(s)`
    }
    case "fetch_trials": {
      const n = Number(s.matches ?? s.hits ?? 0)
      const ncts = (s.ncts as string[] | undefined) || []
      const gene = step.args_summary?.gene as string | undefined
      const prefix = gene ? `${gene}: ` : ""
      const tail = ncts.length ? `${n} trial(s) · ${ncts.slice(0, 3).join(", ")}` : `${n} trial match(es)`
      return `${prefix}${tail}`
    }
    case "fetch_rxnorm": {
      const drugs = (s.drugs as string[] | undefined) || []
      return `${s.interactions ?? 0} interaction(s)${drugs.length ? ` · ${drugs.slice(0, 4).join(", ")}` : ""}`
    }
    case "check_safety_flags": {
      const flags = (s.flags as { gene?: string; severity?: string }[]) || []
      if (!flags.length) return "No PGx safety flags"
      const crit = flags.filter((f) => (f.severity || "").toUpperCase() === "CRITICAL").length
      const warn = flags.length - crit
      const genes = flags.map((f) => f.gene).filter(Boolean).slice(0, 4)
      const tail = genes.length ? ` (${genes.join(", ")})` : ""
      if (crit && warn) return `${crit} critical, ${warn} warning${tail}`
      if (crit) return `${crit} critical flag(s)${tail}`
      return `${warn || flags.length} warning(s)${tail}`
    }
    case "generate_brief": {
      const parts: string[] = []
      if (s.discontinue) parts.push(`discontinue ${s.discontinue}`)
      if (s.start) parts.push(`start ${s.start}`)
      if (s.citations != null) parts.push(`${s.citations} citation(s)`)
      return parts.length ? parts.join(" · ") : "Brief assembled"
    }
    default:
      if (s.count != null) return `${s.count} result(s)`
      if (s.hits != null) return `${s.hits} hit(s)`
      return ""
  }
}

/** Human-readable one-liner for a GIRA pipeline tool step (terminal + tool trace). */
export function formatTraceStep(step: TraceStep): string {
  if (step.agent_wide_fallback && typeof step.detail === "string") {
    return step.detail
  }

  if (
    step.tool === "generate_brief" &&
    (step.partial || step.status === "partial") &&
    (step.result_summary as { status?: string } | undefined)?.status === "assembling"
  ) {
    return "Assembling clinician brief with GIRA…"
  }

  const label = TOOL_LABELS[step.tool] || step.tool.replace(/_/g, " ")
  const detail = summarizeTraceResult(step)
  const prefix = step.auto_invoked ? `${label} (auto)` : label

  if (step.data_source === "mock" && detail) {
    return `${prefix} — ${detail} · demo data`
  }
  if (step.data_source === "cache" && detail) {
    return `${prefix} — ${detail} · cached`
  }
  return detail ? `${prefix} — ${detail}` : `${prefix}…`
}

export function traceStepToLogLine(step: TraceStep, elapsedSec: number): LogLine {
  const detail = summarizeTraceResult(step)
  const label = step.agent_wide_fallback ? undefined : toolConsoleLabel(step.tool)
  const text =
    step.agent_wide_fallback && typeof step.detail === "string"
      ? step.detail
      : detail || (step.partial ? "…" : "complete")
  return {
    timestamp: formatElapsedSeconds(elapsedSec),
    toolLabel: label,
    text,
    type: logTypeFromStep(step),
  }
}

export function traceToLogLines(trace: TraceStep[], startMs?: number): LogLine[] {
  const t0 = startMs ?? Date.now()
  const lines: LogLine[] = [
    { timestamp: "00:00.0", text: "Starting GIRA brief pipeline…", type: "info" },
  ]
  trace.forEach((step) => {
    const elapsed = (Date.now() - t0) / 1000
    lines.push(traceStepToLogLine(step, elapsed))
  })
  if (trace.length > 0) {
    const elapsed = (Date.now() - t0) / 1000
    lines.push({
      timestamp: formatElapsedSeconds(elapsed),
      text: "Brief ready for review",
      type: "success",
    })
  }
  return lines
}

export function briefToRecommendations(brief: AgentBrief): UiRecommendation[] {
  const rec = brief.recommendation
  const out: UiRecommendation[] = []
  if (!rec) return out

  if (rec.discontinue) {
    out.push({
      title: `Discontinue ${rec.discontinue}`,
      type: "discontinue",
      body:
        rec.start
          ? `Consider switching to ${rec.start}.`
          : (rec.rationale?.[0] ?? "Medication change indicated by PGx + clinical data."),
    })
  }
  if (rec.start && !rec.discontinue) {
    out.push({
      title: `Start ${rec.start}`,
      type: "start",
      body: rec.rationale?.[0] ?? "Recommended based on genetic and glucose profile.",
    })
  } else if (rec.start && rec.discontinue) {
    out.push({
      title: `Start ${rec.start}`,
      type: "start",
      body: rec.rationale?.find((r) => r.toLowerCase().includes(rec.start!.toLowerCase())) ?? rec.rationale?.[1] ?? "",
    })
  }

  const wearable = brief.wearable_insight as { hypoglycemia_signal?: boolean } | undefined
  if (wearable?.hypoglycemia_signal) {
    out.push({
      title: "Consider sleep study referral",
      type: "consider",
      body: "Wearable pattern suggests possible nocturnal hypoglycemia or sleep-disordered breathing — discuss with patient.",
    })
  }

  for (const line of rec.rationale ?? []) {
    if (out.some((o) => o.body === line)) continue
    if (rec.discontinue && line.toLowerCase().includes(String(rec.discontinue).toLowerCase())) continue
    out.push({
      title: "Clinical note",
      type: "consider",
      body: line,
    })
  }

  if (out.length === 0 && rec.rationale?.length) {
    out.push({
      title: "Continue current plan",
      type: "consider",
      body: rec.rationale.join(" "),
    })
  }

  return out.slice(0, 5)
}

export function genotypeForFlag(
  flag: { rsid?: string; gene?: string },
  snpProfile?: Record<string, { genotype?: string }>
): string {
  if (flag.rsid && snpProfile?.[flag.rsid]?.genotype) {
    return snpProfile[flag.rsid].genotype!
  }
  return "—"
}

export function severityUi(severity?: string): "critical" | "warning" {
  return (severity || "").toUpperCase() === "CRITICAL" ? "critical" : "warning"
}
