import {
  formatPatientMgDl,
  formatPatientPercent,
} from "@/lib/patient-display"
import type { GlucoseInsight } from "@/types/brief"

interface GlucoseProfileProps {
  glucose: GlucoseInsight
  variant?: "patient" | "clinician"
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

export default function GlucoseProfile({ glucose, variant = "clinician" }: GlucoseProfileProps) {
  const isPatient = variant === "patient"
  const fmtPct = (n: number) => (isPatient ? formatPatientPercent(n) : `${n}%`)
  const fmtMg = (n: number) => (isPatient ? formatPatientMgDl(n) : String(n))

  const high = Math.max(0, glucose.time_high_pct)
  const inRange = Math.max(0, glucose.time_in_range_pct)
  const low = Math.max(0, glucose.time_low_pct)
  const barHigh = isPatient ? Number(high.toFixed(1)) : high
  const barInRange = isPatient ? Number(inRange.toFixed(1)) : inRange
  const barLow = isPatient ? Number(low.toFixed(1)) : low

  const peakLabel = isPatient ? "Highest blood sugar reading" : "Peak glucose"
  const riseLabel = isPatient ? "Blood sugar rise after meals" : "Avg postprandial rise"
  const cvLabel = isPatient
    ? "How much your blood sugar fluctuates day to day"
    : "Glucose variability (CV)"
  const lowsLabel = isPatient ? "Low blood sugar overnight" : "Nocturnal lows"
  const dawnLabel = isPatient ? "Early morning blood sugar spike" : "Dawn phenomenon"

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">
        {isPatient ? "Blood sugar sensor — last 30 days" : "CGM — 30-day profile"}
      </h3>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        <div
          className="flex items-center justify-center bg-red-500 text-[9px] text-white"
          style={{ width: `${barHigh}%` }}
          title={`High ${fmtPct(high)}`}
        >
          {barHigh >= 8 ? fmtPct(high) : ""}
        </div>
        <div
          className="flex items-center justify-center bg-green-600 text-[9px] text-white"
          style={{ width: `${barInRange}%` }}
          title={`In range ${fmtPct(inRange)}`}
        >
          {barInRange >= 8 ? fmtPct(inRange) : ""}
        </div>
        <div
          className="flex items-center justify-center bg-amber-500 text-[9px] text-white"
          style={{ width: `${barLow}%` }}
          title={`Low ${fmtPct(low)}`}
        >
          {barLow >= 8 ? fmtPct(low) : ""}
        </div>
      </div>
      <div className="rounded-md border bg-card px-3">
        <StatRow
          label={peakLabel}
          value={`${fmtMg(glucose.peak_glucose)} mg/dL`}
          tone={glucose.peak_glucose > 180 ? "bad" : undefined}
        />
        <StatRow label={riseLabel} value={`+${fmtMg(glucose.avg_postprandial_rise)} mg/dL`} />
        <StatRow
          label={cvLabel}
          value={isPatient ? fmtPct(glucose.glucose_variability_cv) : fmtPct(glucose.glucose_variability_cv)}
          tone={glucose.glucose_variability_cv > 36 ? "warn" : undefined}
        />
        <StatRow
          label={lowsLabel}
          value={glucose.nocturnal_lows ? "Yes — talk with your doctor" : "No"}
          tone={glucose.nocturnal_lows ? "warn" : "good"}
        />
        <StatRow
          label={dawnLabel}
          value={
            glucose.dawn_phenomenon
              ? isPatient
                ? `Seen on ${glucose.dawn_phenomenon_days ?? 0} of 30 days`
                : `Present — ${glucose.dawn_phenomenon_days ?? 0}/30 days`
              : isPatient
                ? "Not seen in this period"
                : "Absent"
          }
        />
      </div>
      {glucose.interpretation && !isPatient ? (
        <p className="text-xs text-muted-foreground">{glucose.interpretation}</p>
      ) : null}
    </section>
  )
}
