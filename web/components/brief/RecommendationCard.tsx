import { Activity, AlertCircle, AlertTriangle, Check, Dna, HeartPulse } from "lucide-react"
import type { Recommendation } from "@/types/brief"

interface RecommendationCardProps {
  recommendation: Recommendation
  variant: "clinician" | "patient"
}

export default function RecommendationCard({ recommendation, variant }: RecommendationCardProps) {
  const isPatient = variant === "patient"
  const drugLabel = isPatient
    ? `${recommendation.drug_name}${recommendation.drug_name.toLowerCase().includes("semaglutide") ? " (a weekly injection)" : ""}`
    : recommendation.drug_name

  return (
    <div className="rounded-md border border-l-4 border-l-teal-600 bg-card p-4 shadow-sm">
      <h3 className="text-lg font-medium">{drugLabel}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {recommendation.drug_class} · {recommendation.evidence_level} · Confidence: {recommendation.confidence}
      </p>
      <div className="mt-4 space-y-2">
        <RationaleRow
          icon={isPatient ? Check : Dna}
          label={isPatient ? "Why your DNA matters" : "Genomic"}
          text={recommendation.rationale.genomic}
        />
        <RationaleRow
          icon={isPatient ? Check : Activity}
          label={isPatient ? "Blood sugar pattern" : "CGM"}
          text={recommendation.rationale.cgm}
        />
        <RationaleRow
          icon={isPatient ? Check : HeartPulse}
          label={isPatient ? "Recovery & stress" : "Wearable"}
          text={recommendation.rationale.wearable}
        />
        {recommendation.rationale.safety_note ? (
          <RationaleRow
            icon={isPatient ? AlertTriangle : AlertCircle}
            label={isPatient ? "Safety note" : "Safety"}
            text={recommendation.rationale.safety_note}
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
}: {
  icon: typeof Dna
  label: string
  text: string
}) {
  return (
    <div className="flex gap-2 text-[13px]">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p>
        <span className="font-medium text-foreground">{label}: </span>
        <span className="text-muted-foreground">{text}</span>
      </p>
    </div>
  )
}
