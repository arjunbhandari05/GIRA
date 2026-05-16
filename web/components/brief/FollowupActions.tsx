"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useFollowup } from "@/hooks/useFollowup"
import { usePatientFollowup } from "./patient-followup"

interface FollowupActionsProps {
  patientId: string
  questions: string[]
  /** Patient brief: shared floating panel via PatientFollowupProvider. Clinician: legacy panel. */
  variant?: "patient" | "clinician"
}

/** Legacy clinician panel (unchanged behavior). */
function ClinicianFollowupPanel({
  open,
  question,
  loading,
  reply,
  error,
  onClose,
}: {
  open: boolean
  question: string | null
  loading: boolean
  reply: string | null
  error: string | null
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background shadow-lg md:inset-x-auto md:right-4 md:bottom-4 md:max-w-lg md:rounded-lg md:border">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground line-clamp-2">{question}</p>
        <button
          type="button"
          aria-label="Dismiss"
          className="rounded p-1 hover:bg-muted"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto px-4 py-3 text-sm">
        {loading ? (
          <p className="text-muted-foreground">GIRA is thinking…</p>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : (
          <p className="whitespace-pre-wrap">{reply}</p>
        )}
      </div>
    </div>
  )
}

function ClinicianFollowupActions({
  patientId,
  questions,
}: {
  patientId: string
  questions: string[]
}) {
  const { ask, loading, reply, error } = useFollowup(patientId)
  const [open, setOpen] = useState(false)
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null)

  const handleAsk = async (q: string) => {
    setActiveQuestion(q)
    setOpen(true)
    await ask(q)
  }

  return (
    <>
      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-semibold">Actions</h3>
        <div className="flex flex-wrap gap-2">
          {questions.map((q) => (
            <Button
              key={q}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto whitespace-normal text-left"
              disabled={loading}
              onClick={() => handleAsk(q)}
            >
              {q}
            </Button>
          ))}
        </div>
      </section>

      <ClinicianFollowupPanel
        open={open}
        question={activeQuestion}
        loading={loading}
        reply={reply}
        error={error}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

function PatientFollowupActions({ questions }: { questions: string[] }) {
  const { submitQuestion, loading } = usePatientFollowup()

  const handleAsk = async (q: string) => {
    await submitQuestion(q)
  }

  return (
    <section className="space-y-3 border-t border-[#E8E6F0] pt-4">
      <h3 className="text-sm font-semibold text-[#0D0B14]">Actions</h3>
      <div className="flex flex-wrap gap-2">
        {questions.map((q) => (
          <Button
            key={q}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto whitespace-normal text-left border-[#E8E6F0] text-[13px] hover:border-[#5B3FD4] hover:text-[#5B3FD4]"
            disabled={loading}
            onClick={() => handleAsk(q)}
          >
            {q}
          </Button>
        ))}
      </div>
    </section>
  )
}

export default function FollowupActions({
  patientId,
  questions,
  variant = "clinician",
}: FollowupActionsProps) {
  if (variant === "patient") {
    return <PatientFollowupActions questions={questions} />
  }

  return <ClinicianFollowupActions patientId={patientId} questions={questions} />
}
