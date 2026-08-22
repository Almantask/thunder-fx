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
import { PROMPT_CHIPS } from '@/lib/incantations'
import { canCast } from '@/lib/prompt'

type IncantationConsoleProps = {
  prompt: string
  duration: number
  cfg: number
  negative: string
  seed: string
  ritesOpen: boolean
  weaving: boolean
  onPrompt: (value: string) => void
  onDuration: (value: number) => void
  onCfg: (value: number) => void
  onNegative: (value: string) => void
  onSeed: (value: string) => void
  onRitesOpen: (open: boolean) => void
  onChip: (chip: string) => void
  onCast: () => void
  onDispel: () => void
}

export function IncantationConsole({
  prompt,
  duration,
  cfg,
  negative,
  seed,
  ritesOpen,
  weaving,
  onPrompt,
  onDuration,
  onCfg,
  onNegative,
  onSeed,
  onRitesOpen,
  onChip,
  onCast,
  onDispel,
}: IncantationConsoleProps) {
  const ready = canCast(prompt)
  const placeholder = 'Speak the sound… a tavern door, a scabbard, a fireball close-mic'

  return (
    <footer className="border-t border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather px-4 py-3">
      <div className="mb-2 flex flex-wrap gap-2" aria-label="Prompt chips">
        {PROMPT_CHIPS.map((chip) => (
          <Hint key={chip} label={`Append “${chip}” to the incantation.`}>
            <Button type="button" size="sm" variant="outline" onClick={() => onChip(chip)}>
              {chip}
            </Button>
          </Hint>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
        <Hint
          className="w-full"
          label="Describe the sound. Enter Casts. Shift+Enter adds a new line. Needs at least 3 characters."
        >
          <div className="parchment-well w-full">
            <Label htmlFor="incantation">Incantation</Label>
            <textarea
              id="incantation"
              value={prompt}
              onChange={(e) => onPrompt(e.target.value)}
              placeholder={placeholder}
              rows={3}
              className="mt-1 w-full resize-none rounded-book border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] p-3 font-ui text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (ready && !weaving) onCast()
                }
              }}
            />
          </div>
        </Hint>
        <Hint
          className="w-full flex-col"
          label="How many seconds Medium should weave. 0.5–30s. Longer takes more VRAM and time."
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
        <div className="flex gap-2">
          {weaving ? (
            <Hint label="Cancel the weave in progress. Audio already written stays in the Grimoire.">
              <Button type="button" variant="outline" size="lg" onClick={onDispel} aria-label="Dispel, cancel generation">
                Dispel
              </Button>
            </Hint>
          ) : (
            <Hint
              label={
                ready
                  ? 'Weave this incantation with Stable Audio 3 Medium: fp32, 8 steps, stereo 44.1 kHz.'
                  : 'Write at least 3 characters to Cast.'
              }
            >
              <Button
                type="button"
                variant="cast"
                size="lg"
                disabled={!ready}
                onClick={onCast}
                aria-label="Cast, generate sound"
              >
                Cast
              </Button>
            </Hint>
          )}
        </div>
      </div>
      <Collapsible open={ritesOpen} onOpenChange={onRitesOpen} className="mt-2">
        <Hint label="Advanced rites: CFG, negative prompt, and seed. Engine quality (fp32, 8 steps) stays fixed.">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              Rites <ChevronDown className="size-4" />
            </Button>
          </CollapsibleTrigger>
        </Hint>
        <CollapsibleContent className="mt-2 grid gap-3 md:grid-cols-3">
          <Hint
            className="w-full flex-col"
            label="Classifier-free guidance. 1 follows the prior more; 7 sticks harder to the incantation."
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
          <Hint className="w-full flex-col" label="Sounds to push away from the weave, such as music, voice, or rain.">
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
          <Hint className="w-full flex-col" label="Fixed seed repeats a weave. −1 picks a random seed for this Cast.">
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
