"use client"

import { useEffect, useState } from "react"
import { Heart, Activity, Droplet, Moon, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts"
import { getGlucose, getWearable } from "@/lib/api"
import { wearableTrendToUi } from "@/lib/mappers"

interface WhoopDataTabProps {
  patientId: string
  refreshKey?: number
  /** Patient portal: live pulse + "Last synced: just now" */
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
  const [whoopMissing, setWhoopMissing] = useState(false)
  const [glucoseMissing, setGlucoseMissing] = useState(false)
  const [metrics, setMetrics] = useState<MetricCard[]>([])
  const [hrvData, setHrvData] = useState<{ day: number; value: number }[]>([])
  const [glucoseData, setGlucoseData] = useState<{ day: number; value: number }[]>([])
  const [recoveryData, setRecoveryData] = useState<{ day: string; score: number }[]>([])
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
        setWhoopMissing(whoopErr)
        setGlucoseMissing(glucoseErr)
        if (whoopErr && glucoseErr) {
          setError(
            "No wearable or CGM files for this patient. Upload them on the Setup tab."
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

        setMetrics([
          {
            label: "Heart Rate Variability",
            value: hrv.avg_30d != null ? String(hrv.avg_30d) : "—",
            unit: "ms",
            trend: wearableTrendToUi(hrv.trend),
            change: `${hrv.wow_pct != null && hrv.wow_pct > 0 ? "+" : ""}${hrv.wow_pct ?? 0}%`,
            icon: Activity,
            status: hrv.trend === "improving" ? "Good" : "Normal",
          },
          {
            label: "Resting Heart Rate",
            value: rhr.avg_30d != null ? String(rhr.avg_30d) : "—",
            unit: "bpm",
            trend: wearableTrendToUi(rhr.trend),
            change: `${rhr.wow_pct ?? 0}%`,
            icon: Heart,
            status: "Normal",
          },
          {
            label: "Blood Glucose (CGM)",
            value: gAvg != null ? String(Math.round(gAvg)) : "—",
            unit: "mg/dL",
            trend:
              gTrend === "improving" ? "down" : gTrend === "worsening" ? "up" : "stable",
            change: gWow != null ? `${gWow > 0 ? "+" : ""}${gWow} mg/dL` : "—",
            icon: Droplet,
            status:
              gAvg != null && gAvg > 140
                ? "Elevated"
                : glucose.controlled
                  ? "Good"
                  : "Monitor",
          },
          {
            label: "Recovery Score",
            value: recovery.avg_30d != null ? String(recovery.avg_30d) : "—",
            unit: "/100",
            trend: wearableTrendToUi(recovery.trend),
            change: `${recovery.wow_pct ?? 0}%`,
            icon: Moon,
            status: (recovery.avg_30d ?? 0) < 50 ? "Low" : "Normal",
          },
        ])

        const raw = (whoop.raw_series || {}) as Record<string, number[]>
        const hrvSeries = raw.hrv_ms || []
        const recoverySeries = raw.recovery_score || []
        setHrvData(hrvSeries.slice(-30).map((value, i) => ({ day: i + 1, value })))
        setRecoveryData(
          recoverySeries.slice(-7).map((score, i) => ({
            day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] || `D${i}`,
            score,
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
          parts.push(`CGM TIR ${glucose.time_in_range_pct}% (GET /glucose/${patientId}).`)
        }
        if (whoop.hypoglycemia_signal) {
          parts.push("Wearable hypoglycemia pattern detected — discuss with patient.")
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
  }, [patientId, refreshKey])

  const getTrendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp className="w-4 h-4" />
    if (trend === "down") return <TrendingDown className="w-4 h-4" />
    return <Minus className="w-4 h-4" />
  }

  const getRecoveryColor = (score: number) => {
    if (score >= 67) return "bg-[#1A9E6E]"
    if (score >= 34) return "bg-[#B45309]"
    return "bg-[#C0392B]"
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
            ? "Streaming from your connected devices."
            : "30-day summary from uploaded wearable and CGM data."}
        </p>
        {liveMode && !error && (
          <p className="text-[12px] text-[#1A9E6E] mt-1 font-medium">Last synced: just now</p>
        )}
      </div>

      {error && <p className="text-[13px] text-[#C0392B]">{error}</p>}
      {insight && (
        <div className="border-l-[3px] border-l-[#5B3FD4] border border-[#E8E6F0] rounded-lg p-4 text-[13px] text-[#6B6778]">
          {insight}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon
          const pulse =
            liveMode &&
            (metric.label.includes("Variability") || metric.label.includes("Recovery"))
          return (
            <div key={metric.label} className="border border-[#E8E6F0] rounded-lg bg-white p-5">
              <div className="flex items-start justify-between mb-3">
                <Icon className="w-[18px] h-[18px] text-[#5B3FD4]" />
                <span className="text-[11px] font-medium text-[#9895A8]">{metric.status}</span>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9895A8] mb-1">
                {metric.label}
              </p>
              <div className="flex items-baseline gap-1">
                <span
                  className={`text-[24px] font-semibold text-[#0D0B14] ${pulse ? "live-metric-pulse" : ""}`}
                >
                  {metric.value}
                </span>
                <span className="text-[13px] text-[#9895A8]">{metric.unit}</span>
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
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hrvData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#9895A8" />
                <YAxis tick={{ fontSize: 10 }} stroke="#9895A8" />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#5B3FD4" fill="#5B3FD420" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {glucoseData.length > 0 && (
        <div className="border border-[#E8E6F0] rounded-lg bg-white p-5">
          <p className="text-[11px] font-semibold uppercase text-[#9895A8] mb-4">Glucose — 30 days</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={glucoseData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E6F0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#9895A8" />
                <YAxis tick={{ fontSize: 10 }} stroke="#9895A8" />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#1A9E6E" fill="#1A9E6E20" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {recoveryData.length > 0 && (
        <div className="border border-[#E8E6F0] rounded-lg bg-white p-5">
          <p className="text-[11px] font-semibold uppercase text-[#9895A8] mb-4">Recovery</p>
          <div className="flex gap-2">
            {recoveryData.map((d) => (
              <div key={d.day} className="flex-1 text-center">
                <div
                  className={`h-16 rounded-md ${getRecoveryColor(d.score)} opacity-80 mx-auto max-w-[48px]`}
                  style={{ height: `${Math.max(24, d.score)}px` }}
                />
                <p className="text-[11px] text-[#9895A8] mt-2">{d.day}</p>
                <p className="text-[12px] font-medium">{d.score}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
