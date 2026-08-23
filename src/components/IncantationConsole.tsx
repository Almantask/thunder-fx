import { ChevronDown } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { GENERATE_MODES } from '@/lib/generateMode'
import { canCast } from '@/lib/prompt'
import type { CatalogEffect } from '@/lib/promptCatalog'
import type { GenerateMode } from '@/lib/types'
import { cn } from '@/lib/utils'

type IncantationConsoleProps = {
  mode: GenerateMode
  prompt: string
  duration: number
  cfg: number
  negative: string
  seed: string
  ritesOpen: boolean
  weaving: boolean
  onMode: (mode: GenerateMode) => void
  onPrompt: (value: string) => void
  onDuration: (value: number) => void
  onCfg: (value: number) => void
  onNegative: (value: string) => void
  onSeed: (value: string) => void
  onRitesOpen: (open: boolean) => void
  onChip: (chip: string) => void
  onCast: () => void
  onDispel: () => void
  onLoadModel?: () => void
  modelLoaded?: boolean
  loadingModel?: boolean
  engineReady?: boolean
  queue?: CatalogEffect[]
  onOpenCatalog?: () => void
  onGenerateQueue?: () => void
  onClearQueue?: () => void
  onRemoveQueued?: (id: string) => void
}

export function IncantationConsole({
  mode,
  prompt,
  duration,
  cfg,
  negative,
  seed,
  ritesOpen,
  weaving,
  onMode,
  onPrompt,
  onDuration,
  onCfg,
  onNegative,
  onSeed,
  onRitesOpen,
  onChip,
  onCast,
  onDispel,
  onLoadModel,
  modelLoaded = true,
  loadingModel = false,
  engineReady = true,
  queue = [],
  onOpenCatalog,
  onGenerateQueue,
  onClearQueue,
  onRemoveQueued,
}: IncantationConsoleProps) {
  const spec = GENERATE_MODES[mode]
  const ready = canCast(prompt)
  const busy = weaving || loadingModel
  const canGenerate = ready && modelLoaded && !busy
  const canLoad = engineReady && !modelLoaded && !busy
  const canGenerateQueue = queue.length > 0 && modelLoaded && !busy

  let loadLabel = 'Load model'
  if (loadingModel) loadLabel = 'Loading model…'
  else if (modelLoaded) loadLabel = 'Model ready'

  let loadHint = 'Load Medium into VRAM once. Generate stays a separate, shorter step.'
  if (loadingModel) {
    loadHint = 'Putting Medium into VRAM. This is not generating a clip.'
  } else if (modelLoaded) {
    loadHint = 'Medium is already in VRAM. Generate only creates a clip.'
  } else if (!engineReady) {
    loadHint = 'CUDA is not available. Load model needs a working GPU engine.'
  }

  return (
    <footer className="border-t border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Generate mode"
          className="inline-flex h-8 items-center rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather-2 p-0.5"
        >
          {(Object.keys(GENERATE_MODES) as GenerateMode[]).map((id) => {
            const selected = mode === id
            return (
              <Hint
                key={id}
                asChild
                label={
                  id === 'sfx'
                    ? 'Short sound effects. Prompts use TrackType: SFX.'
                    : 'Instrumental music. Prompts use TrackType: Music and avoid vocals.'
                }
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  className={cn(
                    'inline-flex h-7 items-center justify-center rounded-[calc(var(--radius-book)-2px)] px-3 font-display text-xs tracking-[0.12em] text-muted transition-colors',
                    'hover:text-cream disabled:opacity-50',
                    selected &&
                      'bg-[color-mix(in_srgb,var(--color-gold)_22%,var(--color-leather))] text-cream',
                  )}
                  onClick={() => onMode(id)}
                >
                  {GENERATE_MODES[id].label}
                </button>
              </Hint>
            )
          })}
        </div>
        <Hint label="Open the shipped /prompts catalog. Check effects and add them to a generate queue.">
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenCatalog?.()}>
            Prompt catalog
          </Button>
        </Hint>
        <Hint
          label={
            queue.length === 0
              ? 'Add prompts from the catalog to generate several effects in order.'
              : `Generate ${queue.length} queued effects one after another. Cancel stops the rest.`
          }
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canGenerateQueue}
            onClick={() => onGenerateQueue?.()}
          >
            Generate queue
          </Button>
        </Hint>
      </div>
      <div className="mb-2 flex flex-wrap gap-2" aria-label="Prompt shortcuts">
        {spec.chips.map((chip) => (
          <Hint key={chip} label={`Add “${chip}” to the prompt.`}>
            <Button type="button" size="sm" variant="outline" onClick={() => onChip(chip)}>
              {chip}
            </Button>
          </Hint>
        ))}
      </div>
      {queue.length > 0 ? (
        <div className="mb-2 rounded-book border border-[color-mix(in_srgb,var(--color-gold)_28%,transparent)] bg-leather-2 px-3 py-2">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <Hint label="These prompts will generate in order. Each clip is saved to the library.">
              <p className="text-xs tracking-[0.12em] text-muted uppercase">
                Queue · {queue.length}
              </p>
            </Hint>
            <Hint label="Remove every queued prompt. Does not delete library clips.">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onClearQueue?.()}
              >
                Clear queue
              </Button>
            </Hint>
          </div>
          <ul className="max-h-24 space-y-1 overflow-y-auto" aria-label="Generate queue">
            {queue.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm text-cream">
                <span className="min-w-0 flex-1 truncate">
                  {item.category} · {item.title}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted">{item.duration}s</span>
                <Hint label={`Remove ${item.title} from the queue.`}>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${item.title} from queue`}
                    disabled={busy}
                    onClick={() => onRemoveQueued?.(item.id)}
                  >
                    Remove
                  </Button>
                </Hint>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
        <Hint
          className="w-full"
          label="Describe the sound or music. Enter starts generation. Shift+Enter adds a new line. Needs at least 3 characters."
        >
          <div className="parchment-well w-full">
            <Label htmlFor="prompt">Prompt</Label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => onPrompt(e.target.value)}
              placeholder={spec.placeholder}
              rows={3}
              className="mt-1 w-full resize-none rounded-book border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] p-3 font-ui text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (canGenerate) onCast()
                }
              }}
            />
          </div>
        </Hint>
        <Hint
          className="w-full flex-col"
          label="How many seconds of audio to generate. 0.5–30s. Longer takes more VRAM and time. Instrumental often uses 20s."
        >
          <div className="w-full">
            <Label htmlFor="duration">Duration {duration.toFixed(1)}s</Label>
            <Slider
              id="duration"
              className="mt-4"
              min={0.5}
              max={30}
              step={0.5}
              value={[duration]}
              onValueChange={(v) => onDuration(v[0] ?? duration)}
              aria-label="Duration in seconds"
            />
          </div>
        </Hint>
        <div className="flex min-w-[11rem] flex-col gap-2">
          <Hint label={loadHint}>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={!canLoad}
              onClick={() => onLoadModel?.()}
              aria-label={loadingModel ? 'Loading model' : modelLoaded ? 'Model ready' : 'Load model'}
            >
              {loadLabel}
            </Button>
          </Hint>
          {weaving ? (
            <Hint label="Stop this generation. Sounds already saved stay in the library.">
              <Button type="button" variant="outline" size="lg" onClick={onDispel} aria-label="Cancel generation">
                Cancel
              </Button>
            </Hint>
          ) : (
            <Hint
              label={
                !modelLoaded
                  ? 'Load the model first. Generate only creates a clip after Medium is in VRAM.'
                  : ready
                    ? `Generate this prompt with Stable Audio 3 Medium: fp32, 8 steps, stereo 44.1 kHz. Mode: ${spec.label.toLowerCase()}.`
                    : 'Write at least 3 characters to generate.'
              }
            >
              <Button
                type="button"
                variant="cast"
                size="lg"
                disabled={!canGenerate}
                onClick={onCast}
                aria-label={spec.generateAria}
              >
                Generate
              </Button>
            </Hint>
          )}
        </div>
      </div>
      <Collapsible open={ritesOpen} onOpenChange={onRitesOpen} className="mt-2">
        <Hint label="Advanced options: CFG, negative prompt, and seed. Engine quality (fp32, 8 steps) stays fixed.">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              Advanced <ChevronDown className="size-4" />
            </Button>
          </CollapsibleTrigger>
        </Hint>
        <CollapsibleContent className="mt-2 grid gap-3 md:grid-cols-3">
          <Hint
            className="w-full flex-col"
            label="Classifier-free guidance. 1 follows the model prior more; 7 sticks harder to the prompt."
          >
            <div className="w-full">
              <Label htmlFor="cfg">CFG {cfg.toFixed(1)}</Label>
              <Slider
                id="cfg"
                className="mt-3"
                min={1}
                max={7}
                step={0.1}
                value={[cfg]}
                onValueChange={(v) => onCfg(v[0] ?? cfg)}
                aria-label="Classifier-free guidance"
              />
            </div>
          </Hint>
          <Hint className="w-full flex-col" label={spec.negativeHint}>
            <div className="w-full">
              <Label htmlFor="negative">Negative prompt</Label>
              <Input
                id="negative"
                className="mt-1"
                value={negative}
                onChange={(e) => onNegative(e.target.value)}
              />
            </div>
          </Hint>
          <Hint className="w-full flex-col" label="A fixed seed repeats a result. −1 picks a random seed.">
            <div className="w-full">
              <Label htmlFor="seed">Seed (−1 random)</Label>
              <Input
                id="seed"
                className="mt-1 font-mono"
                value={seed}
                onChange={(e) => onSeed(e.target.value)}
              />
            </div>
          </Hint>
        </CollapsibleContent>
      </Collapsible>
    </footer>
  )
}
