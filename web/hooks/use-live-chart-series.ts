"use client"

import { useEffect, useRef, useState } from "react"

function jitterPoint(value: number, jitter: number, min: number, max: number): number {
  const delta = Math.floor(Math.random() * (2 * jitter + 1)) - jitter
  return Math.min(max, Math.max(min, Math.round(value + delta)))
}

/**
 * Periodically perturbs each Y value around the loaded series (±jitter) for a "live sensor" chart.
 */
export function useLiveChartSeries<T extends { day: number; value: number }>(
  baseSeries: T[],
  enabled: boolean,
  jitter = 2,
  tickMs = 2200
): T[] {
  const [live, setLive] = useState<T[]>(baseSeries)
  const baseRef = useRef(baseSeries)

  useEffect(() => {
    baseRef.current = baseSeries
    setLive(baseSeries)
  }, [baseSeries, enabled])

  useEffect(() => {
    if (!enabled || !baseRef.current.length) return

    let id: ReturnType<typeof setInterval>

    const tick = () => {
      const src = baseRef.current
      if (!src.length) return
      const ys = src.map((d) => d.value)
      const lo = Math.min(...ys) - 8
      const hi = Math.max(...ys) + 8
      setLive(
        src.map((d) => ({
          ...d,
          value: jitterPoint(d.value, jitter, lo, hi),
        })) as T[]
      )
    }

    id = setInterval(tick, tickMs + Math.floor(Math.random() * 600))
    return () => clearInterval(id)
  }, [enabled, baseSeries, jitter, tickMs])

  return enabled && baseSeries.length ? live : baseSeries
}
