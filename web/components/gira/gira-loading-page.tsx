"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Dna, Shield, Sparkles, CheckCircle } from "lucide-react"
import DNAHelix from "./dna-helix"
import GiraAgentLog from "./gira-agent-log"
import type { AgentLogEntry } from "@/lib/types"

const STATUS_MESSAGES = [
  "Initializing GIRA pipeline…",
  "Loading patient genomic data…",
  "Querying ClinVar and PubMed…",
  "Analyzing pharmacogenomic variants…",
  "Cross-referencing drug interactions…",
  "Processing CGM and wearable signals…",
  "Running Nemotron reasoning…",
  "Assembling clinician brief…",
]

const ESTIMATED_TOOL_STEPS = 14

interface GiraLoadingPageProps {
  patientName?: string
  patientId?: string
  entries: AgentLogEntry[]
  isRunning: boolean
  isComplete?: boolean
  progress?: number
  onComplete?: () => void
  onCancel?: () => void
}

export default function GiraLoadingPage({
  patientName = "Patient",
  patientId = "PT-001",
  entries,
  isRunning,
  isComplete = false,
  progress: progressProp,
  onComplete,
  onCancel,
}: GiraLoadingPageProps) {
  const [statusIndex, setStatusIndex] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startTimeRef = useMemo(() => Date.now(), [])

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef)
    }, 100)
    return () => clearInterval(timer)
  }, [startTimeRef])

  useEffect(() => {
    if (isComplete) return
    const timer = setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length)
    }, 3500)
    return () => clearInterval(timer)
  }, [isComplete])

  const formatElapsed = useCallback((ms: number) => {
    const sec = Math.floor(ms / 1000)
    const min = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }, [])

  const computedProgress = useMemo(() => {
    if (isComplete) return 100
    if (progressProp != null) return progressProp
    const done = entries.filter((e) => e.status === "complete").length
    return Math.min(95, Math.round((done / ESTIMATED_TOOL_STEPS) * 100))
  }, [entries, isComplete, progressProp])

  const isActive = isRunning && !isComplete

  return (
    <div className="h-dvh w-full flex flex-col bg-[#FAFAFC] overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(91,63,212,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(91,63,212,0.08) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#E8E6F0] bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold tracking-tight text-gira-text">GIRA</span>
            <span className="text-sm font-medium text-gira-purple">Rx</span>
          </div>
          <div className="w-px h-5 bg-gira-border" />
          <span className="text-xs font-mono text-gira-muted">{patientId}</span>
          <span className="text-xs text-gira-text-secondary">{patientName}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${isActive ? "bg-gira-accent animate-pulse" : "bg-gira-accent"}`}
            />
            <span className="text-xs font-mono text-gira-muted">{formatElapsed(elapsedMs)}</span>
          </div>
          {onCancel && isActive && (
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 rounded-lg hover:bg-gira-surface-hover transition-colors text-gira-muted hover:text-gira-text"
              aria-label="Cancel pipeline"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <div className="relative z-10 flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center relative px-6 py-8 lg:py-0 shrink-0 lg:shrink">
          <div className="w-48 h-64 lg:w-56 lg:h-80 relative">
            <DNAHelix className="absolute inset-0" />
            <AnimatePresence>
              {isComplete && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div className="w-16 h-16 rounded-full bg-gira-accent/20 flex items-center justify-center backdrop-blur-sm">
                    <CheckCircle className="w-8 h-8 text-gira-accent" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-6 text-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={isComplete ? "done" : statusIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
                className={`text-sm font-medium ${isActive ? "text-gira-text-secondary" : "text-gira-accent"}`}
              >
                {isComplete ? "Brief generation complete" : STATUS_MESSAGES[statusIndex]}
              </motion.p>
            </AnimatePresence>

            <div className="mt-4 w-64 mx-auto">
              <div className="h-1 bg-gira-border rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, #5B3FD4, #1A9E6E)" }}
                  animate={{ width: `${computedProgress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[10px] font-mono text-gira-muted">{computedProgress}%</span>
                <span className="text-[10px] font-mono text-gira-muted">
                  {entries.filter((e) => e.status === "complete").length} steps logged
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 max-w-sm mx-auto">
              {entries
                .filter((e) => e.status === "running")
                .slice(-3)
                .map((e) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gira-surface-active border border-gira-border"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-gira-accent animate-pulse" />
                    <span className="text-[10px] font-medium text-gira-text-secondary truncate max-w-28">
                      {e.label}
                    </span>
                  </motion.div>
                ))}
            </div>
          </div>

          <motion.div
            className="absolute top-8 left-8 text-gira-muted opacity-10 pointer-events-none"
            animate={{ rotate: 360 }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          >
            <Dna className="w-8 h-8" />
          </motion.div>
          <motion.div
            className="absolute bottom-12 right-12 text-gira-muted opacity-10 pointer-events-none hidden lg:block"
            animate={{ rotate: -360 }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
          >
            <Shield className="w-6 h-6" />
          </motion.div>
          <motion.div
            className="absolute top-1/4 right-16 text-gira-muted opacity-10 pointer-events-none hidden lg:block"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="w-5 h-5" />
          </motion.div>
        </div>

        <div className="lg:w-[420px] xl:w-[460px] border-t lg:border-t-0 lg:border-l border-[#E8E6F0] bg-white flex flex-col overflow-hidden min-h-[320px] lg:min-h-0 flex-1 lg:flex-none shadow-[-8px_0_24px_rgba(13,11,20,0.04)]">
          <GiraAgentLog entries={entries} running={isActive} className="flex-1 min-h-0" />
        </div>
      </div>

      <footer className="relative z-10 flex items-center justify-between px-6 py-3 border-t border-[#E8E6F0] bg-white shrink-0">
        <span className="text-[10px] font-mono text-gira-muted">GIRA Genomic Inference Rx Agent</span>
        {isComplete && onComplete && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onComplete}
            className="px-5 py-2 bg-gira-purple text-white text-sm font-medium rounded-lg hover:bg-gira-purple-hover transition-colors"
          >
            View clinician brief
          </motion.button>
        )}
      </footer>
    </div>
  )
}
