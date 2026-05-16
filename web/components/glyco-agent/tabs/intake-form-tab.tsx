"use client"

import { useEffect, useState } from "react"
import { Plus, X, Check, Loader2 } from "lucide-react"
import { getIntake, putIntake } from "@/lib/api"
import {
  COMORBIDITY_OPTIONS,
  emptyIntake,
  FAMILY_HISTORY_OPTIONS,
  GOAL_OPTIONS,
  SIDE_EFFECT_OPTIONS,
} from "@/lib/intake-defaults"
import type { PatientIntake } from "@/lib/types"

interface IntakeFormTabProps {
  patientId: string
  refreshKey?: number
  onSaved?: () => void
  onSaveAndRerun?: () => void
}

export default function IntakeFormTab({
  patientId,
  refreshKey = 0,
  onSaved,
  onSaveAndRerun,
}: IntakeFormTabProps) {
  const [intake, setIntake] = useState<PatientIntake>(() => emptyIntake(patientId))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await getIntake(patientId)
        if (cancelled) return
        if (res.error) {
          setError(res.error)
          setIntake(emptyIntake(patientId))
        } else if (res.intake) {
          setIntake({ ...emptyIntake(patientId), ...res.intake, patientId })
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load intake")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [patientId, refreshKey])

  const medications = intake.medications

  const toggleSelection = (item: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(item) ? list.filter((i) => i !== item) : [...list, item])
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMessage(null)
    setError(null)
    try {
      const res = await putIntake(patientId, intake)
      if (res.error) throw new Error(res.error)
      setSaveMessage("Intake saved — medications synced for safety checks and brief.")
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const Checkbox = ({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-md border text-left text-sm transition-all ${
        checked ? "bg-[#F9F8FC] border-[#5B3FD4]" : "bg-white border-[#E8E6F0] hover:border-[#C4C1D4]"
      }`}
    >
      <div
        className={`w-5 h-5 rounded flex items-center justify-center ${
          checked ? "bg-[#5B3FD4]" : "border-2 border-[#E8E6F0]"
        }`}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <span className={checked ? "text-[#0D0B14]" : "text-[#6B6778]"}>{label}</span>
    </button>
  )

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#9895A8] py-12 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading intake…
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8]">Intake Form</p>
        <p className="text-[13px] text-[#6B6778] mt-1">
          Fill manually or upload JSON on the Setup tab.
        </p>
      </div>

      {error && (
        <div className="border-l-[3px] border-l-[#C0392B] border border-[#E8E6F0] rounded-md p-3 text-[13px] text-[#C0392B]">
          {error}
        </div>
      )}
      {saveMessage && (
        <div className="border-l-[3px] border-l-[#1A9E6E] border border-[#E8E6F0] rounded-md p-3 text-[13px] text-[#1A9E6E]">
          {saveMessage}
        </div>
      )}

      <section className="border border-[#E8E6F0] rounded-lg bg-white p-5">
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8] mb-4">Current Medications</p>
        <div className="space-y-3">
          {medications.map((med) => (
            <div key={med.id} className="flex items-center gap-3">
              <input
                type="text"
                value={med.name}
                onChange={(e) =>
                  setIntake({
                    ...intake,
                    medications: medications.map((m) =>
                      m.id === med.id ? { ...m, name: e.target.value } : m
                    ),
                  })
                }
                placeholder="Drug name"
                className="flex-1 px-3 py-2.5 border border-[#E8E6F0] rounded-md text-[14px] focus:outline-none focus:border-[#5B3FD4]"
              />
              <input
                type="text"
                value={med.dose}
                onChange={(e) =>
                  setIntake({
                    ...intake,
                    medications: medications.map((m) =>
                      m.id === med.id ? { ...m, dose: e.target.value } : m
                    ),
                  })
                }
                placeholder="Dose"
                className="w-24 px-3 py-2.5 border border-[#E8E6F0] rounded-md text-[14px] focus:outline-none focus:border-[#5B3FD4]"
              />
              <input
                type="text"
                value={med.frequency}
                onChange={(e) =>
                  setIntake({
                    ...intake,
                    medications: medications.map((m) =>
                      m.id === med.id ? { ...m, frequency: e.target.value } : m
                    ),
                  })
                }
                placeholder="Frequency"
                className="w-28 px-3 py-2.5 border border-[#E8E6F0] rounded-md text-[14px] focus:outline-none focus:border-[#5B3FD4]"
              />
              <button
                type="button"
                onClick={() =>
                  setIntake({ ...intake, medications: medications.filter((m) => m.id !== med.id) })
                }
                className="p-2 text-[#9895A8] hover:text-[#C0392B]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setIntake({
                ...intake,
                medications: [
                  ...medications,
                  { id: Date.now().toString(), name: "", dose: "", frequency: "" },
                ],
              })
            }
            className="border border-[#5B3FD4] text-[#5B3FD4] rounded-md px-3 py-1.5 text-[13px] font-medium hover:bg-[#5B3FD4] hover:text-white flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add medication
          </button>
        </div>
      </section>

      <section className="border border-[#E8E6F0] rounded-lg bg-white p-5">
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8] mb-4">Vitals</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {(
            [
              ["weight", "Weight"],
              ["height", "Height"],
              ["bloodPressure", "Blood Pressure"],
              ["fastingGlucose", "Fasting Glucose"],
              ["hba1c", "HbA1c"],
              ["egfr", "eGFR"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="block text-[11px] font-semibold uppercase text-[#9895A8] mb-2">{label}</label>
              <input
                type="text"
                value={intake.vitals[key]}
                onChange={(e) =>
                  setIntake({ ...intake, vitals: { ...intake.vitals, [key]: e.target.value } })
                }
                className="w-full px-3 py-2.5 border border-[#E8E6F0] rounded-md text-[14px] focus:outline-none focus:border-[#5B3FD4]"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="border border-[#E8E6F0] rounded-lg bg-white p-5">
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8] mb-4">Patient Goals</p>
        <div className="flex flex-wrap gap-2">
          {GOAL_OPTIONS.map((goal) => (
            <button
              key={goal}
              type="button"
              onClick={() => toggleSelection(goal, intake.goals, (g) => setIntake({ ...intake, goals: g }))}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium border ${
                intake.goals.includes(goal)
                  ? "bg-[#5B3FD4] text-white border-[#5B3FD4]"
                  : "bg-white text-[#6B6778] border-[#E8E6F0]"
              }`}
            >
              {goal}
            </button>
          ))}
        </div>
      </section>

      <section className="border border-[#E8E6F0] rounded-lg bg-white p-5">
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8] mb-4">Side Effects</p>
        <div className="grid grid-cols-2 gap-2">
          {SIDE_EFFECT_OPTIONS.map((effect) => (
            <Checkbox
              key={effect}
              checked={intake.sideEffects.includes(effect)}
              label={effect}
              onClick={() =>
                toggleSelection(effect, intake.sideEffects, (s) => setIntake({ ...intake, sideEffects: s }))
              }
            />
          ))}
        </div>
      </section>

      <section className="border border-[#E8E6F0] rounded-lg bg-white p-5">
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8] mb-4">Lifestyle</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#9895A8] mb-2">Activity</label>
            <select
              value={intake.lifestyle.activityLevel}
              onChange={(e) =>
                setIntake({ ...intake, lifestyle: { ...intake.lifestyle, activityLevel: e.target.value } })
              }
              className="w-full px-3 py-2.5 border border-[#E8E6F0] rounded-md text-[14px]"
            >
              {["Sedentary", "Light", "Moderate", "Very Active"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#9895A8] mb-2">Diet</label>
            <select
              value={intake.lifestyle.diet}
              onChange={(e) => setIntake({ ...intake, lifestyle: { ...intake.lifestyle, diet: e.target.value } })}
              className="w-full px-3 py-2.5 border border-[#E8E6F0] rounded-md text-[14px]"
            >
              {["Standard", "Low-carb", "Mediterranean", "Vegetarian"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#9895A8] mb-2">Alcohol</label>
            <select
              value={intake.lifestyle.alcohol}
              onChange={(e) =>
                setIntake({ ...intake, lifestyle: { ...intake.lifestyle, alcohol: e.target.value } })
              }
              className="w-full px-3 py-2.5 border border-[#E8E6F0] rounded-md text-[14px]"
            >
              {["None", "Occasional", "Regular", "Daily"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-[#9895A8] mb-2">Smoking</label>
            <select
              value={intake.lifestyle.smoking}
              onChange={(e) =>
                setIntake({ ...intake, lifestyle: { ...intake.lifestyle, smoking: e.target.value } })
              }
              className="w-full px-3 py-2.5 border border-[#E8E6F0] rounded-md text-[14px]"
            >
              {["Never", "Former", "Current"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase text-[#9895A8] mb-2">
            Sleep Quality: <span className="text-[#5B3FD4]">{intake.lifestyle.sleepQuality}/10</span>
          </label>
          <input
            type="range"
            min={1}
            max={10}
            value={intake.lifestyle.sleepQuality}
            onChange={(e) =>
              setIntake({
                ...intake,
                lifestyle: { ...intake.lifestyle, sleepQuality: parseInt(e.target.value, 10) },
              })
            }
            className="w-full accent-[#5B3FD4]"
          />
        </div>
      </section>

      <section className="border border-[#E8E6F0] rounded-lg bg-white p-5">
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8] mb-4">Comorbidities</p>
        <div className="grid grid-cols-2 gap-2">
          {COMORBIDITY_OPTIONS.map((c) => (
            <Checkbox
              key={c}
              checked={intake.comorbidities.includes(c)}
              label={c}
              onClick={() =>
                toggleSelection(c, intake.comorbidities, (v) => setIntake({ ...intake, comorbidities: v }))
              }
            />
          ))}
        </div>
      </section>

      <section className="border border-[#E8E6F0] rounded-lg bg-white p-5">
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8] mb-4">Family History</p>
        <div className="grid grid-cols-2 gap-2">
          {FAMILY_HISTORY_OPTIONS.map((h) => (
            <Checkbox
              key={h}
              checked={intake.familyHistory.includes(h)}
              label={h}
              onClick={() =>
                toggleSelection(h, intake.familyHistory, (v) => setIntake({ ...intake, familyHistory: v }))
              }
            />
          ))}
        </div>
      </section>

      <section className="border border-[#E8E6F0] rounded-lg bg-white p-5">
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8] mb-4">Clinician Notes</p>
        <textarea
          rows={3}
          value={intake.clinicianNotes}
          onChange={(e) => setIntake({ ...intake, clinicianNotes: e.target.value })}
          className="w-full px-3 py-2.5 border border-[#E8E6F0] rounded-md text-[14px] resize-none focus:outline-none focus:border-[#5B3FD4]"
        />
      </section>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-3 border border-[#5B3FD4] text-[#5B3FD4] rounded-lg text-[14px] font-medium hover:bg-[#F9F8FC] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save intake
        </button>
        <button
          type="button"
          onClick={async () => {
            await handleSave()
            onSaveAndRerun?.()
          }}
          disabled={saving}
          className="flex-1 py-3 bg-[#5B3FD4] text-white rounded-lg text-[14px] font-medium hover:bg-[#4A32B0] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          Save &amp; open brief to regenerate
        </button>
      </div>
    </div>
  )
}
