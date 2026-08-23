import { useMemo, useState } from 'react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { CatalogEffect, PromptCategory, PromptLibrary } from '@/lib/promptCatalog'
import { PROMPT_LIBRARIES } from '@/lib/promptCatalog'
import { cn } from '@/lib/utils'

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
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewId, setPreviewId] = useState<string | null>(null)

  const libraryCategories = catalog.filter((c) => c.library === library)
  const category = libraryCategories.find((c) => c.id === categoryId) ?? libraryCategories[0]
  const visible = useMemo(() => {
    const effects = category?.effects ?? []
    const q = query.trim().toLowerCase()
    if (!q) return effects
    return effects.filter(
      (effect) =>
        effect.title.toLowerCase().includes(q) || effect.prompt.toLowerCase().includes(q),
    )
  }, [category, query])

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
    setSelected(new Set())
    setPreviewId(null)
  }

  function selectLibrary(next: PromptLibrary) {
    if (next === library) return
    setLibrary(next)
    setCategoryId(catalog.find((c) => c.library === next)?.id ?? '')
    setSelected(new Set())
    setQuery('')
    setPreviewId(null)
  }

  function addSelected() {
    const items = visible.filter((effect) => selected.has(effect.id))
    if (items.length === 0) return
    onEnqueue(items)
    setSelected(new Set())
  }

  function addCategory() {
    if (visible.length === 0) return
    onEnqueue(visible)
    setSelected(new Set())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(80vh,40rem)] max-w-3xl flex-col gap-3">
        <DialogTitle>Browse prompts</DialogTitle>
        <Hint label="Shipped starting prompts from the prompts folder. Add several to the queue, or use one in Generate now.">
          <DialogDescription>
            Load shipped sound-effect or ambience prompts, then generate them as a queue.
          </DialogDescription>
        </Hint>
        <div
          role="radiogroup"
          aria-label="Ambience or FX"
          className="inline-flex h-8 w-fit items-center rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather-2 p-0.5"
        >
          {PROMPT_LIBRARIES.map((lib) => {
              const selectedLib = lib.id === library
              return (
                <Hint
                  key={lib.id}
                  asChild
                  label={
                    lib.id === 'fx'
                      ? 'Game one-shots with TrackType: SFX.'
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
        <Hint className="w-full" label="Filter the open category by title or prompt text.">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prompts…"
            aria-label="Search prompts"
          />
        </Hint>
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[11rem_1fr]">
          <ScrollArea className="h-64 rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] md:h-full">
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
                      <span>{item.name}</span>
                      <span className="font-mono text-[11px]">{item.effects.length}</span>
                    </button>
                  </Hint>
                )
              })}
            </div>
          </ScrollArea>
          <ScrollArea className="h-64 rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] md:h-full">
            <ul className="space-y-1 p-2" aria-label={category ? `${category.name} prompts` : 'Prompts'}>
              {visible.map((effect) => {
                const checked = selected.has(effect.id)
                const previewing = previewId === effect.id
                return (
                  <li
                    key={effect.id}
                    className="rounded-book px-1 py-1 hover:bg-leather-2"
                  >
                    <div className="flex items-center gap-2">
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-cream">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggle(effect.id, value === true)}
                          aria-label={effect.title}
                        />
                        <span className="min-w-0 flex-1 truncate">{effect.title}</span>
                        <span className="shrink-0 font-mono text-[11px] text-muted">
                          {effect.duration}s
                        </span>
                      </label>
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
                    {previewing ? (
                      <div className="mt-1 space-y-1 px-7 pb-1">
                        <p className="text-xs leading-relaxed text-muted whitespace-pre-wrap">
                          {effect.prompt}
                        </p>
                        {effect.negative ? (
                          <p className="text-[11px] text-muted">Negative: {effect.negative}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                )
              })}
              {visible.length === 0 ? (
                <li className="px-2 py-6 text-sm text-muted">No prompts match that search.</li>
              ) : null}
            </ul>
          </ScrollArea>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Hint label="Add every visible prompt in this category to the generate queue.">
            <Button type="button" variant="outline" onClick={addCategory} disabled={visible.length === 0}>
              Add category
            </Button>
          </Hint>
          <Hint label="Add the checked prompts to the generate queue. Duplicates are skipped.">
            <Button
              type="button"
              onClick={addSelected}
              disabled={!visible.some((effect) => selected.has(effect.id))}
            >
              Add selected
            </Button>
          </Hint>
        </div>
      </DialogContent>
    </Dialog>
  )
}
