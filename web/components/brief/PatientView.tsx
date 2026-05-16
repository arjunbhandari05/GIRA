"use client"

import MetricCard from "./MetricCard"
import PatientFlagTable from "./PatientFlagTable"
import RecommendationCard from "./RecommendationCard"
import GlucoseProfile from "./GlucoseProfile"
import NextSteps from "./NextSteps"
import FollowupActions from "./FollowupActions"
import type { AgentBrief, PatientMeta } from "@/types/brief"

interface PatientViewProps {
  brief: AgentBrief
  patient: PatientMeta
}

const DISCLAIMER =
  "This summary is for education only. Talk with your doctor before changing any medication."

export default function PatientView({ brief, patient }: PatientViewProps) {
  const rec = brief.recommendation
  const g = brief.glucose_insight
  const w = brief.wearable_insight

  const questions = [
    `Explain in simple terms what ${rec.drug_name} does and what to expect in the first month of taking it.`,
    "What lifestyle changes can help me improve my blood sugar alongside my medication?",
    "What questions should I ask my doctor at my next appointment about changing my diabetes medication?",
  ]

  return (
    <div className="space-y-6">
      <article className="rounded-lg border bg-gradient-to-br from-teal-50 to-white p-5 dark:from-teal-950/20">
        <h2 className="text-lg font-semibold">
          {rec.drug_name} may work better for your body than your current medication
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{brief.patient_summary}</p>
      </article>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Blood sugar in range" value={`${g.time_in_range_pct}%`} subtext="Last 30 days" />
        <MetricCard label="Recovery score" value={`${w.avg_recovery_pct}%`} subtext="WHOOP average" />
        <MetricCard
          label="HbA1c"
          value={patient.hba1c_pct != null ? `${patient.hba1c_pct}%` : "Ask your clinic"}
        />
      </div>

      <PatientFlagTable flags={brief.safety_flags} />
      <RecommendationCard recommendation={rec} variant="patient" />
      <GlucoseProfile glucose={g} />
      <NextSteps
        recommendation={rec}
        flags={brief.safety_flags}
        wearable={w}
        trials={brief.trial_matches}
      />
      <FollowupActions patientId={patient.id} questions={questions} />
      <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
    </div>
  )
}
