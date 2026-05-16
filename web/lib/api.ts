import type { AgentBrief, BackendPatient, PatientIntake, SafetyFlag, TraceStep } from "./types"

function resolveApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")
  // Browser: same-origin proxy (next.config rewrites) avoids CORS / host mismatches
  if (typeof window !== "undefined") {
    return "/backend"
  }
  return fromEnv || "http://127.0.0.1:8000"
}

const API_BASE = resolveApiBase()

const BRIEF_TIMEOUT_MS = 5 * 60 * 1000

async function request<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const { timeoutMs = 60_000, ...fetchInit } = init ?? {}
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const hasJsonBody =
    fetchInit.body != null &&
    !(fetchInit.body instanceof FormData) &&
    !(fetchInit.body instanceof URLSearchParams)

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...fetchInit,
      signal: controller.signal,
      headers: {
        ...(hasJsonBody ? { "Content-Type": "application/json" } : {}),
        ...fetchInit.headers,
      },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        typeof data === "object" && data && "detail" in data
          ? String((data as { detail: unknown }).detail)
          : `Request failed (${res.status})`
      )
    }
    return data as T
  } finally {
    clearTimeout(timer)
  }
}

export function getApiBase(): string {
  return API_BASE
}

export async function healthCheck(): Promise<{ status: string }> {
  return request("/health")
}

export async function listPatients(): Promise<BackendPatient[]> {
  return request("/patients")
}

export interface PatientAssets {
  patient_id: string
  genome: boolean
  wearable: boolean
  glucose: boolean
  intake_file: boolean
}

