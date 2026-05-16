"use client"

import { useEffect, useState } from "react"
import { Heart, Droplet } from "lucide-react"
import {
  isDeviceConnected,
  uploadDemoGlucose,
  uploadDemoWearable,
  CGM_DEVICE_OPTIONS,
  WHOOP_DEVICE_OPTIONS,
  type DeviceSlot,
} from "@/lib/device-larp"
import { uploadPatientGlucose, uploadPatientWearable } from "@/lib/api"
import DeviceConnectModal from "./device-connect-modal"

interface PatientWearableConnectProps {
  patientId: string
  onConnectionChange?: () => void
}

/** Patient Setup: WHOOP / CGM connect buttons and modals (logic unchanged from Live Metrics). */
export default function PatientWearableConnect({
  patientId,
  onConnectionChange,
}: PatientWearableConnectProps) {
  const [whoopOpen, setWhoopOpen] = useState(false)
  const [cgmOpen, setCgmOpen] = useState(false)
  const whoopOk = isDeviceConnected(patientId, "whoop")
  const cgmOk = isDeviceConnected(patientId, "cgm")

  useEffect(() => {
    onConnectionChange?.()
  }, [patientId, whoopOk, cgmOk, onConnectionChange])

  return (
    <div className="border border-[#E8E6F0] rounded-lg bg-white p-5 space-y-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8]">
          Connected devices
        </p>
        <p className="text-[13px] text-[#6B6778] mt-1">
          Link your WHOOP and CGM so live metrics can sync to your record.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setWhoopOpen(true)}
          className="flex items-center gap-2 px-3 py-2 border border-[#E8E6F0] rounded-lg text-[13px] hover:bg-[#FAFAFC] transition-colors"
        >
          <Heart className="w-4 h-4 text-[#1A9E6E]" />
          {whoopOk ? "WHOOP connected" : "Connect WHOOP"}
        </button>
        <button
          type="button"
          onClick={() => setCgmOpen(true)}
          className="flex items-center gap-2 px-3 py-2 border border-[#E8E6F0] rounded-lg text-[13px] hover:bg-[#FAFAFC] transition-colors"
        >
          <Droplet className="w-4 h-4 text-[#5B3FD4]" />
          {cgmOk ? "CGM connected" : "Connect CGM"}
        </button>
      </div>

      <DeviceConnectModal
        open={whoopOpen}
        onClose={() => setWhoopOpen(false)}
        title="Connect your WHOOP"
        searchLabel="Searching for nearby WHOOP devices…"
        options={WHOOP_DEVICE_OPTIONS}
        manualPlaceholder="WHOOP User ID"
        onConnect={async (slot: DeviceSlot | null) => {
          if (slot) await uploadDemoWearable(patientId, slot, uploadPatientWearable)
          onConnectionChange?.()
        }}
      />
      <DeviceConnectModal
        open={cgmOpen}
        onClose={() => setCgmOpen(false)}
        title="Connect your CGM"
        searchLabel="Searching for nearby CGM devices…"
        options={CGM_DEVICE_OPTIONS}
        manualPlaceholder="Libre User ID"
        onConnect={async (slot: DeviceSlot | null) => {
          if (slot) await uploadDemoGlucose(patientId, slot, uploadPatientGlucose)
          onConnectionChange?.()
        }}
      />
    </div>
  )
}
