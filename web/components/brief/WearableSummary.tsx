import type { WearableInsight } from "@/types/brief"

interface WearableSummaryProps {
  wearable: WearableInsight
}

function StatRow({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string
  tone?: "warn" | "bad"
}) {
  const toneClass = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600" : ""
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className={`font-medium ${toneClass}`}>{value}</span>
        {note ? <p className="text-[11px] text-amber-600">{note}</p> : null}
      </div>
    </div>
  )
}

export default function WearableSummary({ wearable }: WearableSummaryProps) {
  const lowHrv = wearable.avg_hrv_ms < 30
  const lowSleep = wearable.sleep_score_pct < 60
  const lowDeep = wearable.deep_sleep_pct < 20

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Wearable — 30-day summary</h3>
      <div className="rounded-md border bg-card px-3">
        <StatRow label="Recovery score" value={`${wearable.avg_recovery_pct}%`} />
        <StatRow label="Resting HR" value={`${wearable.avg_resting_hr} bpm`} />
        <StatRow
          label="HRV"
          value={`${wearable.avg_hrv_ms} ms`}
          note={lowHrv ? "⚠ autonomic stress" : undefined}
          tone={lowHrv ? "warn" : undefined}
        />
        <StatRow label="Strain" value={String(wearable.avg_strain)} />
        <StatRow
          label="Sleep score"
          value={`${wearable.sleep_score_pct}%`}
          tone={lowSleep ? "warn" : undefined}
        />
        <StatRow
          label="Deep sleep"
          value={`${wearable.deep_sleep_pct}%`}
          tone={lowDeep ? "warn" : undefined}
        />
        <StatRow
          label="Sleep duration"
          value={wearable.avg_sleep_hrs != null ? `${wearable.avg_sleep_hrs} hrs` : "—"}
        />
      </div>
      {wearable.interpretation ? (
        <p className="text-xs text-muted-foreground">{wearable.interpretation}</p>
      ) : null}
    </section>
  )
}
