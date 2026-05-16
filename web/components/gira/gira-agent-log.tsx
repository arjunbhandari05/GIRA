"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Dna,
  Search,
  Database,
  Heart,
  Droplet,
  ClipboardList,
  FileText,
  Shield,
  BookOpen,
  Pill,
  FlaskConical,
  CheckCircle,
  Loader2,
  Sparkles,
} from "lucide-react"
import type { AgentLogEntry } from "@/lib/types"

const TOOL_ICONS: Record<string, typeof Dna> = {
  get_snp_profile: Dna,
  fetch_clinvar: Database,
  fetch_pubmed: BookOpen,
  fetch_rxnorm: Pill,
  fetch_trials: FlaskConical,
  fetch_cpic: FileText,
  fetch_whoop: Heart,
  fetch_glucose: Droplet,
  get_patient_intake: ClipboardList,
  check_safety_flags: Shield,
  generate_brief: Sparkles,
  fetch_pharmgkb: Search,
  nemotron_turn: Sparkles,
  system: Sparkles,
}

const TOOL_COLORS: Record<string, string> = {
  get_snp_profile: "#7C5CFC",
  fetch_clinvar: "#5B3FD4",
  fetch_pubmed: "#1A9E6E",
  fetch_rxnorm: "#B45309",
  fetch_trials: "#1A9E6E",
  fetch_cpic: "#7C5CFC",
  fetch_whoop: "#C0392B",
  fetch_glucose: "#1A9E6E",
  get_patient_intake: "#B45309",
  check_safety_flags: "#C0392B",
  generate_brief: "#5B3FD4",
  fetch_pharmgkb: "#7C5CFC",
  nemotron_turn: "#5B3FD4",
  system: "#9895A8",
}

const ROLE_LABELS: Record<string, string> = {
  orchestrator: "ORCHESTRATOR",
  safety: "SAFETY",
  evidence: "EVIDENCE",
  writer: "WRITER",
}

interface GiraAgentLogProps {
  entries: AgentLogEntry[]
  className?: string
  running?: boolean
}

function TypewriterText({ text, animate }: { text: string; animate: boolean }) {
  const [shown, setShown] = useState(animate ? "" : text)

  useEffect(() => {
    if (!animate) {
      setShown(text)
      return
    }
    setShown("")
    let i = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      i += Math.max(1, Math.floor(text.length / 36))
      setShown(text.slice(0, i))
      if (i >= text.length) return
      timer = setTimeout(tick, 16)
    }
    timer = setTimeout(tick, 30)
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [text, animate])

  return (
    <span>
      {shown}
      {animate && shown.length < text.length && (
        <span className="inline-block w-1 h-3.5 ml-0.5 bg-gira-accent animate-pulse align-middle rounded-sm" />
      )}
    </span>
  )
}

export default function GiraAgentLog({ entries, className, running = false }: GiraAgentLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, running])

  return (
    <div className={`flex flex-col min-h-0 bg-white ${className || ""}`}>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[#E8E6F0] shrink-0 bg-[#FAFAFC]">
        <div className="w-2 h-2 rounded-full bg-gira-accent animate-pulse" />
        <span className="text-xs font-semibold tracking-widest uppercase text-[#9895A8]">
          Agent activity
        </span>
        <span className="ml-auto text-[11px] font-mono text-[#9895A8]">{entries.length} events</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 min-h-0">
        <AnimatePresence mode="popLayout">
          {entries.map((entry, idx) => {
            const Icon = TOOL_ICONS[entry.tool] || Database
            const color = TOOL_COLORS[entry.tool] || "#5B3FD4"
            const isLatest = idx === entries.length - 1
            const roleLabel = entry.agentRole
              ? ROLE_LABELS[entry.agentRole] || entry.agentRole.toUpperCase()
              : null
            const isError = entry.type === "error" || entry.status === "error"

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                  isLatest ? "bg-[#F9F8FC] border border-[#E8E6F0]" : "hover:bg-[#FAFAFC]"
                }`}
              >
                <div className="flex flex-col items-center pt-0.5 shrink-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#E8E6F0] bg-white"
                    style={{ backgroundColor: `${color}10` }}
                  >
                    {entry.status === "running" ? (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color }} />
                    ) : (
                      <Icon className="w-4 h-4" style={{ color: isError ? "#C0392B" : color }} />
                    )}
                  </div>
                  {idx < entries.length - 1 && (
                    <div className="w-px flex-1 min-h-3 bg-[#E8E6F0] mt-1.5" />
                  )}
                </div>

                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-[#0D0B14]">{entry.label}</span>
                    {roleLabel && (
                      <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded bg-[#F9F8FC] text-[#9895A8] border border-[#E8E6F0]">
                        {roleLabel}
                      </span>
                    )}
                    {entry.status === "complete" && !isError && (
                      <CheckCircle className="w-3.5 h-3.5 text-gira-accent shrink-0" />
                    )}
                    <span className="ml-auto text-[10px] font-mono text-[#9895A8] tabular-nums">
                      {entry.timestamp}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#6B6778] mt-1 leading-relaxed">
                    <TypewriterText
                      text={entry.detail}
                      animate={isLatest && entry.status === "running"}
                    />
                  </p>
                  {entry.reason && entry.status === "complete" && (
                    <p className="text-[11px] text-[#9895A8] mt-1.5 italic leading-snug">{entry.reason}</p>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-[#9895A8]">
            <Sparkles className="w-6 h-6 mb-2 opacity-30" />
            <p className="text-sm">Waiting for agent to start…</p>
          </div>
        )}

        {running && entries.length > 0 && (
          <p className="text-[12px] text-[#9895A8] mt-3 px-3 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-gira-accent" />
            GIRA is working…
          </p>
        )}
      </div>
    </div>
  )
}
