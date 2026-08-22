import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
          <Button key={chip} type="button" size="sm" variant="outline" onClick={() => onChip(chip)}>
            {chip}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
        <div className="parchment-well">
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
        <div>
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
        <div className="flex gap-2">
          {weaving ? (
            <Button type="button" variant="outline" size="lg" onClick={onDispel} aria-label="Dispel, cancel generation">
              Dispel
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
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
                </span>
              </TooltipTrigger>
              {!ready ? (
                <TooltipContent>Write at least 3 characters to Cast.</TooltipContent>
              ) : null}
            </Tooltip>
          )}
        </div>
      </div>
      <Collapsible open={ritesOpen} onOpenChange={onRitesOpen} className="mt-2">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            Rites <ChevronDown className="size-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 grid gap-3 md:grid-cols-3">
          <div>
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
          <div>
            <Label htmlFor="negative">Negative prompt</Label>
            <Input
              id="negative"
              className="mt-1"
              value={negative}
              onChange={(e) => onNegative(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="seed">Seed (−1 random)</Label>
            <Input
              id="seed"
              className="mt-1 font-mono"
              value={seed}
              onChange={(e) => onSeed(e.target.value)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </footer>
  )
}
