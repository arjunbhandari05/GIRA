"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle, Circle, Dna, FileJson, Heart, Loader2, Upload } from "lucide-react"
import { motion } from "framer-motion"
import {
  getPatientAssets,
  uploadPatientGenome,
  uploadPatientGlucose,
  uploadPatientIntakeFile,
  uploadPatientWearable,
  type PatientAssets,
} from "@/lib/api"

interface SetupTabProps {
  patientId: string
  patientName: string
  onAssetsUpdated?: () => void
}

function StatusRow({
  label,
  done,
  hint,
}: {
  label: string
  done: boolean
  hint: string
}) {
  return (
    <motion.div className="flex items-start gap-3">
      {done ? (
        <CheckCircle className="w-5 h-5 text-[#1A9E6E] shrink-0 mt-0.5" />
      ) : (
        <Circle className="w-5 h-5 text-[#C4C1D4] shrink-0 mt-0.5" />
      )}
      <div>
        <p className={`text-[14px] font-medium ${done ? "text-[#0D0B14]" : "text-[#6B6778]"}`}>{label}</p>
        <p className="text-[12px] text-[#9895A8] mt-0.5">{hint}</p>
      </div>
    </motion.div>
  )
}

function UploadCard({
  title,
  description,
  accept,
  icon: Icon,
  uploading,
  onFile,
}: {
  title: string
  description: string
  accept: string
  icon: typeof Dna
  uploading: boolean
  onFile: (file: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="border border-[#E8E6F0] rounded-lg bg-white p-5">
      <div className="flex items-start gap-3 mb-4">
        <Icon className="w-5 h-5 text-[#5B3FD4] shrink-0" />
        <motion.div>
          <p className="text-[14px] font-semibold text-[#0D0B14]">{title}</p>
          <p className="text-[13px] text-[#6B6778] mt-0.5">{description}</p>
        </motion.div>
      </div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          if (ref.current) ref.current.value = ""
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => ref.current?.click()}
        className="flex items-center gap-2 px-4 py-2 border border-[#5B3FD4] text-[#5B3FD4] rounded-md text-[13px] font-medium hover:bg-[#5B3FD4] hover:text-white transition-colors disabled:opacity-50"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? "Uploading…" : "Choose file"}
      </button>
    </div>
  )
}

export default function SetupTab({ patientId, patientName, onAssetsUpdated }: SetupTabProps) {
  const [assets, setAssets] = useState<PatientAssets | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const a = await getPatientAssets(patientId)
      if ("error" in a && a.error) throw new Error(String(a.error))
      setAssets(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load status")
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const wrapUpload = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setMessage(null)
    setError(null)
    try {
      await fn()
      setMessage(`${key} uploaded successfully.`)
      await refresh()
      onAssetsUpdated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setBusy(null)
    }
  }

  if (loading && !assets) {
    return (
      <div className="flex items-center gap-2 text-[#9895A8] py-12 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading patient workspace…
      </div>
    )
  }

  const a = assets || {
    patient_id: patientId,
    genome: false,
    wearable: false,
    glucose: false,
    intake_file: false,
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8]">Patient workspace</p>
        <p className="text-[13px] text-[#6B6778] mt-1">
          <span className="font-medium text-[#0D0B14]">{patientName}</span>
          <span className="font-mono text-[12px] ml-2 text-[#9895A8]">{patientId}</span>
        </p>
        <p className="text-[13px] text-[#6B6778] mt-2">
          Upload each data source for this patient. When ready, open the Brief tab and generate the agent brief.
        </p>
      </div>

      {error && (
        <motion.div className="border-l-[3px] border-l-[#C0392B] border border-[#E8E6F0] rounded-md p-3 text-[13px] text-[#C0392B]">
          {error}
        </motion.div>
      )}
      {message && (
        <div className="border-l-[3px] border-l-[#1A9E6E] border border-[#E8E6F0] rounded-md p-3 text-[13px] text-[#1A9E6E]">
          {message}
        </div>
      )}

      <div className="border border-[#E8E6F0] rounded-lg bg-white p-5 space-y-4">
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8]">Checklist</p>
        <StatusRow label="Genome" done={a.genome} hint="23andMe raw .txt" />
        <StatusRow label="WHOOP metrics" done={a.wearable} hint="Synthetic JSON → data/whoop/" />
        <StatusRow label="CGM glucose" done={a.glucose} hint="Synthetic JSON → data/glucose/" />
        <StatusRow label="Intake form file" done={a.intake_file} hint="JSON matching intake schema" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <UploadCard
          title="Genome"
          description="23andMe export for this patient only"
          accept=".txt,.tsv,.csv"
          icon={Dna}
          uploading={busy === "genome"}
          onFile={(file) => wrapUpload("Genome", () => uploadPatientGenome(patientId, file))}
        />
        <UploadCard
          title="WHOOP / wearables"
          description="30-day synthetic metrics JSON"
          accept=".json,application/json"
          icon={Heart}
          uploading={busy === "wearable"}
          onFile={(file) => wrapUpload("WHOOP", () => uploadPatientWearable(patientId, file))}
        />
        <UploadCard
          title="CGM glucose"
          description="30-day synthetic glucose JSON"
          accept=".json,application/json"
          icon={Heart}
          uploading={busy === "glucose"}
          onFile={(file) => wrapUpload("Glucose", () => uploadPatientGlucose(patientId, file))}
        />
        <UploadCard
          title="Intake form"
          description="Pre-filled clinician intake JSON"
          accept=".json,application/json"
          icon={FileJson}
          uploading={busy === "intake"}
          onFile={(file) => wrapUpload("Intake", () => uploadPatientIntakeFile(patientId, file))}
        />
      </div>

      <p className="text-[12px] text-[#9895A8]">
        You can also edit intake manually on the Intake tab. Metrics appear on the Metrics tab after WHOOP and CGM
        files are uploaded.
      </p>
    </div>
  )
}
