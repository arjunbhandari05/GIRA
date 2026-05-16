"use client"

import { lookupSnpStat } from "@/lib/snp-population"
import { X } from "lucide-react"

interface SnpDetailPanelProps {
  gene: string
  rsid?: string
  genotype?: string
  onClose: () => void
}

export default function SnpDetailPanel({ gene, rsid, genotype, onClose }: SnpDetailPanelProps) {
  const stat = lookupSnpStat(gene, rsid, genotype)
  if (!stat) return null

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm bg-white border-l border-[#E8E6F0] shadow-xl p-6 overflow-y-auto">
      <button type="button" onClick={onClose} className="absolute top-4 right-4 p-1 text-[#9895A8]">
        <X className="w-5 h-5" />
      </button>
      <p className="text-[11px] font-semibold uppercase text-[#9895A8]">Population genetics</p>
      <h3 className="text-[20px] font-bold font-mono text-[#0D0B14] mt-1">
        {stat.gene} {stat.rsid}
      </h3>
      <p className="font-mono text-[14px] text-[#5B3FD4] mt-1">{stat.genotype}</p>

      <div className="mt-6">
        <p className="text-[12px] text-[#9895A8] mb-2">Population frequency</p>
        <div className="h-2 bg-[#F0EEF5] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#5B3FD4] rounded-full"
            style={{ width: `${Math.min(100, stat.populationPct)}%` }}
          />
        </div>
        <p className="text-[13px] text-[#6B6778] mt-2">{stat.headline}</p>
      </div>

      <p className="text-[14px] text-[#6B6778] leading-relaxed mt-6">{stat.detail}</p>
    </div>
  )
}
