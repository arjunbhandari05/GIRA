"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, FileText, Activity, Dna, Sparkles } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { AgentBrief, Patient } from "@/lib/types"
import BriefInferencePanel from "@/components/brief/BriefInferencePanel"
import BriefTab from "./tabs/brief-tab"
import WhoopDataTab from "./tabs/whoop-data-tab"
import GenomeTab from "./tabs/genome-tab"

type Tab = "brief" | "results" | "whoop" | "genome"

interface ProviderPatientViewProps {
  patient: Patient
  onBack: () => void
  onSignOut: () => void
  onPatientUpdated?: () => void
  initialTab?: Tab
}

const baseTabs: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "brief", label: "Agent", icon: FileText },
  { id: "whoop", label: "Metrics", icon: Activity },
  { id: "genome", label: "Genome", icon: Dna },
]

const resultsTab = { id: "results" as Tab, label: "Clinician brief", icon: Sparkles }

export default function ProviderPatientView({
  patient,
  onBack,
  onPatientUpdated,
  initialTab = "brief",
}: ProviderPatientViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const allowed: Tab[] = ["brief", "results", "whoop", "genome"]
    return allowed.includes(initialTab) ? initialTab : "brief"
  })
  const [dataRefreshKey, setDataRefreshKey] = useState(0)
  const [hasCachedBrief, setHasCachedBrief] = useState(false)
  const [generatedBrief, setGeneratedBrief] = useState<AgentBrief | null>(null)
  const [resultsKey, setResultsKey] = useState(0)

  const bumpDataRefresh = () => setDataRefreshKey((k) => k + 1)

  useEffect(() => {
    const allowed: Tab[] = ["brief", "results", "whoop", "genome"]
    const next = allowed.includes(initialTab) ? initialTab : "brief"
    setActiveTab(next)
  }, [initialTab, patient.id])

  const tabConfig = useMemo(
    () => (hasCachedBrief ? [baseTabs[0], resultsTab, ...baseTabs.slice(1)] : baseTabs),
    [hasCachedBrief]
  )

  const handleBriefComplete = (brief?: AgentBrief) => {
    const nextBrief = brief ?? generatedBrief
    if (brief) setGeneratedBrief(brief)
    setHasCachedBrief(Boolean(nextBrief))
    setResultsKey((k) => k + 1)
    if (nextBrief) setActiveTab("results")
  }

  return (
    <div className="gira-clinician-shell min-h-screen">
      <header className="bg-white border-b border-[#E8E6F0] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 -ml-2 hover:bg-[#F9F8FC] rounded-lg transition-colors"
                aria-label="Back to patients"
              >
                <ArrowLeft className="w-5 h-5 text-[#9895A8]" />
              </button>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold tracking-tight text-[#0D0B14]">GIRA</span>
                <span className="text-sm font-medium text-[#5B3FD4]">Rx</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full ${patient.avatarColor} flex items-center justify-center text-white font-medium text-sm shrink-0`}
              >
                {patient.initials}
              </div>
              <div className="hidden sm:block text-left">
                <p className="font-medium text-[#0D0B14] text-sm leading-tight">{patient.name}</p>
                <p className="gira-mono text-xs text-[#9895A8] leading-tight">{patient.id}</p>
              </div>
            </div>
          </div>

          <nav className="flex gap-0 -mb-px overflow-x-auto">
            {tabConfig.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-4 py-4 text-[14px] transition-colors whitespace-nowrap ${
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
              <BriefTab patient={patient} onBriefComplete={handleBriefComplete} />
            )}
            {activeTab === "results" && hasCachedBrief && (
              <BriefInferencePanel
                key={resultsKey}
                patientId={patient.id}
                audience="clinician"
                initialBrief={generatedBrief}
                embedded
                initialView="clinician"
                showViewToggle
                loadWhenActive
                isActive={activeTab === "results"}
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
