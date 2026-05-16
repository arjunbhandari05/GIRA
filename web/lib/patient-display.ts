import type {
  AgentBrief,
  GlucoseInsight,
  PatientMeta,
  Recommendation,
  SafetyFlag,
  WearableInsight,
} from "@/types/brief"
import type { AgentBrief as ApiBrief } from "@/lib/types"

/** Display-layer rounding for patient UI (does not mutate source data). */
export function formatPatientPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—"
  return `${Number(value).toFixed(1)}%`
}

export function formatPatientMgDl(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—"
  return Number(value).toFixed(1)
}

export function formatPatientHbA1c(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—"
  return `${Number(value).toFixed(1)}%`
}

export function formatPatientMs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—"
  return Number(value).toFixed(1)
}

export function formatPatientBpm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "—"
  return Number(value).toFixed(1)
}

export function formatPatientWowPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "0.0%"
  const n = Number(value)
  const sign = n > 0 ? "+" : ""
  return `${sign}${n.toFixed(1)}%`
}

export type PatientRecommendationKind = "continue" | "switch" | "needs_more_data"

const FRIENDLY_GENES: Record<string, string> = {
  SLC22A1: "how your body absorbs metformin",
  SLCO1B1: "cholesterol medications",
  CYP2C19: "certain blood thinners",
  VKORC1: "warfarin",
  TCF7L2: "blood sugar risk",
}

const CONTINUE_PATTERN =
  /\b(continue\s+current|current\s+regimen|no\s+change|maintain\s+current|stay\s+on|keep\s+current|remain\s+on)\b/i
const SWITCH_PATTERN =
  /\b(switch|change\s+to|start\s+|consider\s+|discontinue|replace\s+with|move\s+to|trial\s+)\b/i

export function friendlyGenePlain(gene: string): string {
  return FRIENDLY_GENES[gene] || "one gene worth monitoring"
}

function friendlyGene(gene: string): string {
  return friendlyGenePlain(gene)
}

function isRawClinicalDump(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (
    /Chart HbA1c|TIR\s|CPIC|PGx|GET \/|mg\/dL,\s*avg|time_in_range|_pct|Safety gates|esearch|pmid/i.test(
      t
    )
  ) {
    return true
  }
  if (/\b(SLC22A1|SLCO1B1|CYP2C19|VKORC1|rs\d+)\b/i.test(t) && t.length < 120) return true
  if (/\d+\.\d{3,}/.test(t)) return true
  return false
}

function plainTrend(text?: string): string | undefined {
  if (!text || isRawClinicalDump(text)) return undefined
  const t = text.toLowerCase()
  if (t.includes("worsen") || t.includes("declin")) return "has been trending up slightly"
  if (t.includes("improv")) return "has been improving slowly"
  if (t.includes("stable")) return "has stayed fairly steady"
  return undefined
}

/** Resolve continue vs switch vs needs-more-data from live agent fields + drug name. */
export function resolvePatientRecommendationKind(
  rec: Recommendation,
  apiRec?: ApiBrief["recommendation"]
): PatientRecommendationKind {
  const name = (rec.drug_name || "").trim()
  const lower = name.toLowerCase()

  if (apiRec?.switch_required === true) return "switch"
  if (apiRec?.discontinue && !apiRec?.start) return "switch"
  if (apiRec?.start && typeof apiRec.start === "string" && !CONTINUE_PATTERN.test(apiRec.start)) {
    return "switch"
  }

  if (!name) return "needs_more_data"

  const hasContinue = CONTINUE_PATTERN.test(lower)
  const hasSwitch = SWITCH_PATTERN.test(lower)

  if (hasContinue && !hasSwitch) return "continue"
  if (hasSwitch) return "switch"

  if (lower.includes("continue") && lower.includes("regimen")) return "continue"

  if (
    !hasContinue &&
    name.length > 2 &&
    !/^continue\b/i.test(name) &&
    !/^no\s+change/i.test(name)
  ) {
    return "switch"
  }

  if (apiRec?.switch_required === false && hasContinue) return "continue"

  return "needs_more_data"
}

export function patientBriefHeadline(kind: PatientRecommendationKind): string {
  switch (kind) {
    case "continue":
      return "Your current medication looks like a good fit"
    case "switch":
      return "A different medication may work better for you"
    default:
      return "More information needed before a recommendation"
  }
}

/** One–two plain sentences for the patient home brief module card. */
export function patientHomeBriefConclusion(
  brief: AgentBrief,
  apiRec?: ApiBrief["recommendation"]
): string {
  const kind = resolvePatientRecommendationKind(brief.recommendation, apiRec)
  const headline = patientBriefHeadline(kind)
  if (kind === "continue") {
    return `${headline} based on your DNA and recent blood sugar data.`
  }
  if (kind === "switch") {
    return `${headline} based on your DNA and recent health data.`
  }
  return `${headline}. Your care team may need a little more information before suggesting a change.`
}

