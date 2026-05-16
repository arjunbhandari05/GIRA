import type { PatientIntake } from "./types"

export const GOAL_OPTIONS = [
  "Lose weight",
  "Maintain weight",
  "Reduce HbA1c",
  "Reduce cardiovascular risk",
  "Minimize injections",
  "Minimize pill burden",
  "Avoid hypoglycemia",
  "Improve energy",
  "Cost-conscious",
]

export const SIDE_EFFECT_OPTIONS = [
  "GI discomfort/nausea",
  "Muscle pain",
  "Fatigue",
  "Hypoglycemia",
  "Swelling",
  "UTIs",
  "Weight gain",
  "Headaches",
]

export const COMORBIDITY_OPTIONS = [
  "Hypertension",
  "Obesity BMI>=30",
  "Heart disease",
  "Kidney disease",
  "Sleep apnea",
  "Liver disease",
  "Neuropathy",
  "Depression",
]

export const FAMILY_HISTORY_OPTIONS = [
  "Type 2 diabetes",
  "Heart attack/stroke",
  "Kidney disease",
  "Statin intolerance",
]

export function emptyIntake(patientId: string): PatientIntake {
  return {
    patientId,
    medications: [],
    vitals: {
      weight: "",
      height: "",
      bloodPressure: "",
      fastingGlucose: "",
      hba1c: "",
      egfr: "",
    },
    goals: [],
    sideEffects: [],
    lifestyle: {
      activityLevel: "Light",
      diet: "Standard",
      alcohol: "None",
      smoking: "Never",
      sleepQuality: 5,
    },
    comorbidities: [],
    familyHistory: [],
    clinicianNotes: "",
  }
}
