"use client"

import { useState } from "react"
import { Stethoscope, User, ArrowRight, Loader2, ChevronLeft } from "lucide-react"
import { motion } from "framer-motion"
import GiraLogo from "./gira-logo"
import { listPatients } from "@/lib/api"

interface LoginProps {
  onLogin: (role: "provider" | "patient", patientId?: string) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [patientPicker, setPatientPicker] = useState(false)
  const [patients, setPatients] = useState<{ patient_id: string; name?: string }[]>([])
  const [loadingPatients, setLoadingPatients] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)

  const openPatientPicker = async () => {
    setPatientPicker(true)
    setPickerError(null)
    setLoadingPatients(true)
    try {
      const rows = await listPatients()
      setPatients(rows)
    } catch {
      setPickerError("Could not load patients. Is the API running?")
      setPatients([])
    } finally {
      setLoadingPatients(false)
    }
  }

  return (
    <motion.div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
      <div className="w-full max-w-md">
        <motion.div
          className="flex justify-center mb-16"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <GiraLogo size="lg" showTagline={true} />
        </motion.div>

        {!patientPicker ? (
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <button
              type="button"
              onClick={() => onLogin("provider")}
              className="w-full px-5 py-4 bg-white border border-[#E8E6F0] rounded-lg text-left group hover:border-[#C4C1D4] hover:border-l-[3px] hover:border-l-[#5B3FD4] transition-colors duration-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Stethoscope className="w-[18px] h-[18px] text-[#5B3FD4]" />
                  <div>
                    <h3 className="font-semibold text-[15px] text-[#0D0B14]">Healthcare Provider</h3>
                    <p className="text-[13px] text-[#9895A8]">Create patients and run clinical briefs</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#C4C1D4] group-hover:text-[#5B3FD4] transition-colors" />
              </div>
            </button>

            <button
              type="button"
              onClick={openPatientPicker}
              className="w-full px-5 py-4 bg-white border border-[#E8E6F0] rounded-lg text-left group hover:border-[#C4C1D4] hover:border-l-[3px] hover:border-l-[#1A9E6E] transition-colors duration-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <User className="w-[18px] h-[18px] text-[#1A9E6E]" />
                  <div>
                    <h3 className="font-semibold text-[15px] text-[#0D0B14]">Patient</h3>
                    <p className="text-[13px] text-[#9895A8]">View your health summary</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#C4C1D4] group-hover:text-[#1A9E6E] transition-colors" />
              </div>
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <button
              type="button"
              onClick={() => setPatientPicker(false)}
              className="flex items-center gap-2 text-[13px] text-[#9895A8] hover:text-[#0D0B14]"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8]">
              Select your record
            </p>
            {pickerError && <p className="text-[13px] text-[#C0392B]">{pickerError}</p>}
            {loadingPatients ? (
              <div className="flex justify-center py-8 text-[#9895A8] gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading…
              </div>
            ) : patients.length === 0 ? (
              <p className="text-[13px] text-[#9895A8] text-center py-8">
                No patients on file yet. Your clinician will add you first.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {patients.map((p) => (
                  <button
                    key={p.patient_id}
                    type="button"
                    onClick={() => onLogin("patient", p.patient_id)}
                    className="w-full p-4 border border-[#E8E6F0] rounded-lg text-left hover:border-[#1A9E6E] hover:bg-[#FAFAFA] transition-colors"
                  >
                    <p className="font-semibold text-[14px] text-[#0D0B14]">{p.name || "Patient"}</p>
                    <p className="font-mono text-[12px] text-[#9895A8] mt-0.5">{p.patient_id}</p>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        <motion.p
          className="text-xs text-[#C4C1D4] text-center mt-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          Powered by Nemotron
        </motion.p>
      </div>
    </motion.div>
  )
}
