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
import { Slider } from '@/components/ui/slider'
import type { AudioFormat, BitDepthOption, SampleRateOption } from '@/lib/audioExport'
import { DEFAULT_CROSSFADE_SEC, MAX_CROSSFADE_SEC, MIN_CROSSFADE_SEC } from '@/lib/seamlessLoop'
import type { GenerateMode } from '@/lib/types'
import { formatClock } from '@/lib/utils'

type AltarProps = {
  mode?: GenerateMode
  hasClip: boolean
  weaving: boolean
  playing: boolean
  looping: boolean
  trimStart: number
  trimEnd: number
  duration: number
  sampleRate: SampleRateOption
  bitDepth: BitDepthOption
  mono: boolean
  seamlessLoop: boolean
  crossfadeSec: number
  onPlay: () => void
  onStop: () => void
  onLoop: (loop: boolean) => void
  onTrimStart: (value: number) => void
  onTrimEnd: (value: number) => void
  onAutoTrim: () => void
  onSampleRate: (value: SampleRateOption) => void
  onBitDepth: (value: BitDepthOption) => void
  onMono: (value: boolean) => void
  onSeamlessLoop: (value: boolean) => void
  onCrossfadeSec: (value: number) => void
  onPreviewLoop: () => void
  onExportWav: () => void
  onExportFormat: (format: AudioFormat) => void
}

const selectClass =
  'mt-1 h-8 w-full rounded-book border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-leather-2 px-2 font-mono text-xs text-cream'

export function Altar({
  mode = 'music',
  hasClip,
  weaving,
  playing,
  looping,
  trimStart,
  trimEnd,
  duration,
  sampleRate,
  bitDepth,
  mono,
  seamlessLoop,
  crossfadeSec,
  onPlay,
  onStop,
  onLoop,
  onTrimStart,
  onTrimEnd,
  onAutoTrim,
  onSampleRate,
  onBitDepth,
  onMono,
  onSeamlessLoop,
  onCrossfadeSec,
  onPreviewLoop,
  onExportWav,
  onExportFormat,
}: AltarProps) {
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
      <Hint label="Length that will be written on export, versus the full generated clip.">
        <p className="font-mono text-xs text-muted">
          Export {formatClock(Math.max(0, trimEnd - trimStart))} of {formatClock(duration)}
        </p>
      </Hint>
      {mode === 'music' ? (
        <>
          <Hint
            className="w-full"
            label="Blend the tail into the head so beds and music loop without a click. Preview plays the processed loop."
          >
            <label className="flex w-full items-center gap-2 text-sm text-cream">
              <Checkbox
                checked={seamlessLoop}
                onCheckedChange={(value) => onSeamlessLoop(value === true)}
                aria-label="Seamless loop"
              />
              Seamless loop
            </label>
          </Hint>
          {seamlessLoop ? (
            <>
              <Hint className="w-full flex-col" label="Equal-power crossfade length, 0.5 to 3 seconds.">
                <div className="w-full">
                  <Label htmlFor="crossfade">Crossfade {crossfadeSec.toFixed(1)}s</Label>
                  <Slider
                    id="crossfade"
                    className="mt-2"
                    min={MIN_CROSSFADE_SEC}
                    max={MAX_CROSSFADE_SEC}
                    step={0.1}
                    value={[crossfadeSec]}
                    onValueChange={(v) => onCrossfadeSec(v[0] ?? DEFAULT_CROSSFADE_SEC)}
                    aria-label="Crossfade seconds"
                  />
                </div>
              </Hint>
              <Hint label="Play the crossfaded loop to check for a gap or click before export.">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={!hasClip || weaving}
                  onClick={onPreviewLoop}
                  aria-label="Preview seamless loop"
                >
                  Preview loop
                </Button>
              </Hint>
            </>
          ) : null}
        </>
      ) : null}
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
        <Hint className="w-full" label="Save the trim as WAV using the sample rate, bit depth, and mono setting above.">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!hasClip || weaving}
            onClick={onExportWav}
            aria-label="Export WAV"
          >
            <Download /> Export WAV
          </Button>
        </Hint>
        <Hint className="w-full" label="FLAC, MP3 320 kbps, and OGG Vorbis. Compressed formats need the desktop app.">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" className="w-full" disabled={!hasClip || weaving}>
                More formats
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => onExportFormat('flac')}>Export FLAC</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExportFormat('mp3')}>Export MP3 320</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onExportFormat('ogg')}>Export OGG Vorbis</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Hint>
      </div>
    </aside>
  )
}
