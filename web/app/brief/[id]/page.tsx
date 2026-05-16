"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import BriefInferencePanel from "@/components/brief/BriefInferencePanel"

export default function BriefInferencePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const patientId = decodeURIComponent(String(params.id ?? ""))
  const viewParam = searchParams.get("view")
  const initialView =
    viewParam === "patient" ? "patient" : viewParam === "clinician" ? "clinician" : undefined

  const [audience, setAudience] = useState<"clinician" | "patient">(
    initialView === "patient" ? "patient" : "clinician"
  )

  useEffect(() => {
    if (initialView === "patient") setAudience("patient")
    else if (initialView === "clinician") setAudience("clinician")
  }, [initialView])

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-8">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to GIRA
      </Link>
      <BriefInferencePanel
        patientId={patientId}
        audience={audience}
        initialView={initialView}
        showViewToggle
        loadWhenActive
        isActive
      />
    </main>
  )
}
