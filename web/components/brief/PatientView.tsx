"use client"

import { useMemo } from "react"
import type { AgentBrief as ApiBrief } from "@/lib/types"
import MetricCard from "./MetricCard"
import PatientFlagTable from "./PatientFlagTable"
import RecommendationCard from "./RecommendationCard"
import GlucoseProfile from "./GlucoseProfile"
import NextSteps from "./NextSteps"
import FollowupActions from "./FollowupActions"
import { AskGiraBar, PatientFollowupProvider } from "./patient-followup"
import { MarkdownContent } from "@/lib/simple-markdown"
import PatientBriefReveal from "./PatientBriefReveal"
import {
  formatPatientHbA1c,
  formatPatientPercent,
  mapPatientRecommendationDisplay,
  patientBriefHeadline,
  patientBriefSummaryText,
  patientMetricSubtexts,
  patientPlainConfidence,
  patientPlainDrugClass,
  patientRecommendationCardTitle,
} from "@/lib/patient-display"
import type { AgentBrief, PatientMeta } from "@/types/brief"

interface PatientViewProps {
  brief: AgentBrief
  patient: PatientMeta
  apiRecommendation?: ApiBrief["recommendation"]
  /** First stagger index (0 if SafetyBanner is separate). */
  staggerStart?: number
}

const DISCLAIMER =
  "This summary is for education only. Talk with your doctor before changing any medication."

export default function PatientView({
  brief,
  patient,
  apiRecommendation,
  staggerStart = 0,
}: PatientViewProps) {
  const rec = useMemo(
    () => mapPatientRecommendationDisplay(brief, apiRecommendation),
    [brief, apiRecommendation]
  )
  const summary = useMemo(
    () => patientBriefSummaryText(brief, patient, apiRecommendation),
    [brief, patient, apiRecommendation]
  )
  const headline = useMemo(() => patientBriefHeadline(rec.kind), [rec.kind])
  const metricSub = useMemo(() => patientMetricSubtexts(brief.glucose_insight), [brief.glucose_insight])
  const g = brief.glucose_insight
  const w = brief.wearable_insight
  const base = staggerStart

  const questions = useMemo(() => {
    const drug = rec.drug_name
    if (rec.kind === "continue") {
      return [
        "In simple terms, why might staying on my current medication make sense for me?",
        "What daily habits can help me keep my blood sugar in a healthier range?",
        "What should I ask my doctor at my next visit about these results?",
      ]
    }
    if (rec.kind === "switch") {
      return [
        `In simple terms, what does ${drug} do and what might I feel in the first month?`,
        "What daily habits can help my blood sugar while my doctor reviews a possible change?",
        "What should I ask my doctor before changing my diabetes medication?",
      ]
    }
    return [
      "What information does my doctor still need before recommending a medication change?",
      "What do these blood sugar and DNA results mean in everyday language?",
      "What questions should I bring to my next appointment?",
    ]
  }, [rec.kind, rec.drug_name])

  const cardSubtitle = `${patientPlainDrugClass(rec.drug_class, rec.drug_name)} · ${patientPlainConfidence(rec.confidence)}`

  return (
    <PatientFollowupProvider patientId={patient.id}>
    <div className="space-y-6">
      <PatientBriefReveal index={base + 0}>
        <article className="rounded-lg border bg-gradient-to-br from-teal-50 to-white p-5 dark:from-teal-950/20">
          <h2 className="text-lg font-semibold">{headline}</h2>
          <MarkdownContent
            text={summary}
            className="mt-2 text-sm text-muted-foreground"
            paragraphClass="text-sm leading-relaxed text-muted-foreground my-2 first:mt-2 last:mb-0"
            listClass="text-sm leading-relaxed text-muted-foreground my-2 first:mt-2 last:mb-0"
          />
        </article>
      </PatientBriefReveal>

      <PatientBriefReveal index={base + 1}>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            label="Blood sugar in healthy range"
            value={formatPatientPercent(g.time_in_range_pct)}
            subtext={metricSub.tir}
          />
          <MetricCard
            label="Recovery score"
            value={formatPatientPercent(w.avg_recovery_pct)}
            subtext={metricSub.recovery}
          />
          <MetricCard
            label="HbA1c (3-month average)"
            value={patient.hba1c_pct != null ? formatPatientHbA1c(patient.hba1c_pct) : "Ask your clinic"}
            subtext={metricSub.hba1c}
          />
        </div>
      </PatientBriefReveal>

      <PatientBriefReveal index={base + 2}>
        <PatientFlagTable flags={brief.safety_flags} />
      </PatientBriefReveal>

      <PatientBriefReveal index={base + 3}>
        <RecommendationCard
          recommendation={rec}
          variant="patient"
          patientTitle={patientRecommendationCardTitle(rec, rec.kind)}
          patientSubtitle={cardSubtitle}
        />
      </PatientBriefReveal>

      <PatientBriefReveal index={base + 4}>
        <GlucoseProfile glucose={g} variant="patient" />
      </PatientBriefReveal>

      <PatientBriefReveal index={base + 5}>
        <NextSteps
          recommendation={rec}
          flags={brief.safety_flags}
          wearable={w}
          trials={brief.trial_matches}
          recommendationKind={rec.kind}
        />
      </PatientBriefReveal>

      <PatientBriefReveal index={base + 6}>
        <FollowupActions patientId={patient.id} questions={questions} variant="patient" />
      </PatientBriefReveal>

      <PatientBriefReveal index={base + 7}>
        <AskGiraBar />
      </PatientBriefReveal>

      <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
    </div>
    </PatientFollowupProvider>
  )
}
