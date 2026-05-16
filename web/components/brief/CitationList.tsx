import type { Citation } from "@/types/brief"

interface CitationListProps {
  citations: Citation[]
}

export default function CitationList({ citations }: CitationListProps) {
  if (citations.length === 0) return null

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Citations</h3>
      <ol className="space-y-2">
        {citations.map((c) => (
          <li key={c.index} className="flex gap-2">
            <span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted text-[11px] font-medium">
              {c.index}
            </span>
            <span className="text-xs text-muted-foreground">{c.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
