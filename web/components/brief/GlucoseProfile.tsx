import type { GlucoseInsight } from "@/types/brief"

interface GlucoseProfileProps {
  glucose: GlucoseInsight
}

function StatRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "warn" | "bad" | "good"
}) {
  const toneClass =
    tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-green-600" : ""
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${toneClass}`}>{value}</span>
    </div>
  )
}

export default function GlucoseProfile({ glucose }: GlucoseProfileProps) {
  const high = Math.max(0, glucose.time_high_pct)
  const inRange = Math.max(0, glucose.time_in_range_pct)
  const low = Math.max(0, glucose.time_low_pct)

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">CGM — 30-day profile</h3>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        <div
          className="flex items-center justify-center bg-red-500 text-[9px] text-white"
          style={{ width: `${high}%` }}
          title={`High ${high}%`}
        >
          {high >= 8 ? `${high}%` : ""}
        </div>
        <div
          className="flex items-center justify-center bg-green-600 text-[9px] text-white"
          style={{ width: `${inRange}%` }}
          title={`In range ${inRange}%`}
        >
          {inRange >= 8 ? `${inRange}%` : ""}
        </div>
        <div
          className="flex items-center justify-center bg-amber-500 text-[9px] text-white"
          style={{ width: `${low}%` }}
          title={`Low ${low}%`}
        >
          {low >= 8 ? `${low}%` : ""}
        </div>
      </div>
      <div className="rounded-md border bg-card px-3">
        <StatRow label="Peak glucose" value={`${glucose.peak_glucose} mg/dL`} tone={glucose.peak_glucose > 180 ? "bad" : undefined} />
        <StatRow label="Avg postprandial rise" value={`+${glucose.avg_postprandial_rise} mg/dL`} />
        <StatRow label="Glucose variability (CV)" value={`${glucose.glucose_variability_cv}%`} tone={glucose.glucose_variability_cv > 36 ? "warn" : undefined} />
        <StatRow
          label="Nocturnal lows"
          value={glucose.nocturnal_lows ? "Yes" : "No"}
          tone={glucose.nocturnal_lows ? "warn" : "good"}
        />
        <StatRow
          label="Dawn phenomenon"
          value={
            glucose.dawn_phenomenon
              ? `Present — ${glucose.dawn_phenomenon_days ?? 0}/30 days`
              : "Absent"
          }
        />
      </div>
      {glucose.interpretation ? (
        <p className="text-xs text-muted-foreground">{glucose.interpretation}</p>
      ) : null}
    </section>
  )
}
