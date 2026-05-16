"use client"

import { useCallback, useEffect, useState } from "react"
import { CheckCircle, Circle, Dna, Heart, FileText, Droplet, Loader2 } from "lucide-react"
import {
  getIntake,
  getPatientAssets,
  uploadPatientGenome,
  uploadPatientGlucose,
  uploadPatientWearable,
} from "@/lib/api"
import {
  CGM_DEVICE_OPTIONS,
  isDeviceConnected,
  uploadDemoGlucose,
  uploadDemoWearable,
  WHOOP_DEVICE_OPTIONS,
  type DeviceSlot,
} from "@/lib/device-larp"
import DeviceConnectModal from "../device-connect-modal"

interface PatientSetupTabProps {
  patientId: string
}

export default function PatientSetupTab({ patientId }: PatientSetupTabProps) {
  const [assets, setAssets] = useState<Awaited<ReturnType<typeof getPatientAssets>> | null>(null)
  const [intakeDone, setIntakeDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [whoopOpen, setWhoopOpen] = useState(false)
  const [cgmOpen, setCgmOpen] = useState(false)
  const [whoopConnected, setWhoopConnected] = useState(false)
  const [cgmConnected, setCgmConnected] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [a, intake] = await Promise.all([
        getPatientAssets(patientId),
        getIntake(patientId),
      ])
      setAssets(a)
      const meds = intake.intake?.medications?.length ?? 0
      setIntakeDone(meds > 0 || Boolean(a.intake_file))
      setWhoopConnected(Boolean(a.wearable) || isDeviceConnected(patientId, "whoop"))
      setCgmConnected(Boolean(a.glucose) || isDeviceConnected(patientId, "cgm"))
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (loading) {
    return (
      <div className="flex justify-center py-12 text-[#9895A8] gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading setup…
      </div>
    )
  }

  const items = [
    { label: "Genome uploaded", done: assets?.genome, icon: Dna },
    { label: "WHOOP connected", done: whoopConnected, icon: Heart },
    { label: "Glucose monitor connected", done: cgmConnected, icon: Droplet },
    { label: "Intake submitted", done: intakeDone, icon: FileText },
  ]

  return (
    <div className="space-y-6">
      <p className="text-[15px] text-[#6B6778]">
        Complete each step so your care team can prepare for your visit.
      </p>

      <div className="space-y-3 border border-[#E8E6F0] rounded-lg p-5 bg-white">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="flex items-center gap-3">
              {item.done ? (
                <CheckCircle className="w-5 h-5 text-[#1A9E6E]" />
              ) : (
                <Circle className="w-5 h-5 text-[#C4C1D4]" />
              )}
              <Icon className="w-4 h-4 text-[#5B3FD4]" />
              <span className="text-[14px] text-[#0D0B14]">{item.label}</span>
            </div>
          )
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setWhoopOpen(true)}
          className="p-4 border border-[#E8E6F0] rounded-lg text-left hover:border-[#1A9E6E]"
        >
          <Heart className="w-5 h-5 text-[#1A9E6E] mb-2" />
          <p className="font-semibold text-[14px]">
            {whoopConnected ? "WHOOP connected ✓" : "Connect WHOOP"}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setCgmOpen(true)}
          className="p-4 border border-[#E8E6F0] rounded-lg text-left hover:border-[#5B3FD4]"
        >
          <Droplet className="w-5 h-5 text-[#5B3FD4] mb-2" />
          <p className="font-semibold text-[14px]">
            {cgmConnected ? "CGM connected ✓" : "Connect CGM"}
          </p>
        </button>
      </div>

      {!assets?.genome && (
        <div className="border border-dashed border-[#E8E6F0] rounded-lg p-4">
          <p className="text-[13px] text-[#6B6778] mb-2">Upload 23andMe raw file (.txt)</p>
          <input
            type="file"
            accept=".txt"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) {
                await uploadPatientGenome(patientId, f)
                refresh()
              }
            }}
            className="text-[13px]"
          />
        </div>
      )}

      <DeviceConnectModal
        open={whoopOpen}
        onClose={() => setWhoopOpen(false)}
        title="Connect your WHOOP"
        searchLabel="Searching for nearby WHOOP devices…"
        options={WHOOP_DEVICE_OPTIONS}
        manualPlaceholder="WHOOP User ID"
        onConnect={async (slot) => {
          if (slot) await uploadDemoWearable(patientId, slot, uploadPatientWearable)
          await refresh()
        }}
      />
      <DeviceConnectModal
        open={cgmOpen}
        onClose={() => setCgmOpen(false)}
        title="Connect your CGM"
        searchLabel="Searching for nearby CGM devices…"
        options={CGM_DEVICE_OPTIONS}
        manualPlaceholder="Libre User ID"
        onConnect={async (slot) => {
          if (slot) await uploadDemoGlucose(patientId, slot, uploadPatientGlucose)
          await refresh()
        }}
      />
    </div>
  )
}
