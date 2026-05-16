"use client"

import { Stethoscope, User } from "lucide-react"
import { cn } from "@/lib/utils"

interface ViewToggleProps {
  view: "clinician" | "patient"
  onChange: (view: "clinician" | "patient") => void
}

export default function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-full border border-border bg-background p-1" role="group" aria-label="View mode">
      <button
        type="button"
        onClick={() => onChange("clinician")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          view === "clinician" ? "bg-muted/80 text-foreground" : "text-muted-foreground"
        )}
      >
        <Stethoscope className="h-3.5 w-3.5" />
        Clinician
      </button>
      <button
        type="button"
        onClick={() => onChange("patient")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
          view === "patient" ? "bg-muted/80 text-foreground" : "text-muted-foreground"
        )}
      >
        <User className="h-3.5 w-3.5" />
        Patient
      </button>
    </div>
  )
}
