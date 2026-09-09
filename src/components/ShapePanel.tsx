import { useState } from 'react'
import {
  ChevronRight,
  FlipHorizontal2,
  Gauge,
  Layers,
  Save,
  Undo2,
  Volume2,
} from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  MAX_FADE_SEC,
  MAX_GAIN_DB,
  MAX_SEMITONES,
  MIN_GAIN_DB,
  MIN_SEMITONES,
} from '@/lib/audioEdit'
import { cn } from '@/lib/utils'

export type ShapePanelProps = {
  /** No clip loaded, or the GPU is busy. */
  disabled: boolean
  canUndo: boolean
  /** The working buffer differs from what is on disk. */
  dirty: boolean
  /** Only the desktop build can write the edit back over the library file. */
  canSave: boolean
  saving?: boolean
  onFade: (fadeInSec: number, fadeOutSec: number) => void
  onReverse: () => void
  onGain: (db: number) => void
  onNormalize: () => void
  onPitch: (semitones: number) => void
  onVariants: (count: number, spread: number) => void
  onUndo: () => void
  onSave: () => void
}

const numberClass = 'mt-1 h-8 font-mono text-xs'

/** Digits, one leading minus and one dot — the shapes a number passes through. */
const NUMERIC_DRAFT = /^-?\d*\.?\d*$/

/**
 * Numeric fields keep their raw text while being typed.
 *
 * Re-parsing on every keystroke cannot work here: typing "0.5" goes through
 * "0." , which `Number` reads as 0, so the dot is thrown away and the next
 * digit lands as "05" — making a decimal impossible to enter. The draft string
 * is clamped when it is read and normalized on blur instead.
 */
function readNumber(draft: string, min: number, max: number, fallback = min): number {
  const parsed = Number(draft)
  if (!Number.isFinite(parsed) || draft.trim() === '' || draft === '-') return fallback
  return Math.min(max, Math.max(min, parsed))
}

/**
 * Edits that cost no GPU time.
 *
 * Everything here applies to the working buffer straight away, so playback and
 * export follow without a separate "preview" concept. Nothing touches the file
 * on disk until Save — Undo walks back through the stack until then.
 */
