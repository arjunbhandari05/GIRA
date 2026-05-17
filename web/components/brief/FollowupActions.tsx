"use client"

import { Button } from "@/components/ui/button"
import { usePatientFollowup } from "./patient-followup"

interface FollowupActionsProps {
  patientId: string
  questions: string[]
  variant?: "patient" | "clinician"
}

export default function FollowupActions({ questions }: FollowupActionsProps) {
  const { submitQuestion, loading } = usePatientFollowup()

  return (
    <section className="space-y-3 border-t border-[#E8E6F0] pt-4">
      <h3 className="text-sm font-semibold text-[#0D0B14]">Actions</h3>
      <div className="flex flex-col gap-2">
        {questions.map((q) => (
          <Button
            key={q}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto w-full whitespace-normal text-left border-[#E8E6F0] text-[13px] hover:border-[#5B3FD4] hover:text-[#5B3FD4] sm:w-auto"
            disabled={loading}
            onClick={() => submitQuestion(q)}
          >
            {q}
          </Button>
        ))}
      </div>
    </section>
  )
}
