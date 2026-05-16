"use client"

import { useEffect, useState } from "react"
import { Dna, Heart, Pill, FolderUp, Calendar, AlertCircle, Microscope, LogOut, Loader2 } from "lucide-react"
import { getAgentBrief, getSafetyFlags, listPatients } from "@/lib/api"
import { briefToRecommendations, formatAppointment } from "@/lib/mappers"

interface PatientDashboardProps {
  patientId: string
  onSignOut: () => void
}

export default function PatientDashboard({ patientId, onSignOut }: PatientDashboardProps) {
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("Patient")
  const [appointment, setAppointment] = useState("")
  const [alert, setAlert] = useState<string | null>(null)
  const [insights, setInsights] = useState<{ title: string; body: string; severity: "red" | "amber" }[]>([])
  const [trialMsg, setTrialMsg] = useState<string | null>(null)

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
        const displayName = row?.name || patientId
        setName(displayName)
        setAppointment(formatAppointment(row?.next_appointment_iso, patientId))

        if (flags.length > 0) {
          setAlert(
            "Your care team has pharmacogenomic notes about your medications. Discuss options at your next visit."
          )
        }

        const cards: { title: string; body: string; severity: "red" | "amber" }[] = []
        for (const f of flags) {
          const sev = (f.severity || "").toUpperCase() === "CRITICAL" ? "red" : "amber"
          cards.push({
            title: `About ${f.drug || f.gene}`,
            body: `${f.flag} ${f.action}`,
            severity: sev as "red" | "amber",
          })
        }
        if (briefRes && !briefRes.error) {
          for (const rec of briefToRecommendations(briefRes)) {
            cards.push({
              title: rec.title,
              body: rec.body,
              severity: rec.type === "discontinue" ? "red" : "amber",
            })
          }
          const trial = briefRes.trial_matches?.[0]
          if (trial?.title) {
            setTrialMsg(
              `${trial.title}${trial.location ? ` · ${trial.location}` : ""}. Ask your clinician if you may qualify.`
            )
          }
        }
        setInsights(cards.slice(0, 4))
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
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#6B6778] hidden sm:block">{name}</span>
            <button onClick={onSignOut} className="p-2 hover:bg-[#F9F8FC] rounded-lg">
              <LogOut className="w-5 h-5 text-[#9895A8]" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#0D0B14]">
            Good morning, {firstName}
          </h1>
          <p className="text-[15px] text-[#6B6778] mt-1">
            {appointment ? `Next visit: ${appointment}` : "No appointment on file"}
          </p>
          <p className="text-[11px] font-mono text-[#9895A8] mt-1">{patientId}</p>
        </div>

        {alert && (
          <div className="border-l-[3px] border-l-[#C0392B] border border-[#E8E6F0] rounded-lg p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-[#C0392B] shrink-0" />
            <p className="text-[14px] text-[#6B6778]">{alert}</p>
          </div>
        )}

        <div className="border-l-[3px] border-l-[#5B3FD4] border border-[#E8E6F0] rounded-lg p-4 flex gap-4">
          <Calendar className="w-5 h-5 text-[#5B3FD4]" />
          <div>
            <p className="font-semibold text-[15px]">{appointment || "Schedule with your clinic"}</p>
            <p className="text-[13px] text-[#9895A8]">Patient portal is UI-only — no backend portal API yet</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Dna, label: "Health Summary", desc: "From cached clinician brief" },
            { icon: Heart, label: "Live Metrics", desc: "WHOOP + CGM (clinician view)" },
            { icon: Pill, label: "Medications", desc: "See intake with your clinician" },
            { icon: FolderUp, label: "Upload Genome", desc: "Ask clinic to upload file" },
          ].map((item) => (
            <div
              key={item.label}
              className="p-5 border border-[#E8E6F0] rounded-lg opacity-80"
              title="Navigation stubs — full flows on provider app"
            >
              <item.icon className="w-5 h-5 mb-3 text-[#5B3FD4]" />
              <p className="font-semibold text-[15px]">{item.label}</p>
              <p className="text-[13px] text-[#9895A8]">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase text-[#9895A8]">What your genetics mean</p>
          {insights.length === 0 ? (
            <p className="text-[13px] text-[#9895A8]">
              No brief cached yet. Your clinician can generate one from the provider dashboard.
            </p>
          ) : (
            insights.map((card, i) => (
              <div
                key={i}
                className={`border-l-[3px] ${
                  card.severity === "red" ? "border-l-[#C0392B]" : "border-l-[#B45309]"
                } border border-[#E8E6F0] rounded-lg p-4`}
              >
                <h3 className="font-semibold text-[14px] mb-2">{card.title}</h3>
                <p className="text-[14px] text-[#6B6778] leading-relaxed">{card.body}</p>
              </div>
            ))
          )}
        </div>

        {trialMsg && (
          <div className="border-l-[3px] border-l-[#5B3FD4] border border-[#E8E6F0] rounded-lg p-4 flex gap-3">
            <Microscope className="w-5 h-5 text-[#5B3FD4] shrink-0" />
            <p className="text-[14px] text-[#6B6778]">{trialMsg}</p>
          </div>
        )}

        <p className="text-[11px] text-[#C4C1D4] text-center pt-4">
          GIRA · Always consult your doctor before changing medications.
        </p>
      </main>
    </div>
  )
}