export function formatBriefLastUpdated(iso?: string): string | null {
  if (!iso?.trim()) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function patientPlainDrugName(raw: string): string {
  const lower = raw.toLowerCase()
  if (CONTINUE_PATTERN.test(lower)) return "your current medications"
  return raw.replace(/\s*\(.*\)\s*$/, "").trim() || "the suggested medication"
}

export function patientPlainConfidence(confidence: Recommendation["confidence"]): string {
  switch (confidence) {
    case "High":
      return "highly confident recommendation"
    case "Low":
      return "early suggestion — your doctor will confirm"
    default:
      return "moderately confident recommendation"
  }
}

export function patientPlainDrugClass(drugClass: string, drugName: string): string {
  const combined = `${drugClass} ${drugName}`.toLowerCase()
  if (combined.includes("glp") || combined.includes("semaglutide") || combined.includes("tirzepatide")) {
    return "for blood sugar and weight"
  }
  if (combined.includes("statin") || combined.includes("pravastatin") || combined.includes("atorvastatin")) {
    return "for cholesterol and heart health"
  }
  if (combined.includes("metformin") || combined.includes("biguanide")) {
    return "for blood sugar"
  }
  return "for blood sugar and heart health"
}

function tirSentence(tir: number): string {
  const pct = formatPatientPercent(tir)
  if (tir >= 70) {
    return `Your blood sugar stayed in the healthy range ${pct} of the time over the last month — the goal is usually 70% or higher, and you're close or there.`
  }
  if (tir >= 50) {
    return `Your blood sugar stayed in the healthy range ${pct} of the time — the goal is 70% or higher, and your care team can help you improve from here.`
  }
  if (tir > 0) {
    return `Your blood sugar stayed in the healthy range ${pct} of the time — the goal is 70% or higher, so there is room to improve with your doctor's help.`
  }
  return ""
}

function hba1cSentence(hba: number): string {
  const val = formatPatientHbA1c(hba)
  if (hba < 7) {
    return `Your HbA1c (${val}, a 3-month blood sugar average) is in a range many doctors consider well controlled.`
  }
  if (hba <= 8.5) {
    return `Your HbA1c (${val}, a 3-month blood sugar average) helps your doctor see the big picture when planning next steps.`
  }
  return `Your HbA1c (${val}, a 3-month blood sugar average) is one reason your doctor may want to adjust your plan.`
}

/** 3–5 sentence plain summary aligned with the headline kind. */
export function buildPatientBriefNarrative(
  brief: AgentBrief,
  patient?: PatientMeta,
  kind?: PatientRecommendationKind,
  apiRec?: ApiBrief["recommendation"]
): string {
  const resolved = kind ?? resolvePatientRecommendationKind(brief.recommendation, apiRec)
  const g = brief.glucose_insight
  const w = brief.wearable_insight
  const rec = brief.recommendation
  const sentences: string[] = []

  const tirLine = tirSentence(g.time_in_range_pct)
  if (tirLine) sentences.push(tirLine)

  if (w.avg_recovery_pct >= 65) {
    sentences.push(
      `Your recovery scores have been solid, which suggests your body is bouncing back well between busy days.`
    )
  } else if (w.avg_hrv_ms >= 40) {
    sentences.push(
      `Your stress and recovery signals have been fairly steady, which is a good sign for day-to-day balance.`
    )
  }

  if (patient?.hba1c_pct != null && Number.isFinite(patient.hba1c_pct)) {
    sentences.push(hba1cSentence(Number(patient.hba1c_pct)))
  }

  const drug = patientPlainDrugName(rec.drug_name || "")

  if (resolved === "continue") {
    sentences.push(
      `Based on your DNA and your day-to-day numbers, staying on ${drug} may still make sense — your doctor will confirm at your visit.`
    )
  } else if (resolved === "switch") {
    sentences.push(
      `Based on your DNA and your day-to-day numbers, your care team may want to talk about ${drug} — please do not change medicines on your own.`
    )
  } else {
    sentences.push(
      `Your doctor may need a little more information before suggesting a clear medication change — bring these results to your visit.`
    )
  }

  sentences.push(
    `This summary is meant to help you prepare questions, not to replace medical advice from your care team.`
  )

  const trimmed = sentences.slice(0, 5)
  while (trimmed.length < 3) {
    trimmed.push("Your care team will walk through these results with you and answer any questions you have.")
    if (trimmed.length >= 3) break
  }

  return trimmed.join(" ")
}

export function patientGenomicRationale(brief: AgentBrief): string {
  const flagged = brief.safety_flags.filter((f) => f.severity !== "ok")
  if (flagged.length > 0) {
    const topics = [...new Set(flagged.map((f) => friendlyGene(f.gene)))]
    return `Your DNA suggests your body may handle ${topics.slice(0, 2).join(" and ")} a little differently than average. Your doctor uses this to choose safer medicines.`
  }
  return "Your DNA did not show major genetic red flags for common diabetes medicines, but your doctor will still double-check before any change."
}

export function patientCgmRationale(g: GlucoseInsight): string {
  const tir = g.time_in_range_pct
  const avg = g.avg_fasting
  const trend = plainTrend(g.interpretation)
  const base = tirSentence(tir) || `Typical readings were around ${formatPatientMgDl(avg)} mg/dL.`
  return trend ? `${base} Your glucose ${trend}.` : base
}

export function patientWearableRationale(w: WearableInsight): string {
  const trend = plainTrend(w.interpretation)
  if (w.avg_recovery_pct >= 60) {
    return `Your wearable shows about ${formatPatientPercent(w.avg_recovery_pct)} average recovery and a resting heart rate around ${formatPatientBpm(w.avg_resting_hr)} beats per minute.${trend ? ` Recovery ${trend}.` : ""}`
  }
  return `Your wearable shows a resting heart rate around ${formatPatientBpm(w.avg_resting_hr)} beats per minute — useful context for sleep and stress.${trend ? ` Recovery ${trend}.` : ""}`
}

export function patientSafetyRationale(note?: string, flags?: SafetyFlag[]): string | undefined {
  if (note?.trim() && !isRawClinicalDump(note)) {
    return note
  }
  const critical = (flags || []).filter((f) => f.severity === "flag")
  if (critical.length === 1) {
    return `One genetic red flag is worth discussing: ${friendlyGene(critical[0].gene)}.`
  }
  if (critical.length > 1) {
    return "A few genetic red flags are worth discussing with your doctor before changing medicines."
  }
  return undefined
}

export function patientPlainFlagImpact(flag: SafetyFlag): string {
  if (isRawClinicalDump(flag.impact)) {
    if (flag.severity === "flag") return "May not work well with your body"
    if (flag.severity === "warn") return "Use with extra caution"
    return "No major concern right now"
  }
  return flag.impact
}

export function patientRecommendationCardTitle(
  rec: Recommendation,
  kind: PatientRecommendationKind
): string {
  if (kind === "continue") return "Staying on your current plan"
  if (kind === "needs_more_data") return "What your care team is reviewing"
  const drug = patientPlainDrugName(rec.drug_name)
  const label =
    drug.toLowerCase().includes("semaglutide") || drug.toLowerCase().includes("ozempic")
      ? `${drug} (a weekly injection)`
      : drug
  return `Option to discuss: ${label}`
}

/** Patient-facing recommendation card copy derived from structured brief fields. */
export function mapPatientRecommendationDisplay(
  brief: AgentBrief,
  apiRec?: ApiBrief["recommendation"]
): Recommendation & { kind: PatientRecommendationKind } {
  const rec = brief.recommendation
  const kind = resolvePatientRecommendationKind(rec, apiRec)

  return {
    ...rec,
    kind,
    evidence_level: "Based on your DNA and health records",
    confidence: rec.confidence,
    rationale: {
      genomic: patientGenomicRationale(brief),
      cgm: patientCgmRationale(brief.glucose_insight),
      wearable: patientWearableRationale(brief.wearable_insight),
      safety_note: patientSafetyRationale(rec.rationale.safety_note, brief.safety_flags),
    },
    narrative: buildPatientBriefNarrative(brief, undefined, kind, apiRec),
  }
}

export function patientBriefSummaryText(
  brief: AgentBrief,
  patient?: PatientMeta,
  apiRec?: ApiBrief["recommendation"]
): string {
  const kind = resolvePatientRecommendationKind(brief.recommendation, apiRec)
  const raw = brief.patient_summary?.trim()
  if (raw && !isRawClinicalDump(raw)) {
    return raw
  }
  return buildPatientBriefNarrative(brief, patient, kind, apiRec)
}

export function patientMetricSubtexts(g: GlucoseInsight): {
  tir: string
  recovery: string
  hba1c: string
} {
  const tir = g.time_in_range_pct
  return {
    tir:
      tir >= 70
        ? "Goal is usually 70% or higher"
        : tir >= 50
          ? "Goal is 70% or higher — room to improve"
          : "Last 30 days · ask your doctor about goals",
    recovery: "WHOOP average · higher is better",
    hba1c: "3-month blood sugar average",
  }
}
