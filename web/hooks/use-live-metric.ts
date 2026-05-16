"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Simulates a live sensor reading by jittering around a base value.
 */
export function useLiveMetric(
  base: number | null | undefined,
  enabled: boolean,
  jitter = 4
): { value: number | null; tick: number } {
  const [value, setValue] = useState<number | null>(base ?? null)
  const [tick, setTick] = useState(0)
  const baseRef = useRef(base)

  useEffect(() => {
    baseRef.current = base
    if (base == null || Number.isNaN(base)) {
      setValue(null)
      return
    }
    setValue(Math.round(base))
  }, [base])

  useEffect(() => {
    if (!enabled || base == null || Number.isNaN(base)) {
      return
    }

    let timeout: ReturnType<typeof setTimeout>

    const schedule = () => {
      const delay = 900 + Math.random() * 1100
      timeout = setTimeout(() => {
        const b = baseRef.current
        if (b == null || Number.isNaN(b)) return
        const delta = (Math.random() * 2 - 1) * jitter
        setValue(Math.round(b + delta))
        setTick((t) => t + 1)
        schedule()
      }, delay)
    }

    schedule()
    return () => clearTimeout(timeout)
  }, [enabled, base, jitter])

  return { value, tick }
}
