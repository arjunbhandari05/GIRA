export interface SafetyFlag {
  gene: string
  variant: string
  genotype: string
  impact: string
  severity: "flag" | "warn" | "ok"
}

export interface Recommendation {
  drug_name: string
  drug_class: string
  evidence_level: string
  confidence: "High" | "Medium" | "Low"
  rationale: {
    genomic: string
    cgm: string
    wearable: string
    safety_note?: string
  }
  full_text?: string
  narrative?: string
}

export interface GlucoseInsight {
  avg_fasting: number
  avg_postprandial_rise: number
  time_in_range_pct: number
  time_high_pct: number
  time_low_pct: number
  peak_glucose: number
  glucose_variability_cv: number
  nocturnal_lows: boolean
  dawn_phenomenon: boolean
  dawn_phenomenon_days?: number
  interpretation?: string
}

export interface WearableInsight {
  avg_recovery_pct: number
  avg_resting_hr: number
  avg_hrv_ms: number
  avg_strain: number
  sleep_score_pct: number
  deep_sleep_pct: number
  avg_sleep_hrs?: number
  interpretation?: string
}

export interface TrialMatch {
  nct_id: string
  title: string
  phase: string
  status: string
  location: string
  url?: string
  tags: string[]
}

export interface Citation {
  index: number
  text: string
  pmid?: string
  url?: string
}

export interface AgentBrief {
  safety_flags: SafetyFlag[]
  snp_summary: string
  recommendation: Recommendation
  glucose_insight: GlucoseInsight
  wearable_insight: WearableInsight
  trial_matches: TrialMatch[]
  citations: Citation[]
  intake_summary: string
  patient_summary: string
  _trace?: Record<string, unknown>
  _timing?: {
    total_ms: number
    llm_ms: number
    tool_ms: number
    by_tool_ms?: Record<string, number>
    slowest_tools?: { tool: string; duration_ms: number }[]
    step_count?: number
  }
  _backend?: string
}

export interface PatientMeta {
  id: string
  name: string
  age: number
  sex: string
  hba1c_pct?: number
}
