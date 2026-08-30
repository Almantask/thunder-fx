import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CatalogEffect, PromptCategory, PromptLibrary } from '@/lib/promptCatalog'
import {
  MAX_QUEUE_TAKES,
  MIN_QUEUE_TAKES,
  PROMPT_LIBRARIES,
  clampQueueTakes,
  expandTakes,
  inferEffectIntensity,
  inferSubcategoryFromCategoryAndPrompt,
} from '@/lib/promptCatalog'
import { cn } from '@/lib/utils'

const INTENSITY_ORDER = [
  'Level I — Quiet looping bed',
  'Level II — Mood in motion',
  'Level III — Full intensity',
]

type PromptCatalogDialogProps = {
  open: boolean
  catalog: PromptCategory[]
  onOpenChange: (open: boolean) => void
  onEnqueue: (effects: CatalogEffect[]) => void
  onUse: (effect: CatalogEffect) => void
}

export function PromptCatalogDialog({
  open,
  catalog,
  onOpenChange,
  onEnqueue,
  onUse,
}: PromptCatalogDialogProps) {
  const [library, setLibrary] = useState<PromptLibrary>(
    () => (catalog.some((c) => c.library === 'fx') ? 'fx' : (catalog[0]?.library ?? 'fx')),
  )
  const [categoryId, setCategoryId] = useState(
    () => catalog.find((c) => c.library === (catalog.some((x) => x.library === 'fx') ? 'fx' : catalog[0]?.library))?.id ?? catalog[0]?.id ?? '',
  )
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)
  const [selectedInstruments, setSelectedInstruments] = useState<Set<string>>(new Set())
  const [instrumentMatchMode, setInstrumentMatchMode] = useState<'any' | 'all'>('any')
  const [collapsedSubcategories, setCollapsedSubcategories] = useState<Set<string>>(new Set())
  const [openIntensities, setOpenIntensities] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewId, setPreviewId] = useState<string | null>(null)
  // Kept as free text while typing (so clearing the field doesn't snap back
  // to 1 mid-edit); clamped to a usable take count wherever it is read.
  const [takeCountInput, setTakeCountInput] = useState('1')
  const takeCount = clampQueueTakes(Number(takeCountInput))

  const libraryCategories = catalog.filter((c) => c.library === library)
  const category = libraryCategories.find((c) => c.id === categoryId) ?? libraryCategories[0]

  const isSearching = query.trim().length > 0

  const availableInstruments = useMemo(() => {
    if (library !== 'music') return []
    const effects = isSearching
      ? libraryCategories.flatMap((c) => c.effects)
      : category?.effects ?? []
    const counts = new Map<string, number>()
    for (const effect of effects) {
      for (const inst of effect.instruments ?? []) {
        counts.set(inst, (counts.get(inst) ?? 0) + 1)
      }
    }
    const list: { name: string; count: number }[] = []
    for (const [name, count] of counts.entries()) {
      list.push({ name, count })
    }
    list.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.name.localeCompare(b.name)
    })
    return list
  }, [category, library, isSearching, libraryCategories])

  const subcategories = useMemo(() => {
    if (library === 'music') return []
    const effects = isSearching
      ? libraryCategories.flatMap((c) => c.effects)
      : category?.effects ?? []
    const counts = new Map<string, number>()
    for (const effect of effects) {
      const sub =
        effect.subcategory ||
        inferSubcategoryFromCategoryAndPrompt(effect.category || category?.name || '', effect.prompt)
      counts.set(sub, (counts.get(sub) ?? 0) + 1)
    }
    const list: { name: string; count: number }[] = []
    for (const [name, count] of counts.entries()) {
      list.push({ name, count })
    }
    list.sort((a, b) => {
      if (a.name === 'General') return 1
      if (b.name === 'General') return -1
      return a.name.localeCompare(b.name)
    })
    return list
  }, [category, library, isSearching, libraryCategories])

  const visible = useMemo(() => {
    const rawEffects = isSearching
      ? libraryCategories.flatMap((c) => c.effects)
      : category?.effects ?? []
    let effects = rawEffects
    if (selectedSubcategory && !isSearching) {
      effects = effects.filter((e) => {
        const sub =
          e.subcategory ||
          inferSubcategoryFromCategoryAndPrompt(e.category || category?.name || '', e.prompt)
        return sub === selectedSubcategory
      })
    }
    if (library === 'music' && selectedInstruments.size > 0) {
      effects = effects.filter((e) => {
        if (!e.instruments || e.instruments.length === 0) return false
        if (instrumentMatchMode === 'all') {
          return Array.from(selectedInstruments).every((inst) => e.instruments!.includes(inst))
        }
        return e.instruments.some((inst) => selectedInstruments.has(inst))
      })
    }
    const q = query.trim().toLowerCase()
    if (!q) return effects
    return effects.filter((effect) => {
      if (effect.title.toLowerCase().includes(q)) return true
      if (effect.prompt.toLowerCase().includes(q)) return true
      if (effect.category && effect.category.toLowerCase().includes(q)) return true
      if (
        effect.instruments &&
        effect.instruments.some((inst) => inst.toLowerCase().includes(q))
      ) {
        return true
      }
      const sub =
        effect.subcategory ||
        inferSubcategoryFromCategoryAndPrompt(effect.category || category?.name || '', effect.prompt)
      if (sub.toLowerCase().includes(q)) return true
      return false
    })
  }, [
    category,
    query,
    selectedSubcategory,
    selectedInstruments,
    instrumentMatchMode,
    library,
    isSearching,
    libraryCategories,
  ])

  const groupedVisible = useMemo(() => {
    if (isSearching) {
      const map = new Map<string, CatalogEffect[]>()
      for (const effect of visible) {
        const catName = effect.category || 'General'
        const list = map.get(catName) ?? []
        list.push(effect)
        map.set(catName, list)
      }
      const groups: { name: string; effects: CatalogEffect[] }[] = []
      for (const [name, catEffects] of map.entries()) {
        groups.push({ name, effects: catEffects })
      }
      groups.sort((a, b) => a.name.localeCompare(b.name))
      return groups
    }

    if (library !== 'music') {
      if (selectedSubcategory) {
        return [{ name: '', effects: visible }]
      }
      const map = new Map<string, CatalogEffect[]>()
      for (const effect of visible) {
        const sub =
          effect.subcategory ||
          inferSubcategoryFromCategoryAndPrompt(category?.name ?? '', effect.prompt)
        const list = map.get(sub) ?? []
        list.push(effect)
        map.set(sub, list)
      }
      const groups: { name: string; effects: CatalogEffect[] }[] = []
      for (const [name, subEffects] of map.entries()) {
        groups.push({ name, effects: subEffects })
      }
      groups.sort((a, b) => {
        if (a.name === 'General') return 1
        if (b.name === 'General') return -1
        return a.name.localeCompare(b.name)
      })
      return groups
    }

    if (library === 'music') {
      const map = new Map<string, CatalogEffect[]>()
      for (const effect of visible) {
        const intensity = inferEffectIntensity(effect)
        const list = map.get(intensity) ?? []
        list.push(effect)
        map.set(intensity, list)
      }
      const groups: { name: string; effects: CatalogEffect[] }[] = []
      for (const [name, intensityEffects] of map.entries()) {
        groups.push({ name, effects: intensityEffects })
      }
      groups.sort((a, b) => {
        const idxA = INTENSITY_ORDER.indexOf(a.name)
        const idxB = INTENSITY_ORDER.indexOf(b.name)
        if (idxA !== -1 && idxB !== -1) return idxA - idxB
        if (idxA !== -1) return -1
        if (idxB !== -1) return 1
        return a.name.localeCompare(b.name)
      })
      return groups
    }

    return [{ name: '', effects: visible }]
  }, [visible, library, selectedSubcategory, category, isSearching])

  const isSubcategoryOpen = (subName: string) => {
    if (query.trim().length > 0 || selectedSubcategory) return true
    return !collapsedSubcategories.has(`${category?.id}::${subName}`)
  }

  const toggleSubcategory = (subName: string) => {
    setCollapsedSubcategories((prev) => {
      const key = `${category?.id}::${subName}`
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const isIntensityOpen = (intensityName: string) => {
    if (query.trim().length > 0) return true
    return openIntensities.has(`${category?.id}::${intensityName}`)
  }

  const toggleIntensity = (intensityName: string) => {
    setOpenIntensities((prev) => {
      const key = `${category?.id}::${intensityName}`
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const toggleInstrument = (instName: string) => {
    setSelectedInstruments((prev) => {
      const next = new Set(prev)
      if (next.has(instName)) {
        next.delete(instName)
      } else {
        next.add(instName)
      }
      return next
    })
  }

  const clearInstruments = () => {
    setSelectedInstruments(new Set())
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function selectCategory(id: string) {
    setCategoryId(id)
    setSelectedSubcategory(null)
    setSelectedInstruments(new Set())
    setCollapsedSubcategories(new Set())
    setOpenIntensities(new Set())
    setSelected(new Set())
    setQuery('')
    setPreviewId(null)
  }

  function selectLibrary(next: PromptLibrary) {
    if (next === library) return
    setLibrary(next)
    setCategoryId(catalog.find((c) => c.library === next)?.id ?? '')
    setSelectedSubcategory(null)
    setSelectedInstruments(new Set())
    setCollapsedSubcategories(new Set())
    setOpenIntensities(new Set())
    setSelected(new Set())
    setQuery('')
    setPreviewId(null)
  }

  function addSelected() {
    const items = visible.filter((effect) => selected.has(effect.id))
    if (items.length === 0) return
    onEnqueue(expandTakes(items, takeCount))
    setSelected(new Set())
  }

  function addCategory() {
    if (visible.length === 0) return
    onEnqueue(expandTakes(visible, takeCount))
    setSelected(new Set())
  }

  const renderEffectItem = (effect: CatalogEffect) => {
    const checked = selected.has(effect.id)
    const previewing = previewId === effect.id
    const hasInstruments = Boolean(effect.instruments && effect.instruments.length > 0)
    return (
      <li
        key={effect.id}
        className="rounded-book px-1 py-1 hover:bg-leather-2"
      >
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-sm text-cream">
            <Checkbox
              className="mt-0.5 shrink-0"
              checked={checked}
              onCheckedChange={(value) => toggle(effect.id, value === true)}
              aria-label={effect.title}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{effect.title}</span>
                {isSearching && effect.category ? (
                  <span className="shrink-0 rounded bg-leather-2 px-1.5 py-0.5 text-[10px] text-muted">
                    {effect.category}
                  </span>
                ) : null}
                {effect.subcategory && !selectedSubcategory ? (
                  <span className="shrink-0 rounded bg-leather-2 px-1.5 py-0.5 text-[10px] text-gold/80">
                    {effect.subcategory}
                  </span>
                ) : null}
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {effect.duration}s
                </span>
              </div>
              {hasInstruments ? (
                <div
                  className="mt-1 flex flex-wrap items-center gap-1"
                  aria-label={`Instruments: ${effect.instruments!.join(', ')}`}
                >
                  {effect.instruments!.map((inst) => (
                    <span
                      key={inst}
                      className="shrink-0 rounded border border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] bg-leather-2/80 px-1.5 py-0.5 text-[10px] font-mono text-gold/90"
                    >
                      {inst}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </label>
          <div className="flex shrink-0 items-center gap-1 self-start pt-0.5">
            <Hint label="Show the full prompt text. Does not fill Generate.">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Preview ${effect.title}`}
                aria-expanded={previewing}
                onClick={() => setPreviewId(previewing ? null : effect.id)}
              >
                Preview
              </Button>
            </Hint>
            <Hint label="Put this prompt, duration, and negative into Generate. You still click Generate.">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Use ${effect.title}`}
                onClick={() => onUse(effect)}
              >
                Use
              </Button>
            </Hint>
          </div>
        </div>
        {previewing ? (
          <div className="mt-1 space-y-1 px-7 pb-1">
            <p className="text-xs leading-relaxed text-muted whitespace-pre-wrap break-words">
              {effect.prompt}
            </p>
            {hasInstruments ? (
              <p className="text-[11px] text-gold/90">
                <span className="font-semibold text-cream/75">Instruments: </span>
                {effect.instruments!.join(', ')}
              </p>
            ) : null}
            {effect.negative ? (
              <p className="text-[11px] text-muted break-words">Negative: {effect.negative}</p>
            ) : null}
          </div>
        ) : null}
      </li>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(85vh,44rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-3 overflow-hidden">
        <DialogTitle className="shrink-0">Browse prompts</DialogTitle>
        <Hint
          className="shrink-0"
          label="Shipped starting prompts from the prompts folder. Add several to the queue, or use one in Generate now."
        >
          <DialogDescription>
            Load shipped sound-effect, ambience, or instrumental prompts, then generate them as a queue.
          </DialogDescription>
        </Hint>
        <div
          role="radiogroup"
          aria-label="Prompt library"
          className="inline-flex h-8 w-fit shrink-0 items-center rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather-2 p-0.5"
        >
          {PROMPT_LIBRARIES.map((lib) => {
            const selectedLib = lib.id === library
            return (
              <Hint
                key={lib.id}
                asChild
                side="bottom"
                label={
                  lib.id === 'fx'
                    ? 'Game one-shots with TrackType: SFX.'
                    : lib.id === 'ambience'
                      ? 'Looping background beds with TrackType: SFX. Avoids music.'
                      : 'Instrumental D&D beds with TrackType: Music.'
                }
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedLib}
                  className={cn(
                    'inline-flex h-7 items-center justify-center rounded-[calc(var(--radius-book)-2px)] px-3 font-display text-xs tracking-[0.12em] text-muted transition-colors hover:text-cream',
                    selectedLib &&
                      'bg-[color-mix(in_srgb,var(--color-gold)_22%,var(--color-leather))] text-cream',
                  )}
                  onClick={() => selectLibrary(lib.id)}
                >
                  {lib.label}
                </button>
              </Hint>
            )
          })}
        </div>
        <Hint
          className="w-full shrink-0"
          label="Search all prompts in the selected library by title, prompt text, category, or subcategory."
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all prompts…"
            aria-label="Search prompts"
          />
        </Hint>
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden md:grid-cols-[11rem_minmax(0,1fr)]">
          <ScrollArea className="h-44 rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] md:h-full">
            <div role="listbox" aria-label="Prompt categories" className="p-1">
              {libraryCategories.map((item) => {
                const active = item.id === category?.id
                return (
                  <Hint
                    key={item.id}
                    asChild
                    label={`Open the ${item.name} prompts. ${item.effects.length} generate-ready effects.`}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={cn(
                        'flex w-full items-center justify-between rounded-[calc(var(--radius-book)-2px)] px-2 py-1.5 text-left text-sm text-muted hover:bg-leather-2 hover:text-cream',
                        active && 'bg-[color-mix(in_srgb,var(--color-gold)_18%,var(--color-leather))] text-cream',
                      )}
                      onClick={() => selectCategory(item.id)}
                    >
                      <span className="truncate">{item.name}</span>
                      <span className="ml-1 shrink-0 font-mono text-[11px]">{item.effects.length}</span>
                    </button>
                  </Hint>
                )
              })}
            </div>
          </ScrollArea>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden">
            {!isSearching && library !== 'music' && subcategories.length > 1 ? (
              <div
                role="radiogroup"
                aria-label="Filter by subcategory"
                className="flex shrink-0 flex-wrap items-center gap-1 px-0.5"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedSubcategory === null}
                  className={cn(
                    'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors',
                    selectedSubcategory === null
                      ? 'border-gold bg-[color-mix(in_srgb,var(--color-gold)_20%,transparent)] font-medium text-cream'
                      : 'border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] text-muted hover:border-gold/50 hover:text-cream',
                  )}
                  onClick={() => setSelectedSubcategory(null)}
                >
                  <span>All</span>
                  <span className="font-mono text-[10px] opacity-75">
                    ({category?.effects.length ?? 0})
                  </span>
                </button>
                {subcategories.map((sub) => {
                  const isSel = selectedSubcategory === sub.name
                  return (
                    <button
                      key={sub.name}
                      type="button"
                      role="radio"
                      aria-checked={isSel}
                      className={cn(
                        'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors',
                        isSel
                          ? 'border-gold bg-[color-mix(in_srgb,var(--color-gold)_20%,transparent)] font-medium text-cream'
                          : 'border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] text-muted hover:border-gold/50 hover:text-cream',
                      )}
                      onClick={() => setSelectedSubcategory(isSel ? null : sub.name)}
                    >
                      <span>{sub.name}</span>
                      <span className="font-mono text-[10px] opacity-75">({sub.count})</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
            {library === 'music' && availableInstruments.length > 0 ? (
              <div
                role="group"
                aria-label="Filter by instruments"
                className="flex shrink-0 max-h-20 flex-wrap items-center gap-1 overflow-y-auto px-0.5 py-0.5"
              >
                <button
                  type="button"
                  aria-pressed={selectedInstruments.size === 0}
                  className={cn(
                    'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors',
                    selectedInstruments.size === 0
                      ? 'border-gold bg-[color-mix(in_srgb,var(--color-gold)_20%,transparent)] font-medium text-cream'
                      : 'border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] text-muted hover:border-gold/50 hover:text-cream',
                  )}
                  onClick={clearInstruments}
                >
                  <span>All instruments</span>
                </button>
                {availableInstruments.map((inst) => {
                  const isSel = selectedInstruments.has(inst.name)
                  return (
                    <button
                      key={inst.name}
                      type="button"
                      aria-pressed={isSel}
                      className={cn(
                        'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors',
                        isSel
                          ? 'border-gold bg-[color-mix(in_srgb,var(--color-gold)_20%,transparent)] font-medium text-cream'
                          : 'border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] text-muted hover:border-gold/50 hover:text-cream',
                      )}
                      onClick={() => toggleInstrument(inst.name)}
                    >
                      <span>{inst.name}</span>
                      <span className="font-mono text-[10px] opacity-75">({inst.count})</span>
                    </button>
                  )
                })}
                {selectedInstruments.size >= 2 ? (
                  <div
                    role="radiogroup"
                    aria-label="Instrument match mode"
                    className="ml-1 inline-flex h-6 items-center rounded-full border border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] bg-leather-2 p-0.5 text-[10px]"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={instrumentMatchMode === 'any'}
                      className={cn(
                        'rounded-full px-1.5 py-0.5 transition-colors',
                        instrumentMatchMode === 'any'
                          ? 'bg-[color-mix(in_srgb,var(--color-gold)_25%,var(--color-leather))] font-medium text-cream'
                          : 'text-muted hover:text-cream',
                      )}
                      onClick={() => setInstrumentMatchMode('any')}
                    >
                      Any
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={instrumentMatchMode === 'all'}
                      className={cn(
                        'rounded-full px-1.5 py-0.5 transition-colors',
                        instrumentMatchMode === 'all'
                          ? 'bg-[color-mix(in_srgb,var(--color-gold)_25%,var(--color-leather))] font-medium text-cream'
                          : 'text-muted hover:text-cream',
                      )}
                      onClick={() => setInstrumentMatchMode('all')}
                    >
                      All
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <ScrollArea className="h-full min-h-0 flex-1 rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)]">
              {isSearching ? (
                <div
                  className="space-y-2 p-2"
                  aria-label="Search results"
                >
                  {groupedVisible.map((group) => (
                    <Collapsible
                      key={group.name}
                      open
                      className="overflow-hidden rounded-book border border-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] bg-leather-2/30"
                    >
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          aria-expanded="true"
                          className="flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors hover:bg-leather-2/60 focus-visible:ring-1 focus-visible:ring-gold focus-visible:outline-none"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronRight className="h-3.5 w-3.5 rotate-90 text-gold/80" />
                            <span className="font-display text-xs tracking-wide text-cream">
                              {group.name}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-muted">
                            {group.effects.length} {group.effects.length === 1 ? 'prompt' : 'prompts'}
                          </span>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="border-t border-[color-mix(in_srgb,var(--color-gold)_12%,transparent)] p-1.5">
                        <ul className="space-y-1">
                          {group.effects.map((effect) => renderEffectItem(effect))}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                  {visible.length === 0 ? (
                    <div className="px-2 py-6 text-sm text-muted">No prompts match that search.</div>
                  ) : null}
                </div>
              ) : library === 'music' ? (
                <div
                  className="space-y-2 p-2"
                  aria-label={category ? `${category.name} prompts` : 'Prompts'}
                >
                  {groupedVisible.map((group) => {
                    const isExpanded = isIntensityOpen(group.name)
                    return (
                      <Collapsible
                        key={group.name}
                        open={isExpanded}
                        onOpenChange={() => toggleIntensity(group.name)}
                        className="overflow-hidden rounded-book border border-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] bg-leather-2/30"
                      >
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            className="flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors hover:bg-leather-2/60 focus-visible:ring-1 focus-visible:ring-gold focus-visible:outline-none"
                          >
                            <div className="flex items-center gap-2">
                              <ChevronRight
                                className={cn(
                                  'h-3.5 w-3.5 text-gold/80 transition-transform duration-200',
                                  isExpanded && 'rotate-90',
                                )}
                              />
                              <span className="font-display text-xs tracking-wide text-cream">
                                {group.name}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-muted">
                              {group.effects.length} {group.effects.length === 1 ? 'prompt' : 'prompts'}
                            </span>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border-t border-[color-mix(in_srgb,var(--color-gold)_12%,transparent)] p-1.5">
                          <ul className="space-y-1">
                            {group.effects.map((effect) => renderEffectItem(effect))}
                          </ul>
                        </CollapsibleContent>
                      </Collapsible>
                    )
                  })}
                  {visible.length === 0 ? (
                    <div className="px-2 py-6 text-sm text-muted">No prompts match that search.</div>
                  ) : null}
                </div>
              ) : !selectedSubcategory && groupedVisible.length > 1 ? (
                <div
                  className="space-y-2 p-2"
                  aria-label={category ? `${category.name} prompts` : 'Prompts'}
                >
                  {groupedVisible.map((group) => {
                    const isExpanded = isSubcategoryOpen(group.name)
                    return (
                      <Collapsible
                        key={group.name}
                        open={isExpanded}
                        onOpenChange={() => toggleSubcategory(group.name)}
                        className="overflow-hidden rounded-book border border-[color-mix(in_srgb,var(--color-gold)_18%,transparent)] bg-leather-2/30"
                      >
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            className="flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors hover:bg-leather-2/60 focus-visible:ring-1 focus-visible:ring-gold focus-visible:outline-none"
                          >
                            <div className="flex items-center gap-2">
                              <ChevronRight
                                className={cn(
                                  'h-3.5 w-3.5 text-gold/80 transition-transform duration-200',
                                  isExpanded && 'rotate-90',
                                )}
                              />
                              <span className="font-display text-xs tracking-wide text-cream">
                                {group.name}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-muted">
                              {group.effects.length} {group.effects.length === 1 ? 'prompt' : 'prompts'}
                            </span>
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border-t border-[color-mix(in_srgb,var(--color-gold)_12%,transparent)] p-1.5">
                          <ul className="space-y-1">
                            {group.effects.map((effect) => renderEffectItem(effect))}
                          </ul>
                        </CollapsibleContent>
                      </Collapsible>
                    )
                  })}
                  {visible.length === 0 ? (
                    <div className="px-2 py-6 text-sm text-muted">No prompts match that search.</div>
                  ) : null}
                </div>
              ) : (
                <ul
                  className="space-y-1 p-2"
                  aria-label={category ? `${category.name} prompts` : 'Prompts'}
                >
                  {visible.map((effect) => renderEffectItem(effect))}
                  {visible.length === 0 ? (
                    <li className="px-2 py-6 text-sm text-muted">No prompts match that search.</li>
                  ) : null}
                </ul>
              )}
            </ScrollArea>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-1">
          <Hint
            className="mr-auto flex items-center gap-2"
            label="How many random-seed takes to queue per prompt. Each take generates and saves as its own clip."
          >
            <div className="flex items-center gap-2">
              <Label htmlFor="catalog-takes" className="text-xs whitespace-nowrap text-muted uppercase tracking-[0.1em]">
                Takes
              </Label>
              <Input
                id="catalog-takes"
                type="number"
                inputMode="numeric"
                min={MIN_QUEUE_TAKES}
                max={MAX_QUEUE_TAKES}
                value={takeCountInput}
                onChange={(e) => setTakeCountInput(e.target.value)}
                onBlur={() => setTakeCountInput(String(clampQueueTakes(Number(takeCountInput))))}
                className="h-8 w-16 text-center"
                aria-label="Takes to queue per prompt"
              />
            </div>
          </Hint>
          <Hint label={isSearching ? 'Add every visible prompt from the search results to the generate queue.' : 'Add every visible prompt in this category to the generate queue.'}>
            <Button type="button" variant="outline" onClick={addCategory} disabled={visible.length === 0}>
              {isSearching ? 'Add visible' : 'Add category'}
              {takeCount > 1 ? ` ×${takeCount}` : ''}
            </Button>
          </Hint>
          <Hint label="Add the checked prompts to the generate queue. Duplicates are skipped.">
            <Button
              type="button"
              onClick={addSelected}
              disabled={!visible.some((effect) => selected.has(effect.id))}
            >
              Add selected
              {takeCount > 1 ? ` ×${takeCount}` : ''}
            </Button>
          </Hint>
        </div>
      </DialogContent>
    </Dialog>
  )
}

