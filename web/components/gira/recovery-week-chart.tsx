"use client"

import { useLiveMetric } from "@/hooks/use-live-metric"

const BAR_MAX_PX = 108

function recoveryTone(score: number): { bar: string; text: string } {
  if (score >= 67) return { bar: "bg-[#1A9E6E]", text: "text-[#1A9E6E]" }
  if (score >= 34) return { bar: "bg-[#D4A017]", text: "text-[#B45309]" }
  return { bar: "bg-[#C0392B]", text: "text-[#C0392B]" }
}

function RecoveryDayBar({
  day,
  baseScore,
  liveMode,
  isToday,
}: {
  day: string
  baseScore: number
  liveMode: boolean
  isToday: boolean
}) {
  const { value, tick } = useLiveMetric(baseScore, liveMode, 2)
  const score = value ?? baseScore
  const height = Math.max(14, Math.round((score / 100) * BAR_MAX_PX))
  const tone = recoveryTone(score)

  return (
    <div className="flex flex-1 flex-col items-center min-w-0">
      <span
        key={liveMode ? tick : day}
        className={`text-[12px] font-semibold tabular-nums ${tone.text} ${
          liveMode ? "live-metric-tick" : ""
        }`}
      >
        {score}
      </span>
      <div
        className="mt-2 w-full max-w-[52px] flex items-end justify-center"
        style={{ height: BAR_MAX_PX }}
      >
        <div
          role="presentation"
          className={`w-[85%] rounded-t-[6px] shadow-sm transition-[height] duration-500 ease-out ${tone.bar} ${
            isToday ? "ring-2 ring-[#5B3FD4]/40 ring-offset-2" : ""
          }`}
          style={{
            height,
            opacity: 0.72 + (score / 100) * 0.28,
          }}
          title={`Recovery ${score}%`}
        />
      </div>
      <span
        className={`mt-2 text-[10px] font-medium uppercase tracking-wide ${
          isToday ? "text-[#5B3FD4]" : "text-[#9895A8]"
        }`}
      >
        {day}
      </span>
    </div>
  )
}

export default function RecoveryWeekChart({
  data,
  liveMode = false,
}: {
  data: { day: string; score: number }[]
  liveMode?: boolean
}) {
  if (!data.length) return null

  const avg = Math.round(data.reduce((s, d) => s + d.score, 0) / data.length)
  const avgHeight = Math.max(14, Math.round((avg / 100) * BAR_MAX_PX))

  return (
    <div className="border border-[#E8E6F0] rounded-lg bg-white p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold uppercase text-[#9895A8]">Recovery</p>
        <p className="text-[12px] text-[#6B6778]">
          7-day avg <span className="font-semibold text-[#0D0B14] tabular-nums">{avg}</span>
          <span className="text-[#9895A8]"> / 100</span>
        </p>
      </div>
      <p className="text-[12px] text-[#9895A8] mb-5">Daily readiness from WHOOP strain & sleep balance</p>

      <div className="relative px-1">
        <div
          className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-[#C4C1D4]"
          style={{ bottom: avgHeight + 28 }}
        />
        <span
          className="pointer-events-none absolute right-0 text-[10px] text-[#9895A8] -translate-y-1/2"
          style={{ bottom: avgHeight + 28 }}
        >
          avg
        </span>

        <div className="flex items-end justify-between gap-1">
          {data.map((d, i) => (
            <RecoveryDayBar
              key={d.day}
              day={d.day}
              baseScore={d.score}
              liveMode={liveMode}
              isToday={i === data.length - 1}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-4 text-[11px] text-[#6B6778]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#1A9E6E]" />
          Green 67+
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#D4A017]" />
          Yellow 34–66
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#C0392B]" />
          Red &lt;34
        </span>
      </div>
    </div>
  )
}