export function ShapePanel({
  disabled,
  canUndo,
  dirty,
  canSave,
  saving = false,
  onFade,
  onReverse,
  onGain,
  onNormalize,
  onPitch,
  onVariants,
  onUndo,
  onSave,
}: ShapePanelProps) {
  const [open, setOpen] = useState(false)
  const [fadeInDraft, setFadeInDraft] = useState('0')
  const [fadeOutDraft, setFadeOutDraft] = useState('0.1')
  const [gainDraft, setGainDraft] = useState('0')
  const [semitoneDraft, setSemitoneDraft] = useState('2')
  const [variantDraft, setVariantDraft] = useState('3')

  const fadeIn = readNumber(fadeInDraft, 0, MAX_FADE_SEC)
  const fadeOut = readNumber(fadeOutDraft, 0, MAX_FADE_SEC)
  const gainDb = readNumber(gainDraft, MIN_GAIN_DB, MAX_GAIN_DB, 0)
  const semitones = readNumber(semitoneDraft, MIN_SEMITONES, MAX_SEMITONES, 0)
  const variantCount = readNumber(variantDraft, 1, 12, 3)

  const fadeReady = fadeIn > 0 || fadeOut > 0

  /** Accepts a partial number while typing; rejects anything that is not one. */
  const draftHandler =
    (set: (value: string) => void) => (event: { target: { value: string } }) => {
      const next = event.target.value
      if (next === '' || NUMERIC_DRAFT.test(next)) set(next)
    }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-book border border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] bg-leather-2/30"
    >
      <Hint label="Fades, reverse, level and pitch. These run on the clip you already generated, so they cost no GPU time.">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            className="flex w-full items-center justify-between px-2.5 py-2 text-left transition-colors hover:bg-leather-2/60 focus-visible:ring-1 focus-visible:ring-gold focus-visible:outline-none"
          >
            <span className="flex items-center gap-1.5">
              <ChevronRight
                className={cn('h-3.5 w-3.5 text-gold transition-transform duration-200', open && 'rotate-90')}
              />
              <span className="font-display text-xs tracking-[0.16em] text-muted">SHAPE</span>
            </span>
            {dirty ? (
              <span className="font-mono text-[10px] text-gold" aria-label="Unsaved edits">
                edited
              </span>
            ) : null}
          </button>
        </CollapsibleTrigger>
      </Hint>

      <CollapsibleContent className="space-y-3 border-t border-[color-mix(in_srgb,var(--color-gold)_15%,transparent)] p-2.5">
        <div className="grid grid-cols-2 gap-2">
          <Hint className="w-full flex-col" label="Seconds of equal-power fade at the start. 0 leaves the attack alone.">
            <div className="w-full">
              <Label htmlFor="fade-in">Fade in</Label>
              <Input
                id="fade-in"
                className={numberClass}
                inputMode="decimal"
                value={fadeInDraft}
                onChange={draftHandler(setFadeInDraft)}
                onBlur={() => setFadeInDraft(String(fadeIn))}
                aria-label="Fade in seconds"
              />
            </div>
          </Hint>
          <Hint className="w-full flex-col" label="Seconds of equal-power fade at the end. A short one kills the click on a hard cut.">
            <div className="w-full">
              <Label htmlFor="fade-out">Fade out</Label>
              <Input
                id="fade-out"
                className={numberClass}
                inputMode="decimal"
                value={fadeOutDraft}
                onChange={draftHandler(setFadeOutDraft)}
                onBlur={() => setFadeOutDraft(String(fadeOut))}
                aria-label="Fade out seconds"
              />
            </div>
          </Hint>
        </div>
        <Hint className="w-full" label="Apply both fades to the clip. Equal-power, so the level does not dip through the middle of the ramp.">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={disabled || !fadeReady}
            onClick={() => onFade(fadeIn, fadeOut)}
          >
            Apply fades
          </Button>
        </Hint>

        <div className="grid grid-cols-2 gap-2">
          <Hint label="Play the clip backwards.">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={disabled}
              onClick={onReverse}
              aria-label="Reverse clip"
            >
              <FlipHorizontal2 className="h-3.5 w-3.5" />
              Reverse
            </Button>
          </Hint>
          <Hint label="Peak-normalize to -1 dBFS, up or down. A near-silent clip is left alone rather than amplified into noise.">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={disabled}
              onClick={onNormalize}
              aria-label="Normalize level"
            >
              <Gauge className="h-3.5 w-3.5" />
              Normalize
            </Button>
          </Hint>
        </div>

        <div className="flex items-end gap-2">
          <Hint className="w-full flex-col" label={`Level change in decibels, ${MIN_GAIN_DB} to +${MAX_GAIN_DB}.`}>
            <div className="w-full">
              <Label htmlFor="gain-db">Gain dB</Label>
              <Input
                id="gain-db"
                className={numberClass}
                inputMode="decimal"
                value={gainDraft}
                onChange={draftHandler(setGainDraft)}
                onBlur={() => setGainDraft(String(gainDb))}
                aria-label="Gain in decibels"
              />
            </div>
          </Hint>
          <Hint label="Apply the level change to the clip.">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={disabled || gainDb === 0}
              onClick={() => onGain(gainDb)}
              aria-label="Apply gain"
            >
              <Volume2 className="h-3.5 w-3.5" />
            </Button>
          </Hint>
        </div>

        <div className="flex items-end gap-2">
          <Hint
            className="w-full flex-col"
            label={`Semitones, ${MIN_SEMITONES} to +${MAX_SEMITONES}. Pitch and speed move together, as on a sampler, so the clip gets shorter as it goes up.`}
          >
            <div className="w-full">
              <Label htmlFor="semitones">Pitch &amp; speed</Label>
              <Input
                id="semitones"
                className={numberClass}
                inputMode="decimal"
                value={semitoneDraft}
                onChange={draftHandler(setSemitoneDraft)}
                onBlur={() => setSemitoneDraft(String(semitones))}
                aria-label="Pitch shift in semitones"
              />
            </div>
          </Hint>
          <Hint label="Shift this clip's pitch and speed.">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={disabled || semitones === 0}
              onClick={() => onPitch(semitones)}
              aria-label="Apply pitch shift"
            >
              <Layers className="h-3.5 w-3.5" />
            </Button>
          </Hint>
        </div>

        <div className="flex items-end gap-2">
          <Hint
            className="w-full flex-col"
            label="How many re-pitched copies to save to the library. The usual trick for stopping a repeated footstep or impact sounding machine-gunned."
          >
            <div className="w-full">
              <Label htmlFor="variant-count">Variants</Label>
              <Input
                id="variant-count"
                className={numberClass}
                inputMode="numeric"
                value={variantDraft}
                onChange={draftHandler(setVariantDraft)}
                onBlur={() => setVariantDraft(String(variantCount))}
                aria-label="Variant count"
              />
            </div>
          </Hint>
          <Hint label="Save that many pitch-shifted copies of this clip to the library. No GPU time; the spread is the semitone value above.">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={disabled || !canSave}
              onClick={() => onVariants(Math.round(variantCount), Math.abs(semitones) || 2)}
              aria-label="Make pitch variants"
            >
              Make
            </Button>
          </Hint>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-[color-mix(in_srgb,var(--color-gold)_15%,transparent)] pt-2.5">
          <Hint label="Step back one edit. Edits are not written to disk until you save.">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={!canUndo}
              onClick={onUndo}
              aria-label="Undo edit"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </Button>
          </Hint>
          <Hint label="Overwrite the library file with the edited audio. Export writes the edit either way; this makes it permanent.">
            <Button
              type="button"
              variant={dirty ? 'default' : 'outline'}
              size="sm"
              className="w-full"
              disabled={!dirty || !canSave || saving}
              onClick={onSave}
              aria-label="Save edits to library"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </Hint>
        </div>
        {dirty && !canSave ? (
          <p className="text-xs text-muted">
            Edits apply to playback and export. Writing them back into the library needs the desktop
            app.
          </p>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}
