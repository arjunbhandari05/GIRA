"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { ArrowRight, X } from "lucide-react"
import { useFollowup, type FollowupMessage } from "@/hooks/useFollowup"
import { renderMarkdown } from "@/lib/simple-markdown"

const PANEL_TRANSITION_MS = 280

export const PATIENT_FREEFORM_INSTRUCTION =
  "You are GIRA, a friendly and clear health assistant. The patient has just reviewed their medication brief. Answer their question using only information relevant to their health data shown in the brief. Use plain language a non-medical person can understand. Keep answers concise — 3 to 5 short paragraphs maximum. Never mention internal field names, raw variable values, or technical system details."

export type ConversationTurn = {
  id: string
  question: string
  answer: string | null
  error?: string
  withInstruction: boolean
}

type PatientFollowupContextValue = {
  submitQuestion: (displayQuestion: string, options?: { freeform?: boolean }) => Promise<void>
  loading: boolean
}

const PatientFollowupContext = createContext<PatientFollowupContextValue | null>(null)

export function usePatientFollowup() {
  const ctx = useContext(PatientFollowupContext)
  if (!ctx) {
    throw new Error("usePatientFollowup must be used within PatientFollowupProvider")
  }
  return ctx
}

function userMessageContent(question: string, withInstruction: boolean): string {
  return withInstruction ? `${PATIENT_FREEFORM_INSTRUCTION}\n\n${question}` : question
}

function turnsToApiMessages(turns: ConversationTurn[]): FollowupMessage[] {
  const messages: FollowupMessage[] = []
  for (const turn of turns) {
    if (!turn.answer) continue
    messages.push({
      role: "user",
      content: userMessageContent(turn.question, turn.withInstruction),
    })
    messages.push({ role: "assistant", content: turn.answer })
  }
  return messages
}

function FollowupSkeleton() {
  return (
    <div className="space-y-3 py-1" aria-hidden>
      <div className="followup-shimmer h-4 w-full rounded-md bg-[#E8E6F0]/80" />
      <div className="followup-shimmer h-4 w-[92%] rounded-md bg-[#E8E6F0]/70" />
      <div className="followup-shimmer h-4 w-[78%] rounded-md bg-[#E8E6F0]/60" />
    </div>
  )
}

function FollowupInputBar({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  id,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: (e?: FormEvent) => void
  placeholder: string
  disabled: boolean
  id: string
}) {
  return (
    <form onSubmit={onSubmit} className="relative w-full">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-[#E8E6F0] bg-background py-2.5 pl-3 pr-11 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#5B3FD4] disabled:opacity-60"
      />
      <button
        type="submit"
        aria-label="Send"
        disabled={disabled || !value.trim()}
        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#5B3FD4] transition-colors hover:bg-[#5B3FD4]/10 disabled:pointer-events-none disabled:opacity-40"
      >
        <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  )
}

function ConversationExchange({
  turn,
  isLast,
  loading,
}: {
  turn: ConversationTurn
  isLast: boolean
  loading: boolean
}) {
  const showSkeleton = isLast && loading && !turn.answer && !turn.error

  return (
    <article className="py-4 first:pt-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        You asked:
      </p>
      <p className="mt-1 text-[15px] font-medium leading-snug text-foreground">{turn.question}</p>
      <div className="mt-3">
        {showSkeleton ? (
          <FollowupSkeleton />
        ) : turn.error ? (
          <p className="text-[15px] leading-[1.7] text-destructive">{turn.error}</p>
        ) : turn.answer ? (
          renderMarkdown(turn.answer)
        ) : null}
      </div>
    </article>
  )
}

function PatientFollowupPanel({
  open,
  turns,
  loading,
  onClose,
  onFollowUp,
}: {
  open: boolean
  turns: ConversationTurn[]
  loading: boolean
  onClose: () => void
  onFollowUp: (question: string) => Promise<void>
}) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [followUpValue, setFollowUpValue] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const frame = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(frame)
    }
    if (mounted) {
      setVisible(false)
      const timer = window.setTimeout(() => setMounted(false), PANEL_TRANSITION_MS)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [open, mounted])

  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mounted, onClose])

  useEffect(() => {
    if (!open) setFollowUpValue("")
  }, [open])

  useEffect(() => {
    if (!mounted) return
    const el = bottomRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: "end", behavior: "smooth" })
    })
  }, [mounted, turns, loading])

  const handleFollowUp = async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = followUpValue.trim()
    if (!trimmed || loading) return
    setFollowUpValue("")
    await onFollowUp(trimmed)
  }

  if (!mounted) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="followup-panel-title"
    >
      <button
        type="button"
        aria-label="Close"
        className={`fixed inset-0 bg-[rgba(0,0,0,0.25)] transition-opacity duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <div
        className={`relative z-10 flex w-full max-w-lg max-h-[min(85vh,640px)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg transition-all duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
          visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5 sm:px-6">
          <p
            id="followup-panel-title"
            className="text-sm font-semibold text-foreground"
          >
            Ask GIRA
          </p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 followup-scroll"
        >
          <div className="py-4">
            {turns.map((turn, i) => (
              <div key={turn.id}>
                <ConversationExchange
                  turn={turn}
                  isLast={i === turns.length - 1}
                  loading={loading}
                />
                {i < turns.length - 1 ? <hr className="border-border" /> : null}
              </div>
            ))}
            <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
          </div>
        </div>

        {turns.length > 0 && turns.some((t) => t.answer || t.error) ? (
          <footer className="shrink-0 border-t border-border bg-background px-5 py-3 sm:px-6">
            <FollowupInputBar
              id="followup-panel-input"
              value={followUpValue}
              onChange={setFollowUpValue}
              onSubmit={handleFollowUp}
              placeholder="Ask a follow-up…"
              disabled={loading}
            />
          </footer>
        ) : null}
      </div>
    </div>
  )
}

