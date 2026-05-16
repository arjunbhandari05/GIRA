import { getPatientAssets, healthCheck } from "./api"

/** Demo provider accounts allowed to sign in. */
const PROVIDER_IDS = new Set(["DR-001"])

export type LoginValidationResult =
  | { ok: true }
  | { ok: false; message: string }

function normalizeId(raw: string): string {
  return raw.trim().toUpperCase()
}

export function isValidProviderId(id: string): boolean {
  const n = normalizeId(id)
  if (PROVIDER_IDS.has(n)) return true
  return /^DR-[A-Z0-9]+$/.test(n)
}

async function patientExists(patientId: string): Promise<boolean> {
  const assets = await getPatientAssets(patientId)
  if (assets.error) return false
  return normalizeId(assets.patient_id) === patientId
}

export async function validateLogin(
  role: "provider" | "patient",
  rawId: string
): Promise<LoginValidationResult> {
  const id = normalizeId(rawId)
  if (!id) {
    return { ok: false, message: "Enter your ID to continue." }
  }

  try {
    await healthCheck()
  } catch {
    return {
      ok: false,
      message: "Cannot reach GIRA. Start the API server (port 8000) and refresh this page.",
    }
  }

  if (role === "provider") {
    if (!isValidProviderId(id)) {
      return {
        ok: false,
        message: "Use a valid provider ID (e.g. DR-001).",
      }
    }
    return { ok: true }
  }

  try {
    const exists = await patientExists(id)
    if (!exists) {
      return {
        ok: false,
        message:
          "This patient ID is not on file. Ask your healthcare provider to create your record in GIRA, or use a demo ID such as PT-001 after running scripts/ensure_demo_patients.py.",
      }
    }
    return { ok: true }
  } catch {
    return {
      ok: false,
      message: "Could not verify your patient ID. Check that the API is running and try again.",
    }
  }
}
