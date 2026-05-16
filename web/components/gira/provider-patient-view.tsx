"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, FileText, ClipboardList, Activity, Dna } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { Patient } from "@/lib/types"
import BriefTab from "./tabs/brief-tab"
import IntakeFormTab from "./tabs/intake-form-tab"
import WhoopDataTab from "./tabs/whoop-data-tab"
import GenomeTab from "./tabs/genome-tab"
type Tab = "brief" | "intake" | "whoop" | "genome"

interface ProviderPatientViewProps {
  patient: Patient
  onBack: () => void
  onSignOut: () => void
  onPatientUpdated?: () => void
  initialTab?: Tab
}

const tabConfig: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "brief", label: "Brief", icon: FileText },
  { id: "intake", label: "Intake", icon: ClipboardList },
  { id: "whoop", label: "Metrics", icon: Activity },
  { id: "genome", label: "Genome", icon: Dna },
]

export default function ProviderPatientView({
  patient,
  onBack,
  onPatientUpdated,
  initialTab = "brief",
}: ProviderPatientViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [dataRefreshKey, setDataRefreshKey] = useState(0)

  const bumpDataRefresh = () => setDataRefreshKey((k) => k + 1)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab, patient.id])

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-[#E8E6F0] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="py-4 flex items-center justify-between">
            <motion.div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 -ml-2 hover:bg-[#F9F8FC] rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-[#9895A8]" />
              </button>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold tracking-tight text-[#0D0B14]">GIRA</span>
                <span className="text-sm font-medium text-[#5B3FD4]">Rx</span>
              </div>
            </motion.div>

            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full ${patient.avatarColor} flex items-center justify-center text-white font-medium text-sm`}
              >
                {patient.initials}
              </div>
              <div className="hidden sm:block">
                <p className="font-medium text-[#0D0B14] text-sm">{patient.name}</p>
                <p className="text-xs font-mono text-[#9895A8]">{patient.id}</p>
              </div>
            </div>
          </div>

          <nav className="flex gap-0 -mb-px">
            {tabConfig.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-4 py-4 text-[14px] transition-colors ${
                    isActive ? "text-[#0D0B14] font-semibold" : "text-[#9895A8] font-medium hover:text-[#0D0B14]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#5B3FD4]"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${dataRefreshKey}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "brief" && (
              <BriefTab
                patient={patient}
                onNavigateIntake={() => setActiveTab("intake")}
              />
            )}
            {activeTab === "intake" && (
              <IntakeFormTab
                patientId={patient.id}
                refreshKey={dataRefreshKey}
                onSaved={() => {
                  onPatientUpdated?.()
                  bumpDataRefresh()
                }}
                onSaveAndRerun={() => setActiveTab("brief")}
              />
            )}
            {activeTab === "whoop" && (
              <WhoopDataTab patientId={patient.id} refreshKey={dataRefreshKey} />
            )}
            {activeTab === "genome" && <GenomeTab patientId={patient.id} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-[#E8E6F0] bg-white py-4 px-6">
        <p className="text-[11px] text-[#C4C1D4] text-center">
          GIRA · For clinical decision support only — physician review required
        </p>
      </footer>
    </div>
  )
}
