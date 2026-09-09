import type { ReactNode } from 'react'
import { Download, Pause, Play, Repeat, Scissors } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AUDIO_FORMATS,
  formatLabel,
  isLosslessFormat,
  type AudioFormat,
  type BitDepthOption,
  type SampleRateOption,
} from '@/lib/audioExport'
import { formatClock } from '@/lib/utils'

type AltarProps = {
  hasClip: boolean
  weaving: boolean
  playing: boolean
  looping: boolean
  trimStart: number
  trimEnd: number
  duration: number
  format: AudioFormat
  sampleRate: SampleRateOption
  bitDepth: BitDepthOption
  mono: boolean
  onPlay: () => void
  onStop: () => void
  onLoop: (loop: boolean) => void
  onTrimStart: (value: number) => void
  onTrimEnd: (value: number) => void
  onAutoTrim: () => void
  onFormat: (value: AudioFormat) => void
  onSampleRate: (value: SampleRateOption) => void
  onBitDepth: (value: BitDepthOption) => void
  onMono: (value: boolean) => void
  onExport: () => void
  onExportFormat: (format: AudioFormat) => void
  /**
   * Slot for the Shape controls. Passed in rather than wired through props so
   * this panel keeps owning trim and export alone, and the editing surface can
   * grow without widening it.
   */
  shape?: ReactNode
}

const selectClass =
  'mt-1 h-8 w-full rounded-book border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-leather-2 px-2 font-mono text-xs text-cream'

