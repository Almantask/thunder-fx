import { BookOpen, ChevronDown, ListOrdered } from 'lucide-react'
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
import { MAX_GENERATE_SECONDS, MIN_GENERATE_SECONDS, clampGenerateSeconds } from '@/lib/duration'
import { GENERATE_MODES } from '@/lib/generateMode'
import { canCast } from '@/lib/prompt'
import type { CatalogEffect } from '@/lib/promptCatalog'
import { formatEstimateMs } from '@/lib/timing'
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
  onCast: () => void
  onDispel: () => void
  onLoadModel?: () => void
  modelLoaded?: boolean
  loadingModel?: boolean
  engineReady?: boolean
  engineMessage?: string
  queue?: CatalogEffect[]
  onOpenCatalog?: () => void
  onGenerateQueue?: () => void
  onClearQueue?: () => void
  onRemoveQueued?: (id: string) => void
  loadEstimateMs?: number
  castEstimateMs?: number
  queueEstimateMs?: number
  clipEstimateMs?: (seconds: number) => number | undefined
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
  onCast,
  onDispel,
  onLoadModel,
  modelLoaded = true,
  loadingModel = false,
  engineReady = true,
  engineMessage = '',
  queue = [],
  onOpenCatalog,
  onGenerateQueue,
  onClearQueue,
  onRemoveQueued,
  loadEstimateMs,
  castEstimateMs,
  queueEstimateMs,
  clipEstimateMs,
}: IncantationConsoleProps) {
  const spec = GENERATE_MODES[mode]
  const ready = canCast(prompt)
  const busy = weaving || loadingModel
  const canGenerate = ready && modelLoaded && !busy
  const canLoad = engineReady && !modelLoaded && !busy
  const canGenerateQueue = queue.length > 0 && modelLoaded && !busy
  const loadEta = formatEstimateMs(loadEstimateMs)
  const castEta = formatEstimateMs(castEstimateMs)
  const queueEta = formatEstimateMs(queueEstimateMs)

  let loadLabel = 'Load model'
  if (loadingModel) loadLabel = 'Loading model…'
  else if (modelLoaded) loadLabel = 'Model ready'

  let loadHint = 'Load Medium into VRAM once. Generate stays a separate, shorter step.'
  if (loadingModel) {
    loadHint = 'Putting Medium into VRAM. This is not generating a clip.'
  } else if (modelLoaded) {
    loadHint = 'Medium is already in VRAM. Generate only creates a clip.'
  } else if (!engineReady) {
    loadHint = engineMessage.trim()
      ? engineMessage
      : 'The GPU engine is not ready. Load model needs CUDA Medium.'
  } else if (loadEta) {
    loadHint = `Load Medium into VRAM once. About ${loadEta} from past loads on this machine. Generate stays a separate, shorter step.`
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
        <Hint label="Open the shipped sound-effect and ambience prompt packs. Check items and add them to a generate queue.">
          <Button type="button" size="lg" onClick={() => onOpenCatalog?.()}>
            <BookOpen />
            Browse prompts
          </Button>
        </Hint>
        <Hint
          label={
            queue.length === 0
              ? 'Add prompts from Browse prompts to generate several effects in order.'
              : queueEta
                ? `Generate ${queue.length} queued effects one after another. About ${queueEta} from past clips on this machine. Cancel stops the rest.`
                : `Generate ${queue.length} queued effects one after another. Cancel stops the rest.`
          }
        >
          <Button
            type="button"
            size="lg"
            disabled={!canGenerateQueue}
            onClick={() => onGenerateQueue?.()}
          >
            <ListOrdered />
            Generate queue
            {queueEta ? <span className="font-mono text-[11px] text-muted">{queueEta}</span> : null}
          </Button>
        </Hint>
      </div>
      {queue.length > 0 ? (
        <div className="mb-2 rounded-book border border-[color-mix(in_srgb,var(--color-gold)_28%,transparent)] bg-leather-2 px-3 py-2">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <Hint label="These prompts will generate in order. Each clip is saved to the library.">
              <p className="text-xs tracking-[0.12em] text-muted uppercase">
                Queue · {queue.length}
                {queueEta ? ` · ${queueEta}` : ''}
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
            {queue.map((item) => {
              const itemEta = formatEstimateMs(clipEstimateMs?.(item.duration))
              return (
              <li key={item.id} className="flex items-center gap-2 text-sm text-cream">
                <span className="min-w-0 flex-1 truncate">
                  {item.category} · {item.title}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {item.duration}s{itemEta ? ` ${itemEta}` : ''}
                </span>
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
              )
            })}
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
          label={
            castEta
              ? `How many seconds of audio to generate. 0.5–380s (Stable Audio 3 Medium max, 6m 20s). Longer takes more VRAM and time. About ${castEta} at this duration, from past clips on this machine.`
              : 'How many seconds of audio to generate. 0.5–380s (Stable Audio 3 Medium max, 6m 20s). Longer takes more VRAM and time. Instrumental often uses 20s.'
          }
        >
          <div className="w-full">
            <Label htmlFor="duration">Duration {duration.toFixed(1)}s</Label>
            <Slider
              id="duration"
              className="mt-4"
              min={MIN_GENERATE_SECONDS}
              max={MAX_GENERATE_SECONDS}
              step={0.5}
              value={[duration]}
              onValueChange={(v) => onDuration(clampGenerateSeconds(v[0] ?? duration))}
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
              {!loadingModel && !modelLoaded && loadEta ? (
                <span className="font-mono text-[11px] text-muted">{loadEta}</span>
              ) : null}
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
                    ? `Generate this prompt with Stable Audio 3 Medium: fp32, 8 steps, stereo 44.1 kHz. Mode: ${spec.label.toLowerCase()}.${castEta ? ` About ${castEta} at this duration, from past clips on this machine.` : ''}`
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
                {castEta ? <span className="font-mono text-[11px] text-cream/80">{castEta}</span> : null}
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
