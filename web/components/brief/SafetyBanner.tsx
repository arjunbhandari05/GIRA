"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import type { SafetyFlag } from "@/types/brief"

interface SafetyBannerProps {
  flags: SafetyFlag[]
}

export default function SafetyBanner({ flags }: SafetyBannerProps) {
  const critical = flags.filter((f) => f.severity === "flag")

  if (critical.length > 0) {
    const summary = critical
      .map((f) => `${f.gene} ${f.variant} (${f.genotype}): ${f.impact}`)
      .join(" · ")
    return (
      <Alert variant="destructive" className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Critical PGx flags</AlertTitle>
        <AlertDescription className="text-sm">{summary}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert className="border-green-500/40 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-100">
      <CheckCircle2 className="h-4 w-4 text-green-600" />
      <AlertTitle>No critical PGx flags detected.</AlertTitle>
      <AlertDescription className="text-sm text-green-800 dark:text-green-200">
        Continue routine monitoring; review full variant table below.
      </AlertDescription>
    </Alert>
  )
}
