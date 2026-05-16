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

const STATUS_RANK: Record<SNPStatus, number> = {
  flag: 0,
  warn: 1,
  ok: 2,
}

const RSID_PRIORITY: Record<string, { rank: number; impact: string }> = {
  rs4149056: { rank: 0, impact: "Statin myopathy risk" },
  rs4244285: { rank: 1, impact: "Clopidogrel response" },
  rs4986893: { rank: 2, impact: "Clopidogrel response" },
  rs9923231: { rank: 3, impact: "Warfarin sensitivity" },
  rs1799853: { rank: 4, impact: "Warfarin dose response" },
  rs1057910: { rank: 5, impact: "Warfarin dose response" },
  rs622342: { rank: 6, impact: "Metformin transport" },
  rs2289669: { rank: 7, impact: "Metformin transport" },
  rs11212617: { rank: 8, impact: "Metformin response" },
  rs7903146: { rank: 9, impact: "Type 2 diabetes risk" },
  rs429358: { rank: 10, impact: "Cardiovascular risk" },
  rs7412: { rank: 11, impact: "Cardiovascular risk" },
}

const GENE_PRIORITY: Record<string, { rank: number; impact: string }> = {
  SLCO1B1: { rank: 0, impact: "Statin myopathy risk" },
  CYP2C19: { rank: 1, impact: "Clopidogrel response" },
  VKORC1: { rank: 2, impact: "Warfarin sensitivity" },
  CYP2C9: { rank: 3, impact: "Warfarin dose response" },
  SLC22A1: { rank: 4, impact: "Metformin transport" },
  SLC47A1: { rank: 5, impact: "Metformin transport" },
  ATM: { rank: 6, impact: "Metformin response" },
  TCF7L2: { rank: 7, impact: "Type 2 diabetes risk" },
  APOE: { rank: 8, impact: "Cardiovascular risk" },
  FTO: { rank: 9, impact: "Metabolic risk" },
}

function flagForRsid(rsid: string, flags: SafetyFlag[]): SafetyFlag | undefined {
  return flags.find((flag) =>
    String(flag.rsid || "")
      .split("+")
      .map((part) => part.trim())
      .includes(rsid)
  )
}

function clinicalImpact(rsid: string, gene: string, flag?: SafetyFlag): string {
  if (flag?.drug) return `${flag.drug} · ${flag.flag}`
  return RSID_PRIORITY[rsid]?.impact || GENE_PRIORITY[gene]?.impact || "Pharmacogenomic target"
}

function relevanceRank(rsid: string, gene: string, flag?: SafetyFlag): number {
  if (flag?.currently_prescribed) return -2
  if (flag) return -1
  return RSID_PRIORITY[rsid]?.rank ?? GENE_PRIORITY[gene]?.rank ?? 99
}

function statusFromFlagOrRsid(rsid: string, flags: SafetyFlag[], flag?: SafetyFlag): SNPStatus {
  if (flag) return (flag.severity || "").toUpperCase() === "CRITICAL" ? "flag" : "warn"
  return snpStatusFromFlags(rsid, flags)
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
      priority: number
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
        const safetyFlags = flags as SafetyFlag[]
        const table = Object.entries(profile)
          .map(([rsid, snp]) => {
            const gene = snp.gene || "—"
            const flag = flagForRsid(rsid, safetyFlags)
            const status = statusFromFlagOrRsid(rsid, safetyFlags, flag)
            const priority = relevanceRank(rsid, gene, flag)
            return {
              gene,
              rsid,
              genotype: snp.genotype || "—",
              impact: clinicalImpact(rsid, gene, flag),
              evidence: flag?.currently_prescribed
                ? "Active medication"
                : flag
                  ? "Safety gate"
                  : priority < 99
                    ? "High-priority panel"
                    : "Panel",
              status,
              priority,
            }
          })
          .sort((a, b) => {
            const statusDelta = STATUS_RANK[a.status] - STATUS_RANK[b.status]
            if (statusDelta !== 0) return statusDelta
            const priorityDelta = a.priority - b.priority
            if (priorityDelta !== 0) return priorityDelta
            const geneDelta = a.gene.localeCompare(b.gene)
            if (geneDelta !== 0) return geneDelta
            return a.rsid.localeCompare(b.rsid)
          })
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
          Pharmacogenomic markers sorted by safety status, medication relevance, and health impact.
        </p>
      </div>

      {error && <p className="text-[13px] text-[#C0392B]">{error}</p>}

      <div className="border border-[#E8E6F0] rounded-lg bg-white p-4 flex items-center gap-4">
        <FileText className="w-5 h-5 text-[#5B3FD4]" />
        <div className="flex-1">
          <p className="font-mono text-[12px] text-[#0D0B14]">{patientId}</p>
          <p className="text-[12px] text-[#9895A8]">
            {meta.count} markers loaded · Parsed {meta.parsedAt}
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
