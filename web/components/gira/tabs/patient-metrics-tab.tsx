"use client"

import { useEffect, useState } from "react"
import { Heart, Droplet } from "lucide-react"
import WhoopDataTab from "./whoop-data-tab"
import { isDeviceConnected, uploadDemoGlucose, uploadDemoWearable, CGM_DEVICE_OPTIONS, WHOOP_DEVICE_OPTIONS } from "@/lib/device-larp"
import type { DeviceSlot } from "@/lib/device-larp"
import { uploadPatientGlucose, uploadPatientWearable } from "@/lib/api"
import DeviceConnectModal from "../device-connect-modal"

interface PatientMetricsTabProps {
  patientId: string
}

export default function PatientMetricsTab({ patientId }: PatientMetricsTabProps) {
  const [whoopOpen, setWhoopOpen] = useState(false)
  const [cgmOpen, setCgmOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const whoopOk = isDeviceConnected(patientId, "whoop")
  const cgmOk = isDeviceConnected(patientId, "cgm")

  useEffect(() => {
    setRefreshKey((k) => k + 1)
  }, [patientId, whoopOk, cgmOk])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setWhoopOpen(true)}
          className="flex items-center gap-2 px-3 py-2 border border-[#E8E6F0] rounded-lg text-[13px]"
        >
          <Heart className="w-4 h-4 text-[#1A9E6E]" />
          {whoopOk ? "WHOOP connected" : "Connect WHOOP"}
        </button>
        <button
          type="button"
          onClick={() => setCgmOpen(true)}
          className="flex items-center gap-2 px-3 py-2 border border-[#E8E6F0] rounded-lg text-[13px]"
        >
          <Droplet className="w-4 h-4 text-[#5B3FD4]" />
          {cgmOk ? "CGM connected" : "Connect CGM"}
        </button>
      </div>

      <WhoopDataTab patientId={patientId} refreshKey={refreshKey} liveMode />

      <DeviceConnectModal
        open={whoopOpen}
        onClose={() => setWhoopOpen(false)}
        title="Connect your WHOOP"
        searchLabel="Searching for nearby WHOOP devices…"
        options={WHOOP_DEVICE_OPTIONS}
        manualPlaceholder="WHOOP User ID"
        onConnect={async (slot: DeviceSlot | null) => {
          if (slot) await uploadDemoWearable(patientId, slot, uploadPatientWearable)
          setRefreshKey((k) => k + 1)
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
          setRefreshKey((k) => k + 1)
        }}
      />
    </div>
  )
}
