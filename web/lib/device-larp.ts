/** Demo device slots — maps to bundled JSON under /demo/ */
export type DeviceSlot = "A" | "B" | "C"

export const WHOOP_DEVICE_OPTIONS = [
  { slot: "A" as DeviceSlot, label: "WHOOP A — Jordan Kim's device" },
  { slot: "B" as DeviceSlot, label: "WHOOP B — Alex Rivera's device" },
  { slot: "C" as DeviceSlot, label: "WHOOP C — Morgan Chen's device" },
]

export const CGM_DEVICE_OPTIONS = [
  { slot: "A" as DeviceSlot, label: "Libre A — Jordan Kim's sensor" },
  { slot: "B" as DeviceSlot, label: "Libre B — Alex Rivera's sensor" },
  { slot: "C" as DeviceSlot, label: "Libre C — Morgan Chen's sensor" },
]

const WHOOP_DEMO_PATH: Record<DeviceSlot, string> = {
  A: "/demo/whoop-patient-a.json",
  B: "/demo/whoop-patient-b.json",
  C: "/demo/whoop-patient-c.json",
}

const CGM_DEMO_PATH: Record<DeviceSlot, string> = {
  A: "/demo/glucose-patient-a.json",
  B: "/demo/glucose-patient-b.json",
  C: "/demo/glucose-patient-c.json",
}

function storageKey(patientId: string, kind: "whoop" | "cgm") {
  return `gira_${kind}_connected_${patientId}`
}

export function getDeviceConnection(patientId: string, kind: "whoop" | "cgm"): DeviceSlot | null {
  if (typeof window === "undefined") return null
  const v = localStorage.getItem(storageKey(patientId, kind))
  return v === "A" || v === "B" || v === "C" ? v : null
}

export function setDeviceConnection(patientId: string, kind: "whoop" | "cgm", slot: DeviceSlot | null) {
  if (typeof window === "undefined") return
  const key = storageKey(patientId, kind)
  if (slot) localStorage.setItem(key, slot)
  else localStorage.removeItem(key)
}

export function isDeviceConnected(patientId: string, kind: "whoop" | "cgm"): boolean {
  return getDeviceConnection(patientId, kind) != null
}

export async function uploadDemoWearable(
  patientId: string,
  slot: DeviceSlot,
  uploadFn: (patientId: string, file: File) => Promise<unknown>
): Promise<void> {
  const res = await fetch(WHOOP_DEMO_PATH[slot])
  if (!res.ok) throw new Error("Demo wearable data unavailable")
  const blob = await res.blob()
  const file = new File([blob], `whoop-${slot.toLowerCase()}.json`, { type: "application/json" })
  await uploadFn(patientId, file)
  setDeviceConnection(patientId, "whoop", slot)
}

export async function uploadDemoGlucose(
  patientId: string,
  slot: DeviceSlot,
  uploadFn: (patientId: string, file: File) => Promise<unknown>
): Promise<void> {
  const res = await fetch(CGM_DEMO_PATH[slot])
  if (!res.ok) throw new Error("Demo CGM data unavailable")
  const blob = await res.blob()
  const file = new File([blob], `glucose-${slot.toLowerCase()}.json`, { type: "application/json" })
  await uploadFn(patientId, file)
  setDeviceConnection(patientId, "cgm", slot)
}
