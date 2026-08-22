import { STARTER_INCANTATIONS } from '@/lib/incantations'
import type { Clip } from '@/lib/types'
import { relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

type GrimoireRailProps = {
  clips: Clip[]
  selectedId?: string
  query: string
  error?: string
  loading?: boolean
  onQuery: (value: string) => void
  onSelect: (id: string) => void
  onStarter: (prompt: string) => void
  onDelete: (id: string) => void
}

export function GrimoireRail({
  clips,
  selectedId,
  query,
  error,
  loading,
  onQuery,
  onSelect,
  onStarter,
  onDelete,
}: GrimoireRailProps) {
  const filtered = clips.filter((c) => c.prompt.toLowerCase().includes(query.toLowerCase()))

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather">
      <div className="p-3">
        <h2 className="font-display text-sm tracking-[0.2em] text-muted">GRIMOIRE</h2>
        <Input
          className="mt-2"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search the pages…"
          aria-label="Search Grimoire"
        />
      </div>
      {error ? (
        <div className="px-3 text-sm text-danger" role="alert">
          Couldn’t open Grimoire. {error}
        </div>
      ) : null}
      {loading ? (
        <div className="space-y-2 px-3" role="status">
          <div className="h-14 animate-pulse rounded-book bg-leather-2" />
          <div className="h-14 animate-pulse rounded-book bg-leather-2" />
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        {filtered.length === 0 && !loading ? (
          <div className="space-y-2 px-3 pb-3">
            <p className="text-sm text-muted">The Grimoire is empty. Try a starter incantation.</p>
            {STARTER_INCANTATIONS.slice(0, 3).map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="w-full rounded-book border border-[color-mix(in_srgb,var(--color-gold)_30%,transparent)] p-2 text-left text-xs text-cream hover:bg-leather-2"
                onClick={() => onStarter(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : (
          <ul className="space-y-1 px-2 pb-3">
            {filtered.map((clip) => (
              <li key={clip.id}>
                <button
                  type="button"
                  onClick={() => onSelect(clip.id)}
                  className={`w-full rounded-book p-2 text-left ${
                    selectedId === clip.id ? 'bg-leather-2' : 'hover:bg-leather-2/60'
                  }`}
                >
                  <p className="line-clamp-2 text-sm text-cream">{clip.prompt}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted">
                    {clip.duration.toFixed(1)}s · {relativeTime(clip.createdAt)}
                  </p>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  onClick={() => onDelete(clip.id)}
                >
                  Strike from the book
                </Button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </aside>
  )
}
