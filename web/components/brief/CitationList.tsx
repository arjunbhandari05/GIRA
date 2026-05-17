import { MarkdownContent } from "@/lib/simple-markdown"
import type { Citation } from "@/types/brief"

interface CitationListProps {
  citations: Citation[]
}

export default function CitationList({ citations }: CitationListProps) {
  if (citations.length === 0) return null

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Citations</h3>
      <ol className="space-y-3">
        {citations.map((c) => (
          <li key={c.index} className="flex gap-2">
            <span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted text-[11px] font-medium">
              {c.index}
            </span>
            <div className="min-w-0 flex-1">
              {c.pmid && c.url ? (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[#5B3FD4] hover:underline"
                >
                  PMID {c.pmid}
                </a>
              ) : null}
              <MarkdownContent
                text={c.text}
                paragraphClass="text-xs leading-relaxed text-muted-foreground my-0"
                listClass="text-xs leading-relaxed text-muted-foreground my-0"
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
