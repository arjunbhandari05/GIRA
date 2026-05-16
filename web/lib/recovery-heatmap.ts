/** GitHub-style recovery cell: hue by band, alpha by score within band. */

import type { CSSProperties } from "react"

export const RECOVERY_ROWS = 7
export const RECOVERY_MAX_DAYS = 30

export function padScoresForContributionGrid(scores: number[]): (number | null)[] {
  const take = Math.min(RECOVERY_MAX_DAYS, Math.max(0, scores.length))
  const tail = take === 0 ? [] : scores.slice(-take)
  const cols = Math.ceil(RECOVERY_MAX_DAYS / RECOVERY_ROWS)
  const total = cols * RECOVERY_ROWS
  const lead = total - tail.length
  const out: (number | null)[] = []
  for (let i = 0; i < lead; i++) out.push(null)
  for (const s of tail) out.push(s)
  while (out.length < total) out.push(null)
  return out
}

export function recoveryCellFill(score: number | null): {
  className: string
  style: CSSProperties
} {
  if (score == null || Number.isNaN(score)) {
    return {
      className: "border border-[#E8E6F0]",
      style: { backgroundColor: "#F3F2F7" },
    }
  }
  const s = Math.min(100, Math.max(0, score))

  if (s >= 67) {
    const t = (s - 67) / (100 - 67)
    const alpha = 0.28 + t * 0.82
    return {
      className: "rounded-[3px]",
      style: { backgroundColor: `rgba(26, 158, 110, ${alpha})` },
    }
  }
  if (s >= 34) {
    const t = (s - 34) / (66 - 34)
    const alpha = 0.28 + t * 0.82
    return {
      className: "rounded-[3px]",
      style: { backgroundColor: `rgba(212, 160, 23, ${alpha})` },
    }
  }
  const t = s / 33
  const alpha = 0.28 + t * 0.82
  return {
    className: "rounded-[3px]",
    style: { backgroundColor: `rgba(192, 57, 43, ${alpha})` },
  }
}
