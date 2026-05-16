"use client"

import type { RunTimingSummary as Timing } from "@/lib/types"
import { formatDurationMs } from "@/lib/format-duration"

const TOOL_DISPLAY: Record<string, string> = {
  nemotron_turn: "Nemotron (planning)",
  get_snp_profile: "SNP profile (local)",
  get_patient_intake: "Patient intake (local)",
  fetch_glucose: "CGM glucose",
  fetch_whoop: "WHOOP wearable",
  fetch_clinvar: "ClinVar",
  fetch_pubmed: "PubMed",
  fetch_trials: "Trials",
  generate_brief: "Brief assembly",
  check_safety_flags: "Safety flags",
}

interface RunTimingSummaryProps {
  timing?: Timing
  backend?: string
}

export default function RunTimingSummary({ timing, backend }: RunTimingSummaryProps) {
  if (!timing || !timing.total_ms) return null

  const slowest =
    timing.slowest_tools?.length
      ? timing.slowest_tools
      : Object.entries(timing.by_tool_ms || {})
          .map(([tool, duration_ms]) => ({ tool, duration_ms }))
          .sort((a, b) => b.duration_ms - a.duration_ms)
          .slice(0, 5)

  return (
    <section className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-foreground">Run timing</h3>
        {backend && <span className="text-xs text-muted-foreground">backend: {backend}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Total <strong className="text-foreground">{formatDurationMs(timing.total_ms)}</strong>
        </span>
        <span>
          LLM <strong className="text-foreground">{formatDurationMs(timing.llm_ms)}</strong>
        </span>
        <span>
          Tools <strong className="text-foreground">{formatDurationMs(timing.tool_ms)}</strong>
        </span>
        {timing.step_count != null && <span>{timing.step_count} trace steps</span>}
      </div>
      {slowest.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {slowest.map(({ tool, duration_ms }) => (
            <li key={tool} className="flex justify-between gap-4 text-muted-foreground">
              <span>{TOOL_DISPLAY[tool] || tool.replace(/_/g, " ")}</span>
              <span className="tabular-nums text-foreground">{formatDurationMs(duration_ms)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
