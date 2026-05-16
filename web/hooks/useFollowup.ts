"use client"

import { useState } from "react"
import { getApiBase } from "@/lib/api"

export type FollowupMessage = {
  role: "user" | "assistant"
  content: string
}

export function useFollowup(patientId: string) {
  const [loading, setLoading] = useState(false)
  const [reply, setReply] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sendMessages = async (messages: FollowupMessage[]): Promise<string | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${getApiBase()}/followup/${encodeURIComponent(patientId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(typeof data?.detail === "string" ? data.detail : "Request failed")
      }
      return typeof data.reply === "string" ? data.reply : null
    } catch {
      setError("Could not reach the GIRA agent. Try again.")
      return null
    } finally {
      setLoading(false)
    }
  }

  const ask = async (question: string) => {
    setReply(null)
    setError(null)
    const answer = await sendMessages([{ role: "user", content: question }])
    if (answer) setReply(answer)
    return answer
  }

  return { ask, sendMessages, loading, reply, error }
}
