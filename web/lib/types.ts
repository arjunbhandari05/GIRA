/** UI roster status (derived from safety flags + brief). */
export type PatientStatus = "ready" | "review" | "flag"
export type SNPStatus = "flag" | "warn" | "ok"
export type FlagSeverity = "critical" | "warning"
export type MetricTrend = "up" | "down" | "stable"
export type MetricStatus = "Good" | "Normal" | "Elevated" | "Low"

export interface Patient {
  id: string
  name: string
  initials: string
  avatarColor: string
  status: PatientStatus
  statusText: string
  badgeText: string
  appointment: string
}

export interface BackendPatient {
  patient_id: string
  name?: string
  zip?: string
  meds?: string[] | string
  next_appointment_iso?: string
  snp_profile_json?: Record<string, { gene?: string; genotype?: string; chromosome?: string }>
  parsed_at?: string
}

export interface PatientIntake {
  patientId: string
  submittedAt?: string
  submittedBy?: string
  medications: { id: string; name: string; dose: string; frequency: string }[]
  vitals: {
    weight: string
    height: string
    bloodPressure: string
    fastingGlucose: string
    hba1c: string
    egfr: string
  }
  goals: string[]
  sideEffects: string[]
  lifestyle: {
    activityLevel: string
    diet: string
    alcohol: string
    smoking: string
    sleepQuality: number
  }
  comorbidities: string[]
  familyHistory: string[]
  clinicianNotes: string
}

export interface SafetyFlag {
  rsid: string
  gene: string
  risk_genotype?: string
  severity: string
  flag: string
  action: string
  drug?: string
  pmid?: string
  currently_prescribed?: boolean
}

export interface AgentBrief {
  action_required?: boolean
  safety_flags?: Array<{
    gene?: string
    rsid?: string
    severity?: string
    flag?: string
    action?: string
    drug?: string
    pmid?: string
    currently_prescribed?: boolean
  }>
  snp_summary?: Array<{
    rsid?: string
    gene?: string
    genotype?: string
    finding?: string
    evidence_level?: string
    drug?: string
    pmid?: string
    clinvar_significance?: string
  }>
  recommendation?: {
    switch_required?: boolean
    discontinue?: string | null
    start?: string | null
    rationale?: string[]
    supporting_pmids?: string[]
  }
  wearable_insight?: Record<string, unknown>
  glucose_insight?: Record<string, unknown>
  trial_matches?: Array<{
    nct_id?: string
    title?: string
    phase?: string
    match_genes?: string[]
    location?: string
    url?: string
  }>
  citations?: Array<{ pmid?: string; title?: string; url?: string; inference?: string }>
  intake_summary?: Record<string, unknown>
  patient_summary?: string
  generated_at?: string
  cached?: boolean
  error?: string
  _trace?: TraceStep[]
  _backend?: string
}

export interface TraceStep {
  tool: string
  step?: number
  args_summary?: Record<string, unknown>
  result_summary?: Record<string, unknown>
  status?: string
  data_source?: string
  detail?: unknown
  partial?: boolean
  plan_fallback?: boolean
  auto_invoked?: boolean
  agent_wide_fallback?: boolean
}

export interface LogLine {
  timestamp: string
  text: string
  type: "info" | "warning" | "error" | "success"
  toolLabel?: string
}

export interface UiRecommendation {
  title: string
  type: "discontinue" | "start" | "consider"
  body: string
}
