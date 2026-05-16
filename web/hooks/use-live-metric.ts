"use client"

import { useEffect, useRef, useState } from "react"

function applyJitter(
  base: number,
  jitter: number,
  decimals: number
): number {
  if (decimals <= 0) {
    const delta = Math.floor(Math.random() * (2 * jitter + 1)) - jitter
    return Math.round(base + delta)
  }
  const delta = Math.random() * (2 * jitter) - jitter
  const factor = 10 ** decimals
  return Math.round((base + delta) * factor) / factor
}

export type LiveMetricOptions = {
  /** How often the displayed value nudges (ms). Default 3000. */
  valueIntervalMs?: number
  /** How often the UI pulse fires (ms). Default 1000. */
  pulseIntervalMs?: number
}

/**
 * Simulates a live sensor: value jitters on valueIntervalMs; pulse increments on pulseIntervalMs.
 */
export function useLiveMetric(
  base: number | null | undefined,
  enabled: boolean,
  jitter = 2,
  decimals = 0,
  options: LiveMetricOptions = {}
): { value: number | null; tick: number; pulse: number } {
  const valueIntervalMs = options.valueIntervalMs ?? 4000
  const pulseIntervalMs = options.pulseIntervalMs ?? 2000

  const [value, setValue] = useState<number | null>(
    base == null || Number.isNaN(base)
      ? null
      : decimals > 0
        ? Math.round(base * 10 ** decimals) / 10 ** decimals
        : Math.round(base)
  )
  const [tick, setTick] = useState(0)
  const [pulse, setPulse] = useState(0)
  const baseRef = useRef(base)

  useEffect(() => {
    baseRef.current = base
    if (base == null || Number.isNaN(base)) {
      setValue(null)
      return
    }
    if (decimals > 0) {
      const factor = 10 ** decimals
      setValue(Math.round(base * factor) / factor)
    } else {
      setValue(Math.round(base))
    }
  }, [base, decimals])

  useEffect(() => {
    if (!enabled || base == null || Number.isNaN(base)) {
      return
    }

    const valueId = setInterval(() => {
      const b = baseRef.current
      if (b == null || Number.isNaN(b)) return
      setValue(applyJitter(b, jitter, decimals))
      setTick((t) => t + 1)
    }, valueIntervalMs)

    const pulseId = setInterval(() => {
      setPulse((p) => p + 1)
    }, pulseIntervalMs)

    return () => {
      clearInterval(valueId)
      clearInterval(pulseId)
    }
  }, [enabled, base, jitter, decimals, valueIntervalMs, pulseIntervalMs])

  return { value, tick, pulse }
}
