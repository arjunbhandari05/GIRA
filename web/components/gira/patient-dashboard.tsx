"use client"

import { useEffect, useState } from "react"
import {
  Calendar,
  LogOut,
  Loader2,
  Clock,
  Pill,
  Activity,
  FolderOpen,
} from "lucide-react"
import {
  getAgentBrief,
  getIntake,
  getPatientAssets,
  getSafetyFlags,
  listPatients,
} from "@/lib/api"
import { formatAppointment } from "@/lib/mappers"
import {
  DEFAULT_HEALTH_MARKERS,
  estimateMonthlyCost,
  healthMarkersFromBrief,
  intakeMedications,
  plainMedicationChangeSentence,
} from "@/lib/patient-plain"
import PatientSetupTab from "./tabs/patient-setup-tab"
import PatientMetricsTab from "./tabs/patient-metrics-tab"

interface PatientDashboardProps {
  patientId: string
  onSignOut: () => void
}

type Tab = "home" | "setup" | "metrics"

export default function PatientDashboard({ patientId, onSignOut }: PatientDashboardProps) {
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("Patient")
  const [appointment, setAppointment] = useState("")
  const [hasBrief, setHasBrief] = useState(false)
  const [safetyFlags, setSafetyFlags] = useState(0)
  const [meds, setMeds] = useState<{ name: string; dose: string; frequency: string }[]>([])
  const [changeSentence, setChangeSentence] = useState<string | null>(null)
  const [switchDrug, setSwitchDrug] = useState<string | null>(null)
  const [switchCost, setSwitchCost] = useState<number | null>(null)
  const [markers, setMarkers] = useState<string[]>(DEFAULT_HEALTH_MARKERS)
  const [trialHint, setTrialHint] = useState(false)
  const [tab, setTab] = useState<Tab>("home")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [rows, flags, briefRes, intakeRes] = await Promise.all([
          listPatients(),
          getSafetyFlags(patientId),
          getAgentBrief(patientId, { cacheOnly: true }).catch(() => null),
          getIntake(patientId).catch(() => null),
        ])
        if (cancelled) return
        const row = rows.find((r) => r.patient_id === patientId)
        setName(row?.name || patientId)
        setAppointment(formatAppointment(row?.next_appointment_iso, patientId))
        setSafetyFlags(flags.length)

        const intakeMeds = intakeMedications(intakeRes?.intake)
        setMeds(intakeMeds)

        const briefOk = Boolean(
          briefRes && !briefRes.error && (briefRes.cached || briefRes.snp_summary?.length)
        )
        setHasBrief(briefOk)

        if (briefOk && briefRes) {
          setChangeSentence(plainMedicationChangeSentence(briefRes))
          const start = briefRes.recommendation?.start
          if (start) {
            setSwitchDrug(start)
            setSwitchCost(estimateMonthlyCost(start))
          }
          setMarkers(healthMarkersFromBrief(briefRes))
          setTrialHint((briefRes.trial_matches?.length ?? 0) > 0)
        }
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
        <nav className="max-w-3xl mx-auto px-6 flex gap-1 border-t border-[#F0EEF5]">
          {(
            [
              { id: "home" as Tab, label: "Home", icon: Calendar },
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
        {tab === "setup" && <PatientSetupTab patientId={patientId} />}
        {tab === "metrics" && <PatientMetricsTab patientId={patientId} />}

        {tab === "home" && !hasBrief && (
          <>
            <div>
              <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#0D0B14]">
                Hello, {firstName}
              </h1>
              <p className="text-[15px] text-[#6B6778] mt-1">
                {appointment ? `Next visit: ${appointment}` : "Your appointment will appear here"}
              </p>
            </div>

            <div className="border border-[#E8E6F0] rounded-lg p-5 flex gap-4 bg-[#FAFAFC]">
              <Calendar className="w-5 h-5 text-[#5B3FD4] shrink-0" />
              <div>
                <p className="font-semibold text-[15px]">{appointment || "Upcoming appointment"}</p>
                <p className="text-[13px] text-[#9895A8]">Your clinic visit is on the calendar</p>
              </div>
            </div>

            <div className="border-l-[3px] border-l-[#5B3FD4] border border-[#E8E6F0] rounded-lg p-4 flex gap-3">
              <Clock className="w-5 h-5 text-[#5B3FD4] shrink-0" />
              <p className="text-[14px] text-[#6B6778]">
                Waiting for your care team to generate your brief. No clinical details are shown until
                then.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setTab("setup")}
              className="text-[13px] text-[#5B3FD4] font-medium"
            >
              Go to Setup →
            </button>
          </>
        )}

        {tab === "home" && hasBrief && (
          <>
            <div>
              <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#0D0B14]">
                Hello, {firstName}
              </h1>
              <p className="text-[15px] text-[#6B6778] mt-1">
                {appointment ? `Next visit: ${appointment}` : "Your summary is ready"}
              </p>
            </div>

            {safetyFlags > 0 && (
              <div className="border border-[#F59E0B] bg-[#FFFBEB] rounded-lg p-4 text-[14px] text-[#6B6778]">
                Your care team has flagged something about your current medications. This will be
                discussed at your appointment.
              </div>
            )}

            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase text-[#9895A8]">Your medications</p>
              {meds.length === 0 ? (
                <p className="text-[14px] text-[#9895A8]">Medication list will appear from your chart.</p>
              ) : (
                meds.map((m) => {
                  const cost = estimateMonthlyCost(m.name)
                  return (
                    <div key={m.name} className="border border-[#E8E6F0] rounded-lg p-5 bg-white">
                      <p className="text-[22px] font-semibold text-[#0D0B14]">{m.name}</p>
                      <p className="text-[14px] text-[#6B6778] mt-1">
                        {m.dose} · {m.frequency}
                      </p>
                      {cost != null && (
                        <p className="text-[13px] text-[#9895A8] mt-2">About ${cost}/month</p>
                      )}
                    </div>
                  )
                })
              )}
            </section>

            {changeSentence && (
              <div className="border-l-[3px] border-l-[#5B3FD4] border border-[#E8E6F0] rounded-lg p-4">
                <p className="text-[14px] text-[#0D0B14] font-medium">{changeSentence}</p>
              </div>
            )}

            {switchDrug && (
              <div className="border border-[#E8E6F0] rounded-lg p-5 bg-[#FAFAFC]">
                <p className="text-[11px] font-semibold uppercase text-[#9895A8] mb-2">
                  A change may be coming
                </p>
                <p className="text-[18px] font-semibold text-[#0D0B14]">{switchDrug}</p>
                {switchCost != null && (
                  <p className="text-[13px] text-[#6B6778] mt-1">About ${switchCost}/month</p>
                )}
                <p className="text-[13px] text-[#9895A8] mt-3">
                  Your doctor will discuss this at your appointment.
                </p>
              </div>
            )}

            <section>
              <p className="text-[11px] font-semibold uppercase text-[#9895A8] mb-3">
                Health markers to watch
              </p>
              <ul className="space-y-2">
                {markers.map((m) => (
                  <li key={m} className="flex items-center gap-2 text-[15px] text-[#0D0B14]">
                    <Pill className="w-4 h-4 text-[#1A9E6E]" />
                    {m}
                  </li>
                ))}
              </ul>
            </section>

            {trialHint && (
              <div className="border-l-[3px] border-l-[#5B3FD4] border border-[#E8E6F0] rounded-lg p-4 text-[14px] text-[#6B6778]">
                A research study near you may be a fit. Ask your doctor.
              </div>
            )}
          </>
        )}

        <p className="text-[11px] text-[#C4C1D4] text-center pt-4">
          GIRA · Always consult your doctor before changing medications.
        </p>
      </main>
    </div>
  )
}
