"use client"

import { useMemo } from "react"
import { Moon, TrendingDown, TrendingUp, Minus } from "lucide-react"
import {
  padScoresForContributionGrid,
  recoveryCellFill,
  RECOVERY_MAX_DAYS,
  RECOVERY_ROWS,
} from "@/lib/recovery-heatmap"

const COLS = Math.ceil(RECOVERY_MAX_DAYS / RECOVERY_ROWS)
const CELL = "h-[9px] w-[9px] min-h-[9px] min-w-[9px] shrink-0 rounded-[2px]"
const ROW_H = "h-[9px]"

export type RecoveryDayPoint = { day?: string; score: number }

export type RecoverySummary = {
  value: string
  unit: string
  trend: "up" | "down" | "stable"
  change: string
  status: string
}

function weekdayLabels(): string[] {
  return ["Mon", "", "Wed", "", "Fri", "", "Sun"]
}

function trendIcon(trend: RecoverySummary["trend"]) {
  if (trend === "up") return <TrendingUp className="w-4 h-4" />
  if (trend === "down") return <TrendingDown className="w-4 h-4" />
  return <Minus className="w-4 h-4" />
}

export interface RecoveryContributionGridProps {
  data: RecoveryDayPoint[]
  summary: RecoverySummary
}

/**
 * GitHub-style recovery heatmap in the same card shell as HRV / glucose metrics.
 * Values are static (no live refresh).
 */
export function RecoveryContributionGrid({ data, summary }: RecoveryContributionGridProps) {
  if (!data.length) return null

  const rawScores = useMemo(() => data.map((d) => d.score), [data])
  const padded = padScoresForContributionGrid(rawScores)
  const nDays = Math.min(RECOVERY_MAX_DAYS, rawScores.length)

  let lastFilled = -1
  padded.forEach((v, i) => {
    if (v != null) lastFilled = i
  })

  const legendSamples: (number | null)[] = [null, 22, 48, 62, 78, 94]

  return (
    <div className="border border-[#E8E6F0] rounded-lg bg-white p-5">
      <div className="flex items-start justify-between mb-3">
        <Moon className="w-[18px] h-[18px] text-[#5B3FD4] shrink-0" />
        <span className="text-[11px] font-medium text-[#9895A8]">{summary.status}</span>
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9895A8] mb-1">
        Recovery score
      </p>
      <div className="flex items-baseline gap-1 flex-wrap">
        <span className="text-[24px] font-semibold text-[#0D0B14] tabular-nums">{summary.value}</span>
        <span className="text-[13px] text-[#9895A8]">{summary.unit}</span>
      </div>
      <div className="flex items-center gap-1 mt-2 text-[12px] text-[#6B6778]">
        {trendIcon(summary.trend)}
        <span>{summary.change}</span>
      </div>

      <p className="text-[12px] text-[#9895A8] mt-4 mb-1">
        Daily readiness from WHOOP strain &amp; sleep balance
      </p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[#C4C1D4] mb-2">
        Last {nDays} days · {COLS} weeks
      </p>

      <div className="flex gap-1.5 min-w-0 items-start">
        <div className="flex flex-col gap-1 shrink-0 w-7 pr-0.5">
          {weekdayLabels().map((label, i) => (
            <div
              key={i}
              className={`${ROW_H} flex items-center justify-end text-[9px] font-medium uppercase text-[#9895A8] leading-none`}
            >
              {label || ""}
            </div>
          ))}
        </div>

        <div className="flex gap-1 shrink-0">
          {Array.from({ length: COLS }, (_, col) => (
            <div key={col} className="flex flex-col gap-1 items-center shrink-0">
              {Array.from({ length: RECOVERY_ROWS }, (_, row) => {
                const idx = col * RECOVERY_ROWS + row
                const score = padded[idx] ?? null
                const fill = recoveryCellFill(score)
                const isToday = idx === lastFilled
                return (
                  <div
                    key={`${col}-${row}`}
                    className={`${ROW_H} flex w-[9px] items-center justify-center`}
                  >
                    <div
                      title={
                        score == null
                          ? "No data"
                          : `Recovery ${Math.round(score)} / 100${score >= 67 ? " · optimal" : score >= 34 ? " · moderate" : " · low"}`
                      }
                      className={`${CELL} ${fill.className} ${
                        isToday ? "ring-2 ring-[#5B3FD4]/55 ring-offset-[1px]" : ""
                      }`}
                      style={fill.style}
                    />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-[#E8E6F0] pt-4">
        <div className="flex flex-wrap gap-3 text-[11px] text-[#6B6778]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: "rgba(26,158,110,0.85)" }} />
            Green 67+
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: "rgba(212,160,23,0.85)" }} />
            Yellow 34–66
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: "rgba(192,57,43,0.85)" }} />
            Red &lt;34
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[#9895A8]">
          <span>Less</span>
          <div className="flex gap-0.5">
            {legendSamples.map((s, i) => {
              const f = recoveryCellFill(s)
              return (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-[2px] ${f.className}`}
                  style={f.style}
                />
              )
            })}
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  )
}

export default function RecoveryWeekChart(props: RecoveryContributionGridProps) {
  return <RecoveryContributionGrid {...props} />
}
