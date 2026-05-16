"use client"

import WhoopDataTab from "./whoop-data-tab"

interface PatientMetricsTabProps {
  patientId: string
  refreshKey?: number
}

export default function PatientMetricsTab({ patientId, refreshKey = 0 }: PatientMetricsTabProps) {
  return (
    <div className="space-y-4">
      <WhoopDataTab patientId={patientId} refreshKey={refreshKey} liveMode />
    </div>
  )
}
