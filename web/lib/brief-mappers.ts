import type { AgentBrief as ApiBrief } from "@/lib/types"
import type {
  AgentBrief,
  Citation,
  GlucoseInsight,
  Recommendation,
  SafetyFlag,
  TrialMatch,
  WearableInsight,
} from "@/types/brief"

function num(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function mapSeverity(severity?: string): SafetyFlag["severity"] {
  const s = (severity || "").toUpperCase()
  if (s === "CRITICAL" || s === "FLAG") return "flag"
  if (s === "WARNING" || s === "WARN") return "warn"
  return "ok"
}

export function mapSafetyFlags(api: ApiBrief, snpProfile?: Record<string, { genotype?: string }>): SafetyFlag[] {
  const flags = api.safety_flags || []
  if (flags.length > 0) {
    return flags.map((f) => ({
      gene: f.gene || "Unknown",
      variant: f.rsid || "",
      genotype: snpProfile?.[f.rsid || ""]?.genotype || "",
      impact: f.flag || f.action || "",
      severity: mapSeverity(f.severity),
    }))
  }
  const rows = api.snp_summary || []
  if (!Array.isArray(rows)) return []
  return rows.map((row) => ({
    gene: row.gene || "Unknown",
    variant: row.rsid || "",
    genotype: row.genotype || "",
    impact: row.finding || "",
    severity: "ok" as const,
  }))
}

function inferDrugClass(drug: string): string {
  const d = drug.toLowerCase()
  if (d.includes("semaglutide") || d.includes("liraglutide") || d.includes("tirzepatide")) {
    return "GLP-1 receptor agonist"
  }
  if (d.includes("metformin")) return "Biguanide"
  if (d.includes("statin") || d.includes("pravastatin") || d.includes("simvastatin")) {
    return "Statin"
  }
  return "Antidiabetic / cardiovascular"
}

export function mapRecommendation(api: ApiBrief): Recommendation {
  const rec = api.recommendation || {}
  const drug =
    (typeof rec.start === "string" && rec.start) ||
    rec.actions?.[0]?.start ||
    "Continue current regimen"
  const rationaleList = Array.isArray(rec.rationale) ? rec.rationale.map(String) : []
  const switchRequired = Boolean(rec.switch_required)

  return {
    drug_name: drug,
    drug_class: inferDrugClass(drug),
    evidence_level: "CPIC-informed + literature",
    confidence: switchRequired ? "High" : "Medium",
    rationale: {
      genomic: rationaleList[0] || "See pharmacogenomic findings in the brief.",
      cgm: rationaleList[1] || api.patient_summary || "See CGM summary.",
      wearable: rationaleList[2] || "See wearable metrics.",
      safety_note: api.safety_flags?.find((f) => mapSeverity(f.severity) === "flag")?.action,
    },
    full_text: rationaleList.join(" "),
    narrative: api.patient_summary,
  }
}

export function mapGlucoseInsight(api: ApiBrief): GlucoseInsight {
  const g = (api.glucose_insight || {}) as Record<string, unknown>
  const tir = num(g.time_in_range_pct, 0)
  const high = Math.max(0, 100 - tir - num(g.time_below_range_pct, 5))
  return {
    avg_fasting: num(g.avg_glucose_mgdl, 120),
    avg_postprandial_rise: 45,
    time_in_range_pct: tir,
    time_high_pct: num(g.time_above_range_pct, high),
    time_low_pct: num(g.time_below_range_pct, 100 - tir - high),
    peak_glucose: num(g.avg_glucose_mgdl, 180) + 40,
    glucose_variability_cv: num(g.cv_pct, 28),
    nocturnal_lows: num(g.hypoglycemic_events, 0) > 0,
    dawn_phenomenon: false,
    interpretation: typeof g.trend_direction === "string" ? `Trend: ${g.trend_direction}` : undefined,
  }
}

export function mapWearableInsight(api: ApiBrief): WearableInsight {
  const w = (api.wearable_insight || {}) as Record<string, unknown>
  return {
    avg_recovery_pct: num(w.recovery_avg, 65),
    avg_resting_hr: num(w.rhr_avg, 68),
    avg_hrv_ms: num(w.hrv_ms_avg, 42),
    avg_strain: 12,
    sleep_score_pct: 72,
    deep_sleep_pct: 18,
    avg_sleep_hrs: 7.1,
    interpretation:
      typeof w.hrv_trend === "string" ? `HRV trend: ${w.hrv_trend}` : undefined,
  }
}

export function mapTrialMatches(api: ApiBrief): TrialMatch[] {
  return (api.trial_matches || []).map((t) => ({
    nct_id: t.nct_id || "",
    title: t.title || "Untitled trial",
    phase: t.phase || "N/A",
    status: "Recruiting",
    location: t.location || "",
    url: t.url || (t.nct_id ? `https://clinicaltrials.gov/study/${t.nct_id}` : undefined),
    tags: t.match_genes || [],
  }))
}

export function mapCitations(api: ApiBrief): Citation[] {
  return (api.citations || []).map((c, i) => ({
    index: i + 1,
    text: `${c.title || "Reference"} (PMID ${c.pmid || "—"}): ${c.inference || ""}`,
  }))
}

export function mapAgentBrief(api: ApiBrief, snpProfile?: Record<string, { genotype?: string }>): AgentBrief {
  const snpRows = api.snp_summary
  const snpText = Array.isArray(snpRows)
    ? snpRows
        .map((r) => `${r.gene} ${r.rsid} ${r.genotype}: ${r.finding}`)
        .join("\n")
    : String(snpRows || "")

  return {
    safety_flags: mapSafetyFlags(api, snpProfile),
    snp_summary: snpText,
    recommendation: mapRecommendation(api),
    glucose_insight: mapGlucoseInsight(api),
    wearable_insight: mapWearableInsight(api),
    trial_matches: mapTrialMatches(api),
    citations: mapCitations(api),
    intake_summary: typeof api.intake_summary === "string" ? api.intake_summary : JSON.stringify(api.intake_summary || ""),
    patient_summary: api.patient_summary || "",
    _trace: api._trace as Record<string, unknown> | undefined,
    _timing: api._timing,
    _backend: api._backend,
  }
}
