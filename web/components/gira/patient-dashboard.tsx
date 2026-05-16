"use client"

import { useEffect, useState } from "react"
import {
  Activity,
  Calendar,
  FileText,
  FolderOpen,
  Loader2,
  LogOut,
} from "lucide-react"
import BriefInferencePanel from "@/components/brief/BriefInferencePanel"
import {
  getAgentBrief,
  getSafetyFlags,
  listPatients,
} from "@/lib/api"
import { formatAppointment } from "@/lib/mappers"
import PatientHomeTab from "./patient-home-tab"
import SetupTab from "./tabs/setup-tab"
import PatientMetricsTab from "./tabs/patient-metrics-tab"

interface PatientDashboardProps {
  patientId: string
  onSignOut: () => void
}

type Tab = "home" | "brief" | "setup" | "metrics"

export default function PatientDashboard({ patientId, onSignOut }: PatientDashboardProps) {
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("Patient")
  const [appointment, setAppointment] = useState("")
  const [hasBrief, setHasBrief] = useState(false)
  const [safetyAlert, setSafetyAlert] = useState(false)
  const [tab, setTab] = useState<Tab>("home")
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [rows, flags, briefRes] = await Promise.all([
          listPatients(),
          getSafetyFlags(patientId),
          getAgentBrief(patientId, { cacheOnly: true }).catch(() => null),
        ])
        if (cancelled) return
        const row = rows.find((r) => r.patient_id === patientId)
        setName(row?.name || patientId)
        setAppointment(formatAppointment(row?.next_appointment_iso, patientId))
        setSafetyAlert(flags.length > 0)

        const briefOk = Boolean(
          briefRes && !briefRes.error && (briefRes.cached || briefRes.snp_summary?.length)
        )
        setHasBrief(briefOk)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [patientId])

  const firstName = name.split(" ")[0] || name

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-[#9895A8]">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-[#E8E6F0] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold tracking-tight text-[#0D0B14]">GIRA</span>
            <span className="text-sm font-medium text-[#5B3FD4]">Rx</span>
          </div>
          <button type="button" onClick={onSignOut} className="p-2 hover:bg-[#F9F8FC] rounded-lg">
            <LogOut className="w-5 h-5 text-[#9895A8]" />
          </button>
        </div>
        <nav className="max-w-3xl mx-auto px-6 flex gap-1 border-t border-[#F0EEF5] flex-wrap">
          {(
            [
              { id: "home" as Tab, label: "Home", icon: Calendar },
              ...(hasBrief ? [{ id: "brief" as Tab, label: "Your brief", icon: FileText }] : []),
              { id: "setup" as Tab, label: "Setup", icon: FolderOpen },
              { id: "metrics" as Tab, label: "Live Metrics", icon: Activity },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-[13px] border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#5B3FD4] text-[#0D0B14] font-semibold"
                  : "border-transparent text-[#9895A8]"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {tab === "brief" && hasBrief && (
          <BriefInferencePanel
            patientId={patientId}
            audience="patient"
            embedded
            initialView="patient"
            showViewToggle={false}
            loadWhenActive
            isActive={tab === "brief"}
          />
        )}
        {tab === "setup" && (
          <SetupTab
            patientId={patientId}
            patientName={name}
            audience="patient"
            onDevicesUpdated={() => setMetricsRefreshKey((k) => k + 1)}
          />
        )}
        {tab === "metrics" && (
          <PatientMetricsTab patientId={patientId} refreshKey={metricsRefreshKey} />
        )}

        {tab === "home" && (
          <PatientHomeTab
            patientId={patientId}
            firstName={firstName}
            appointment={appointment}
            hasBrief={hasBrief}
            safetyAlert={safetyAlert}
            onNavigate={setTab}
            metricsRefreshKey={metricsRefreshKey}
          />
        )}

        <p className="text-[11px] text-[#C4C1D4] text-center pt-4">
          GIRA · Always consult your doctor before changing medications.
        </p>
      </main>
    </div>
  )
}
