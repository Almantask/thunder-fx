import { Hint } from '@/components/Hint'
import { promptName } from '@/lib/filename'
import { GENERATE_MODES, clipMode } from '@/lib/generateMode'
import { extractInstruments } from '@/lib/instruments'
import type { Clip, GenerateMode } from '@/lib/types'
import { relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

type GrimoireRailProps = {
  clips: Clip[]
  selectedId?: string
  query: string
  mode?: GenerateMode
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
  mode = 'sfx',
  error,
  loading,
  onQuery,
  onSelect,
  onStarter,
  onDelete,
}: GrimoireRailProps) {
  const filtered = clips.filter((c) => {
    const q = query.toLowerCase()
    if (!q) return true
    if (c.prompt.toLowerCase().includes(q)) return true
    if (promptName(c.prompt).toLowerCase().includes(q)) return true
    const names = c.instruments?.length ? c.instruments : extractInstruments(c.prompt)
    return names.some((name) => name.toLowerCase().includes(q))
  })
  const starters = GENERATE_MODES[mode].starters.slice(0, 3)

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col bg-leather" aria-label="Library">
      <div className="mx-auto w-full max-w-4xl p-6">
        <Hint label="Sounds saved on this machine. Open a clip to load it in Generate.">
          <h2 className="font-display text-sm tracking-[0.2em] text-muted">LIBRARY</h2>
        </Hint>
        <Hint className="mt-3 w-full" label="Filter clips by name or prompt text. Does not search the audio.">
          <Input
            className="w-full"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search sounds…"
            aria-label="Search library"
          />
        </Hint>
      </div>
      {error ? (
        <Hint className="mx-auto w-full max-w-4xl px-6" label="The library store failed. You can still generate; reload the app if clips stay missing.">
          <div className="text-sm text-danger" role="alert">
            Couldn’t open the library. {error}
          </div>
        </Hint>
      ) : null}
      {loading ? (
        <Hint className="mx-auto w-full max-w-4xl px-6" label="Loading saved clips from the local library.">
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
              <Hint className="sm:col-span-2 lg:col-span-3" label="No clips match yet. Starters fill the prompt and open Generate.">
                <p className="text-sm text-muted">The library is empty. Try a starter prompt.</p>
              </Hint>
              {starters.map((prompt) => (
                <Hint key={prompt} className="w-full" label="Put this starter into Generate. You still click Generate to create the sound.">
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
              {filtered.map((clip) => {
                const instruments =
                  clip.instruments?.length
                    ? clip.instruments
                    : clipMode(clip) === 'music'
                      ? extractInstruments(clip.prompt)
                      : []
                return (
                <li
                  key={clip.id}
                  className="rounded-book border border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] bg-leather-2/40 p-3"
                >
                  <Hint className="w-full" label="Load this clip in Generate for preview, trim, and export.">
                    <button
                      type="button"
                      onClick={() => onSelect(clip.id)}
                      className={`w-full rounded-book p-2 text-left ${
                        selectedId === clip.id ? 'bg-leather-2' : 'hover:bg-leather-2/60'
                      }`}
                    >
                      <p className="line-clamp-2 text-sm text-cream">{promptName(clip.prompt)}</p>
                      {instruments.length ? (
                        <p
                          className="mt-2 text-xs text-gold"
                          aria-label={`Instruments: ${instruments.join(', ')}`}
                        >
                          {instruments.join(', ')}
                        </p>
                      ) : null}
                      <p className="mt-2 font-mono text-[11px] text-muted">
                        <span aria-label={clipMode(clip) === 'music' ? 'Music clip' : 'Sound effect clip'}>
                          {clipMode(clip) === 'music' ? 'Music' : 'SFX'}
                        </span>
                        {' · '}
                        {clip.duration.toFixed(1)}s · {relativeTime(clip.createdAt)}
                      </p>
                    </button>
                  </Hint>
                  <Hint label="Remove this clip from the library. This cannot be undone.">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() => onDelete(clip.id)}
                    >
                      Delete
                    </Button>
                  </Hint>
                </li>
                )
              })}
            </ul>
          )}
        </div>
      </ScrollArea>
    </section>
  )
}
