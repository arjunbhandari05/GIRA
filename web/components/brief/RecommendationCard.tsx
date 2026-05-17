import { Activity, AlertCircle, AlertTriangle, Check, Dna, HeartPulse } from "lucide-react"
import { MarkdownContent } from "@/lib/simple-markdown"
import type { Recommendation } from "@/types/brief"

interface RecommendationCardProps {
  recommendation: Recommendation
  variant: "clinician" | "patient"
  patientTitle?: string
  patientSubtitle?: string
}

export default function RecommendationCard({
  recommendation,
  variant,
  patientTitle,
  patientSubtitle,
}: RecommendationCardProps) {
  const isPatient = variant === "patient"
  const drugLabel = isPatient
    ? patientTitle ||
      `${recommendation.drug_name}${recommendation.drug_name.toLowerCase().includes("semaglutide") ? " (a weekly injection)" : ""}`
    : recommendation.drug_name

  return (
    <div className="rounded-md border border-l-4 border-l-teal-600 bg-card p-4 shadow-sm">
      <h3 className="text-lg font-medium">{drugLabel}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {isPatient
          ? patientSubtitle || recommendation.evidence_level
          : `${recommendation.drug_class} · ${recommendation.evidence_level} · Confidence: ${recommendation.confidence}`}
      </p>
      <div className="mt-4 space-y-2">
        <RationaleRow
          icon={isPatient ? Check : Dna}
          label={isPatient ? "Why your DNA matters" : "Genomic"}
          text={recommendation.rationale.genomic}
          useMarkdown
        />
        <RationaleRow
          icon={isPatient ? Check : Activity}
          label={isPatient ? "Blood sugar from your sensor" : "CGM"}
          text={recommendation.rationale.cgm}
          useMarkdown
        />
        <RationaleRow
          icon={isPatient ? Check : HeartPulse}
          label={isPatient ? "Recovery & stress" : "Wearable"}
          text={recommendation.rationale.wearable}
          useMarkdown
        />
        {recommendation.rationale.safety_note ? (
          <RationaleRow
            icon={isPatient ? AlertTriangle : AlertCircle}
            label={isPatient ? "Something to watch" : "Safety"}
            text={recommendation.rationale.safety_note}
            useMarkdown
          />
        ) : null}
      </div>
    </div>
  )
}

function RationaleRow({
  icon: Icon,
  label,
  text,
  useMarkdown = false,
}: {
  icon: typeof Dna
  label: string
  text: string
  useMarkdown?: boolean
}) {
  return (
    <div className="flex gap-2 text-[13px]">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{label}</p>
        {useMarkdown ? (
          <MarkdownContent
            text={text}
            className="mt-0.5"
            paragraphClass="text-[13px] leading-relaxed text-muted-foreground my-1.5 first:mt-0.5 last:mb-0"
            listClass="text-[13px] leading-relaxed text-muted-foreground my-1.5"
          />
        ) : (
          <p className="mt-0.5 text-muted-foreground">{text}</p>
        )}
      </div>
    </div>
  )
}
