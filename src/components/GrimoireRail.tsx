import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Columns2, Pause, Play, Trash2 } from 'lucide-react'
import { ClipMetaControls } from '@/components/ClipMetaControls'
import { LibraryFilterBar } from '@/components/LibraryFilterBar'
import { Hint } from '@/components/Hint'
import { GENERATE_MODES, clipMode } from '@/lib/generateMode'
import { extractBpm, extractInstruments } from '@/lib/instruments'
import { createPlayback, type PlaybackHandle } from '@/lib/playback'
import { inferClipCategory, inferClipIntensity, inferClipSubcategory } from '@/lib/promptCatalog'
import type { AudioFormat } from '@/lib/audioExport'
import { DEFAULT_PACK_TEMPLATE } from '@/lib/packNaming'
import {
  EMPTY_FILTER,
  clipDisplayName,
  filterClips,
  getMeta,
  tagCounts,
  type ClipMetaIndex,
  type LibraryFilter,
} from '@/lib/clipMeta'
import type { Clip, GenerateMode } from '@/lib/types'
import { cn, relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'

export type PackExportRequest = {
  ids: string[]
  template: string
  format: AudioFormat
  zip: boolean
  includeManifest: boolean
}

type GrimoireRailProps = {
  clips: Clip[]
  selectedId?: string
  query: string
  mode?: GenerateMode
  defaultFormat?: AudioFormat
  error?: string
  loading?: boolean
  onQuery: (value: string) => void
  onSelect: (id: string) => void
  onStarter: (prompt: string, mode?: GenerateMode) => void
  onDelete: (id: string) => void
  onModeChange?: (mode: GenerateMode) => void
  onExportPack?: (request: PackExportRequest) => void
  getWav?: (id: string) => Promise<ArrayBuffer | undefined>
  /** Favourites, ratings, tags and renames, keyed by clip id. */
  meta?: ClipMetaIndex
  filter?: LibraryFilter
  onFilter?: (filter: LibraryFilter) => void
  onToggleFavorite?: (id: string) => void
  onToggleRejected?: (id: string) => void
  onRate?: (id: string, rating: number) => void
  onRename?: (id: string) => void
  onEditTags?: (id: string) => void
  /** Opens the trash. Undefined hides the button on builds without one. */
  onOpenTrash?: () => void
  trashCount?: number
  /** Compares exactly two selected clips, level-matched. */
  onCompare?: (ids: [string, string]) => void
}

type IntensityGroup = {
  name: string
  clips: Clip[]
}

type SubcategoryGroup = {
  name: string
  clips: Clip[]
}

type CategoryGroup = {
  name: string
  clips: Clip[]
  intensityGroups?: IntensityGroup[]
  subcategoryGroups?: SubcategoryGroup[]
}

const LIBRARY_TABS: { id: GenerateMode; label: string; hint: string; search: string }[] = [
  { id: 'sfx', label: 'Sounds', hint: 'Browse sound effect clips.', search: 'Search sounds…' },
  {
    id: 'ambience',
    label: 'Ambience',
    hint: 'Browse looping background beds.',
    search: 'Search ambience…',
  },
  {
    id: 'music',
    label: 'Instrumental',
    hint: 'Browse instrumental music clips.',
    search: 'Search instrumental…',
  },
]

/** Stable empty index, so the default prop does not break memo equality. */
const NO_META: ClipMetaIndex = {}

function clipNoun(mode: GenerateMode, count: number): string {
  if (mode === 'music') return count === 1 ? 'instrumental' : 'instrumentals'
  if (mode === 'ambience') return count === 1 ? 'ambience' : 'ambiences'
  return count === 1 ? 'sound' : 'sounds'
}

export function GrimoireRail({
  clips,
  selectedId,
  query,
  mode = 'sfx',
  defaultFormat = 'wav',
  error,
  loading,
  onQuery,
  onSelect,
  onStarter,
  onDelete,
  onModeChange,
  onExportPack,
  getWav,
  meta = NO_META,
  filter = EMPTY_FILTER,
  onFilter,
  onToggleFavorite,
  onToggleRejected,
  onRate,
  onRename,
  onEditTags,
  onOpenTrash,
  trashCount = 0,
  onCompare,
}: GrimoireRailProps) {
  const [selectedMode, setSelectedMode] = useState<GenerateMode | null>(null)
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set())
  const [openSubcategories, setOpenSubcategories] = useState<Set<string>>(() => new Set())
  const [openIntensities, setOpenIntensities] = useState<Set<string>>(() => new Set())
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [fxPlayingIds, setFxPlayingIds] = useState<Set<string>>(() => new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [packOpen, setPackOpen] = useState(false)
  const [packTemplate, setPackTemplate] = useState(DEFAULT_PACK_TEMPLATE)
  const [packFormat, setPackFormat] = useState<AudioFormat>(defaultFormat)
  const [packZip, setPackZip] = useState(true)
  const [packManifest, setPackManifest] = useState(true)
  const fxPlaybacksRef = useRef<Map<string, PlaybackHandle>>(new Map())
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
  const ambienceCount = useMemo(() => clips.filter((c) => clipMode(c) === 'ambience').length, [clips])
  const musicCount = useMemo(() => clips.filter((c) => clipMode(c) === 'music').length, [clips])
  const tabCount = (id: GenerateMode) =>
    id === 'sfx' ? sfxCount : id === 'ambience' ? ambienceCount : musicCount

  const modeClips = useMemo(
    () => clips.filter((c) => clipMode(c) === activeMode),
    [clips, activeMode],
  )

  // Metadata first, then text. A reject stays hidden whatever is searched for,
  // so a search cannot quietly surface clips the filter is meant to keep out.
  const triaged = useMemo(
    () => filterClips(modeClips, meta, filter),
    [modeClips, meta, filter],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return triaged
    return triaged.filter((c) => {
      if (c.prompt.toLowerCase().includes(q)) return true
      if (clipDisplayName(c, meta).toLowerCase().includes(q)) return true
      if (c.category?.toLowerCase().includes(q)) return true
      if (c.subcategory?.toLowerCase().includes(q)) return true
      if (inferClipSubcategory(c).toLowerCase().includes(q)) return true
      if (getMeta(meta, c.id).tags?.some((tag) => tag.includes(q))) return true
      const names = c.instruments?.length ? c.instruments : extractInstruments(c.prompt)
      return names.some((name) => name.toLowerCase().includes(q))
    })
  }, [triaged, query, meta])

  const libraryTags = useMemo(() => tagCounts(meta), [meta])
  const hiddenByFilter = Math.max(0, modeClips.length - triaged.length)

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
        const subcategoryMap = new Map<string, Clip[]>()
        for (const clip of groupClips) {
          const subcat = inferClipSubcategory(clip)
          const list = subcategoryMap.get(subcat) ?? []
          list.push(clip)
          subcategoryMap.set(subcat, list)
        }
        const subcategoryGroups: SubcategoryGroup[] = []
        for (const [subName, subClips] of subcategoryMap.entries()) {
          subcategoryGroups.push({ name: subName, clips: subClips })
        }
        subcategoryGroups.sort((a, b) => {
          if (a.name === 'General') return 1
          if (b.name === 'General') return -1
          return a.name.localeCompare(b.name)
        })
        groups.push({ name, clips: groupClips, subcategoryGroups })
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

  const isSubcategoryOpen = (categoryName: string, subcategoryName: string) => {
    if (isSearching) return true
    return openSubcategories.has(`${categoryName}::${subcategoryName}`)
  }

  const toggleSubcategory = (categoryName: string, subcategoryName: string) => {
    setOpenSubcategories((prev) => {
      const key = `${categoryName}::${subcategoryName}`
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
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
      if (activeMode !== 'music' && g.subcategoryGroups) {
        return g.subcategoryGroups.every((sg) => openSubcategories.has(`${g.name}::${sg.name}`))
      }
      return true
    })

  const toggleExpandAll = () => {
    if (allExpanded) {
      setOpenCategories(new Set())
      setOpenSubcategories(new Set())
      setOpenIntensities(new Set())
    } else {
      setOpenCategories(new Set(categoryGroups.map((g) => g.name)))
      if (activeMode === 'music') {
        const allIntKeys: string[] = []
        for (const g of categoryGroups) {
          if (g.intensityGroups) {
            for (const ig of g.intensityGroups) {
              allIntKeys.push(`${g.name}::${ig.name}`)
            }
          }
        }
        setOpenIntensities(new Set(allIntKeys))
      } else {
        const allSubKeys: string[] = []
        for (const g of categoryGroups) {
          if (g.subcategoryGroups) {
            for (const sg of g.subcategoryGroups) {
              allSubKeys.push(`${g.name}::${sg.name}`)
            }
          }
        }
        setOpenSubcategories(new Set(allSubKeys))
      }
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

    for (const handle of fxPlaybacksRef.current.values()) {
      handle.stop()
      handle.dispose()
    }
    fxPlaybacksRef.current.clear()
    setFxPlayingIds(new Set())
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

  const isAnyPlaying = isPlaying || fxPlayingIds.size > 0

  const togglePlayVisible = () => {
    if (isAnyPlaying) {
      stopPlayback()
    } else {
      if (filtered.length === 0) return
      void playClipAtIndex(0, filtered)
    }
  }

  const togglePlayClip = async (clipId: string) => {
    const clip = clips.find((c) => c.id === clipId) || filtered.find((c) => c.id === clipId)
    if (!clip) return

    const isSfx = clipMode(clip) === 'sfx'

    if (isSfx) {
      if (fxPlayingIds.has(clipId)) {
        const handle = fxPlaybacksRef.current.get(clipId)
        if (handle) {
          handle.stop()
          handle.dispose()
          fxPlaybacksRef.current.delete(clipId)
        }
        setFxPlayingIds((prev) => {
          const next = new Set(prev)
          next.delete(clipId)
          return next
        })
        return
      }

      setFxPlayingIds((prev) => new Set(prev).add(clipId))

      if (!getWav) return

      try {
        const wavBuffer = await getWav(clipId)
        if (!wavBuffer) {
          setFxPlayingIds((prev) => {
            const next = new Set(prev)
            next.delete(clipId)
            return next
          })
          return
        }

        const handle = await createPlayback(wavBuffer, () => {
          const h = fxPlaybacksRef.current.get(clipId)
          if (h) {
            h.dispose()
            fxPlaybacksRef.current.delete(clipId)
          }
          setFxPlayingIds((prev) => {
            const next = new Set(prev)
            next.delete(clipId)
            return next
          })
        })

        fxPlaybacksRef.current.set(clipId, handle)
        await handle.play(0, clip.duration, false)
      } catch {
        setFxPlayingIds((prev) => {
          const next = new Set(prev)
          next.delete(clipId)
          return next
        })
      }
      return
    }

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
    const fxHandle = fxPlaybacksRef.current.get(id)
    if (fxHandle) {
      fxHandle.stop()
      fxHandle.dispose()
      fxPlaybacksRef.current.delete(id)
      setFxPlayingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
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
      for (const handle of fxPlaybacksRef.current.values()) {
        handle.dispose()
      }
      fxPlaybacksRef.current.clear()
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
    const isClipPlaying =
      clipMode(clip) === 'sfx'
        ? fxPlayingIds.has(clip.id) || (playingId === clip.id && isPlaying)
        : playingId === clip.id && isPlaying
    const isSelected = selectedId === clip.id
    const isChecked = selectedIds.has(clip.id)
    const clipMeta = getMeta(meta, clip.id)
    const displayName = clipDisplayName(clip, meta)
    return (
      <li
        key={clip.id}
        className={`group flex flex-col rounded-book border px-2.5 py-2 transition-colors ${
          clipMeta.rejected ? 'opacity-55 ' : ''
        }${
          isClipPlaying
            ? 'border-gold bg-leather-2/90 ring-1 ring-gold/40'
            : isSelected
              ? 'border-gold/50 bg-leather-2'
              : 'border-[color-mix(in_srgb,var(--color-gold)_20%,transparent)] bg-leather-2/40 hover:border-gold/40 hover:bg-leather-2/70'
        }`}
      >
        <div className="flex items-center justify-between gap-2.5">
        <Hint label={isChecked ? 'Remove this clip from the pack selection.' : 'Add this clip to the pack selection.'}>
          <Checkbox
            checked={isChecked}
            aria-label={`Select ${displayName}`}
            onCheckedChange={(value) => {
              setSelectedIds((prev) => {
                const next = new Set(prev)
                if (value === true) next.add(clip.id)
                else next.delete(clip.id)
                return next
              })
            }}
          />
        </Hint>
        <Hint
          label={
            isClipPlaying
              ? `Pause ${displayName}.`
              : `Play ${displayName}.`
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
              {displayName}
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
                {Number.isFinite(clip.seed) ? ` · seed ${clip.seed}` : null}
              </span>
            </div>
          </button>
        </Hint>

        <Hint label="Move this clip to the trash. It can be restored until the trash is emptied.">
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
        </div>
        {onToggleFavorite ? (
          <ClipMetaControls
            meta={clipMeta}
            name={displayName}
            onToggleFavorite={() => onToggleFavorite(clip.id)}
            onToggleRejected={() => onToggleRejected?.(clip.id)}
            onRate={(rating) => onRate?.(clip.id, rating)}
            onRename={() => onRename?.(clip.id)}
            onEditTags={() => onEditTags?.(clip.id)}
          />
        ) : null}
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
              {LIBRARY_TABS.map((tab) => {
                const selected = activeMode === tab.id
                return (
                  <Hint key={tab.id} label={tab.hint}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={cn(
                        'inline-flex h-7 items-center justify-center gap-1.5 rounded-[calc(var(--radius-book)-2px)] px-3 font-display text-xs tracking-[0.12em] text-muted transition-colors hover:text-cream',
                        selected &&
                          'bg-[color-mix(in_srgb,var(--color-gold)_22%,var(--color-leather))] font-medium text-cream',
                      )}
                      onClick={() => handleModeChange(tab.id)}
                    >
                      <span>{tab.label}</span>
                      <span className="font-mono text-[10px] opacity-75">({tabCount(tab.id)})</span>
                    </button>
                  </Hint>
                )
              })}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Hint className="w-full flex-1" label="Filter clips by name, category, or prompt text.">
              <Input
                className="w-full"
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder={LIBRARY_TABS.find((tab) => tab.id === activeMode)?.search}
                aria-label="Search library"
              />
            </Hint>
            <Hint
              label={
                isAnyPlaying
                  ? `Pause playing visible ${clipNoun(activeMode, 2)}.`
                  : `Play visible ${clipNoun(activeMode, 2)} in sequence.`
              }
            >
              <Button
                type="button"
                variant="outline"
                disabled={filtered.length === 0 || loading}
                onClick={togglePlayVisible}
                aria-label={isAnyPlaying ? 'Pause visible sounds' : 'Play visible sounds'}
                aria-pressed={isAnyPlaying}
                className="shrink-0 gap-2"
              >
                {isAnyPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                <span>{isAnyPlaying ? 'Pause' : 'Play'}</span>
              </Button>
            </Hint>
          </div>
          {onFilter ? (
            <LibraryFilterBar
              filter={filter}
              onFilter={onFilter}
              tags={libraryTags}
              hiddenCount={hiddenByFilter}
            />
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {onCompare ? (
              <Hint
                label={
                  selectedIds.size === 2
                    ? 'Compare the two selected clips, level-matched so the louder one does not simply win.'
                    : 'Select exactly two clips to compare them side by side.'
                }
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedIds.size !== 2}
                  onClick={() => {
                    const [first, second] = [...selectedIds]
                    if (first && second) onCompare([first, second])
                  }}
                  aria-label="Compare selected clips"
                >
                  <Columns2 className="h-3.5 w-3.5" />
                  Compare
                </Button>
              </Hint>
            ) : null}
            {onOpenTrash ? (
              <Hint label="Deleted clips are kept here so they can be restored.">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onOpenTrash}
                  aria-label="Open trash"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Trash{trashCount ? ` (${trashCount})` : ''}
                </Button>
              </Hint>
            ) : null}
          </div>
          {filtered.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Hint label="Select every clip currently visible in this tab and search.">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const ids = filtered.map((clip) => clip.id)
                    const allOn = ids.length > 0 && ids.every((id) => selectedIds.has(id))
                    setSelectedIds(allOn ? new Set() : new Set(ids))
                  }}
                  aria-label="Select visible clips"
                >
                  {filtered.every((clip) => selectedIds.has(clip.id)) ? 'Clear selection' : 'Select visible'}
                </Button>
              </Hint>
              <Hint label="Export selected clips with a naming template, as files or a ZIP sound pack.">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={selectedIds.size === 0}
                  onClick={() => {
                    // Each pack starts from the default format in Settings; a
                    // per-export choice only lives as long as the dialog.
                    setPackFormat(defaultFormat)
                    setPackOpen(true)
                  }}
                  aria-label="Export pack"
                >
                  Export pack{selectedIds.size ? ` (${selectedIds.size})` : ''}
                </Button>
              </Hint>
            </div>
          ) : null}
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
            <div className="space-y-4">
              {LIBRARY_TABS.filter((tab) => tab.id !== activeMode && tabCount(tab.id) > 0).map((tab) => (
                <div
                  key={tab.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather-2/80 p-3.5"
                >
                  <p className="text-sm text-cream">
                    No {clipNoun(activeMode, 2)} in this tab, but you have{' '}
                    <span className="font-semibold text-gold">{tabCount(tab.id)}</span>{' '}
                    {clipNoun(tab.id, tabCount(tab.id))} in {tab.label}.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleModeChange(tab.id)}
                  >
                    View {tab.label}
                  </Button>
                </div>
              ))}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Hint className="sm:col-span-2 lg:col-span-3" label="No clips match yet. Starters fill the prompt and open Generate.">
                  <p className="text-sm text-muted">The library is empty. Try a starter prompt.</p>
                </Hint>
                {starters.map((prompt) => (
                  <Hint key={prompt} className="w-full" label="Put this starter into Generate. You still click Generate to create the sound.">
                    <button
                      type="button"
                      className="h-full w-full rounded-book border border-[color-mix(in_srgb,var(--color-gold)_30%,transparent)] p-3 text-left text-sm text-cream hover:bg-leather-2"
                      onClick={() => onStarter(prompt, activeMode)}
                    >
                      {prompt}
                    </button>
                  </Hint>
                ))}
              </div>
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
                            {group.clips.length} {clipNoun(activeMode, group.clips.length)}
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
                              <Hint label={`Click to ${isIntOpen ? 'collapse' : 'expand'} level ${intGroup.name}.`}>
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
                                      {clipNoun('music', intGroup.clips.length)}
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
                    ) : group.subcategoryGroups ? (
                      <CollapsibleContent className="border-t border-[color-mix(in_srgb,var(--color-gold)_15%,transparent)] p-2 sm:p-2.5 space-y-2">
                        {group.subcategoryGroups.map((subGroup) => {
                          const isSubOpen = isSubcategoryOpen(group.name, subGroup.name)
                          return (
                            <Collapsible
                              key={subGroup.name}
                              open={isSubOpen}
                              onOpenChange={() => toggleSubcategory(group.name, subGroup.name)}
                              className="overflow-hidden rounded-book border border-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] bg-leather/50"
                            >
                              <Hint label={`Click to ${isSubOpen ? 'collapse' : 'expand'} ${subGroup.name}.`}>
                                <CollapsibleTrigger asChild>
                                  <button
                                    type="button"
                                    aria-expanded={isSubOpen}
                                    className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-leather-2/60 focus-visible:ring-1 focus-visible:ring-gold focus-visible:outline-none"
                                  >
                                    <div className="flex items-center gap-2">
                                      <ChevronRight
                                        className={cn(
                                          'h-3.5 w-3.5 text-gold/80 transition-transform duration-200',
                                          isSubOpen && 'rotate-90',
                                        )}
                                      />
                                      <span className="font-display text-xs tracking-wider text-cream/90">
                                        {subGroup.name}
                                      </span>
                                    </div>
                                    <span className="font-mono text-[11px] text-muted">
                                      {subGroup.clips.length} {subGroup.clips.length === 1 ? 'sound' : 'sounds'}
                                    </span>
                                  </button>
                                </CollapsibleTrigger>
                              </Hint>
                              <CollapsibleContent className="border-t border-[color-mix(in_srgb,var(--color-gold)_12%,transparent)] p-2 sm:p-2.5">
                                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {subGroup.clips.map((clip) => renderClipCard(clip))}
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
      <Dialog open={packOpen} onOpenChange={setPackOpen}>
        <DialogContent aria-describedby="pack-export-desc">
          <DialogTitle>Export pack</DialogTitle>
          <DialogDescription id="pack-export-desc">
            Rename selected clips with a template and save them as files or a ZIP with an optional manifest.
          </DialogDescription>
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="pack-template">Naming template</Label>
              <Input
                id="pack-template"
                className="mt-1 font-mono"
                value={packTemplate}
                onChange={(e) => setPackTemplate(e.target.value)}
                aria-label="Naming template"
              />
              <p className="mt-1 text-xs text-muted">
                Tokens: {'{type}'} {'{category}'} {'{name}'} {'{index}'} — e.g. SFX_Combat_Sword_01.wav
              </p>
            </div>
            <div>
              <Label htmlFor="pack-format">Format</Label>
              <select
                id="pack-format"
                className="mt-1 h-9 w-full rounded-book border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-leather-2 px-2 font-mono text-xs text-cream"
                value={packFormat}
                onChange={(e) => setPackFormat(e.target.value as AudioFormat)}
                aria-label="Pack format"
              >
                <option value="wav">WAV</option>
                <option value="flac">FLAC</option>
                <option value="ogg">OGG Vorbis</option>
                <option value="mp3">MP3 320</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-cream">
              <Checkbox checked={packZip} onCheckedChange={(value) => setPackZip(value === true)} aria-label="Zip archive" />
              Zip archive
            </label>
            <label className="flex items-center gap-2 text-sm text-cream">
              <Checkbox
                checked={packManifest}
                onCheckedChange={(value) => setPackManifest(value === true)}
                aria-label="Include manifest"
              />
              Include manifest.json
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setPackOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onExportPack?.({
                    ids: [...selectedIds],
                    template: packTemplate,
                    format: packFormat,
                    zip: packZip,
                    includeManifest: packManifest,
                  })
                  setPackOpen(false)
                }}
              >
                Export
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
