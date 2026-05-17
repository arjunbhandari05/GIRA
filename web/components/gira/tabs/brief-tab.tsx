"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ClipboardList, Dna, Droplet, Heart, Link2, type LucideIcon } from "lucide-react"
import type { AgentBrief, LogLine, Patient } from "@/lib/types"
import {
  deleteAgentBrief,
  getAgentBrief,
  getPatientAssets,
  getSafetyFlags,
  streamAgentBrief,
} from "@/lib/api"
import {
  logLineToAgentEntry,
  traceStepToAgentEntry,
  traceStepToLogLine,
  traceToLogLines,
} from "@/lib/mappers"
import GenerateClinicalBriefButton from "../generate-clinical-brief-button"
import GiraLoadingPage from "../gira-loading-page"
import type { AgentLogEntry, TraceStep } from "@/lib/types"

interface BriefTabProps {
  patient: Patient
  onBriefComplete?: (brief?: AgentBrief) => void
}

export default function BriefTab({ patient, onBriefComplete }: BriefTabProps) {
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineComplete, setPipelineComplete] = useState(false)
  const [activeCards, setActiveCards] = useState<string[]>([])
  const [logLines, setLogLines] = useState<LogLine[]>([])
  const [brief, setBrief] = useState<AgentBrief | null>(null)
  const pipelineStartRef = useRef<number>(0)
  const stepQueueRef = useRef<TraceStep[]>([])
  /** Latest API brief from stream/fetch — avoids stale React state when the loading overlay finishes. */
  const lastBriefResultRef = useRef<AgentBrief | null>(null)
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showAgentOverlay, setShowAgentOverlay] = useState(false)
  const [agentLogEntries, setAgentLogEntries] = useState<AgentLogEntry[]>([])
  const streamAbortRef = useRef<AbortController | null>(null)
  const [portalMounted, setPortalMounted] = useState(false)

  useEffect(() => {
    setPortalMounted(true)
  }, [])

  useEffect(() => {
    if (!showAgentOverlay) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [showAgentOverlay])

  const dataSources: {
    id: string
    title: string
    subtitle: string
    icon: LucideIcon
    iconColor: string
    borderColor: string
    borderHover: string
  }[] = [
    {
      id: "genome",
      title: "Genome",
      subtitle: "SNP profile",
      icon: Dna,
      iconColor: "#7c3aed",
      borderColor: "#7c3aed",
      borderHover: "#6d28d9",
    },
    {
      id: "whoop",
      title: "Wearables",
      subtitle: "WHOOP 30-day",
      icon: Heart,
      iconColor: "#16a34a",
      borderColor: "#16a34a",
      borderHover: "#15803d",
    },
    {
      id: "glucose",
      title: "CGM",
      subtitle: "Glucose 30-day",
      icon: Droplet,
      iconColor: "#2563eb",
      borderColor: "#2563eb",
      borderHover: "#1d4ed8",
    },
    {
      id: "intake",
      title: "Intake Form",
      subtitle: "Clinician chart",
      icon: ClipboardList,
      iconColor: "#d97706",
      borderColor: "#d97706",
      borderHover: "#b45309",
    },
  ]

  const clinicalApiTags = ["ClinVar", "PubMed", "CPIC", "ClinicalTrials.gov", "RxNorm"]

  const loadContext = useCallback(async () => {
    const flags = await getSafetyFlags(patient.id)
    return flags
  }, [patient.id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBrief(null)
      lastBriefResultRef.current = null
      setPipelineComplete(false)
      setLogLines([])
      try {
        await loadContext()
        const assets = await getPatientAssets(patient.id)
        if (cancelled) return
        const ready: string[] = []
        if (assets.genome) ready.push("genome")
        if (assets.wearable) ready.push("whoop")
        if (assets.glucose) ready.push("glucose")
        if (assets.intake_file) ready.push("intake")
        setActiveCards(ready)
      } catch {
        setActiveCards([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [patient.id, loadContext])

  const activateCardForTool = (tool: string) => {
    if (tool === "nemotron_turn") return
    setActiveCards((prev) => {
      const next = new Set(prev)
      if (tool === "get_snp_profile" || tool === "fetch_pharmgkb") next.add("genome")
      if (tool === "fetch_whoop") next.add("whoop")
      if (
        tool === "fetch_clinvar" ||
        tool === "fetch_pubmed" ||
        tool === "fetch_rxnorm" ||
        tool === "fetch_trials" ||
        tool === "fetch_cpic"
      ) {
        next.add("clinical")
      }
      if (tool === "fetch_glucose") next.add("glucose")
      if (tool === "get_patient_intake") next.add("intake")
      return Array.from(next)
    })
  }

  const activateCardsFromTrace = (trace: AgentBrief["_trace"]) => {
    const tools = new Set((trace || []).map((t) => t.tool))
    const cards: string[] = []
    if (tools.has("get_snp_profile")) cards.push("genome")
    if (tools.has("fetch_whoop")) cards.push("whoop")
    if (
      tools.has("fetch_clinvar") ||
      tools.has("fetch_pubmed") ||
      tools.has("fetch_rxnorm") ||
      tools.has("fetch_trials") ||
      tools.has("fetch_cpic")
    ) {
      cards.push("clinical")
    }
    if (tools.has("fetch_glucose")) cards.push("glucose")
    if (tools.has("get_patient_intake")) cards.push("intake")
    setActiveCards(cards)
  }

  const pushAgentLogEntry = useCallback((entry: AgentLogEntry) => {
    setAgentLogEntries((prev) => {
      const settled = prev.map((e) =>
        e.status === "running"
          ? {
              ...e,
              status: "complete" as const,
              type: e.type === "error" ? ("error" as const) : ("success" as const),
            }
          : e
      )
      return [...settled, entry]
    })
  }, [])

  const flushStepQueue = useCallback(() => {
    if (stepQueueRef.current.length === 0) {
      drainTimerRef.current = null
      return
    }
    const step = stepQueueRef.current.shift()!
    const elapsed = (Date.now() - pipelineStartRef.current) / 1000
    pushAgentLogEntry(traceStepToAgentEntry(step, elapsed))
    setLogLines((prev) => {
      const next = [...prev, traceStepToLogLine(step, elapsed)]
      if (step.tool === "check_safety_flags") {
        next.push({
          timestamp: traceStepToLogLine({ tool: "generate_brief" }, elapsed).timestamp,
          text: "Assembling clinician brief…",
          type: "info",
        })
      }
      return next
    })
    activateCardForTool(step.tool)
    drainTimerRef.current = setTimeout(flushStepQueue, 120)
  }, [pushAgentLogEntry])

  const enqueueTraceStep = useCallback(
    (step: TraceStep) => {
      stepQueueRef.current.push(step)
      if (!drainTimerRef.current) flushStepQueue()
    },
    [flushStepQueue]
  )

  const replayTraceSteps = useCallback((trace: TraceStep[]) => {
    stepQueueRef.current = []
    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current)
      drainTimerRef.current = null
    }
    setLogLines([
      {
        timestamp: "00:00.0",
        text: "Replaying agent steps…",
        type: "info",
      },
    ])
    stepQueueRef.current = [...trace]
    flushStepQueue()
  }, [flushStepQueue])

  const handleLoadingComplete = useCallback(() => {
    setShowAgentOverlay(false)
    onBriefComplete?.(brief ?? lastBriefResultRef.current ?? undefined)
  }, [onBriefComplete, brief])

  const runPipeline = async () => {
    streamAbortRef.current?.abort()
    streamAbortRef.current = new AbortController()
    setShowAgentOverlay(true)
    setAgentLogEntries([])
    setPipelineRunning(true)
    setPipelineComplete(false)
    pipelineStartRef.current = Date.now()
    stepQueueRef.current = []
    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current)
      drainTimerRef.current = null
    }
    const bootLine: LogLine = { timestamp: "00:00.0", text: "Loading PGx safety gates…", type: "info" }
    setLogLines([bootLine])
    pushAgentLogEntry(logLineToAgentEntry(bootLine, "boot"))
    setActiveCards([])
    setBrief(null)
    lastBriefResultRef.current = null
    setPipelineComplete(false)

    try {
      await deleteAgentBrief(patient.id).catch(() => {})
      const flags = await loadContext()
      const flagLine =
        flags.length === 0
          ? "No PGx safety flags on file"
          : `${flags.length} safety gate(s) — ${flags
              .slice(0, 3)
              .map((f) => f.gene)
              .filter(Boolean)
              .join(", ")}${flags.length > 3 ? "…" : ""}`
      const elapsed0 = (Date.now() - pipelineStartRef.current) / 1000
      const flagLog: LogLine = {
        timestamp: traceStepToLogLine({ tool: "check_safety_flags" }, elapsed0).timestamp,
        toolLabel: "check_safety_flags → Safety flag evaluation",
        text: flagLine,
        type: flags.some((f) => (f.severity || "").toUpperCase() === "CRITICAL")
          ? "warning"
          : flags.length
            ? "warning"
            : "success",
      }
      const streamLog: LogLine = {
        timestamp: traceStepToLogLine({ tool: "generate_brief" }, elapsed0).timestamp,
        text: "Streaming agent trace — lines appear as each tool finishes",
        type: "info",
      }
      setLogLines((prev) => [...prev, flagLog, streamLog])
      pushAgentLogEntry(logLineToAgentEntry(flagLog, "flags"))
      pushAgentLogEntry(logLineToAgentEntry(streamLog, "stream"))

      let completed = false
      let streamError: string | null = null
      let sawGenerateBrief = false
      await streamAgentBrief(patient.id, {
        refresh: true,
        signal: streamAbortRef.current.signal,
        onStep: (step) => {
          if (step.tool === "generate_brief" && step.status !== "partial") {
            sawGenerateBrief = true
          }
          enqueueTraceStep(step)
        },
        onComplete: (result) => {
          completed = true
          if (result.error) {
            streamError = String(result.error)
            return
          }
          lastBriefResultRef.current = result
          setBrief(result)
          const finish = () => {
            const elapsed = (Date.now() - pipelineStartRef.current) / 1000
            const doneLine: LogLine = {
              timestamp: traceStepToLogLine({ tool: "generate_brief" }, elapsed).timestamp,
              toolLabel: "generate_brief → Brief synthesis",
              text: "Brief ready for review",
              type: "success",
            }
            setLogLines((prev) => [...prev, doneLine])
            pushAgentLogEntry(logLineToAgentEntry(doneLine, "done"))
            if (result._trace?.length) activateCardsFromTrace(result._trace)
            setPipelineComplete(true)
          }
          if (stepQueueRef.current.length > 0 || drainTimerRef.current) {
            const waitDrain = () => {
              if (stepQueueRef.current.length > 0 || drainTimerRef.current) {
                setTimeout(waitDrain, 200)
                return
              }
              finish()
            }
            waitDrain()
          } else {
            finish()
          }
        },
        onError: (message) => {
          streamError = message
        },
      })

      if (streamError) throw new Error(streamError)

      if (!completed && sawGenerateBrief) {
        const result = await getAgentBrief(patient.id, { cacheOnly: true })
        if (result && !result.error && result.snp_summary) {
          lastBriefResultRef.current = result
          setBrief(result)
          setPipelineComplete(true)
          if (result._trace?.length) activateCardsFromTrace(result._trace)
          completed = true
        }
      }

      if (!completed) {
        const result = await getAgentBrief(patient.id, { refresh: true })
        if (result.error) throw new Error(String(result.error))
        lastBriefResultRef.current = result
        setBrief(result)
        if (result._trace?.length) {
          replayTraceSteps(result._trace)
          activateCardsFromTrace(result._trace)
        }
        setPipelineComplete(true)
      }
    } catch (e) {
      const rawMsg = e instanceof Error ? e.message : "Pipeline failed"
      console.error("GIRA brief generation failed", e)
      const msg = "Analysis unavailable — please try again."
      if (rawMsg.includes("abort")) {
        setShowAgentOverlay(false)
        return
      }
      const errLine: LogLine = { timestamp: "—", text: msg, type: "error" }
      setLogLines((prev) => [...prev, errLine])
      pushAgentLogEntry(logLineToAgentEntry(errLine, "error"))
    } finally {
      setPipelineRunning(false)
    }
  }

  const handleLoadingCancel = () => {
    streamAbortRef.current?.abort()
    setPipelineRunning(false)
    setShowAgentOverlay(false)
  }

  useEffect(() => {
    return () => {
      if (drainTimerRef.current) clearTimeout(drainTimerRef.current)
    }
  }, [])

  const loadingScreen =
    showAgentOverlay && portalMounted ? (
      <GiraLoadingPage
        patientName={patient.name}
        patientId={patient.id}
        entries={agentLogEntries}
        isRunning={pipelineRunning}
        isComplete={pipelineComplete && !pipelineRunning}
        onComplete={handleLoadingComplete}
        onCancel={pipelineRunning ? handleLoadingCancel : undefined}
      />
    ) : null

  return (
    <>
      {loadingScreen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-[#FAFAFC]">{loadingScreen}</div>,
        document.body
      )}
      <div className={showAgentOverlay ? "hidden" : "gira-agent-page space-y-4"} aria-hidden={showAgentOverlay}>
        <div className="rounded-[12px] border border-[#E8E6F0] bg-white overflow-hidden">
          <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E8E6F0]">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#9895A8]">
                GIRA pipeline
              </p>
              <p className="text-[13px] text-[#6B6778] mt-0.5">
                Parallel evidence gathering + clinical brief
              </p>
            </div>
            <GenerateClinicalBriefButton
              running={pipelineRunning}
              complete={pipelineComplete}
              onClick={runPipeline}
            />
          </div>

          <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {dataSources.map((card) => {
              const Icon = card.icon
              const isLoaded = activeCards.includes(card.id)
              return (
                <div
                  key={card.id}
                  className="group relative rounded-[10px] border border-[#E8E6F0] bg-white p-4 transition-colors hover:border-[var(--card-border-hover)]"
                  style={{
                    borderTopWidth: 3,
                    borderTopColor: card.borderColor,
                    ["--card-border-hover" as string]: card.borderHover,
                  }}
                >
                  {isLoaded && (
                    <span
                      className="absolute top-3 right-3 w-[7px] h-[7px] rounded-full bg-[#16a34a]"
                      aria-label="Data loaded"
                    />
                  )}
                  <Icon className="w-4 h-4 shrink-0" strokeWidth={2} style={{ color: card.iconColor }} aria-hidden />
                  <p className="font-bold text-[13px] text-[#0D0B14] mt-3">{card.title}</p>
                  <p className="text-[12px] text-[#9895A8] mt-0.5">{card.subtitle}</p>
                </div>
              )
            })}
          </div>

          <div className="px-5 pb-5">
            <div className="rounded-[10px] border border-[#E8E6F0] bg-white px-4 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 min-w-0">
                <div className="flex items-center gap-2 shrink-0">
                  <Link2 className="w-4 h-4 text-[#9895A8]" />
                  <span className="text-[13px] font-bold text-[#0D0B14]">Clinical APIs</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {clinicalApiTags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] font-medium text-[#0D0B14] bg-[#F9F8FC] border border-[#E8E6F0] rounded-full px-2.5 py-0.5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-[12px] text-[#9895A8] shrink-0">Queried live on run</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
