"use client"

import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useFollowup } from "@/hooks/useFollowup"
import { useState } from "react"

interface FollowupActionsProps {
  patientId: string
  questions: string[]
}

export default function FollowupActions({ patientId, questions }: FollowupActionsProps) {
  const { ask, loading, reply, error } = useFollowup(patientId)
  const [open, setOpen] = useState(false)
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null)

  const handleAsk = async (q: string) => {
    setActiveQuestion(q)
    setOpen(true)
    await ask(q)
  }

  return (
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

      {open ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background shadow-lg md:inset-x-auto md:right-4 md:bottom-4 md:max-w-lg md:rounded-lg md:border">
          <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground line-clamp-2">{activeQuestion}</p>
            <button
              type="button"
              aria-label="Dismiss"
              className="rounded p-1 hover:bg-muted"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto px-4 py-3 text-sm">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                GIRA is thinking…
              </div>
            ) : error ? (
              <p className="text-destructive">{error}</p>
            ) : (
              <p className="whitespace-pre-wrap">{reply}</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
