import type { AgentBrief, PatientIntake, SafetyFlag } from "./types"

export const DRUG_MONTHLY_COST: Record<string, number> = {
  metformin: 10,
  atorvastatin: 15,
  pravastatin: 15,
  semaglutide: 900,
  clopidogrel: 20,
  empagliflozin: 550,
  glipizide: 25,
  liraglutide: 900,
  ozempic: 900,
  wegovy: 900,
}

export function estimateMonthlyCost(drugName: string): number | null {
  const key = drugName.toLowerCase().replace(/\s+/g, "")
  for (const [name, cost] of Object.entries(DRUG_MONTHLY_COST)) {
    if (key.includes(name)) return cost
  }
  return null
}

export function plainMedicationChangeSentence(brief: AgentBrief): string | null {
  const rec = brief.recommendation
  if (!rec?.discontinue && !rec?.start) return null
  if (rec.discontinue?.toLowerCase().includes("statin") || rec.start?.toLowerCase().includes("pravastatin")) {
    return "Your DNA suggests your cholesterol medication may not be right for you."
  }
  if (rec.discontinue?.toLowerCase().includes("metformin")) {
    return "Your DNA suggests your diabetes medication may need a change."
  }
  if (rec.start?.toLowerCase().includes("semaglutide") || rec.start?.toLowerCase().includes("glp")) {
    return "Your care team may discuss a different diabetes medication that could work better for you."
  }
  if (rec.discontinue) {
    return `Your care team may discuss whether ${rec.discontinue} is still the best fit for you.`
  }
  if (rec.start) {
    return `Your care team may discuss starting ${rec.start} at your next visit.`
  }
  return null
}

export const DEFAULT_HEALTH_MARKERS = [
  "Heart rate variability",
  "Fasting blood sugar",
  "Body weight",
]

export function healthMarkersFromBrief(brief: AgentBrief | null): string[] {
  const markers: string[] = []
  if (brief?.wearable_insight) markers.push("Heart rate variability")
  if (brief?.glucose_insight) markers.push("Blood sugar levels")
  markers.push("Body weight")
  return [...new Set(markers)].slice(0, 3)
}

export function hasSafetyAlert(flags: SafetyFlag[]): boolean {
  return flags.length > 0
}

export function intakeMedications(intake?: PatientIntake): { name: string; dose: string; frequency: string }[] {
  if (!intake?.medications?.length) return []
  return intake.medications.map((m) => ({
    name: m.name,
    dose: m.dose || "—",
    frequency: m.frequency || "—",
  }))
}
