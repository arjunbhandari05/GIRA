import type { Recommendation, SafetyFlag, TrialMatch, WearableInsight } from "@/types/brief"
import type { PatientRecommendationKind } from "@/lib/patient-display"
import { friendlyGenePlain, patientPlainDrugName } from "@/lib/patient-display"

interface NextStepsProps {
  recommendation: Recommendation
  flags: SafetyFlag[]
  wearable: WearableInsight
  trials: TrialMatch[]
  recommendationKind?: PatientRecommendationKind
}

export default function NextSteps({
  recommendation,
  flags,
  wearable,
  trials,
  recommendationKind = "switch",
}: NextStepsProps) {
  const drug = patientPlainDrugName(recommendation.drug_name)
  const steps: string[] = []

  if (recommendationKind === "continue") {
    steps.push("Talk with your doctor about whether staying on your current plan still makes sense for you.")
  } else if (recommendationKind === "switch") {
    steps.push(`Ask your doctor whether ${drug} could be a better fit — do not change medicines on your own.`)
  } else {
    steps.push("Ask your doctor what other information they need before suggesting a medication change.")
  }

  for (const f of flags.filter((x) => x.severity === "flag")) {
    if (f.gene === "SLCO1B1") {
      steps.push(
        "Tell your doctor that some cholesterol medicines may not be the safest choice for you based on your DNA."
      )
    } else if (f.gene === "SLC22A1") {
      steps.push("Mention that your DNA can affect how your body handles metformin.")
    } else {
      steps.push(`Bring up ${friendlyGenePlain(f.gene)} — your doctor can explain what it means for you.`)
    }
  }

  if (wearable.deep_sleep_pct < 20 || wearable.sleep_score_pct < 60) {
    steps.push("Focus on sleep: a regular bedtime, less screen time at night, and about 7–8 hours when you can.")
  } else if (wearable.avg_hrv_ms < 30) {
    steps.push("Add gentle stress recovery: short walks, calm breathing, and easier days when you feel worn down.")
  } else {
    steps.push("Keep up moderate daily movement — it supports blood sugar and recovery.")
  }

  if (trials.length > 0) {
    steps.push(
      "Ask whether a research study near you might be a fit. Your doctor can explain the pros and cons in plain language."
    )
  }

  const visible = steps.slice(0, 4)

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Next steps</h3>
      <ol className="space-y-3">
        {visible.map((step, i) => (
          <li key={step} className="flex gap-3 text-[14px]">
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-blue-100 text-[12px] font-semibold text-blue-700">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
