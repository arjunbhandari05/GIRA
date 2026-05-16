"use client"

import { useState } from "react"
import { getApiBase } from "@/lib/api"

export function useFollowup(patientId: string) {
  const [loading, setLoading] = useState(false)
  const [reply, setReply] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ask = async (question: string) => {
    setLoading(true)
    setReply(null)
    setError(null)
    try {
      const res = await fetch(`${getApiBase()}/followup/${encodeURIComponent(patientId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(typeof data?.detail === "string" ? data.detail : "Request failed")
      }
      setReply(data.reply)
    } catch {
      setError("Could not reach the GIRA agent. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return { ask, loading, reply, error }
}
