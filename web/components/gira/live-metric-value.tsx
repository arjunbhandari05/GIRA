"use client"

import { useLiveMetric, type LiveMetricOptions } from "@/hooks/use-live-metric"

interface LiveMetricValueProps {
  base: number | null | undefined
  enabled: boolean
  unit: string
  jitter?: number
  decimals?: number
  liveOptions?: LiveMetricOptions
}

export default function LiveMetricValue({
  base,
  enabled,
  unit,
  jitter = 2,
  decimals = 0,
  liveOptions,
}: LiveMetricValueProps) {
  const { value, tick, pulse } = useLiveMetric(base, enabled, jitter, decimals, liveOptions)

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

  /** Re-mount each pulse/value tick so the fade cycle replays (~1s pulse, ~3s value). */
  const animKey = enabled ? `${pulse}-${tick}` : "static"

  return (
    <>
      <span
        key={animKey}
        className={`text-[24px] font-semibold text-[#0D0B14] tabular-nums inline-block ${
          enabled ? "live-metric-value live-metric-fade-cycle" : ""
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