export async function createPatient(name: string): Promise<{
  patient_id: string
  name: string
  assets: PatientAssets
  error?: string
}> {
  return request("/patients", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export async function registerPatient(payload: {
  name: string
  password: string
  zip?: string
}): Promise<{
  patient_id: string
  name: string
  zip?: string
  assets: PatientAssets
  error?: string
}> {
  return request("/patients/register", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function loginPatient(payload: {
  patient_id: string
  password: string
}): Promise<{ ok?: boolean; patient_id?: string; name?: string; error?: string }> {
  return request("/patients/login", {
    method: "POST",
    body: JSON.stringify({
      patient_id: payload.patient_id.trim().toUpperCase(),
      password: payload.password,
    }),
  })
}

export async function getPatientAssets(
  patientId: string
): Promise<PatientAssets & { error?: string }> {
  const data = await request<PatientAssets & { error?: string }>(
    `/patients/${encodeURIComponent(patientId)}/assets`
  )
  return data
}

export async function uploadPatientGenome(
  patientId: string,
  file: File
): Promise<{ patient_id: string; snp_count?: number; assets?: PatientAssets }> {
  const form = new FormData()
  form.append("file", file)
  return request(`/patients/${encodeURIComponent(patientId)}/genome`, {
    method: "POST",
    body: form,
    timeoutMs: 120_000,
  })
}

export async function uploadPatientWearable(patientId: string, file: File) {
  const form = new FormData()
  form.append("file", file)
  return request(`/patients/${encodeURIComponent(patientId)}/wearable`, {
    method: "POST",
    body: form,
  })
}

export async function uploadPatientGlucose(patientId: string, file: File) {
  const form = new FormData()
  form.append("file", file)
  return request(`/patients/${encodeURIComponent(patientId)}/glucose`, {
    method: "POST",
    body: form,
  })
}

export async function uploadPatientIntakeFile(patientId: string, file: File) {
  const form = new FormData()
  form.append("file", file)
  return request(`/patients/${encodeURIComponent(patientId)}/intake-file`, {
    method: "POST",
    body: form,
  })
}

export async function getSafetyFlags(patientId: string): Promise<SafetyFlag[]> {
  return request(`/safety/${encodeURIComponent(patientId)}`)
}

export async function getIntake(patientId: string): Promise<{
  patient_id: string
  intake?: PatientIntake
  medications_flat?: string[]
  error?: string
}> {
  return request(`/intake/${encodeURIComponent(patientId)}`)
}

export async function putIntake(
  patientId: string,
  intake: PatientIntake
): Promise<{ saved?: boolean; intake?: PatientIntake; error?: string }> {
  return request(`/intake/${encodeURIComponent(patientId)}`, {
    method: "PUT",
    body: JSON.stringify(intake),
  })
}

export async function getWearable(patientId: string): Promise<Record<string, unknown>> {
  return request(`/wearable/${encodeURIComponent(patientId)}`)
}

export async function getGlucose(patientId: string): Promise<Record<string, unknown>> {
  return request(`/glucose/${encodeURIComponent(patientId)}`)
}

export async function deleteAgentBrief(patientId: string): Promise<{ deleted: string }> {
  return request(`/agent_brief/${encodeURIComponent(patientId)}`, { method: "DELETE" })
}

export async function deleteAllAgentBriefs(): Promise<{
  deleted_briefs: number
  deleted_context_files: number
}> {
  return request("/agent_briefs", { method: "DELETE" })
}

export async function getAgentBrief(
  patientId: string,
  opts?: { refresh?: boolean; cacheOnly?: boolean }
): Promise<AgentBrief> {
  const params = new URLSearchParams()
  if (opts?.refresh) params.set("refresh", "true")
  if (opts?.cacheOnly) params.set("cache_only", "true")
  const qs = params.toString()
  return request(`/agent_brief/${encodeURIComponent(patientId)}${qs ? `?${qs}` : ""}`, {
    timeoutMs: opts?.refresh ? BRIEF_TIMEOUT_MS : 30_000,
  })
}

export async function streamAgentBrief(
  patientId: string,
  opts: {
    refresh?: boolean
    onStep?: (step: TraceStep) => void
    onComplete?: (brief: AgentBrief) => void
    onError?: (message: string) => void
    signal?: AbortSignal
  }
): Promise<void> {
  const params = new URLSearchParams()
  if (opts.refresh) params.set("refresh", "true")
  const qs = params.toString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BRIEF_TIMEOUT_MS)
  const signal = opts.signal
    ? (() => {
        opts.signal!.addEventListener("abort", () => controller.abort())
        return controller.signal
      })()
    : controller.signal

  try {
    const res = await fetch(
      `${API_BASE}/agent_brief/${encodeURIComponent(patientId)}/stream${qs ? `?${qs}` : ""}`,
      { signal }
    )
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(
        typeof data === "object" && data && "detail" in data
          ? String((data as { detail: unknown }).detail)
          : `Stream failed (${res.status})`
      )
    }
    const reader = res.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split("\n\n")
      buffer = chunks.pop() || ""
      for (const chunk of chunks) {
        const line = chunk.split("\n").find((l) => l.startsWith("data: "))
        if (!line) continue
        const raw = line.slice(6).trim()
        if (!raw) continue
        let data: {
          event?: string
          step?: TraceStep
          brief?: AgentBrief
          message?: string
        }
        try {
          data = JSON.parse(raw)
        } catch {
          if (raw.includes('"event":"complete"') || raw.includes('"event": "complete"')) {
            opts.onError?.("Brief response was truncated — try again or use a cached brief.")
          }
          continue
        }
        if (data.event === "step" && data.step) opts.onStep?.(data.step)
        if (data.event === "complete") {
          if (data.brief) opts.onComplete?.(data.brief)
          else opts.onError?.("Brief finished but response was empty.")
        }
        if (data.event === "error" && data.message) opts.onError?.(data.message)
      }
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function uploadGenome(file: File): Promise<{
  patient_id: string
  snps: Record<string, unknown>
}> {
  const form = new FormData()
  form.append("file", file)
  return request("/upload", {
    method: "POST",
    body: form,
    timeoutMs: 120_000,
  })
}