export function PatientFollowupProvider({
  patientId,
  children,
}: {
  patientId: string
  children: ReactNode
}) {
  const { sendMessages, loading } = useFollowup(patientId)
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<ConversationTurn[]>([])

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  const runTurn = useCallback(
    async (
      displayQuestion: string,
      withInstruction: boolean,
      resetThread: boolean
    ) => {
      const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const pending: ConversationTurn = {
        id: turnId,
        question: displayQuestion,
        answer: null,
        withInstruction,
      }

      let priorSnapshot: ConversationTurn[] = []
      setTurns((current) => {
        priorSnapshot = resetThread ? [] : current.filter((t) => t.answer || t.error)
        return [...priorSnapshot, pending]
      })

      const history = turnsToApiMessages(priorSnapshot)
      history.push({
        role: "user",
        content: userMessageContent(displayQuestion, withInstruction),
      })

      const answer = await sendMessages(history)

      setTurns((current) =>
        current.map((t) =>
          t.id === turnId
            ? {
                ...t,
                answer: answer ?? null,
                error: answer ? undefined : "Could not reach the GIRA agent. Try again.",
              }
            : t
        )
      )
    },
    [sendMessages]
  )

  const submitQuestion = useCallback(
    async (displayQuestion: string, options?: { freeform?: boolean }) => {
      const trimmed = displayQuestion.trim()
      if (!trimmed) return
      const withInstruction = Boolean(options?.freeform)
      setOpen(true)
      await runTurn(trimmed, withInstruction, true)
    },
    [runTurn]
  )

  const submitFollowUp = useCallback(
    async (displayQuestion: string) => {
      const trimmed = displayQuestion.trim()
      if (!trimmed) return
      await runTurn(trimmed, true, false)
    },
    [runTurn]
  )

  return (
    <PatientFollowupContext.Provider value={{ submitQuestion, loading }}>
      {children}
      <PatientFollowupPanel
        open={open}
        turns={turns}
        loading={loading}
        onClose={handleClose}
        onFollowUp={submitFollowUp}
      />
    </PatientFollowupContext.Provider>
  )
}

export function AskGiraBar() {
  const { submitQuestion, loading } = usePatientFollowup()
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || loading) return
    setValue("")
    await submitQuestion(trimmed, { freeform: true })
  }

  const handleFocus = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
      requestAnimationFrame(() => {
        inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
      })
    }
  }

  return (
    <section className="w-full space-y-2">
      <label htmlFor="ask-gira-input" className="text-sm font-semibold text-[#0D0B14]">
        Ask GIRA
      </label>
      <form onSubmit={handleSubmit} className="relative w-full">
        <input
          ref={inputRef}
          id="ask-gira-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={handleFocus}
          placeholder="Ask anything about your results…"
          disabled={loading}
          className="w-full rounded-lg border border-[#E8E6F0] bg-background py-3 pl-4 pr-12 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#5B3FD4] disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Send question"
          disabled={loading || !value.trim()}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[#5B3FD4] transition-colors hover:bg-[#5B3FD4]/10 disabled:pointer-events-none disabled:opacity-40"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </form>
    </section>
  )
}
