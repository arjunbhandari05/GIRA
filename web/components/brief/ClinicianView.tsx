"use client"

import MetricCard from "./MetricCard"
import SnpTable from "./SnpTable"
import RecommendationCard from "./RecommendationCard"
import GlucoseProfile from "./GlucoseProfile"
import WearableSummary from "./WearableSummary"
import TrialList from "./TrialList"
import CitationList from "./CitationList"
import FollowupActions from "./FollowupActions"
import { AskGiraBar, PatientFollowupProvider } from "./patient-followup"
import RunTimingSummary from "./RunTimingSummary"
import type { AgentBrief, PatientMeta } from "@/types/brief"

interface ClinicianViewProps {
  brief: AgentBrief
  patient: PatientMeta
}

const DISCLAIMER =
  "Research and demonstration only. All outputs require physician review before clinical use."

export default function ClinicianView({ brief, patient }: ClinicianViewProps) {
  const rec = brief.recommendation
  const g = brief.glucose_insight
  const w = brief.wearable_insight

  const questions = [
    `Generate a full prescription plan for this patient switching to ${rec.drug_name}, including titration schedule and monitoring labs.`,
    `What are the contraindications and drug interactions for ${rec.drug_name} given this patient's full intake and comorbidities?`,
    "Write a patient-facing explanation of why this patient's DNA affects their diabetes medication response.",
    ...(brief.trial_matches.length > 0
      ? [`Draft a referral note for clinical trial ${brief.trial_matches[0].nct_id} for this patient.`]
      : []),
  ]

  return (
    <PatientFollowupProvider patientId={patient.id} audience="clinician">
    <div className="space-y-6">
      <RunTimingSummary timing={brief._timing} backend={brief._backend} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="HbA1c"
          value={patient.hba1c_pct != null ? `${patient.hba1c_pct}%` : "—"}
          severity={
            patient.hba1c_pct != null && patient.hba1c_pct > 7 ? "warn" : patient.hba1c_pct != null ? "good" : "neutral"
          }
        />
        <MetricCard label="Time in range" value={`${g.time_in_range_pct}%`} severity={g.time_in_range_pct < 70 ? "warn" : "good"} />
        <MetricCard label="Avg glucose" value={`${g.avg_fasting} mg/dL`} />
        <MetricCard label="HRV (30d)" value={`${w.avg_hrv_ms} ms`} severity={w.avg_hrv_ms < 30 ? "warn" : "good"} />
        <MetricCard label="Recovery" value={`${w.avg_recovery_pct}%`} />
        <MetricCard label="Resting HR" value={`${w.avg_resting_hr} bpm`} />
      </div>

      <SnpTable flags={brief.safety_flags} />
      <RecommendationCard recommendation={rec} variant="clinician" />
      <GlucoseProfile glucose={g} />
      <WearableSummary wearable={w} />
      <TrialList trials={brief.trial_matches} />
      <CitationList citations={brief.citations} />
      <FollowupActions patientId={patient.id} questions={questions} variant="clinician" />
      <AskGiraBar audience="clinician" />
      <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
    </div>
    </PatientFollowupProvider>
  )
}
