import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Pause, Play, Trash2 } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { promptName } from '@/lib/filename'
import { GENERATE_MODES, clipMode } from '@/lib/generateMode'
import { extractBpm, extractInstruments } from '@/lib/instruments'
import { createPlayback, type PlaybackHandle } from '@/lib/playback'
import { inferClipCategory, inferClipIntensity } from '@/lib/promptCatalog'
import type { Clip, GenerateMode } from '@/lib/types'
import { cn, relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  onModeChange?: (mode: GenerateMode) => void
  getWav?: (id: string) => Promise<ArrayBuffer | undefined>
}

type IntensityGroup = {
  name: string
  clips: Clip[]
}

type CategoryGroup = {
  name: string
  clips: Clip[]
  intensityGroups?: IntensityGroup[]
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
  onModeChange,
  getWav,
}: GrimoireRailProps) {
  const [selectedMode, setSelectedMode] = useState<GenerateMode | null>(null)
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set())
  const [openIntensities, setOpenIntensities] = useState<Set<string>>(() => new Set())
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const playbackRef = useRef<PlaybackHandle | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const isPlayingRef = useRef(false)
  const playRunIdRef = useRef(0)

  const activeMode = selectedMode ?? mode

  const handleModeChange = (next: GenerateMode) => {
    setSelectedMode(next)
    onModeChange?.(next)
  }

  const sfxCount = useMemo(() => clips.filter((c) => clipMode(c) === 'sfx').length, [clips])
  const musicCount = useMemo(() => clips.filter((c) => clipMode(c) === 'music').length, [clips])

  const modeClips = useMemo(
    () => clips.filter((c) => clipMode(c) === activeMode),
    [clips, activeMode],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return modeClips
    return modeClips.filter((c) => {
      if (c.prompt.toLowerCase().includes(q)) return true
      if (promptName(c.prompt).toLowerCase().includes(q)) return true
      if (c.category?.toLowerCase().includes(q)) return true
      const names = c.instruments?.length ? c.instruments : extractInstruments(c.prompt)
      return names.some((name) => name.toLowerCase().includes(q))
    })
  }, [modeClips, query])

  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, Clip[]>()
    for (const clip of filtered) {
      const cat = inferClipCategory(clip)
      const list = map.get(cat) ?? []
      list.push(clip)
      map.set(cat, list)
    }
    const groups: CategoryGroup[] = []
    for (const [name, groupClips] of map.entries()) {
      if (activeMode === 'music') {
        const intensityMap = new Map<string, Clip[]>()
        for (const clip of groupClips) {
          const intensity = inferClipIntensity(clip)
          const list = intensityMap.get(intensity) ?? []
          list.push(clip)
          intensityMap.set(intensity, list)
        }
        const intensityGroups: IntensityGroup[] = []
        for (const [intName, intClips] of intensityMap.entries()) {
          intensityGroups.push({ name: intName, clips: intClips })
        }
        intensityGroups.sort((a, b) => a.name.localeCompare(b.name))
        groups.push({ name, clips: groupClips, intensityGroups })
      } else {
        groups.push({ name, clips: groupClips })
      }
    }
    groups.sort((a, b) => {
      if (a.name === 'Custom') return 1
      if (b.name === 'Custom') return -1
      return a.name.localeCompare(b.name)
    })
    return groups
  }, [filtered, activeMode])

  const isSearching = query.trim().length > 0

  const isCategoryOpen = (categoryName: string) => {
    if (isSearching) return true
    return openCategories.has(categoryName)
  }

  const toggleCategory = (categoryName: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryName)) {
        next.delete(categoryName)
      } else {
        next.add(categoryName)
      }
      return next
    })
  }

  const isIntensityOpen = (categoryName: string, intensityName: string) => {
    if (isSearching) return true
    return openIntensities.has(`${categoryName}::${intensityName}`)
  }

  const toggleIntensity = (categoryName: string, intensityName: string) => {
    setOpenIntensities((prev) => {
      const key = `${categoryName}::${intensityName}`
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const allExpanded =
    categoryGroups.length > 0 &&
    categoryGroups.every((g) => {
      if (!openCategories.has(g.name)) return false
      if (activeMode === 'music' && g.intensityGroups) {
        return g.intensityGroups.every((ig) => openIntensities.has(`${g.name}::${ig.name}`))
      }
      return true
    })

  const toggleExpandAll = () => {
    if (allExpanded) {
      setOpenCategories(new Set())
      setOpenIntensities(new Set())
    } else {
      setOpenCategories(new Set(categoryGroups.map((g) => g.name)))
      const allIntKeys: string[] = []
      for (const g of categoryGroups) {
        if (g.intensityGroups) {
          for (const ig of g.intensityGroups) {
            allIntKeys.push(`${g.name}::${ig.name}`)
          }
        }
      }
      setOpenIntensities(new Set(allIntKeys))
    }
  }

  const starters = GENERATE_MODES[activeMode].starters.slice(0, 3)

  const filteredRef = useRef(filtered)
  useEffect(() => {
    filteredRef.current = filtered
  }, [filtered])

  const stopPlayback = () => {
    playRunIdRef.current += 1
    playbackRef.current?.stop()
    playbackRef.current?.dispose()
    playbackRef.current = null
    setPlayingId(null)
    setIsPlaying(false)
    activeIdRef.current = null
    isPlayingRef.current = false
  }

  const playClipAtIndex = async (index: number, list: Clip[]) => {
    if (index < 0 || index >= list.length) {
      stopPlayback()
      return
    }

    const clip = list[index]
    if (!clip) {
      stopPlayback()
      return
    }

    const runId = ++playRunIdRef.current
    playbackRef.current?.stop()
    playbackRef.current?.dispose()
    playbackRef.current = null

    setPlayingId(clip.id)
    setIsPlaying(true)
    activeIdRef.current = clip.id
    isPlayingRef.current = true

    if (!getWav) {
      return
    }

    const wavBuffer = await getWav(clip.id)
    if (playRunIdRef.current !== runId || !isPlayingRef.current || activeIdRef.current !== clip.id) {
      return
    }

    if (!wavBuffer) {
      const currentList = filteredRef.current
      const currentIdx = currentList.findIndex((c) => c.id === clip.id)
      const nextIdx = currentIdx !== -1 ? currentIdx + 1 : index + 1
      void playClipAtIndex(nextIdx, currentList)
      return
    }

    try {
      const handle = await createPlayback(wavBuffer, () => {
        if (playRunIdRef.current === runId && isPlayingRef.current && activeIdRef.current === clip.id) {
          const currentList = filteredRef.current
          const currentIdx = currentList.findIndex((c) => c.id === clip.id)
          const nextIdx = currentIdx !== -1 ? currentIdx + 1 : index + 1
          void playClipAtIndex(nextIdx, currentList)
        }
      })

      if (playRunIdRef.current !== runId || !isPlayingRef.current || activeIdRef.current !== clip.id) {
        handle.dispose()
        return
      }

      playbackRef.current = handle
      await handle.play(0, clip.duration, false)
    } catch {
      if (playRunIdRef.current === runId && isPlayingRef.current && activeIdRef.current === clip.id) {
        const currentList = filteredRef.current
        const currentIdx = currentList.findIndex((c) => c.id === clip.id)
        const nextIdx = currentIdx !== -1 ? currentIdx + 1 : index + 1
        void playClipAtIndex(nextIdx, currentList)
      }
    }
  }

  const togglePlayVisible = () => {
    if (isPlaying) {
      stopPlayback()
    } else {
      if (filtered.length === 0) return
      void playClipAtIndex(0, filtered)
    }
  }

  const togglePlayClip = (clipId: string) => {
    if (isPlaying && playingId === clipId) {
      stopPlayback()
    } else {
      const idx = filtered.findIndex((c) => c.id === clipId)
      if (idx !== -1) {
        void playClipAtIndex(idx, filtered)
      } else {
        const singleClip = clips.find((c) => c.id === clipId)
        if (singleClip) {
          void playClipAtIndex(0, [singleClip])
        }
      }
    }
  }

  const handleDelete = (id: string) => {
    if (playingId === id) {
      stopPlayback()
    }
    onDelete(id)
  }

  useEffect(() => {
    return () => {
      playRunIdRef.current += 1
      playbackRef.current?.dispose()
      playbackRef.current = null
      activeIdRef.current = null
      isPlayingRef.current = false
    }
  }, [])

  const renderClipCard = (clip: Clip) => {
    const allInstruments =
      clip.instruments?.length
        ? clip.instruments
        : clipMode(clip) === 'music'
          ? extractInstruments(clip.prompt)
          : []
    const topInstruments = allInstruments.slice(0, 3)
    const bpm = extractBpm(clip.prompt)
    const isClipPlaying = playingId === clip.id && isPlaying
    const isSelected = selectedId === clip.id
    return (
      <li
        key={clip.id}
        className={`group flex items-center justify-between gap-2.5 rounded-book border px-2.5 py-2 transition-colors ${
          isClipPlaying
            ? 'border-gold bg-leather-2/90 ring-1 ring-gold/40'
            : isSelected
              ? 'border-gold/50 bg-leather-2'
              : 'border-[color-mix(in_srgb,var(--color-gold)_20%,transparent)] bg-leather-2/40 hover:border-gold/40 hover:bg-leather-2/70'
        }`}
      >
        <Hint
          label={
            isClipPlaying
              ? `Pause ${promptName(clip.prompt)}.`
              : `Play ${promptName(clip.prompt)}.`
          }
        >
          <Button
            type="button"
            variant={isClipPlaying ? 'default' : 'ghost'}
            size="sm"
            className="h-7 w-7 shrink-0 rounded-full p-0 text-cream"
            onClick={() => togglePlayClip(clip.id)}
            aria-label={isClipPlaying ? 'Pause sound' : 'Play sound'}
            aria-pressed={isClipPlaying}
          >
            {isClipPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 translate-x-0.5" />
            )}
          </Button>
        </Hint>

        <Hint className="min-w-0 flex-1" label="Load this clip in Generate for preview, trim, and export.">
          <button
            type="button"
            onClick={() => onSelect(clip.id)}
            className="w-full min-w-0 text-left focus-visible:outline-none"
          >
            <p className="truncate text-xs font-medium text-cream group-hover:text-gold sm:text-sm">
              {promptName(clip.prompt)}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight">
              {topInstruments.length ? (
                <span
                  className="truncate text-gold"
                  aria-label={`Instruments: ${topInstruments.join(', ')}`}
                >
                  {topInstruments.join(', ')}
                </span>
              ) : null}
              {topInstruments.length ? <span className="text-muted/40">·</span> : null}
              <span className="shrink-0 font-mono text-muted">
                {bpm ? `${bpm} BPM · ` : null}
                {relativeTime(clip.createdAt)}
              </span>
            </div>
          </button>
        </Hint>

        <Hint label="Remove this clip from the library. This cannot be undone.">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-1.5 text-xs text-danger hover:bg-danger/10 hover:text-danger"
            onClick={() => handleDelete(clip.id)}
            aria-label="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Delete</span>
          </Button>
        </Hint>
      </li>
    )
  }

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col bg-leather" aria-label="Library">
      <ScrollArea className="h-full">
        <div className="mx-auto w-full max-w-4xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Hint label="Sounds saved on this machine. Open a clip to load it in Generate.">
              <h2 className="font-display text-sm tracking-[0.2em] text-muted">LIBRARY</h2>
            </Hint>
            <div
              role="radiogroup"
              aria-label="Library browsing mode"
              className="inline-flex h-8 items-center rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather-2 p-0.5"
            >
              <Hint label="Browse sound effect clips.">
                <button
                  type="button"
                  role="radio"
                  aria-checked={activeMode === 'sfx'}
                  className={cn(
                    'inline-flex h-7 items-center justify-center gap-1.5 rounded-[calc(var(--radius-book)-2px)] px-3 font-display text-xs tracking-[0.12em] text-muted transition-colors hover:text-cream',
                    activeMode === 'sfx' &&
                      'bg-[color-mix(in_srgb,var(--color-gold)_22%,var(--color-leather))] font-medium text-cream',
                  )}
                  onClick={() => handleModeChange('sfx')}
                >
                  <span>Sounds</span>
                  <span className="font-mono text-[10px] opacity-75">({sfxCount})</span>
                </button>
              </Hint>
              <Hint label="Browse ambient music clips.">
                <button
                  type="button"
                  role="radio"
                  aria-checked={activeMode === 'music'}
                  className={cn(
                    'inline-flex h-7 items-center justify-center gap-1.5 rounded-[calc(var(--radius-book)-2px)] px-3 font-display text-xs tracking-[0.12em] text-muted transition-colors hover:text-cream',
                    activeMode === 'music' &&
                      'bg-[color-mix(in_srgb,var(--color-gold)_22%,var(--color-leather))] font-medium text-cream',
                  )}
                  onClick={() => handleModeChange('music')}
                >
                  <span>Ambiences</span>
                  <span className="font-mono text-[10px] opacity-75">({musicCount})</span>
                </button>
              </Hint>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Hint className="w-full flex-1" label="Filter clips by name, category, or prompt text.">
              <Input
                className="w-full"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder={activeMode === 'music' ? 'Search ambiences…' : 'Search sounds…'}
                aria-label="Search library"
              />
            </Hint>
            <Hint
              label={
                isPlaying
                  ? `Pause playing visible ${activeMode === 'music' ? 'ambiences' : 'sounds'}.`
                  : `Play visible ${activeMode === 'music' ? 'ambiences' : 'sounds'} in sequence.`
              }
            >
              <Button
                type="button"
                variant="outline"
                disabled={filtered.length === 0 || loading}
                onClick={togglePlayVisible}
                aria-label={isPlaying ? 'Pause visible sounds' : 'Play visible sounds'}
                aria-pressed={isPlaying}
                className="shrink-0 gap-2"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </Button>
            </Hint>
          </div>
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
        <div className="mx-auto w-full max-w-4xl px-6 pb-8">
          {modeClips.length === 0 && !loading ? (
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
          ) : filtered.length === 0 && !loading ? (
            <p className="py-6 text-sm text-muted">No clips match that search.</p>
          ) : (
            <div className="space-y-4">
              {categoryGroups.length > 1 && !isSearching ? (
                <div className="flex items-center justify-end">
                  <Hint label={allExpanded ? 'Collapse all categories' : 'Expand all categories'}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={toggleExpandAll}
                      className="gap-1.5 text-xs text-muted hover:text-cream"
                    >
                      {allExpanded ? (
                        <>
                          <ChevronsDownUp className="h-3.5 w-3.5" />
                          <span>Collapse all</span>
                        </>
                      ) : (
                        <>
                          <ChevronsUpDown className="h-3.5 w-3.5" />
                          <span>Expand all</span>
                        </>
                      )}
                    </Button>
                  </Hint>
                </div>
              ) : null}
              {categoryGroups.map((group) => {
                const open = isCategoryOpen(group.name)
                return (
                  <Collapsible
                    key={group.name}
                    open={open}
                    onOpenChange={() => toggleCategory(group.name)}
                    className="overflow-hidden rounded-book border border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] bg-leather-2/30"
                  >
                    <Hint label={`Click to ${open ? 'collapse' : 'expand'} ${group.name} category.`}>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          aria-expanded={open}
                          className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-leather-2/60 focus-visible:ring-1 focus-visible:ring-gold focus-visible:outline-none"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              className={cn(
                                'h-4 w-4 text-gold transition-transform duration-200',
                                open && 'rotate-90',
                              )}
                            />
                            <span className="font-display text-sm tracking-wide text-cream">
                              {group.name}
                            </span>
                          </div>
                          <span className="font-mono text-xs text-muted">
                            {group.clips.length} {group.clips.length === 1 ? (activeMode === 'music' ? 'ambience' : 'sound') : (activeMode === 'music' ? 'ambiences' : 'sounds')}
                          </span>
                        </button>
                      </CollapsibleTrigger>
                    </Hint>
                    {activeMode === 'music' && group.intensityGroups ? (
                      <CollapsibleContent className="border-t border-[color-mix(in_srgb,var(--color-gold)_15%,transparent)] p-2 sm:p-2.5 space-y-2">
                        {group.intensityGroups.map((intGroup) => {
                          const isIntOpen = isIntensityOpen(group.name, intGroup.name)
                          return (
                            <Collapsible
                              key={intGroup.name}
                              open={isIntOpen}
                              onOpenChange={() => toggleIntensity(group.name, intGroup.name)}
                              className="overflow-hidden rounded-book border border-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] bg-leather/50"
                            >
                              <Hint label={`Click to ${isIntOpen ? 'collapse' : 'expand'} ${intGroup.name}.`}>
                                <CollapsibleTrigger asChild>
                                  <button
                                    type="button"
                                    aria-expanded={isIntOpen}
                                    className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-leather-2/60 focus-visible:ring-1 focus-visible:ring-gold focus-visible:outline-none"
                                  >
                                    <div className="flex items-center gap-2">
                                      <ChevronRight
                                        className={cn(
                                          'h-3.5 w-3.5 text-gold/80 transition-transform duration-200',
                                          isIntOpen && 'rotate-90',
                                        )}
                                      />
                                      <span className="font-display text-xs tracking-wider text-cream/90">
                                        {intGroup.name}
                                      </span>
                                    </div>
                                    <span className="font-mono text-[11px] text-muted">
                                      {intGroup.clips.length} {intGroup.clips.length === 1 ? 'ambience' : 'ambiences'}
                                    </span>
                                  </button>
                                </CollapsibleTrigger>
                              </Hint>
                              <CollapsibleContent className="border-t border-[color-mix(in_srgb,var(--color-gold)_12%,transparent)] p-2 sm:p-2.5">
                                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {intGroup.clips.map((clip) => renderClipCard(clip))}
                                </ul>
                              </CollapsibleContent>
                            </Collapsible>
                          )
                        })}
                      </CollapsibleContent>
                    ) : (
                      <CollapsibleContent className="border-t border-[color-mix(in_srgb,var(--color-gold)_15%,transparent)] p-2 sm:p-2.5">
                        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {group.clips.map((clip) => renderClipCard(clip))}
                        </ul>
                      </CollapsibleContent>
                    )}
                  </Collapsible>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </section>
  )
}
