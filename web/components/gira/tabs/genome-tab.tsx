"use client"

import { useEffect, useState } from "react"
import { FileText, Loader2 } from "lucide-react"
import { getSafetyFlags, listPatients } from "@/lib/api"
import { snpStatusFromFlags } from "@/lib/mappers"
import type { SafetyFlag, SNPStatus } from "@/lib/types"
import SnpDetailPanel from "../snp-detail-panel"

interface GenomeTabProps {
  patientId: string
}

export default function GenomeTab({ patientId }: GenomeTabProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snps, setSnps] = useState<
    Array<{
      gene: string
      rsid: string
      genotype: string
      impact: string
      evidence: string
      status: SNPStatus
    }>
  >([])
  const [meta, setMeta] = useState({ parsedAt: "", count: 0 })
  const [panel, setPanel] = useState<{ gene: string; rsid: string; genotype: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [rows, flags] = await Promise.all([listPatients(), getSafetyFlags(patientId)])
        if (cancelled) return
        const row = rows.find((r) => r.patient_id === patientId)
        const profile = (row?.snp_profile_json || {}) as Record<
          string,
          { gene?: string; genotype?: string }
        >
        const table = Object.entries(profile).map(([rsid, snp]) => ({
          gene: snp.gene || "—",
          rsid,
          genotype: snp.genotype || "—",
          impact: "Pharmacogenomic target",
          evidence: flags.some((f) => f.rsid === rsid) ? "Safety gate" : "Panel",
          status: snpStatusFromFlags(rsid, flags as SafetyFlag[]),
        }))
        setSnps(table)
        setMeta({
          parsedAt: row?.parsed_at ? new Date(row.parsed_at).toLocaleDateString() : "—",
          count: Object.keys(profile).length,
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load genome")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [patientId])

  const getStatusStyles = (status: SNPStatus) => {
    switch (status) {
      case "flag":
        return { text: "Safety flag", row: "bg-[#FDF9F9]", genotype: "text-[#C0392B]", textColor: "text-[#C0392B]" }
      case "warn":
        return { text: "Monitor", row: "bg-[#FDFAF5]", genotype: "text-[#B45309]", textColor: "text-[#B45309]" }
      default:
        return { text: "Normal", row: "", genotype: "text-[#1A9E6E]", textColor: "text-[#1A9E6E]" }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#9895A8] py-12 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading SNP profile…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8]">Genomic Profile</p>
        <p className="text-[13px] text-[#6B6778] mt-1">
          From GET /patients → <span className="font-mono">snp_profile_json</span> ({meta.count} targets)
        </p>
      </div>

      {error && <p className="text-[13px] text-[#C0392B]">{error}</p>}

      <div className="border border-[#E8E6F0] rounded-lg bg-white p-4 flex items-center gap-4">
        <FileText className="w-5 h-5 text-[#5B3FD4]" />
        <div className="flex-1">
          <p className="font-mono text-[12px] text-[#0D0B14]">{patientId}</p>
          <p className="text-[12px] text-[#9895A8]">
            Parsed {meta.parsedAt} · Download not exposed by API (frontend-only gap)
          </p>
        </div>
      </div>

      <div className="border border-[#E8E6F0] rounded-lg bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#E8E6F0]">
                {["Gene", "rsID", "Genotype", "Clinical Impact", "Evidence", "Status"].map((h) => (
                  <th
                    key={h}
                    className="px-4 pb-2 pt-4 text-left text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9895A8]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#9895A8]">
                    No SNPs on file. Upload a genome from the patient roster.
                  </td>
                </tr>
              ) : (
                snps.map((snp, i) => {
                  const styles = getStatusStyles(snp.status)
                  return (
                    <tr
                      key={snp.rsid}
                      className={`border-b border-[#E8E6F0] last:border-0 cursor-pointer hover:bg-[#FAFAFC] ${styles.row}`}
                      onClick={() => setPanel({ gene: snp.gene, rsid: snp.rsid, genotype: snp.genotype })}
                    >
                      <td className="px-4 py-3 font-mono font-semibold">{snp.gene}</td>
                      <td className="px-4 py-3 font-mono text-[12px] text-[#9895A8]">{snp.rsid}</td>
                      <td className={`px-4 py-3 font-mono text-[14px] font-bold ${styles.genotype}`}>
                        {snp.genotype}
                      </td>
                      <td className="px-4 py-3 text-[#6B6778]">{snp.impact}</td>
                      <td className="px-4 py-3 font-mono text-[12px] text-[#9895A8]">{snp.evidence}</td>
                      <td className={`px-4 py-3 text-[11px] font-semibold ${styles.textColor}`}>{styles.text}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {panel && (
        <SnpDetailPanel
          gene={panel.gene}
          rsid={panel.rsid}
          genotype={panel.genotype}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  )
}
