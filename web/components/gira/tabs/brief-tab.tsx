"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  AlertTriangle,
  Play,
  AlertCircle,
  CheckCircle,
  Dna,
  Heart,
  Database,
  ClipboardList,
  Loader2,
  Droplet,
} from "lucide-react"
import { motion } from "framer-motion"
import type { AgentBrief, LogLine, Patient, SafetyFlag } from "@/lib/types"
import {
  deleteAgentBrief,
  getAgentBrief,
  getPatientAssets,
  getSafetyFlags,
  listPatients,
  streamAgentBrief,
} from "@/lib/api"
import {
  genotypeForFlag,
  logLineToAgentEntry,
  severityUi,
  traceStepToAgentEntry,
  traceStepToLogLine,
  traceToLogLines,
} from "@/lib/mappers"
import AgentConsole from "../agent-console"
import GiraLoadingPage from "../gira-loading-page"
import type { AgentLogEntry, TraceStep } from "@/lib/types"

interface BriefTabProps {
  patient: Patient
  onNavigateIntake?: () => void
  onBriefComplete?: () => void
}

export default function BriefTab({ patient, onNavigateIntake, onBriefComplete }: BriefTabProps) {
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineComplete, setPipelineComplete] = useState(false)
  const [activeCards, setActiveCards] = useState<string[]>([])
  const [logLines, setLogLines] = useState<LogLine[]>([])
  const [brief, setBrief] = useState<AgentBrief | null>(null)
  const [safetyFlags, setSafetyFlags] = useState<SafetyFlag[]>([])
  const [snpProfile, setSnpProfile] = useState<Record<string, { genotype?: string }>>({})
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [loadingCache, setLoadingCache] = useState(true)
  const pipelineStartRef = useRef<number>(0)
  const stepQueueRef = useRef<TraceStep[]>([])
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [consoleAnimate, setConsoleAnimate] = useState(false)
  const [showAgentOverlay, setShowAgentOverlay] = useState(false)
  const [agentLogEntries, setAgentLogEntries] = useState<AgentLogEntry[]>([])
  const streamAbortRef = useRef<AbortController | null>(null)
  const autoNavigatedRef = useRef(false)
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

  const sourceCards = [
    { id: "genome", title: "Genome", subtitle: "SNP profile", icon: Dna, accentColor: "#5B3FD4" },
    { id: "whoop", title: "Wearables", subtitle: "WHOOP 30-day", icon: Heart, accentColor: "#1A9E6E" },
    { id: "glucose", title: "CGM", subtitle: "Glucose 30-day", icon: Droplet, accentColor: "#1A9E6E" },
    { id: "intake", title: "Intake Form", subtitle: "Clinician chart", icon: ClipboardList, accentColor: "#B45309" },
    { id: "clinical", title: "Clinical APIs", subtitle: "ClinVar · PubMed", icon: Database, accentColor: "#5B3FD4" },
  ]

  const loadContext = useCallback(async () => {
    const [flags, rows] = await Promise.all([
      getSafetyFlags(patient.id),
      listPatients(),
    ])
    setSafetyFlags(flags)
    const row = rows.find((r) => r.patient_id === patient.id)
    setSnpProfile((row?.snp_profile_json as Record<string, { genotype?: string }>) || {})
    return flags
  }, [patient.id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingCache(true)
      setBrief(null)
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
      } finally {
        if (!cancelled) setLoadingCache(false)
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
    drainTimerRef.current = setTimeout(flushStepQueue, 420)
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
    setConsoleAnimate(true)
    stepQueueRef.current = [...trace]
    flushStepQueue()
  }, [flushStepQueue])

  const handleLoadingComplete = useCallback(() => {
    if (autoNavigatedRef.current) return
    autoNavigatedRef.current = true
    setShowAgentOverlay(false)
    onBriefComplete?.()
  }, [onBriefComplete])

  useEffect(() => {
    if (!showAgentOverlay || pipelineRunning || !pipelineComplete || !brief || brief.error) {
      return
    }
    if (autoNavigatedRef.current) return

    const timer = setTimeout(() => {
      handleLoadingComplete()
    }, 1200)

    return () => clearTimeout(timer)
  }, [
    showAgentOverlay,
    pipelineRunning,
    pipelineComplete,
    brief,
    handleLoadingComplete,
  ])

  const runPipeline = async () => {
    streamAbortRef.current?.abort()
    streamAbortRef.current = new AbortController()
    autoNavigatedRef.current = false
    setShowAgentOverlay(true)
    setAgentLogEntries([])
    setPipelineRunning(true)
    setPipelineComplete(false)
    setPipelineError(null)
    setConsoleAnimate(true)
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
            setConsoleAnimate(false)
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
          setBrief(result)
          setPipelineComplete(true)
          if (result._trace?.length) activateCardsFromTrace(result._trace)
          completed = true
        }
      }

      if (!completed) {
        const result = await getAgentBrief(patient.id, { refresh: true })
        if (result.error) throw new Error(String(result.error))
        setBrief(result)
        if (result._trace?.length) {
          replayTraceSteps(result._trace)
          activateCardsFromTrace(result._trace)
        }
        setPipelineComplete(true)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pipeline failed"
      if (msg.includes("abort")) {
        setShowAgentOverlay(false)
        return
      }
      setPipelineError(msg)
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

  const displayFlags = brief?.safety_flags?.length
    ? brief.safety_flags.map((f) => ({
        gene: f.gene || "",
        rsid: f.rsid,
        genotype: genotypeForFlag(f, snpProfile),
        severity: severityUi(f.severity),
        description: f.flag || "",
        source: f.action || `PMID ${f.pmid || ""}`,
        prescribed: f.currently_prescribed,
      }))
    : safetyFlags.map((f) => ({
        gene: f.gene,
        rsid: f.rsid,
        genotype: f.risk_genotype || genotypeForFlag(f, snpProfile),
        severity: severityUi(f.severity),
        description: f.flag,
        source: f.action,
        prescribed: f.currently_prescribed,
      }))


  const bannerDetail =
    displayFlags.find((f) => f.severity === "critical" && f.prescribed)?.description ||
    displayFlags[0]?.description ||
    patient.statusText

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
      <div className={showAgentOverlay ? "hidden" : "space-y-6"} aria-hidden={showAgentOverlay}>
      {patient.status === "flag" && (
        <div className="border-l-[3px] border-l-[#C0392B] border border-[#E8E6F0] rounded-md bg-white p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#C0392B] shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#C0392B]">Action required</p>
            <p className="text-[13px] text-[#6B6778] mt-0.5">{bannerDetail}</p>
          </div>
        </div>
      )}
      {patient.status === "review" && (
        <motion.div className="border-l-[3px] border-l-[#B45309] border border-[#E8E6F0] rounded-md bg-white p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#B45309]">Review recommended</p>
            <p className="text-[13px] text-[#6B6778] mt-0.5">{bannerDetail}</p>
          </div>
        </motion.div>
      )}
      {patient.status === "ready" && (
        <div className="border-l-[3px] border-l-[#1A9E6E] border border-[#E8E6F0] rounded-md bg-white p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-[#1A9E6E] shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[#1A9E6E]">All clear</p>
            <p className="text-[13px] text-[#6B6778] mt-0.5">No critical pharmacogenomic gates on file.</p>
          </div>
        </div>
      )}

      <div className="border border-[#E8E6F0] rounded-lg bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E8E6F0] flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8]">GIRA pipeline</p>
            <p className="text-[13px] text-[#6B6778]">
              {brief?._backend
                ? `Engine: ${brief._backend}`
                : "Parallel evidence gathering + clinical brief"}
              {brief?.cached ? " · cached" : ""}
            </p>
          </div>
          <button
            onClick={runPipeline}
            disabled={pipelineRunning}
            className="flex items-center gap-2 px-4 py-2 border border-[#5B3FD4] text-[#5B3FD4] bg-white rounded-md text-[13px] font-medium hover:bg-[#5B3FD4] hover:text-white transition-colors disabled:opacity-50 shrink-0"
          >
            {pipelineRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {pipelineRunning ? "Running…" : pipelineComplete ? "Run GIRA Agent again" : "Run GIRA Agent"}
          </button>
        </div>

        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          {sourceCards.map((card) => {
            const Icon = card.icon
            const isActive = activeCards.includes(card.id)
            return (
              <div
                key={card.id}
                className={`p-4 rounded-lg border transition-all ${
                  isActive
                    ? "border-l-[3px] border-[#E8E6F0] bg-white opacity-100"
                    : "border border-[#E8E6F0] bg-white opacity-40"
                }`}
                style={isActive ? { borderLeftColor: card.accentColor } : {}}
              >
                <Icon className="w-4 h-4 mb-3" style={{ color: card.accentColor }} />
                <p className="font-semibold text-[13px] text-[#0D0B14]">{card.title}</p>
                <p className="text-[12px] text-[#9895A8]">{card.subtitle}</p>
              </div>
            )
          })}
        </div>

        <div className="px-5 pb-5">
          <AgentConsole
            lines={logLines}
            running={pipelineRunning}
            loading={loadingCache}
            emptyHint='Click "Run GIRA Agent" to start (usually 1–3 min)'
            defaultOpen={pipelineRunning || pipelineComplete}
            animateLatest={consoleAnimate}
          />
        </div>

        {pipelineError && (
          <p className="px-5 pb-4 text-[13px] text-[#C0392B]">{pipelineError}</p>
        )}
      </div>

      {pipelineComplete && brief && (
        <div className="rounded-lg border border-[#E8E6F0] bg-[#FAFAFC] p-5 text-center space-y-3">
          <p className="text-[14px] text-[#0D0B14] font-medium">Brief ready — open the Clinician brief tab to review.</p>
          <button
            type="button"
            onClick={onBriefComplete}
            className="w-full bg-[#5B3FD4] text-white rounded-lg py-3 text-[14px] font-medium hover:bg-[#4A32B0] transition-colors"
          >
            View clinician brief
          </button>
          <button
            type="button"
            onClick={onNavigateIntake}
            className="w-full border border-[#E8E6F0] text-[#5B3FD4] rounded-lg py-2.5 text-[13px] font-medium hover:bg-white transition-colors"
          >
            Update medications (intake form)
          </button>
        </div>
      )}
      </div>
    </>
  )
}
