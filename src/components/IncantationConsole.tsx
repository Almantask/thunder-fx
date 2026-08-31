import { BookOpen, ChevronDown, ListOrdered, Square } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { MAX_GENERATE_SECONDS, MIN_GENERATE_SECONDS, clampGenerateSeconds } from '@/lib/duration'
import { GENERATE_MODES, modeSupportsSeamlessLoop } from '@/lib/generateMode'
import { canCast } from '@/lib/prompt'
import type { CatalogEffect } from '@/lib/promptCatalog'
import { formatEstimateMs } from '@/lib/timing'
import type { GenerateMode } from '@/lib/types'
import { cn } from '@/lib/utils'

type IncantationConsoleProps = {
  className?: string
  mode: GenerateMode
  prompt: string
  duration: number
  steps?: number
  negative: string
  seed: string
  ritesOpen: boolean
  weaving: boolean
  onMode: (mode: GenerateMode) => void
  onPrompt: (value: string) => void
  onDuration: (value: number) => void
  onSteps?: (value: number) => void
  onNegative: (value: string) => void
  onSeed: (value: string) => void
  onRitesOpen: (open: boolean) => void
  onCast: () => void
  onCastTakes?: () => void
  onQueueCurrent?: () => void
  onDispel: () => void
  onLoadModel?: () => void
  onCancelLoadModel?: () => void
  onUnloadModel?: () => void
  modelLoaded?: boolean
  loadingModel?: boolean
  engineReady?: boolean
  engineMessage?: string
  queue?: CatalogEffect[]
  queueRunning?: boolean
  onOpenCatalog?: () => void
  onGenerateQueue?: () => void
  onCancelQueue?: () => void
  onClearQueue?: () => void
  onRemoveQueued?: (id: string) => void
  loadEstimateMs?: number
  castEstimateMs?: number
  queueEstimateMs?: number
  clipEstimateMs?: (seconds: number) => number | undefined
  generateSeamlessLoop?: boolean
  onGenerateSeamlessLoop?: (value: boolean) => void
}

