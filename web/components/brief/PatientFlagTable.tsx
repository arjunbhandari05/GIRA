import { Badge } from "@/components/ui/badge"
import type { SafetyFlag } from "@/types/brief"

const FRIENDLY_GENES: Record<string, string> = {
  SLC22A1: "Metformin absorption gene",
  SLCO1B1: "Cholesterol medication gene",
  CYP2C19: "Blood thinner gene",
  VKORC1: "Warfarin sensitivity gene",
  TCF7L2: "Diabetes risk gene",
}

interface PatientFlagTableProps {
  flags: SafetyFlag[]
}

function friendlyGene(gene: string) {
  return FRIENDLY_GENES[gene] || gene
}

function badgeLabel(severity: SafetyFlag["severity"]) {
  if (severity === "flag") return "Not working well"
  if (severity === "warn") return "Higher risk variant"
  return "No concern now"
}

function badgeClass(severity: SafetyFlag["severity"]) {
  if (severity === "flag") return "bg-red-100 text-red-900 border-red-200"
  if (severity === "warn") return "bg-amber-100 text-amber-900 border-amber-200"
  return "bg-green-100 text-green-900 border-green-200"
}

export default function PatientFlagTable({ flags }: PatientFlagTableProps) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Your genetic medication clues</h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">What it means</th>
              <th className="px-3 py-2 font-medium">Your result</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((f) => (
              <tr key={`${f.gene}-${f.variant}`} className="border-b last:border-0">
                <td className="px-3 py-2">{friendlyGene(f.gene)}</td>
                <td className="px-3 py-2 font-mono text-xs">{f.genotype || "—"}</td>
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
        These variants are inherited — not caused by anything you did. They help your doctor pick the
        medication that works for your body.
      </p>
    </section>
  )
}
