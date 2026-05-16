import { Badge } from "@/components/ui/badge"
import type { TrialMatch } from "@/types/brief"

interface TrialListProps {
  trials: TrialMatch[]
}

export default function TrialList({ trials }: TrialListProps) {
  if (trials.length === 0) {
    return <p className="text-sm text-muted-foreground">No matching trials found for this profile.</p>
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Clinical trials</h3>
      <div className="space-y-2">
        {trials.map((t) => (
          <article key={t.nct_id} className="rounded-md border bg-card p-3">
            <p className="font-mono text-xs text-muted-foreground">{t.nct_id}</p>
            <p className="mt-1 font-medium">{t.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.phase} · {t.status} · {t.location}
            </p>
            {t.tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {t.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
