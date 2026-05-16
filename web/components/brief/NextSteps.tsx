import type { Recommendation, SafetyFlag, TrialMatch, WearableInsight } from "@/types/brief"

interface NextStepsProps {
  recommendation: Recommendation
  flags: SafetyFlag[]
  wearable: WearableInsight
  trials: TrialMatch[]
}

export default function NextSteps({ recommendation, flags, wearable, trials }: NextStepsProps) {
  const steps: string[] = [
    `Talk to your doctor about switching to ${recommendation.drug_name}.`,
  ]

  for (const f of flags.filter((x) => x.severity === "flag")) {
    if (f.gene === "SLCO1B1") {
      steps.push(
        "Make sure your doctor knows certain cholesterol medications may not be safe for you based on your DNA."
      )
    } else {
      steps.push(`Tell your doctor about your ${friendlyGene(f.gene)} result (${f.impact}).`)
    }
  }

  if (wearable.deep_sleep_pct < 20 || wearable.sleep_score_pct < 60) {
    steps.push("Focus on sleep: consistent bedtime, less screen time before bed, and 7–8 hours nightly.")
  } else if (wearable.avg_hrv_ms < 30) {
    steps.push("Add stress recovery: short walks, breathing exercises, and lighter training days when worn down.")
  } else {
    steps.push("Stay active with moderate daily movement to support blood sugar and recovery.")
  }

  if (trials.length > 0) {
    steps.push(
      "Ask your doctor if you might qualify for a clinical trial. There may be studies nearby specifically for people with your genetic profile."
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

function friendlyGene(gene: string) {
  const map: Record<string, string> = {
    SLC22A1: "metformin absorption gene",
    SLCO1B1: "cholesterol medication gene",
    CYP2C19: "blood thinner gene",
    VKORC1: "warfarin sensitivity gene",
    TCF7L2: "diabetes risk gene",
  }
  return map[gene] || gene
}
