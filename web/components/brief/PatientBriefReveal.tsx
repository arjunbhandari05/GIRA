"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

interface PatientBriefRevealProps {
  /** Stagger index: 0 → 0ms, 1 → 120ms, etc. */
  index: number
  children: ReactNode
  className?: string
}

/**
 * One-shot mount animation for patient "Your brief" sections (CSS only).
 */
export default function PatientBriefReveal({ index, children, className }: PatientBriefRevealProps) {
  const [visible, setVisible] = useState(false)
  const playedRef = useRef(false)

  useEffect(() => {
    if (playedRef.current) return
    const delayMs = index * 120
    const timer = window.setTimeout(() => {
      playedRef.current = true
      setVisible(true)
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [index])

  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 400ms ease-out, transform 400ms ease-out",
      }}
    >
      {children}
    </div>
  )
}
