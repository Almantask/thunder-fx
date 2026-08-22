import { Hint } from '@/components/Hint'
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
    <section className="flex min-h-0 w-full flex-1 flex-col bg-leather" aria-label="Library">
      <div className="mx-auto w-full max-w-4xl p-6">
        <Hint label="Library of weaves saved on this machine. Open a page to load it in Generate.">
          <h2 className="font-display text-sm tracking-[0.2em] text-muted">GRIMOIRE</h2>
        </Hint>
        <Hint className="mt-3 w-full" label="Filter pages by incantation text. Does not search the audio.">
          <Input
            className="w-full"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search the pages…"
            aria-label="Search Grimoire"
          />
        </Hint>
      </div>
      {error ? (
        <Hint className="mx-auto w-full max-w-4xl px-6" label="The Grimoire store failed. Casts may still work; reload the keep if pages stay missing.">
          <div className="text-sm text-danger" role="alert">
            Couldn’t open Grimoire. {error}
          </div>
        </Hint>
      ) : null}
      {loading ? (
        <Hint className="mx-auto w-full max-w-4xl px-6" label="Loading saved pages from the local library.">
          <div className="w-full space-y-2" role="status">
            <div className="h-20 animate-pulse rounded-book bg-leather-2" />
            <div className="h-20 animate-pulse rounded-book bg-leather-2" />
          </div>
        </Hint>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-4xl px-6 pb-8">
          {filtered.length === 0 && !loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Hint className="sm:col-span-2 lg:col-span-3" label="No pages match yet. Starters fill the incantation and open Generate.">
                <p className="text-sm text-muted">The Grimoire is empty. Try a starter incantation.</p>
              </Hint>
              {STARTER_INCANTATIONS.slice(0, 3).map((prompt) => (
                <Hint key={prompt} className="w-full" label="Put this starter into Generate. Cast still waits for you.">
                  <button
                    type="button"
                    className="h-full w-full rounded-book border border-[color-mix(in_srgb,var(--color-gold)_30%,transparent)] p-3 text-left text-sm text-cream hover:bg-leather-2"
                    onClick={() => onStarter(prompt)}
                  >
                    {prompt}
                  </button>
                </Hint>
              ))}
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((clip) => (
                <li
                  key={clip.id}
                  className="rounded-book border border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] bg-leather-2/40 p-3"
                >
                  <Hint className="w-full" label="Load this weave in Generate for preview, trim, and export.">
                    <button
                      type="button"
                      onClick={() => onSelect(clip.id)}
                      className={`w-full rounded-book p-2 text-left ${
                        selectedId === clip.id ? 'bg-leather-2' : 'hover:bg-leather-2/60'
                      }`}
                    >
                      <p className="line-clamp-3 text-sm text-cream">{clip.prompt}</p>
                      <p className="mt-2 font-mono text-[11px] text-muted">
                        {clip.duration.toFixed(1)}s · {relativeTime(clip.createdAt)}
                      </p>
                    </button>
                  </Hint>
                  <Hint label="Remove this clip from the Grimoire. This cannot be undone.">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() => onDelete(clip.id)}
                    >
                      Strike from the book
                    </Button>
                  </Hint>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </section>
  )
}
