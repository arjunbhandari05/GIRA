import { cn } from "@/lib/utils"

interface MetricCardProps {
  label: string
  value: string
  subtext?: string
  severity?: "warn" | "bad" | "good" | "neutral"
}

const valueColors: Record<NonNullable<MetricCardProps["severity"]>, string> = {
  warn: "text-amber-600",
  bad: "text-destructive",
  good: "text-green-600",
  neutral: "text-foreground",
}

export default function MetricCard({ label, value, subtext, severity = "neutral" }: MetricCardProps) {
  return (
    <div className="rounded-md bg-muted/50 p-4">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[20px] font-medium", valueColors[severity])}>{value}</p>
      {subtext ? <p className="mt-1 text-[11px] text-muted-foreground">{subtext}</p> : null}
    </div>
  )
}