export function Altar({
  hasClip,
  weaving,
  playing,
  looping,
  trimStart,
  trimEnd,
  duration,
  format,
  sampleRate,
  bitDepth,
  mono,
  onPlay,
  onStop,
  onLoop,
  onTrimStart,
  onTrimEnd,
  onAutoTrim,
  onFormat,
  onSampleRate,
  onBitDepth,
  onMono,
  onExport,
  onExportFormat,
  shape,
}: AltarProps) {
  const otherFormats = AUDIO_FORMATS.filter((option) => option !== format)
  // Rate and Bits are PCM settings; the lossy encoders set their own.
  const formatCaveat =
    format === 'opus'
      ? 'Opus always writes 48 kHz. Bits do not apply.'
      : isLosslessFormat(format)
        ? ''
        : 'Bits do not apply to a lossy format.'
  return (
    <aside className="flex w-[252px] shrink-0 min-h-0 flex-col gap-2.5 overflow-y-auto border-l border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather p-3">
      <Hint label="Preview, trim, and export the clip on the waveform.">
        <h2 className="font-display text-sm tracking-[0.2em] text-muted">PREVIEW</h2>
      </Hint>
      <div className="flex flex-wrap gap-2">
        <Hint
          label={
            playing
              ? 'Stop playback of the trimmed region.'
              : 'Play the trimmed region (In to Out).'
          }
        >
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={!hasClip || weaving}
            onClick={playing ? onStop : onPlay}
            aria-label={playing ? 'Stop playback' : 'Play trimmed clip'}
            aria-pressed={playing}
          >
            {playing ? <Pause /> : <Play />}
            {playing ? 'Stop' : 'Play'}
          </Button>
        </Hint>
        <Hint label="Loop the trimmed region until you stop. Off plays once.">
          <Button
            type="button"
            variant={looping ? 'default' : 'ghost'}
            size="icon"
            disabled={!hasClip}
            onClick={() => onLoop(!looping)}
            aria-label="Loop trim preview"
            aria-pressed={looping}
          >
            <Repeat />
          </Button>
        </Hint>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Hint className="w-full flex-col" label="Export start time in seconds. Drag the left gold handle on the waveform, or type here.">
          <div className="w-full">
            <Label htmlFor="trim-in">In</Label>
            <Input
              id="trim-in"
              className="mt-1 font-mono"
              value={trimStart.toFixed(2)}
              onChange={(e) => onTrimStart(Number(e.target.value) || 0)}
              aria-label="Trim start seconds"
            />
          </div>
        </Hint>
        <Hint className="w-full flex-col" label="Export end time in seconds. Drag the right gold handle on the waveform, or type here.">
          <div className="w-full">
            <Label htmlFor="trim-out">Out</Label>
            <Input
              id="trim-out"
              className="mt-1 font-mono"
              value={trimEnd.toFixed(2)}
              onChange={(e) => onTrimEnd(Number(e.target.value) || 0)}
              aria-label="Trim end seconds"
            />
          </div>
        </Hint>
      </div>
      <Hint label="Snap In and Out to the first and last audio above about -42 dB, with a short safety pad.">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={!hasClip || weaving}
          onClick={onAutoTrim}
          aria-label="Auto-trim silence"
        >
          <Scissors />
          Auto-trim silence
        </Button>
      </Hint>
      {shape}
      <Hint label="Length that will be written on export, versus the full generated clip.">
        <p className="font-mono text-xs text-muted">
          Export {formatClock(Math.max(0, trimEnd - trimStart))} of {formatClock(duration)}
        </p>
      </Hint>
      <Hint
        className="w-full flex-col"
        label="Format the Export button writes. Starts from the default audio format in Settings."
      >
        <div className="w-full">
          <Label htmlFor="export-format">Format</Label>
          <select
            id="export-format"
            className={selectClass}
            value={format}
            onChange={(e) => onFormat(e.target.value as AudioFormat)}
            aria-label="Export format"
          >
            {AUDIO_FORMATS.map((option) => (
              <option key={option} value={option}>
                {formatLabel(option)}
              </option>
            ))}
          </select>
        </div>
      </Hint>
      <div className="grid grid-cols-2 gap-2">
        <Hint className="w-full flex-col" label="44.1 kHz is the generate default. 48 kHz matches Unreal, Unity, and video.">
          <div className="w-full">
            <Label htmlFor="sample-rate">Rate</Label>
            <select
              id="sample-rate"
              className={selectClass}
              value={sampleRate}
              onChange={(e) => onSampleRate(Number(e.target.value) as SampleRateOption)}
              aria-label="Sample rate"
            >
              <option value={44100}>44.1 kHz</option>
              <option value={48000}>48 kHz</option>
            </select>
          </div>
        </Hint>
        <Hint className="w-full flex-col" label="16-bit PCM is the baseline. 24-bit is the game-engine and video master.">
          <div className="w-full">
            <Label htmlFor="bit-depth">Bits</Label>
            <select
              id="bit-depth"
              className={selectClass}
              value={bitDepth}
              onChange={(e) => onBitDepth(Number(e.target.value) as BitDepthOption)}
              aria-label="Bit depth"
            >
              <option value={16}>16-bit</option>
              <option value={24}>24-bit</option>
            </select>
          </div>
        </Hint>
      </div>
      {formatCaveat ? <p className="text-xs text-muted">{formatCaveat}</p> : null}
      <Hint label="Downmix to one channel for 3D positional emitters in a game engine.">
        <label className="flex items-center gap-2 text-sm text-cream">
          <Checkbox
            checked={mono}
            onCheckedChange={(value) => onMono(value === true)}
            aria-label="Mono downmix"
          />
          Mono downmix
        </label>
      </Hint>
      <div className="mt-auto flex shrink-0 flex-col gap-2 pt-2">
        <Hint
          className="w-full"
          label="Save the trim using the format, sample rate, bit depth, and mono setting above."
        >
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!hasClip || weaving}
            onClick={onExport}
            aria-label={`Export ${formatLabel(format)}`}
          >
            <Download /> Export {formatLabel(format)}
          </Button>
        </Hint>
        <Hint className="w-full" label="Export once in another format without changing the setting above. Compressed formats need the desktop app.">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" className="w-full" disabled={!hasClip || weaving}>
                More formats
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {otherFormats.map((option) => (
                <DropdownMenuItem key={option} onSelect={() => onExportFormat(option)}>
                  Export {formatLabel(option)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Hint>
      </div>
    </aside>
  )
}
