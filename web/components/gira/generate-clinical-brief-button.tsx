"use client"

import { Loader2 } from "lucide-react"

interface GenerateClinicalBriefButtonProps {
  running?: boolean
  complete?: boolean
  disabled?: boolean
  onClick: () => void
}

export default function GenerateClinicalBriefButton({
  running = false,
  complete = false,
  disabled = false,
  onClick,
}: GenerateClinicalBriefButtonProps) {
  const label = running
    ? "Running…"
    : complete
      ? "▷  Generate Clinical Brief again"
      : "▷  Generate Clinical Brief"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || running}
      className={`gira-generate-brief-btn ${running ? "gira-generate-brief-btn--running" : ""}`}
    >
      <span className="gira-generate-brief-btn__inner">
        {running && <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />}
        <span>{label}</span>
      </span>
    </button>
  )
}
