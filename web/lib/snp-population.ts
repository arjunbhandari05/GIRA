export interface SnpPopulationStat {
  gene: string
  rsid: string
  genotype: string
  populationPct: number
  headline: string
  detail: string
}

export const SNP_POPULATION_STATS: SnpPopulationStat[] = [
  {
    gene: "TCF7L2",
    rsid: "rs7903146",
    genotype: "TT",
    populationPct: 10,
    headline: "~10% of people carry this variant",
    detail:
      "Most studied T2D risk gene. Affects insulin secretion and GLP-1 signaling. 2.4× T2D risk.",
  },
  {
    gene: "SLC22A1",
    rsid: "rs622342",
    genotype: "AA",
    populationPct: 20,
    headline: "~20% of people carry this variant",
    detail: "Reduces metformin absorption by 60%. Common reason for metformin non-response.",
  },
  {
    gene: "KCNJ11",
    rsid: "rs5219",
    genotype: "TT",
    populationPct: 15,
    headline: "~15% of people carry this variant",
    detail: "Affects insulin-secreting cells. Sulfonylureas work better for this genotype.",
  },
  {
    gene: "PPARG",
    rsid: "rs1801282",
    genotype: "CC",
    populationPct: 75,
    headline: "~75% of people carry this variant",
    detail: "Pro/Pro variant. Highest insulin resistance but strongest TZD drug response.",
  },
  {
    gene: "ABCC8",
    rsid: "rs757110",
    genotype: "AA",
    populationPct: 30,
    headline: "~30% of people carry this variant",
    detail: "Variant affects sulfonylurea drug binding site.",
  },
  {
    gene: "FTO",
    rsid: "rs9939609",
    genotype: "AA",
    populationPct: 16,
    headline: "~16% of people carry this variant",
    detail: "Strongest known obesity risk variant. 40% better weight loss on GLP-1 drugs. 1.67× obesity risk.",
  },
  {
    gene: "SLCO1B1",
    rsid: "rs4149056",
    genotype: "TT",
    populationPct: 5,
    headline: "~5% of people carry this variant",
    detail: "Rare but serious. Atorvastatin and simvastatin can cause severe muscle damage. 16.9× statin myopathy risk.",
  },
  {
    gene: "APOE",
    rsid: "rs429358",
    genotype: "TT",
    populationPct: 2,
    headline: "~2% of people carry this variant",
    detail: "APOE4/4 — highest cardiovascular risk. SGLT2 inhibitors provide cardioprotection.",
  },
  {
    gene: "CYP2C19",
    rsid: "rs4244285",
    genotype: "AA",
    populationPct: 2,
    headline: "~2% of people carry this variant",
    detail: "Poor metabolizer. Clopidogrel (blood thinner) has zero effect. FDA Black Box warning.",
  },
  {
    gene: "VKORC1",
    rsid: "rs9923231",
    genotype: "AA",
    populationPct: 10,
    headline: "~10% of people carry this variant",
    detail: "Highly warfarin sensitive. Standard dosing causes dangerous over-anticoagulation.",
  },
]

export function lookupSnpStat(gene: string, rsid?: string, genotype?: string): SnpPopulationStat | undefined {
  const g = gene.toUpperCase()
  return SNP_POPULATION_STATS.find(
    (s) =>
      s.gene.toUpperCase() === g &&
      (!rsid || s.rsid === rsid) &&
      (!genotype || s.genotype.toUpperCase() === genotype.toUpperCase())
  )
}
