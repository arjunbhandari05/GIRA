"use client"

import { useEffect, useState } from "react"
import { CheckCircle, Loader2, X } from "lucide-react"
import type { DeviceSlot } from "@/lib/device-larp"

type Phase = "search" | "pick" | "connecting" | "done"

interface DeviceOption {
  slot: DeviceSlot
  label: string
}

interface DeviceConnectModalProps {
  open: boolean
  onClose: () => void
  title: string
  searchLabel: string
  options: DeviceOption[]
  manualPlaceholder: string
  onConnect: (slot: DeviceSlot | null, manualId?: string) => Promise<void>
}

export default function DeviceConnectModal({
  open,
  onClose,
  title,
  searchLabel,
  options,
  manualPlaceholder,
  onConnect,
}: DeviceConnectModalProps) {
  const [phase, setPhase] = useState<Phase>("search")
  const [selected, setSelected] = useState<DeviceSlot | null>(null)
  const [manualId, setManualId] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPhase("search")
    setSelected(null)
    setManualId("")
    setError(null)
    const t = setTimeout(() => setPhase("pick"), 2000)
    return () => clearTimeout(t)
  }, [open])

  const finishConnect = async (slot: DeviceSlot | null, manual?: string) => {
    setPhase("connecting")
    setError(null)
    try {
      await onConnect(slot, manual)
      setPhase("done")
      setTimeout(() => onClose(), 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed")
      setPhase("pick")
    }
  }

  const handleSelect = (slot: DeviceSlot) => {
    setSelected(slot)
    finishConnect(slot)
  }

  const handleManual = () => {
    if (!manualId.trim()) return
    finishConnect(null, manualId.trim())
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-[#E8E6F0] shadow-xl p-6 relative">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 p-1 text-[#9895A8] hover:text-[#0D0B14]">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-[18px] font-semibold text-[#0D0B14] pr-8">{title}</h2>

        {phase === "search" && (
          <div className="py-10 flex flex-col items-center gap-3 text-[#6B6778]">
            <Loader2 className="w-8 h-8 animate-spin text-[#5B3FD4]" />
            <p className="text-[14px]">{searchLabel}</p>
          </div>
        )}

        {phase === "pick" && (
          <div className="mt-6 space-y-3">
            {options.map((opt) => (
              <button
                key={opt.slot}
                type="button"
                onClick={() => handleSelect(opt.slot)}
                className="w-full p-4 border border-[#E8E6F0] rounded-lg text-left hover:border-[#5B3FD4] hover:bg-[#FAFAFC] transition-colors"
              >
                <p className="text-[14px] font-medium text-[#0D0B14]">{opt.label}</p>
              </button>
            ))}
            <div className="pt-2">
              <p className="text-[12px] text-[#9895A8] mb-2">Or enter your ID manually</p>
              <div className="flex gap-2">
                <input
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder={manualPlaceholder}
                  className="flex-1 px-3 py-2 border border-[#E8E6F0] rounded-lg text-[13px] font-mono"
                />
                <button
                  type="button"
                  onClick={handleManual}
                  className="px-4 py-2 bg-[#5B3FD4] text-white rounded-lg text-[13px] font-medium"
                >
                  Connect
                </button>
              </div>
            </div>
            {error && <p className="text-[13px] text-[#C0392B]">{error}</p>}
          </div>
        )}

        {phase === "connecting" && (
          <div className="py-10 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#1A9E6E]" />
            <p className="text-[14px] text-[#6B6778]">Connecting…</p>
          </div>
        )}

        {phase === "done" && (
          <div className="py-10 flex flex-col items-center gap-3">
            <CheckCircle className="w-12 h-12 text-[#1A9E6E]" />
            <p className="text-[16px] font-semibold text-[#1A9E6E]">Connected ✓</p>
          </div>
        )}
      </div>
    </div>
  )
}
