"use client"

import { useLiveMetric } from "@/hooks/use-live-metric"

interface LiveMetricValueProps {
  base: number | null | undefined
  enabled: boolean
  unit: string
  jitter?: number
  decimals?: number
}

export default function LiveMetricValue({
  base,
  enabled,
  unit,
  jitter = 4,
  decimals = 0,
}: LiveMetricValueProps) {
  const { value, tick } = useLiveMetric(base, enabled, jitter)

  if (value == null) {
    return (
      <>
        <span className="text-[24px] font-semibold text-[#0D0B14]">—</span>
        <span className="text-[13px] text-[#9895A8]">{unit}</span>
      </>
    )
  }

  const formatted =
    decimals > 0 ? value.toFixed(decimals) : String(Math.round(value))

  return (
    <>
      <span
        key={tick}
        className={`text-[24px] font-semibold text-[#0D0B14] tabular-nums ${
          enabled ? "live-metric-value live-metric-tick" : ""
        }`}
      >
        {formatted}
      </span>
      <span className="text-[13px] text-[#9895A8]">{unit}</span>
      {enabled && (
        <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-[#1A9E6E]">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#1A9E6E]" />
          Live
        </span>
      )}
    </>
  )
}
