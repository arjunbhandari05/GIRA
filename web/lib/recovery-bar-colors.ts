/** WHOOP-style recovery tiers for bar / cell coloring (patient metrics). */
export function recoveryBarFill(score: number): string {
  if (score >= 67) return "#22c55e"
  if (score >= 34) return "#eab308"
  return "#ef4444"
}
