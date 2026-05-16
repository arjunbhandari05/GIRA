"use client"

import { useEffect, useMemo, useState } from "react"
import { Heart, Activity, Droplet, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react"
import { getGlucose, getWearable } from "@/lib/api"
import { wearableTrendToUi } from "@/lib/mappers"
import {
  formatPatientBpm,
  formatPatientMgDl,
  formatPatientMs,
  formatPatientPercent,
  formatPatientWowPct,
} from "@/lib/patient-display"
import LiveMetricValue from "../live-metric-value"
import MetricAreaChart from "../metric-area-chart"
import RecoveryWeekChart, { type RecoverySummary } from "../recovery-week-chart"

const LIVE_VALUE_MS = 4000
const LIVE_PULSE_MS = 2000

interface WhoopDataTabProps {
  patientId: string
  refreshKey?: number
  /** Patient portal: shows sync hint only (metric values stay static). */
  liveMode?: boolean
}

type MetricCard = {
  label: string
  value: string
  unit: string
  trend: "up" | "down" | "stable"
  change: string
  icon: typeof Heart
  status: string
}

export default function WhoopDataTab({ patientId, refreshKey = 0, liveMode = false }: WhoopDataTabProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<MetricCard[]>([])
  const [hrvData, setHrvData] = useState<{ day: number; value: number }[]>([])
  const [glucoseData, setGlucoseData] = useState<{ day: number; value: number }[]>([])
  const [recoveryData, setRecoveryData] = useState<{ score: number }[]>([])
  const [recoverySummary, setRecoverySummary] = useState<RecoverySummary | null>(null)
  const [metricBases, setMetricBases] = useState<{ hrv?: number; glucose?: number; rhr?: number }>({})
  const [insight, setInsight] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [whoop, glucose] = await Promise.all([
          getWearable(patientId),
          getGlucose(patientId),
        ])
        if (cancelled) return

        const whoopErr = Boolean(whoop.error)
        const glucoseErr = Boolean(glucose.error)
        if (whoopErr && glucoseErr) {
          setError(
            "No wearable or CGM files for this patient. The patient can upload them on their Setup page."
          )
        } else if (whoopErr) {
          setError(String(whoop.error))
        } else if (glucoseErr) {
          setError(String(glucose.error))
        } else {
          setError(null)
        }

        const wm = (whoop.metrics || {}) as Record<
          string,
          { avg_30d?: number; wow_pct?: number; trend?: string }
        >
        const hrv = wm.hrv_ms || {}
        const rhr = wm.rhr_bpm || {}
        const recovery = wm.recovery_score || {}

        const gAvg = glucose.avg_glucose_mgdl as number | undefined
        const gTrend = glucose.trend_direction as string | undefined
        const gWow = glucose.trend_delta_mgdl as number | undefined

        const hrvBase = hrv.avg_30d != null ? Number(hrv.avg_30d) : undefined
        const rhrBase = rhr.avg_30d != null ? Number(rhr.avg_30d) : undefined
        const glucoseBase = gAvg != null ? Number(gAvg) : undefined
        setMetricBases({ hrv: hrvBase, glucose: glucoseBase, rhr: rhrBase })

        const recoveryAvg = recovery.avg_30d != null ? Number(recovery.avg_30d) : null
        const fmt = liveMode
        setRecoverySummary({
          value:
            recoveryAvg != null
              ? fmt
                ? formatPatientPercent(recoveryAvg).replace("%", "")
                : Number.isInteger(recoveryAvg)
                  ? String(recoveryAvg)
                  : recoveryAvg.toFixed(1)
              : "—",
          unit: "/100",
          trend: wearableTrendToUi(recovery.trend),
          change: fmt ? formatPatientWowPct(recovery.wow_pct) : `${recovery.wow_pct ?? 0}%`,
          status: (recoveryAvg ?? 0) < 50 ? "Low" : "Normal",
        })

        setMetrics([
          {
            label: "Heart Rate Variability",
            value: hrvBase != null ? (fmt ? formatPatientMs(hrvBase) : String(Math.round(hrvBase))) : "—",
            unit: "ms",
            trend: wearableTrendToUi(hrv.trend),
            change: fmt
              ? formatPatientWowPct(hrv.wow_pct)
              : `${hrv.wow_pct != null && hrv.wow_pct > 0 ? "+" : ""}${hrv.wow_pct ?? 0}%`,
            icon: Activity,
            status: hrv.trend === "improving" ? "Good" : "Normal",
          },
          {
            label: "Resting Heart Rate",
            value: rhrBase != null ? (fmt ? formatPatientBpm(rhrBase) : String(rhr.avg_30d)) : "—",
            unit: "bpm",
            trend: wearableTrendToUi(rhr.trend),
            change: fmt ? formatPatientWowPct(rhr.wow_pct) : `${rhr.wow_pct ?? 0}%`,
            icon: Heart,
            status: "Normal",
          },
          {
            label: "Blood Glucose (CGM)",
            value: glucoseBase != null ? (fmt ? formatPatientMgDl(glucoseBase) : String(Math.round(glucoseBase))) : "—",
            unit: "mg/dL",
            trend:
              gTrend === "improving" ? "down" : gTrend === "worsening" ? "up" : "stable",
            change:
              gWow != null
                ? fmt
                  ? `${gWow > 0 ? "+" : ""}${formatPatientMgDl(gWow)} mg/dL`
                  : `${gWow > 0 ? "+" : ""}${gWow} mg/dL`
                : "—",
            icon: Droplet,
            status:
              gAvg != null && gAvg > 140
                ? "Elevated"
                : glucose.controlled
                  ? "Good"
                  : "Monitor",
          },
        ])

        const raw = (whoop.raw_series || {}) as Record<string, number[]>
        const hrvSeries = raw.hrv_ms || []
        const recoverySeries = raw.recovery_score || []
        setHrvData(hrvSeries.slice(-30).map((value, i) => ({ day: i + 1, value })))
        setRecoveryData(
          recoverySeries.slice(-30).map((score) => ({
            score: Math.round(Number(score)),
          }))
        )

        const daily = (glucose as { daily_summaries?: { avg_mgdl: number }[] }).daily_summaries
        if (daily?.length) {
          setGlucoseData(daily.slice(-30).map((d, i) => ({ day: i + 1, value: d.avg_mgdl })))
        } else if (gAvg) {
          setGlucoseData(Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: gAvg })))
        }

        const parts: string[] = []
        if (glucose.time_in_range_pct != null) {
          if (liveMode) {
            parts.push(
              `About ${formatPatientPercent(Number(glucose.time_in_range_pct))} of your recent readings were in your target range.`
            )
          } else {
            parts.push(`CGM TIR ${glucose.time_in_range_pct}% (GET /glucose/${patientId}).`)
          }
        }
        if (whoop.hypoglycemia_signal) {
          parts.push(
            liveMode
              ? "Your wearable noticed a possible low-blood-sugar pattern — mention this at your next visit."
              : "Wearable hypoglycemia pattern detected — discuss with patient."
          )
        }
        setInsight(parts.join(" ") || null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load metrics")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [patientId, refreshKey, liveMode])

  const topMetrics = useMemo(
    () => metrics.filter((m) => !m.label.includes("Recovery")),
    [metrics]
  )

  const showLiveCards = Boolean(liveMode && !error)
  const showLiveChartEnd = showLiveCards

  const getTrendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp className="w-4 h-4" />
    if (trend === "down") return <TrendingDown className="w-4 h-4" />
    return <Minus className="w-4 h-4" />
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#9895A8] py-12 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading WHOOP + CGM…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8]">
          {liveMode ? "Live Metrics" : "Metrics"}
        </p>
        <p className="text-[13px] text-[#6B6778] mt-1">
          {liveMode
            ? "Connected device summary (values refresh when you reload)."
            : "30-day summary from uploaded wearable and CGM data."}
        </p>
        {liveMode && !error && (
          <p className="text-[12px] text-[#9895A8] mt-1">Last synced from your devices</p>
        )}
      </div>

      {error && <p className="text-[13px] text-[#C0392B]">{error}</p>}
      {insight && (
        <div className="border-l-[3px] border-l-[#5B3FD4] border border-[#E8E6F0] rounded-lg p-4 text-[13px] text-[#6B6778]">
          {insight}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {topMetrics.map((metric) => {
          const Icon = metric.icon
          const isRhr = metric.label.includes("Resting Heart")
          const isGlucose = metric.label.includes("Glucose")
          const liveOpts = { valueIntervalMs: LIVE_VALUE_MS, pulseIntervalMs: LIVE_PULSE_MS }
          return (
            <div key={metric.label} className="border border-[#E8E6F0] rounded-lg bg-white p-5">
              <div className="flex items-start justify-between mb-3">
                <Icon className="w-[18px] h-[18px] text-[#5B3FD4]" />
                <span className="text-[11px] font-medium text-[#9895A8]">{metric.status}</span>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9895A8] mb-1">
                {metric.label}
              </p>
              <div className="flex items-baseline gap-1 flex-wrap">
                {showLiveCards && isRhr ? (
                  <LiveMetricValue
                    base={metricBases.rhr}
                    enabled
                    unit={metric.unit}
                    jitter={0.5}
                    decimals={1}
                    liveOptions={liveOpts}
                  />
                ) : showLiveCards && isGlucose ? (
                  <LiveMetricValue
                    base={metricBases.glucose}
                    enabled
                    unit={metric.unit}
                    jitter={3}
                    decimals={1}
                    liveOptions={liveOpts}
                  />
                ) : (
                  <>
                    <span className="text-[24px] font-semibold text-[#0D0B14] tabular-nums">
                      {metric.value}
                    </span>
                    <span className="text-[13px] text-[#9895A8]">{metric.unit}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1 mt-2 text-[12px] text-[#6B6778]">
                {getTrendIcon(metric.trend)}
                <span>{metric.change}</span>
              </div>
            </div>
          )
        })}
      </div>

      {hrvData.length > 0 && (
        <div className="border border-[#E8E6F0] rounded-lg bg-white p-5">
          <p className="text-[11px] font-semibold uppercase text-[#9895A8] mb-4">HRV — 30 days</p>
          <div className="h-48">
            <MetricAreaChart
              data={hrvData}
              stroke="#5B3FD4"
              fill="#5B3FD420"
              showLiveEnd={showLiveChartEnd}
            />
          </div>
        </div>
      )}

      {glucoseData.length > 0 && (
        <div className="border border-[#E8E6F0] rounded-lg bg-white p-5">
          <p className="text-[11px] font-semibold uppercase text-[#9895A8] mb-4">Glucose — 30 days</p>
          <div className="h-48">
            <MetricAreaChart
              data={glucoseData}
              stroke="#1A9E6E"
              fill="#1A9E6E20"
              showLiveEnd={showLiveChartEnd}
            />
          </div>
        </div>
      )}

      {recoveryData.length > 0 && recoverySummary && (
        <RecoveryWeekChart
          data={recoveryData}
          summary={recoverySummary}
          layout={liveMode ? "bars" : "heatmap"}
        />
      )}
    </div>
  )
}
