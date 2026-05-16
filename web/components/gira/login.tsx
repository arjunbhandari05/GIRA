"use client"

import { useState } from "react"
import { Stethoscope, User, ArrowRight, ChevronLeft, Loader2, AlertCircle } from "lucide-react"
import { motion } from "framer-motion"
import GiraLogo from "./gira-logo"
import { validateLogin } from "@/lib/auth"

interface LoginProps {
  onLogin: (role: "provider" | "patient", id: string) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [step, setStep] = useState<"role" | "credentials">("role")
  const [role, setRole] = useState<"provider" | "patient" | null>(null)
  const [userId, setUserId] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const selectRole = (r: "provider" | "patient") => {
    setRole(r)
    setStep("credentials")
    setUserId("")
    setPassword("")
    setError(null)
  }

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!role || !userId.trim()) return

    setSubmitting(true)
    setError(null)

    const result = await validateLogin(role, userId)
    setSubmitting(false)

    if (!result.ok) {
      setError(result.message)
      return
    }

    onLogin(role, userId.trim().toUpperCase())
  }

  const inputBorder = error
    ? "border-[#C0392B] focus:border-[#C0392B]"
    : "border-[#E8E6F0] focus:border-[#5B3FD4]"

  return (
    <motion.div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex justify-center mb-12">
          <GiraLogo size="lg" showTagline />
        </div>

        {step === "role" ? (
          <motion.div className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <button
              type="button"
              onClick={() => selectRole("provider")}
              className="w-full px-5 py-4 border border-[#E8E6F0] rounded-lg text-left hover:border-l-[#5B3FD4] hover:border-l-[3px] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Stethoscope className="w-[18px] h-[18px] text-[#5B3FD4]" />
                  <div>
                    <h3 className="font-semibold text-[15px] text-[#0D0B14]">Healthcare Provider</h3>
                    <p className="text-[13px] text-[#9895A8]">Create patients and run GIRA clinical briefs</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#C4C1D4]" />
              </div>
            </button>
            <button
              type="button"
              onClick={() => selectRole("patient")}
              className="w-full px-5 py-4 border border-[#E8E6F0] rounded-lg text-left hover:border-l-[#1A9E6E] hover:border-l-[3px] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <User className="w-[18px] h-[18px] text-[#1A9E6E]" />
                  <div>
                    <h3 className="font-semibold text-[15px] text-[#0D0B14]">Patient</h3>
                    <p className="text-[13px] text-[#9895A8]">View your health summary</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#C4C1D4]" />
              </div>
            </button>
          </motion.div>
        ) : (
          <form onSubmit={submitCredentials} className="space-y-4">
            <button
              type="button"
              onClick={() => {
                setStep("role")
                setRole(null)
                setError(null)
              }}
              className="flex items-center gap-2 text-[13px] text-[#9895A8] hover:text-[#0D0B14]"
              disabled={submitting}
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>

            <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8]">
              {role === "provider" ? "Provider sign in" : "Patient sign in"}
            </p>

            {error && (
              <div
                className="flex gap-3 p-4 rounded-lg border border-[#F5C6C6] bg-[#FDF9F9]"
                role="alert"
              >
                <AlertCircle className="w-5 h-5 text-[#C0392B] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-[#C0392B]">Invalid credentials</p>
                  <p className="text-[13px] text-[#6B6778] mt-1 leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            <div>
              <label className="text-[12px] font-medium text-[#6B6778]">
                {role === "provider" ? "Provider ID" : "Patient ID"}
              </label>
              <input
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value)
                  if (error) setError(null)
                }}
                disabled={submitting}
                autoComplete="username"
                placeholder={role === "provider" ? "e.g. DR-001" : "e.g. PT-001"}
                className={`mt-1 w-full px-4 py-3 border rounded-lg font-mono text-[14px] focus:outline-none transition-colors ${inputBorder}`}
              />
            </div>

            <div>
              <label className="text-[12px] font-medium text-[#6B6778]">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                autoComplete="current-password"
                placeholder="Password"
                className={`mt-1 w-full px-4 py-3 border rounded-lg text-[14px] focus:outline-none transition-colors ${inputBorder}`}
              />
            </div>

            <p className="text-[12px] text-[#9895A8] leading-relaxed">
              {role === "patient"
                ? "Use the patient ID shown when your clinician created your record (e.g. PT-EUUKV4), or demo IDs PT-001–PT-003 after seeding."
                : "Demo provider: DR-001. Password is not checked in this demo."}
            </p>

            <button
              type="submit"
              disabled={!userId.trim() || submitting}
              className="w-full py-3 bg-[#5B3FD4] text-white rounded-lg text-[14px] font-medium hover:bg-[#4A32B0] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        )}

        <p className="text-xs text-[#C4C1D4] text-center mt-12">Powered by GIRA</p>
      </motion.div>
    </motion.div>
  )
}
