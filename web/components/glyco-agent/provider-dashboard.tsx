"use client"

import { useState } from "react"
import { Search, ChevronRight, Clock, LogOut, Plus, RefreshCw, AlertCircle, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { Patient } from "@/lib/types"
import { createPatient } from "@/lib/api"

interface ProviderDashboardProps {
  patients: Patient[]
  loading?: boolean
  error?: string | null
  onRefresh: () => void
  onPatientSelect: (patient: Patient) => void
  onPatientCreated: (patientId: string) => void
  onSignOut: () => void
}

export default function ProviderDashboard({
  patients,
  loading,
  error,
  onRefresh,
  onPatientSelect,
  onPatientCreated,
  onSignOut,
}: ProviderDashboardProps) {
  const [search, setSearch] = useState("")
  const [showNewPatient, setShowNewPatient] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const filtered = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      setCreateError("Enter a patient name")
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const res = await createPatient(name)
      if (res.error) throw new Error(res.error)
      setShowNewPatient(false)
      setNewName("")
      onPatientCreated(res.patient_id)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not create patient")
    } finally {
      setCreating(false)
    }
  }

  const getStatusConfig = (status: Patient["status"]) => {
    switch (status) {
      case "ready":
        return {
          borderClass: "border border-[#E8E6F0] rounded-lg",
          hoverClass: "hover:bg-[#FAFAFA] hover:border-[#C4C1D4]",
          avatarBg: "bg-[#1A9E6E]",
          dotColor: "#1A9E6E",
          textColor: "text-[#1A9E6E]",
        }
      case "review":
        return {
          borderClass: "border-l-[3px] border-l-[#B45309] border border-[#E8E6F0] rounded-lg",
          hoverClass: "hover:bg-[#FAFAFA]",
          avatarBg: "bg-[#B45309]",
          dotColor: "#B45309",
          textColor: "text-[#B45309]",
        }
      case "flag":
        return {
          borderClass: "border-l-[3px] border-l-[#C0392B] border border-[#E8E6F0] rounded-lg",
          hoverClass: "hover:bg-[#FAFAFA]",
          avatarBg: "bg-[#C0392B]",
          dotColor: "#C0392B",
          textColor: "text-[#C0392B]",
        }
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-[#E8E6F0] sticky top-0 z-10">
        <motion.div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold tracking-tight text-[#0D0B14]">GIRA</span>
            <span className="text-sm font-medium text-[#5B3FD4]">Rx</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNewPatient(true)}
              className="flex items-center gap-2 px-3 py-2 bg-[#5B3FD4] text-white rounded-md text-[13px] font-medium hover:bg-[#4A32B0] transition-colors"
            >
              <Plus className="w-4 h-4" />
              New patient
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="p-2.5 hover:bg-[#F9F8FC] rounded-lg transition-colors"
              title="Refresh roster"
            >
              <RefreshCw className={`w-5 h-5 text-[#9895A8] ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onSignOut} className="p-2.5 hover:bg-[#F9F8FC] rounded-lg transition-colors">
              <LogOut className="w-5 h-5 text-[#9895A8]" />
            </button>
          </div>
        </motion.div>
      </header>

      <AnimatePresence>
        {showNewPatient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
            onClick={() => !creating && setShowNewPatient(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-lg border border-[#E8E6F0] p-6 w-full max-w-md shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div className="flex items-center justify-between mb-4">
                <h2 className="text-[18px] font-semibold text-[#0D0B14]">New patient</h2>
                <button
                  type="button"
                  onClick={() => setShowNewPatient(false)}
                  className="p-1 hover:bg-[#F9F8FC] rounded"
                >
                  <X className="w-5 h-5 text-[#9895A8]" />
                </button>
              </motion.div>
              <p className="text-[13px] text-[#6B6778] mb-4">
                Creates an empty workspace. You will upload genome, metrics, and intake for this patient next.
              </p>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Patient full name"
                className="w-full px-4 py-3 border border-[#E8E6F0] rounded-md text-[14px] focus:outline-none focus:border-[#5B3FD4] mb-2"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              {createError && <p className="text-[13px] text-[#C0392B] mb-3">{createError}</p>}
              <button
                type="button"
                disabled={creating}
                onClick={handleCreate}
                className="w-full py-3 bg-[#5B3FD4] text-white rounded-lg text-[14px] font-medium hover:bg-[#4A32B0] disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create & open workspace"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <motion.div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8] mb-1">
              UCSF Diabetes Clinic
            </p>
            <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-[#0D0B14]">Your Patients</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#1A9E6E]" />
            <span className="text-[13px] text-[#0D0B14]">
              {loading ? "Loading…" : `${patients.length} patient${patients.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </motion.div>

        {error && (
          <div className="mb-6 border-l-[3px] border-l-[#C0392B] border border-[#E8E6F0] rounded-md p-4 flex gap-3 text-[13px] text-[#6B6778]">
            <AlertCircle className="w-5 h-5 text-[#C0392B] shrink-0" />
            <div>
              <p>{error}</p>
              <p className="text-[12px] text-[#9895A8] mt-1">
                Ensure the API is running: <code className="font-mono">uvicorn server.main:app --port 8000</code>
              </p>
            </div>
          </div>
        )}

        <motion.div
          className="relative mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9895A8]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patients by name or ID..."
            className="w-full pl-12 pr-4 py-3 bg-white border border-[#E8E6F0] rounded-md text-[#0D0B14] placeholder:text-[#9895A8] focus:outline-none focus:border-[#5B3FD4] transition-colors"
          />
        </motion.div>

        <div className="space-y-3">
          {!loading && filtered.length === 0 && (
            <p className="text-center text-[13px] text-[#9895A8] py-12">
              No patients yet. Click <strong>New patient</strong> to add someone, then upload their data on the Setup
              tab.
            </p>
          )}
          {filtered.map((patient, index) => {
            const config = getStatusConfig(patient.status)
            return (
              <motion.button
                key={patient.id}
                onClick={() => onPatientSelect(patient)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                className={`w-full p-5 bg-white ${config.borderClass} ${config.hoverClass} text-left group transition-colors duration-200`}
              >
                <div className="flex items-center gap-5">
                  <motion.div
                    className={`w-10 h-10 rounded-full ${config.avatarBg} flex items-center justify-center text-white font-medium text-sm`}
                  >
                    {patient.initials}
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-semibold text-[15px] text-[#0D0B14]">{patient.name}</span>
                      <span className={`text-[12px] ${config.textColor}`}>
                        <span style={{ color: config.dotColor }}>●</span> {patient.badgeText}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[13px] text-[#6B6778]">
                      <span className="font-mono text-[12px]">{patient.id}</span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        {patient.appointment}
                      </span>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-4">
                    <span className={`text-[13px] font-medium ${config.textColor}`}>{patient.statusText}</span>
                    <ChevronRight className="w-5 h-5 text-[#C4C1D4] group-hover:text-[#5B3FD4] transition-colors" />
                  </div>
                </div>
              </motion.button>
            )
          })}
        </div>

        <p className="text-[11px] text-[#C4C1D4] text-center mt-12">
          All patients in the roster · upload data per patient on Setup
        </p>
      </main>
    </div>
  )
}
