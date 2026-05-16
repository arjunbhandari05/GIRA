"use client"

import { useEffect, useState, type ReactNode } from "react"
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Loader2,
} from "lucide-react"
import type { AgentBrief as ApiBrief } from "@/lib/types"
import {
  getAgentBrief,
  getGlucose,
  getPatientAssets,
  getWearable,
  type PatientAssets,
} from "@/lib/api"
import { mapAgentBrief } from "@/lib/brief-mappers"
import { isDeviceConnected } from "@/lib/device-larp"
import {
  formatBriefLastUpdated,
  formatPatientBpm,
  formatPatientMgDl,
  formatPatientPercent,
  patientHomeBriefConclusion,
} from "@/lib/patient-display"
import { MarkdownContent } from "@/lib/simple-markdown"

type HomeTab = "home" | "brief" | "setup" | "metrics"

interface PatientHomeTabProps {
  patientId: string
  appointment: string
  firstName: string
  hasBrief: boolean
  safetyAlert: boolean
  onNavigate: (tab: HomeTab) => void
  metricsRefreshKey?: number
}

type SetupItem = {
  id: string
  label: string
  done: boolean
}

type MetricTile = {
  id: string
  label: string
  value: string
  unit: string
  connected: boolean
  live: boolean
}

function ModuleCard({
  accentClass,
  children,
}: {
  accentClass: string
  children: ReactNode
}) {
  return (
    <section
      className={`rounded-lg border border-[#E8E6F0] bg-white p-5 sm:p-6 border-l-[3px] ${accentClass}`}
    >
      {children}
    </section>
  )
}

function ModuleHeader({
  icon: Icon,
  title,
  iconClassName,
}: {
  icon: typeof FileText
  title: string
  iconClassName: string
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <Icon className={`h-5 w-5 shrink-0 ${iconClassName}`} />
      <h2 className="text-[15px] font-semibold text-[#0D0B14]">{title}</h2>
    </div>
  )
}

function CardLinkRow({
  label,
  onClick,
  tone = "purple",
}: {
  label: string
  onClick: () => void
  tone?: "purple" | "green"
}) {
  const toneClass =
    tone === "green"
      ? "text-[#1A9E6E] hover:text-[#158f5e]"
      : "text-[#5B3FD4] hover:text-[#4A32B0]"
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-4 flex w-full items-center justify-between border-t border-[#E8E6F0] pt-4 text-[14px] font-medium transition-colors ${toneClass}`}
    >
      <span>{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
    </button>
  )
}

function MetricMiniTile({ tile }: { tile: MetricTile }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-[#E8E6F0] bg-[#FAFAFC] p-3 sm:p-3.5">
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9895A8] leading-tight">
          {tile.label}
        </p>
        {tile.live ? (
          <span className="shrink-0 rounded bg-[#1A9E6E]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#1A9E6E]">
            Live
          </span>
        ) : null}
      </div>
      {tile.connected ? (
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="text-[20px] font-semibold leading-none text-[#0D0B14]">{tile.value}</span>
          {tile.unit ? (
            <span className="text-[11px] text-[#9895A8]">{tile.unit}</span>
          ) : null}
        </div>
      ) : (
        <div>
          <span className="text-[20px] font-semibold leading-none text-[#C4C1D4]">—</span>
          <p className="mt-1 text-[11px] text-[#9895A8]">Not connected</p>
        </div>
      )}
    </div>
  )
}

