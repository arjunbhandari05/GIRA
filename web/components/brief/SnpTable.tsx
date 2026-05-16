import { Badge } from "@/components/ui/badge"
import type { SafetyFlag } from "@/types/brief"

interface SnpTableProps {
  flags: SafetyFlag[]
}

function badgeVariant(severity: SafetyFlag["severity"]) {
  if (severity === "flag") return "destructive" as const
  if (severity === "warn") return "secondary" as const
  return "outline" as const
}

function badgeClass(severity: SafetyFlag["severity"]) {
  if (severity === "warn") return "bg-amber-100 text-amber-900 border-amber-200"
  if (severity === "ok") return "bg-green-100 text-green-900 border-green-200"
  return ""
}

export default function SnpTable({ flags }: SnpTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Gene</th>
            <th className="px-3 py-2 font-medium">Variant</th>
            <th className="px-3 py-2 font-medium">Genotype</th>
            <th className="px-3 py-2 font-medium">Impact</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={`${f.gene}-${f.variant}`} className="border-b last:border-0">
              <td className="px-3 py-2 font-medium">{f.gene}</td>
              <td className="px-3 py-2 font-mono text-xs">{f.variant}</td>
              <td className="px-3 py-2 font-mono">{f.genotype || "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{f.impact}</td>
              <td className="px-3 py-2">
                <Badge variant={badgeVariant(f.severity)} className={badgeClass(f.severity)}>
                  {f.severity}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
