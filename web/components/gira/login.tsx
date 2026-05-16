"use client"

import { useState } from "react"
import {
  Stethoscope,
  User,
  ArrowRight,
  ChevronLeft,
  Loader2,
  AlertCircle,
  UserPlus,
  Copy,
  Check,
} from "lucide-react"
import { motion } from "framer-motion"
import GiraLogo from "./gira-logo"
import { validateLogin } from "@/lib/auth"
import { registerPatient } from "@/lib/api"

interface LoginProps {
  onLogin: (role: "provider" | "patient", id: string) => void
}

type Step = "role" | "credentials" | "register" | "register-success"

export default function Login({ onLogin }: LoginProps) {
  const [step, setStep] = useState<Step>("role")
  const [role, setRole] = useState<"provider" | "patient" | null>(null)
  const [userId, setUserId] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [zip, setZip] = useState("")
  const [createdPatientId, setCreatedPatientId] = useState("")
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const selectRole = (r: "provider" | "patient") => {
    setRole(r)
    setStep("credentials")
    setUserId("")
    setPassword("")
    setConfirmPassword("")
    setFullName("")
    setZip("")
    setCreatedPatientId("")
    setError(null)
  }

  const goToRegister = () => {
    setRole("patient")
    setStep("register")
    setError(null)
    setPassword("")
    setConfirmPassword("")
  }

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!role || !userId.trim()) return

    setSubmitting(true)
    setError(null)

    const result = await validateLogin(role, userId, password)
    setSubmitting(false)

    if (!result.ok) {
      setError(result.message)
      return
    }

    onLogin(role, userId.trim().toUpperCase())
  }

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = fullName.trim()
    if (!name) {
      setError("Enter your full name.")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const result = await registerPatient({
        name,
        password,
        zip: zip.trim() || undefined,
      })

      if (result.error || !result.patient_id) {
        setError(result.error || "Could not create your account. Please try again.")
        setSubmitting(false)
        return
      }

      setCreatedPatientId(result.patient_id)
      setStep("register-success")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your account.")
    } finally {
      setSubmitting(false)
    }
  }

  const copyPatientId = async () => {
    if (!createdPatientId) return
    try {
      await navigator.clipboard.writeText(createdPatientId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const inputBorder = error
    ? "border-[#C0392B] focus:border-[#C0392B]"
    : "border-[#E8E6F0] focus:border-[#5B3FD4]"

  const patientInputBorder = error
    ? "border-[#C0392B] focus:border-[#C0392B]"
    : "border-[#E8E6F0] focus:border-[#1A9E6E]"

  return (
    <motion.div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <motion.div className="flex justify-center mb-5">
          <GiraLogo size="lg" showTagline />
        </motion.div>

        {step === "role" ? (
          <motion.div className="space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <button
              type="button"
              onClick={() => selectRole("provider")}
              className="w-full px-5 py-4 border border-[#E8E6F0] rounded-lg text-left hover:border-l-[#5B3FD4] hover:border-l-[3px] transition-colors"
            >
              <motion.div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Stethoscope className="w-[18px] h-[18px] text-[#5B3FD4]" />
                  <div>
                    <h3 className="font-semibold text-[15px] text-[#0D0B14]">Healthcare Provider</h3>
                    <p className="text-[13px] text-[#9895A8]">Create patients and run GIRA clinical briefs</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#C4C1D4]" />
              </motion.div>
            </button>
            <button
              type="button"
              onClick={() => selectRole("patient")}
              className="w-full px-5 py-4 border border-[#E8E6F0] rounded-lg text-left hover:border-l-[#1A9E6E] hover:border-l-[3px] transition-colors"
            >
              <motion.div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <User className="w-[18px] h-[18px] text-[#1A9E6E]" />
                  <div>
                    <h3 className="font-semibold text-[15px] text-[#0D0B14]">Patient</h3>
                    <p className="text-[13px] text-[#9895A8]">Sign in or create your account</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-[#C4C1D4]" />
              </motion.div>
            </button>
          </motion.div>
        ) : step === "register-success" ? (
          <motion.div className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="p-5 rounded-lg border border-[#C8E6D9] bg-[#F4FBF7]">
              <p className="text-[13px] font-semibold text-[#1A9E6E]">Account created</p>
              <p className="text-[13px] text-[#6B6778] mt-2 leading-relaxed">
                Save your patient ID — you will need it to sign in.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <code className="flex-1 px-3 py-2.5 bg-white border border-[#E8E6F0] rounded-lg font-mono text-[15px] text-[#0D0B14]">
                  {createdPatientId}
                </code>
                <button
                  type="button"
                  onClick={copyPatientId}
                  className="p-2.5 border border-[#E8E6F0] rounded-lg hover:bg-white transition-colors"
                  title="Copy patient ID"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-[#1A9E6E]" />
                  ) : (
                    <Copy className="w-5 h-5 text-[#9895A8]" />
                  )}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onLogin("patient", createdPatientId)}
              className="w-full py-3 bg-[#1A9E6E] text-white rounded-lg text-[14px] font-medium hover:bg-[#158f5f] transition-colors"
            >
              Continue to my dashboard
            </button>
          </motion.div>
        ) : step === "register" ? (
          <form onSubmit={submitRegister} className="space-y-4">
            <button
              type="button"
              onClick={() => {
                setStep("credentials")
                setRole("patient")
                setError(null)
              }}
              className="flex items-center gap-2 text-[13px] text-[#9895A8] hover:text-[#0D0B14]"
              disabled={submitting}
            >
              <ChevronLeft className="w-4 h-4" />
              Back to sign in
            </button>

            <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8]">
              Create patient account
            </p>

            {error && (
              <div
                className="flex gap-3 p-4 rounded-lg border border-[#F5C6C6] bg-[#FDF9F9]"
                role="alert"
              >
                <AlertCircle className="w-5 h-5 text-[#C0392B] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-[#C0392B]">Could not create account</p>
                  <p className="text-[13px] text-[#6B6778] mt-1 leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            <div>
              <label className="text-[12px] font-medium text-[#6B6778]">Full name</label>
              <input
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value)
                  if (error) setError(null)
                }}
                disabled={submitting}
                autoComplete="name"
                placeholder="Jane Doe"
                className={`mt-1 w-full px-4 py-3 border rounded-lg text-[14px] focus:outline-none transition-colors ${patientInputBorder}`}
              />
            </div>

            <div>
              <label className="text-[12px] font-medium text-[#6B6778]">Zip code (optional)</label>
              <input
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                disabled={submitting}
                autoComplete="postal-code"
                placeholder="e.g. 94102"
                className={`mt-1 w-full px-4 py-3 border rounded-lg text-[14px] focus:outline-none transition-colors ${patientInputBorder}`}
              />
            </div>

            <div>
              <label className="text-[12px] font-medium text-[#6B6778]">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError(null)
                }}
                disabled={submitting}
                autoComplete="new-password"
                placeholder="At least 6 characters"
                className={`mt-1 w-full px-4 py-3 border rounded-lg text-[14px] focus:outline-none transition-colors ${patientInputBorder}`}
              />
            </div>

            <div>
              <label className="text-[12px] font-medium text-[#6B6778]">Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  if (error) setError(null)
                }}
                disabled={submitting}
                autoComplete="new-password"
                placeholder="Re-enter password"
                className={`mt-1 w-full px-4 py-3 border rounded-lg text-[14px] focus:outline-none transition-colors ${patientInputBorder}`}
              />
            </div>

            <button
              type="submit"
              disabled={!fullName.trim() || !password || submitting}
              className="w-full py-3 bg-[#1A9E6E] text-white rounded-lg text-[14px] font-medium hover:bg-[#158f5f] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Create account
                </>
              )}
            </button>
          </form>
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
                placeholder={role === "provider" ? "e.g. DR-001" : "e.g. PT-ABC123"}
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
                ? "New here? Create an account below. Demo IDs PT-001–PT-003 work without a password after seeding."
                : "Demo provider: DR-001. Password is not checked for providers."}
            </p>

            <button
              type="submit"
              disabled={!userId.trim() || submitting}
              className={`w-full py-3 text-white rounded-lg text-[14px] font-medium disabled:opacity-40 transition-colors flex items-center justify-center gap-2 ${
                role === "patient"
                  ? "bg-[#1A9E6E] hover:bg-[#158f5f]"
                  : "bg-[#5B3FD4] hover:bg-[#4A32B0]"
              }`}
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

            {role === "patient" && (
              <button
                type="button"
                onClick={goToRegister}
                disabled={submitting}
                className="w-full py-3 border border-[#E8E6F0] text-[#0D0B14] rounded-lg text-[14px] font-medium hover:border-[#1A9E6E] hover:text-[#1A9E6E] transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Create account
              </button>
            )}
          </form>
        )}

        <p className="text-xs text-[#C4C1D4] text-center mt-12">Powered by GIRA</p>
      </motion.div>
    </motion.div>
  )
}
