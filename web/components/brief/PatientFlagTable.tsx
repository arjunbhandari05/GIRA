import { Badge } from "@/components/ui/badge"
import { friendlyGenePlain } from "@/lib/patient-display"
import type { SafetyFlag } from "@/types/brief"

interface PatientFlagTableProps {
  flags: SafetyFlag[]
}

function badgeLabel(severity: SafetyFlag["severity"]) {
  if (severity === "flag") return "Worth discussing"
  if (severity === "warn") return "Use extra caution"
  return "Looks okay for now"
}

function badgeClass(severity: SafetyFlag["severity"]) {
  if (severity === "flag") return "bg-red-100 text-red-900 border-red-200"
  if (severity === "warn") return "bg-amber-100 text-amber-900 border-amber-200"
  return "bg-green-100 text-green-900 border-green-200"
}

export default function PatientFlagTable({ flags }: PatientFlagTableProps) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">How your DNA may affect medicines</h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">What it means for you</th>
              <th className="px-3 py-2 font-medium">Your body&apos;s pattern</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => (
              <tr key={`${f.gene}-${f.variant}`} className="border-b last:border-0">
                <td className="px-3 py-2">{friendlyGenePlain(f.gene)}</td>
                <td className="px-3 py-2 text-[13px] text-muted-foreground">
                  {f.genotype ? `Pattern ${f.genotype}` : "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={badgeClass(f.severity)}>
                    {badgeLabel(f.severity)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        These patterns are inherited — not something you caused. They help your doctor choose medicines
        that fit your body. Only your doctor should make medication changes.
      </p>
    </section>
  )
}