export default function PatientHomeTab({
  patientId,
  appointment,
  firstName,
  hasBrief,
  safetyAlert,
  onNavigate,
  metricsRefreshKey = 0,
}: PatientHomeTabProps) {
  const [loading, setLoading] = useState(true)
  const [briefConclusion, setBriefConclusion] = useState<string | null>(null)
  const [briefUpdated, setBriefUpdated] = useState<string | null>(null)
  const [setupItems, setSetupItems] = useState<SetupItem[]>([])
  const [metricTiles, setMetricTiles] = useState<MetricTile[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [briefRes, assetsRes, whoop, glucose] = await Promise.all([
          hasBrief
            ? getAgentBrief(patientId, { cacheOnly: true }).catch(() => null)
            : Promise.resolve(null),
          getPatientAssets(patientId).catch(() => null),
          getWearable(patientId).catch(() => null),
          getGlucose(patientId).catch(() => null),
        ])
        if (cancelled) return

        const whoopConnected =
          isDeviceConnected(patientId, "whoop") || Boolean(assetsRes && !("error" in assetsRes) && assetsRes.wearable)
        const cgmConnected =
          isDeviceConnected(patientId, "cgm") || Boolean(assetsRes && !("error" in assetsRes) && assetsRes.glucose)
        if (hasBrief && briefRes && !briefRes.error) {
          const mapped = mapAgentBrief(briefRes as ApiBrief)
          setBriefConclusion(patientHomeBriefConclusion(mapped, briefRes.recommendation))
          setBriefUpdated(formatBriefLastUpdated(briefRes.generated_at))
        } else {
          setBriefConclusion(null)
          setBriefUpdated(null)
        }

        const assets: PatientAssets =
          assetsRes && !("error" in assetsRes && assetsRes.error)
            ? assetsRes
            : {
                patient_id: patientId,
                genome: false,
                wearable: false,
                glucose: false,
                intake_file: false,
              }

        setSetupItems([
          { id: "genome", label: "DNA file uploaded", done: assets.genome },
          { id: "cgm", label: "CGM connected", done: cgmConnected },
          { id: "whoop", label: "WHOOP connected", done: whoopConnected },
          { id: "profile", label: "Profile complete", done: assets.intake_file },
        ])

        const wm = (whoop?.metrics || {}) as Record<
          string,
          { avg_30d?: number; wow_pct?: number; trend?: string }
        >
        const rhr = wm.rhr_bpm || {}
        const recovery = wm.recovery_score || {}
        const gAvg = glucose?.avg_glucose_mgdl as number | undefined
        const whoopDataOk = Boolean(whoop && !whoop.error)
        const glucoseDataOk = Boolean(glucose && !glucose.error)

        const recoveryAvg = recovery.avg_30d != null ? Number(recovery.avg_30d) : null
        const rhrBase = rhr.avg_30d != null ? Number(rhr.avg_30d) : null

        setMetricTiles([
          {
            id: "rhr",
            label: "Resting heart rate",
            value: rhrBase != null ? formatPatientBpm(rhrBase) : "—",
            unit: "bpm",
            connected: whoopConnected && whoopDataOk,
            live: whoopConnected && whoopDataOk,
          },
          {
            id: "glucose",
            label: "Blood glucose",
            value: gAvg != null ? formatPatientMgDl(gAvg) : "—",
            unit: "mg/dL",
            connected: cgmConnected && glucoseDataOk,
            live: cgmConnected && glucoseDataOk,
          },
          {
            id: "recovery",
            label: "Recovery score",
            value:
              recoveryAvg != null
                ? formatPatientPercent(recoveryAvg).replace("%", "")
                : "—",
            unit: "/100",
            connected: whoopConnected && whoopDataOk,
            live: false,
          },
        ])

      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [patientId, hasBrief, metricsRefreshKey])

  const setupComplete = setupItems.length > 0 && setupItems.every((i) => i.done)
  const setupIncomplete = setupItems.some((i) => !i.done)

  return (
    <div className="space-y-4 sm:space-y-4">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#0D0B14]">
          Hello, {firstName}
        </h1>
        <p className="text-[15px] text-[#6B6778] mt-1">
          {appointment
            ? `Next visit: ${appointment}`
            : hasBrief
              ? "Your summary is ready"
              : "Your appointment will appear here"}
        </p>
      </div>

      {safetyAlert ? (
        <div
          className="flex gap-3 rounded-lg border border-[#F59E0B] bg-[#FFFBEB] p-4 text-[14px] leading-relaxed text-[#6B6778]"
          role="status"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-[#D97706] mt-0.5" />
          <p>
            Your care team has flagged something about your current medications. This will be
            discussed at your appointment.
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[#9895A8]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-[14px]">Loading your dashboard…</span>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:gap-4">
          <ModuleCard accentClass="border-l-[#5B3FD4]">
            <ModuleHeader
              icon={FileText}
              title="Your medication brief"
              iconClassName="text-[#5B3FD4]"
            />
            {hasBrief && briefConclusion ? (
              <>
                <MarkdownContent
                  text={briefConclusion}
                  paragraphClass="text-[14px] leading-relaxed text-[#0D0B14] my-0"
                  listClass="text-[14px] leading-relaxed text-[#0D0B14] my-2"
                />
                {briefUpdated ? (
                  <p className="mt-3 text-[12px] text-[#9895A8]">Last updated {briefUpdated}</p>
                ) : null}
                <CardLinkRow label="View full brief →" onClick={() => onNavigate("brief")} />
              </>
            ) : (
              <p className="text-[14px] leading-relaxed text-[#9895A8]">
                No brief yet. Your care team will generate one at your next visit.
              </p>
            )}
          </ModuleCard>

          <ModuleCard
            accentClass={
              setupComplete ? "border-l-[#1A9E6E]" : "border-l-[#F59E0B]"
            }
          >
            <ModuleHeader
              icon={ClipboardList}
              title="Your setup"
              iconClassName={setupComplete ? "text-[#1A9E6E]" : "text-[#D97706]"}
            />
            <ul className="space-y-3">
              {setupItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  {item.done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1A9E6E]" aria-hidden />
                  ) : (
                    <AlertCircle className="h-5 w-5 shrink-0 text-[#D97706]" aria-hidden />
                  )}
                  <span
                    className={`text-[14px] ${item.done ? "text-[#0D0B14]" : "text-[#6B6778]"}`}
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
            {setupIncomplete ? (
              <div className="mt-4 flex gap-2.5 rounded-md bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-[#D97706] mt-0.5" />
                <p className="text-[13px] leading-snug text-[#6B6778]">
                  Some setup steps are incomplete — this may affect your brief accuracy.
                </p>
              </div>
            ) : null}
            {setupComplete ? (
              <CardLinkRow
                label="Setup complete ✓"
                onClick={() => onNavigate("setup")}
                tone="green"
              />
            ) : (
              <CardLinkRow label="Go to setup →" onClick={() => onNavigate("setup")} />
            )}
          </ModuleCard>

          <ModuleCard accentClass="border-l-[#14B8A6]">
            <ModuleHeader
              icon={Activity}
              title="Live metrics"
              iconClassName="text-[#14B8A6]"
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              {metricTiles.map((tile) => (
                <MetricMiniTile key={tile.id} tile={tile} />
              ))}
            </div>
            <CardLinkRow
              label="View live metrics →"
              onClick={() => onNavigate("metrics")}
              tone="green"
            />
          </ModuleCard>
        </div>
      )}
    </div>
  )
}