export function IncantationConsole({
  className,
  mode,
  prompt,
  duration,
  steps = 20,
  negative,
  seed,
  ritesOpen,
  weaving,
  onMode,
  onPrompt,
  onDuration,
  onSteps,
  onNegative,
  onSeed,
  onRitesOpen,
  onCast,
  onCastTakes,
  onQueueCurrent,
  onDispel,
  onLoadModel,
  onCancelLoadModel,
  onUnloadModel,
  modelLoaded = true,
  loadingModel = false,
  engineReady = true,
  engineMessage = '',
  queue = [],

  queueRunning = false,
  onOpenCatalog,
  onGenerateQueue,
  onCancelQueue,
  onClearQueue,
  onRemoveQueued,
  loadEstimateMs,
  castEstimateMs,
  queueEstimateMs,
  clipEstimateMs,
  generateSeamlessLoop = false,
  onGenerateSeamlessLoop,
}: IncantationConsoleProps) {
  const spec = GENERATE_MODES[mode]
  const ready = canCast(prompt)
  const busy = weaving || loadingModel
  const canGenerate = ready && modelLoaded && !busy
  const canQueueMore = ready && modelLoaded && !loadingModel
  const canLoad = engineReady && !modelLoaded && !busy
  const canUnload = engineReady && modelLoaded && !busy
  const canGenerateQueue = queue.length > 0 && modelLoaded && !busy
  const loadEta = formatEstimateMs(loadEstimateMs)
  const castEta = formatEstimateMs(castEstimateMs)
  const queueEta = formatEstimateMs(queueEstimateMs)

  let loadHint = 'Load Medium into VRAM once. Generate stays a separate, shorter step.'
  if (!engineReady) {
    loadHint = engineMessage.trim()
      ? engineMessage
      : 'The GPU engine is not ready. Load model needs CUDA Medium.'
  } else if (loadEta) {
    loadHint = `Load Medium into VRAM once. About ${loadEta} from past loads on this machine. Generate stays a separate, shorter step.`
  }

  const durationHint = castEta
    ? `How many seconds of audio to generate. 0.5–380s (Stable Audio 3 Medium max, 6m 20s). Longer takes more VRAM and time. About ${castEta} at this duration, from past clips on this machine.`
    : 'How many seconds of audio to generate. 0.5–380s (Stable Audio 3 Medium max, 6m 20s). Longer takes more VRAM and time. Ambience often uses 30s; Instrumental often uses 20s.'

  return (
    <footer className={cn('flex flex-col min-h-0 max-h-[60vh] border-t border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather px-4 py-3 overflow-y-auto', className)}>
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-3">
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
                    : id === 'ambience'
                      ? 'Looping background beds. Prompts use TrackType: SFX and avoid music.'
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
        <Hint label="Open the shipped sound-effect, ambience, and instrumental prompt packs. Check items and add them to a generate queue.">
          <Button type="button" size="lg" onClick={() => onOpenCatalog?.()}>
            <BookOpen />
            Browse prompts
          </Button>
        </Hint>
        {queueRunning ? (
          <Hint label="Stop the running queue. Remaining prompts stay in the queue and can be resumed at any time.">
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="border-danger/60 text-danger hover:bg-danger/10 hover:text-danger"
              onClick={() => onCancelQueue?.()}
              aria-label="Cancel queue"
            >
              <Square className="size-4 fill-current" />
              Cancel queue
            </Button>
          </Hint>
        ) : (
          <Hint
            label={
              queue.length === 0
                ? 'Add prompts from Browse prompts to generate several effects in order.'
                : queueEta
                  ? `Generate ${queue.length} queued effects one after another. About ${queueEta} from past clips on this machine. Saved across sessions.`
                  : `Generate ${queue.length} queued effects one after another. Saved across sessions.`
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
        )}
      </div>
      <div className="flex min-h-[144px] flex-1 items-stretch gap-3">
        {queue.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col rounded-book border border-[color-mix(in_srgb,var(--color-gold)_28%,transparent)] bg-leather-2 p-3">
            <div className="mb-1 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <Hint label="These prompts will generate in order. Each clip is saved to the library. The queue is preserved if you close the app.">
                <p className="text-xs tracking-[0.12em] text-muted uppercase">
                  Queue · {queue.length}
                  {queueEta ? ` · ${queueEta}` : ''}
                  {queueRunning ? ' · Generating…' : ' · Saved'}
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
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Generate queue">
              {queue.map((item) => {
                const itemEta = formatEstimateMs(clipEstimateMs?.(item.duration))
                return (
                  <li key={item.id} className="flex items-center gap-2 text-sm text-cream">
                    <span className="min-w-0 flex-1 truncate">
                      {item.category} · {item.title}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">
                      {item.duration}s{itemEta ? ` ${itemEta}` : ''}
                      {typeof item.seed === 'number' ? ` · seed ${item.seed}` : ''}
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
        <Hint
          className="flex min-h-0 flex-1 flex-col"
          label="Describe the sound or music. Enter starts generation. Shift+Enter adds a new line. Needs at least 3 characters."
        >
          <div className="parchment-well flex min-h-0 flex-1 flex-col w-full">
            <Label htmlFor="prompt">Prompt</Label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => onPrompt(e.target.value)}
              placeholder={spec.placeholder}
              className="mt-1 w-full min-h-[72px] flex-1 resize-none rounded-book border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] p-3 font-ui text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (canGenerate) onCast()
                }
              }}
            />
          </div>
        </Hint>
        <div className="flex w-56 shrink-0 flex-col justify-end gap-2.5">
          <div className="w-full">
            <div className="flex w-full items-center justify-between gap-2">
              <Hint label={durationHint}>
                <Label htmlFor="duration">Duration {duration.toFixed(1)}s</Label>
              </Hint>
              {modeSupportsSeamlessLoop(mode) ? (
                <Hint label="Generate extra overlap and blend the tail into the head so the clip starts and ends the same. Playback loops after generate.">
                  <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-cream">
                    <Checkbox
                      className="size-4"
                      checked={generateSeamlessLoop}
                      disabled={busy}
                      onCheckedChange={(value) => onGenerateSeamlessLoop?.(value === true)}
                      aria-label="Generate seamless loop"
                    />
                    Seamless loop
                  </label>
                </Hint>
              ) : null}
            </div>
            <Hint className="w-full" label={durationHint}>
              <Slider
                id="duration"
                className="mt-2 w-full"
                min={MIN_GENERATE_SECONDS}
                max={MAX_GENERATE_SECONDS}
                step={0.5}
                value={[duration]}
                onValueChange={(v) => onDuration(clampGenerateSeconds(v[0] ?? duration))}
                aria-label="Duration in seconds"
              />
            </Hint>
          </div>
          <div className="flex flex-col gap-2">
            {loadingModel ? (
              <Hint label="Cancel putting Medium into VRAM.">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => onCancelLoadModel?.()}
                  aria-label="Cancel model load"
                >
                  Cancel
                </Button>
              </Hint>
            ) : modelLoaded ? (
              <Hint label="Remove Medium from VRAM to free GPU memory. Generate will require loading Medium again.">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={!canUnload}
                  onClick={() => onUnloadModel?.()}
                  aria-label="Unload model"
                >
                  Unload model
                </Button>
              </Hint>
            ) : (
              <Hint label={loadHint}>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={!canLoad}
                  onClick={() => onLoadModel?.()}
                  aria-label="Load model"
                >
                  Load model
                  {loadEta ? (
                    <span className="font-mono text-[11px] text-muted">{loadEta}</span>
                  ) : null}
                </Button>
              </Hint>
            )}
            {weaving ? (
              <Hint label="Stop this generation. Sounds already saved stay in the library.">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={onDispel}
                  aria-label="Cancel generation"
                >
                  Cancel
                </Button>
              </Hint>
            ) : (
              <Hint
                label={
                  !modelLoaded
                    ? 'Load the model first. Generate only creates a clip after Medium is in VRAM.'
                    : ready
                      ? `Generate this prompt with Stable Audio 3 Medium: ${steps} steps, stereo 44.1 kHz. Mode: ${spec.label.toLowerCase()}.${castEta ? ` About ${castEta} at this duration, from past clips on this machine.` : ''}`
                      : 'Write at least 3 characters to generate.'
                }
              >
                <Button
                  type="button"
                  variant="cast"
                  size="lg"
                  className="w-full"
                  disabled={!canGenerate}
                  onClick={onCast}
                  aria-label={spec.generateAria}
                >
                  Generate
                  {castEta ? <span className="font-mono text-[11px] text-cream/80">{castEta}</span> : null}
                </Button>
              </Hint>
            )}
            {weaving ? (
              <Hint label="Queue this prompt. It generates automatically right after the current run finishes.">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={!canQueueMore}
                  onClick={() => onQueueCurrent?.()}
                  aria-label="Queue next"
                >
                  <ListOrdered />
                  Queue next
                </Button>
              </Hint>
            ) : (
              <Hint label="Generate four variations with random seeds, then keep or discard each take.">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={!canGenerate}
                  onClick={() => onCastTakes?.()}
                  aria-label="Generate 4 takes"
                >
                  Generate 4 takes
                </Button>
              </Hint>
            )}
          </div>
        </div>
      </div>
      <Collapsible open={ritesOpen} onOpenChange={onRitesOpen} className="mt-2 shrink-0">
        <Hint label="Advanced options: Quality steps, negative prompt, and seed.">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              Advanced <ChevronDown className="size-4" />
            </Button>
          </CollapsibleTrigger>
        </Hint>
        <CollapsibleContent className="mt-2 grid gap-3 md:grid-cols-3">
          <Hint
            className="w-full flex-col"
            label="Diffusion sampling steps. 8 = Draft, 20 = Balanced (Recommended), 32 = High Fidelity."
          >
            <div className="w-full">
              <div className="flex items-center justify-between">
                <Label htmlFor="steps">Steps {steps}</Label>
                <span className="text-[10px] uppercase tracking-wider text-muted font-display">
                  {steps <= 10 ? 'Draft' : steps <= 24 ? 'Balanced' : 'Hi-Fi'}
                </span>
              </div>
              <Slider
                id="steps"
                className="mt-3"
                min={4}
                max={50}
                step={1}
                value={[steps]}
                onValueChange={(v) => onSteps?.(v[0] ?? steps)}
                aria-label="Quality steps"
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
