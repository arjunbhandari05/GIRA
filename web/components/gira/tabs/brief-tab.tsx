"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
} from "lucide-react"
import { motion } from "framer-motion"
import type { AgentBrief, LogLine, Patient, SafetyFlag } from "@/lib/types"
import { getAgentBrief, getSafetyFlags, listPatients, streamAgentBrief } from "@/lib/api"
import {
  genotypeForFlag,
  severityUi,
  traceStepToLogLine,
  traceToLogLines,
} from "@/lib/mappers"
import AgentConsole from "../agent-console"
import DoctorBriefView from "../doctor-brief-view"
import type { TraceStep } from "@/lib/types"

interface BriefTabProps {
  patient: Patient
  onNavigateIntake?: () => void
}

export default function BriefTab({ patient, onNavigateIntake }: BriefTabProps) {
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

  const sourceCards = [
    { id: "genome", title: "Genome", subtitle: "SNP profile", icon: Dna, accentColor: "#5B3FD4" },
    { id: "whoop", title: "Wearables", subtitle: "WHOOP 30-day", icon: Heart, accentColor: "#1A9E6E" },
    { id: "clinical", title: "Clinical APIs", subtitle: "ClinVar · PubMed", icon: Database, accentColor: "#5B3FD4" },
    { id: "intake", title: "Intake Form", subtitle: "Clinician chart", icon: ClipboardList, accentColor: "#B45309" },
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
      try {
        await loadContext()
        const cached = await getAgentBrief(patient.id, { cacheOnly: true })
        if (cancelled) return
        if (cached && !cached.error && (cached.cached || cached.generated_at || cached.snp_summary)) {
          setBrief(cached)
          setPipelineComplete(true)
          if (cached._trace?.length) {
            setLogLines(traceToLogLines(cached._trace))
            activateCardsFromTrace(cached._trace)
          }
        }
      } catch {
        /* no cache */
      } finally {
        if (!cancelled) setLoadingCache(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [patient.id, loadContext])

  const activateCardForTool = (tool: string) => {
    setActiveCards((prev) => {
      const next = new Set(prev)
      if (tool === "get_snp_profile" || tool === "fetch_pharmgkb") next.add("genome")
      if (tool === "fetch_whoop") next.add("whoop")
      if (
        tool === "fetch_clinvar" ||
        tool === "fetch_pubmed" ||
        tool === "fetch_rxnorm" ||
        tool === "fetch_trials"
      ) {
        next.add("clinical")
      }
      if (tool === "get_patient_intake" || tool === "fetch_glucose") next.add("intake")
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
      tools.has("fetch_trials")
    ) {
      cards.push("clinical")
    }
    if (tools.has("get_patient_intake") || tools.has("fetch_glucose")) cards.push("intake")
    setActiveCards(cards.length ? cards : ["genome", "whoop", "clinical", "intake"])
  }

  const appendTraceStep = (step: TraceStep) => {
    const elapsed = (Date.now() - pipelineStartRef.current) / 1000
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
  }

  const runPipeline = async () => {
    setPipelineRunning(true)
    setPipelineComplete(false)
    setPipelineError(null)
    pipelineStartRef.current = Date.now()
    setLogLines([{ timestamp: "00:00.0", text: "Loading PGx safety gates…", type: "info" }])
    setActiveCards([])

    try {
      const flags = await loadContext()
      const flagLine =
        flags.length === 0
          ? "No PGx safety flags on file"
          : `${flags.length} safety gate(s) — ${flags
              .slice(0, 3)
              .map((f) => f.gene)
              .filter(Boolean)
              .join(", ")}${flags.length > 3 ? "…" : ""}`
      setLogLines((prev) => [
        ...prev,
        {
          timestamp: traceStepToLogLine(
            { tool: "check_safety_flags" },
            (Date.now() - pipelineStartRef.current) / 1000
          ).timestamp,
          text: flagLine,
          type: flags.some((f) => (f.severity || "").toUpperCase() === "CRITICAL")
            ? "warning"
            : flags.length
              ? "warning"
              : "success",
        },
        {
          timestamp: traceStepToLogLine(
            { tool: "generate_brief" },
            (Date.now() - pipelineStartRef.current) / 1000
          ).timestamp,
          text: "Running tools in parallel — lines appear as each finishes",
          type: "info",
        },
      ])

      let completed = false
      let streamError: string | null = null
      let sawGenerateBrief = false
      await streamAgentBrief(patient.id, {
        refresh: true,
        onStep: (step) => {
          if (step.tool === "generate_brief" && step.status !== "partial") {
            sawGenerateBrief = true
          }
          appendTraceStep(step)
        },
        onComplete: (result) => {
          completed = true
          if (result.error) {
            streamError = String(result.error)
            return
          }
          setBrief(result)
          const elapsed = (Date.now() - pipelineStartRef.current) / 1000
          setLogLines((prev) => [
            ...prev,
            {
              timestamp: traceStepToLogLine({ tool: "generate_brief" }, elapsed).timestamp,
              text: "Brief ready for review",
              type: "success",
            },
          ])
          if (result._trace?.length) activateCardsFromTrace(result._trace)
          else setActiveCards(["genome", "whoop", "clinical", "intake"])
          setPipelineComplete(true)
        },
        onError: (message) => {
          streamError = message
        },
      })

      if (streamError) throw new Error(streamError)

      if (!completed) {
        const cached = await getAgentBrief(patient.id, { cacheOnly: true })
        if (cached && !cached.error && (cached.snp_summary?.length || cached.generated_at)) {
          setBrief(cached)
          setPipelineComplete(true)
          if (cached._trace?.length) activateCardsFromTrace(cached._trace)
          completed = true
        }
      }

      if (!completed && sawGenerateBrief) {
        const result = await getAgentBrief(patient.id, { cacheOnly: true })
        if (result && !result.error && result.snp_summary) {
          setBrief(result)
          setPipelineComplete(true)
          completed = true
        }
      }

      if (!completed) {
        const result = await getAgentBrief(patient.id, { refresh: true })
        if (result.error) throw new Error(String(result.error))
        setBrief(result)
        if (result._trace?.length) {
          setLogLines(traceToLogLines(result._trace, pipelineStartRef.current))
          activateCardsFromTrace(result._trace)
        }
        setPipelineComplete(true)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pipeline failed"
      setPipelineError(msg)
      setLogLines((prev) => [...prev, { timestamp: "—", text: msg, type: "error" }])
    } finally {
      setPipelineRunning(false)
    }
  }

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

  return (
    <div className="space-y-6">
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
            defaultOpen={pipelineRunning}
          />
        </div>

        {pipelineError && (
          <p className="px-5 pb-4 text-[13px] text-[#C0392B]">{pipelineError}</p>
        )}
      </div>

      {pipelineComplete && brief && (
        <>
          <DoctorBriefView
            patient={patient}
            brief={brief}
            safetyFlags={safetyFlags}
            snpProfile={snpProfile}
          />
          <button
            type="button"
            onClick={onNavigateIntake}
            className="w-full bg-[#5B3FD4] text-white rounded-lg py-3 text-[14px] font-medium hover:bg-[#4A32B0] transition-colors"
          >
            Update medications (intake form)
          </button>
        </>
      )}
    </div>
  )
}
