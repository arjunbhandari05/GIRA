"use client"

import { useCallback, useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import Login from "@/components/gira/login"
import ProviderDashboard from "@/components/gira/provider-dashboard"
import ProviderPatientView from "@/components/gira/provider-patient-view"
import PatientDashboard from "@/components/gira/patient-dashboard"
import { getSafetyFlags, listPatients } from "@/lib/api"
import { mapBackendPatient } from "@/lib/mappers"
import type { Patient } from "@/lib/types"

export type { Patient } from "@/lib/types"
export type Screen = "login" | "provider-dashboard" | "provider-patient-view" | "patient-dashboard"

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
}

export default function GIRAApp() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("login")
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientsLoading, setPatientsLoading] = useState(false)
  const [patientsError, setPatientsError] = useState<string | null>(null)
  const [sessionPatientId, setSessionPatientId] = useState("")
  const [patientInitialTab, setPatientInitialTab] = useState<"setup" | "brief">("setup")

  const loadPatients = useCallback(async () => {
    setPatientsLoading(true)
    setPatientsError(null)
    try {
      const rows = await listPatients()
      const mapped = await Promise.all(
        rows.map(async (row) => {
          const flags = await getSafetyFlags(row.patient_id).catch(() => [])
          return mapBackendPatient(row, flags)
        })
      )
      setPatients(mapped)
    } catch (e) {
      setPatientsError(e instanceof Error ? e.message : "Could not load patients")
      setPatients([])
    } finally {
      setPatientsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentScreen === "provider-dashboard") {
      loadPatients()
    }
  }, [currentScreen, loadPatients])

  const handleLogin = (role: "provider" | "patient", patientId?: string) => {
    if (role === "provider") {
      setCurrentScreen("provider-dashboard")
    } else if (patientId) {
      setSessionPatientId(patientId)
      setCurrentScreen("patient-dashboard")
    }
  }

  const handlePatientSelect = (patient: Patient) => {
    setSelectedPatient(patient)
    setPatientInitialTab("setup")
    setCurrentScreen("provider-patient-view")
  }

  const handleBackToDashboard = () => {
    setSelectedPatient(null)
    setCurrentScreen("provider-dashboard")
  }

  const handleSignOut = () => {
    setCurrentScreen("login")
    setSelectedPatient(null)
  }

  const openPatientById = async (patientId: string, tab: "setup" | "brief" = "setup") => {
    await loadPatients()
    const flags = await getSafetyFlags(patientId).catch(() => [])
    const rows = await listPatients()
    const row = rows.find((r) => r.patient_id === patientId)
    if (row) {
      const p = await mapBackendPatient(row, flags)
      setSelectedPatient(p)
      setPatientInitialTab(tab)
      setCurrentScreen("provider-patient-view")
    }
  }

  const handlePatientCreated = (patientId: string) => {
    openPatientById(patientId, "setup")
  }

  return (
    <motion.div className="min-h-screen bg-white">
      <AnimatePresence mode="wait">
        {currentScreen === "login" && (
          <motion.div key="login" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <Login onLogin={handleLogin} />
          </motion.div>
        )}

        {currentScreen === "provider-dashboard" && (
          <motion.div key="provider-dashboard" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <ProviderDashboard
              patients={patients}
              loading={patientsLoading}
              error={patientsError}
              onRefresh={loadPatients}
              onPatientSelect={handlePatientSelect}
              onPatientCreated={handlePatientCreated}
              onSignOut={handleSignOut}
            />
          </motion.div>
        )}

        {currentScreen === "provider-patient-view" && selectedPatient && (
          <motion.div key="provider-patient-view" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <ProviderPatientView
              patient={selectedPatient}
              initialTab={patientInitialTab}
              onBack={handleBackToDashboard}
              onSignOut={handleSignOut}
              onPatientUpdated={loadPatients}
            />
          </motion.div>
        )}

        {currentScreen === "patient-dashboard" && (
          <motion.div key="patient-dashboard" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <PatientDashboard patientId={sessionPatientId} onSignOut={handleSignOut} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
