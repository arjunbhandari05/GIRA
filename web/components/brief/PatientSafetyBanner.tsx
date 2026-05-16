"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { friendlyGenePlain, patientPlainFlagImpact } from "@/lib/patient-display"
import type { SafetyFlag } from "@/types/brief"

interface PatientSafetyBannerProps {
  flags: SafetyFlag[]
}

/** Patient-only safety banner — plain language, no PGx jargon. */
export default function PatientSafetyBanner({ flags }: PatientSafetyBannerProps) {
  const critical = flags.filter((f) => f.severity === "flag")

  if (critical.length > 0) {
    const summary =
      critical.length === 1
        ? `${friendlyGenePlain(critical[0].gene)}: ${patientPlainFlagImpact(critical[0])}`
        : `${critical.length} genetic red flags are worth discussing with your doctor before any medication change.`

    return (
      <Alert
        variant="destructive"
        className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
      >
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Your doctor should review a genetic red flag</AlertTitle>
        <AlertDescription className="text-sm">{summary}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert className="border-green-500/40 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-100">
      <CheckCircle2 className="h-4 w-4 text-green-600" />
      <AlertTitle>No major genetic red flags showed up</AlertTitle>
      <AlertDescription className="text-sm text-green-800 dark:text-green-200">
        That is encouraging, but your doctor will still review the full table below before any changes.
      </AlertDescription>
    </Alert>
  )
}
