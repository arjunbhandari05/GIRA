"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import ViewToggle from "@/components/brief/ViewToggle"
import SafetyBanner from "@/components/brief/SafetyBanner"
import PatientSafetyBanner from "@/components/brief/PatientSafetyBanner"
import PatientBriefReveal from "@/components/brief/PatientBriefReveal"
import ClinicianView from "@/components/brief/ClinicianView"
import PatientView from "@/components/brief/PatientView"
import { getAgentBrief, getIntake, listPatients } from "@/lib/api"
import { mapAgentBrief } from "@/lib/brief-mappers"
import type { AgentBrief as ApiBrief } from "@/lib/types"
import type { AgentBrief, PatientMeta } from "@/types/brief"

function parseHba1c(hba1c?: string): number | undefined {
  if (!hba1c) return undefined
  const n = parseFloat(String(hba1c).replace("%", ""))
  return Number.isFinite(n) ? n : undefined
}

export interface BriefInferencePanelProps {
  patientId: string
  audience: "clinician" | "patient"
  initialBrief?: ApiBrief | null
  embedded?: boolean
  initialView?: "clinician" | "patient"
  showViewToggle?: boolean
  /** When true, only loads while isActive (avoids preloading stale briefs on mount). */
  loadWhenActive?: boolean
  isActive?: boolean
}

export default function BriefInferencePanel({
  patientId,
  audience,
  initialBrief = null,
  embedded = false,
  initialView,
  showViewToggle,
  loadWhenActive = false,
  isActive = true,
}: BriefInferencePanelProps) {
  const defaultView = initialView ?? (audience === "patient" ? "patient" : "clinician")
  const toggleVisible = showViewToggle ?? audience === "clinician"
  const mayLoad = loadWhenActive ? isActive : true

  const [view, setView] = useState<"clinician" | "patient">(defaultView)
  const [apiBrief, setApiBrief] = useState<ApiBrief | null>(null)
  const [brief, setBrief] = useState<AgentBrief | null>(null)
  const [patient, setPatient] = useState<PatientMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setView(defaultView)
  }, [defaultView, patientId])

  const hydrate = useCallback(
    async (data: ApiBrief, snpProfile?: Record<string, { genotype?: string }>) => {
      setApiBrief(data)
      setBrief(mapAgentBrief(data, snpProfile))
    },
    []
  )

  const loadPatientMeta = useCallback(async () => {
    const [rows, intakeRes] = await Promise.all([
      listPatients(),
      getIntake(patientId).catch(() => null),
    ])
    const row = rows.find((r) => r.patient_id === patientId)
    const snpProfile = (row?.snp_profile_json || {}) as Record<string, { genotype?: string }>
    const vitals = intakeRes?.intake?.vitals
    setPatient({
      id: patientId,
      name: row?.name || patientId,
      age: 0,
      sex: "—",
      hba1c_pct: parseHba1c(vitals?.hba1c),
    })
    return snpProfile
  }, [patientId])

  const fetchBrief = useCallback(async () => {
    if (initialBrief) {
      return initialBrief
    }
    const snpProfile = await loadPatientMeta()
    const data = await getAgentBrief(patientId, { cacheOnly: true })
    if (data.error === "not_cached") {
      return null
    }
    if (data.error) {
      throw new Error(data.error)
    }
    await hydrate(data, snpProfile)
    return data
  }, [patientId, hydrate, loadPatientMeta, initialBrief])

  useEffect(() => {
    if (!mayLoad) {
      setLoading(false)
      setError(null)
      setBrief(null)
      setApiBrief(null)
      return
    }

    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        if (initialBrief) {
          const snpProfile = await loadPatientMeta()
          if (!cancelled) await hydrate(initialBrief, snpProfile)
          return
        }
        const hit = await fetchBrief()
        if (cancelled) return
        if (!hit) {
          setError("not_ready")
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load brief")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [mayLoad, fetchBrief, patientId, initialBrief, hydrate, loadPatientMeta])

  const shell = embedded ? "space-y-6" : "mx-auto min-h-0 max-w-4xl space-y-6"

  if (!mayLoad) {
    return (
      <div className="rounded-lg border border-[#E8E6F0] bg-[#FAFAFC] p-6 text-center text-sm text-[#6B6778]">
        Run the GIRA agent on the Agent tab first. Results appear here after the run completes.
      </div>
    )
  }

  if (loading && !brief) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 py-16 ${embedded ? "" : "min-h-[40vh]"}`} role="status">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading brief from this session…</p>
      </div>
    )
  }

  if (error === "not_ready" && !brief) {
    return (
      <div className="rounded-lg border border-[#E8E6F0] bg-[#FAFAFC] p-6 text-center">
        <p className="text-sm text-[#6B6778]">
          {audience === "patient"
            ? "Your care team has not published a brief yet. Check back after your clinician runs the GIRA agent."
            : "No brief for this session yet. Run the agent on the Agent tab."}
        </p>
      </div>
    )
  }

  if (error && !brief) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <p className="font-medium text-destructive">{error}</p>
      </div>
    )
  }

  if (!brief || !patient) {
    return null
  }

  const cached = apiBrief?.cached || String(apiBrief?._backend || "").includes("cache")
  const backendLabel = cached ? "From agent run" : "Live"
  const activeView = toggleVisible ? view : defaultView

  return (
    <div className={shell}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={embedded ? "text-xl font-semibold tracking-tight" : "text-2xl font-semibold tracking-tight"}>
            {audience === "patient" ? "Your medication brief" : patient.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {patient.id}
            {apiBrief?.generated_at ? ` · ${new Date(apiBrief.generated_at).toLocaleString()}` : ""}
          </p>
          <Badge variant="secondary" className="mt-2">
            {backendLabel}
            {apiBrief?._backend ? ` · ${apiBrief._backend}` : ""}
          </Badge>
        </div>
        {toggleVisible ? <ViewToggle view={view} onChange={setView} /> : null}
      </header>

      {activeView === "clinician" ? (
        <>
          <SafetyBanner flags={brief.safety_flags} />
          <ClinicianView brief={brief} patient={patient} />
        </>
      ) : (
        <>
          <PatientBriefReveal index={0}>
            <PatientSafetyBanner flags={brief.safety_flags} />
          </PatientBriefReveal>
          <PatientView
            brief={brief}
            patient={patient}
            apiRecommendation={apiBrief?.recommendation}
            staggerStart={1}
          />
        </>
      )}
    </div>
  )
}
