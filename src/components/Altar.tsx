import { Download, Pause, Play, Repeat } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatClock } from '@/lib/utils'

type AltarProps = {
  hasClip: boolean
  weaving: boolean
  playing: boolean
  looping: boolean
  trimStart: number
  trimEnd: number
  duration: number
  onPlay: () => void
  onStop: () => void
  onLoop: (loop: boolean) => void
  onTrimStart: (value: number) => void
  onTrimEnd: (value: number) => void
  onExportWav: () => void
  onExportOgg: () => void
}

export function Altar({
  hasClip,
  weaving,
  playing,
  looping,
  trimStart,
  trimEnd,
  duration,
  onPlay,
  onStop,
  onLoop,
  onTrimStart,
  onTrimEnd,
  onExportWav,
  onExportOgg,
}: AltarProps) {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col gap-3 border-l border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)] bg-leather p-3">
      <Hint label="Preview, trim, and export the weave currently on the Scroll.">
        <h2 className="font-display text-sm tracking-[0.2em] text-muted">ALTAR</h2>
      </Hint>
      <div className="flex flex-wrap gap-2">
        <Hint
          label={
            playing
              ? 'Stop playback of the trimmed region.'
              : 'Play the trimmed region (In to Out) through the keep speakers.'
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
      <Hint className="w-full flex-col" label="Export start time in seconds. Drag the left gold handle on the Scroll, or type here.">
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
      <Hint className="w-full flex-col" label="Export end time in seconds. Drag the right gold handle on the Scroll, or type here.">
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
      <Hint label="Length that will be written on export, versus the full generated clip.">
        <p className="font-mono text-xs text-muted">
          Export {formatClock(Math.max(0, trimEnd - trimStart))} of {formatClock(duration)}
        </p>
      </Hint>
      <div className="mt-auto flex flex-col gap-2">
        <Hint className="w-full" label="Save the trim as 16-bit stereo PCM WAV at 44.1 kHz.">
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
        <Hint className="w-full" label="Other containers. OGG Vorbis is smaller; the sidecar encodes it.">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" className="w-full" disabled={!hasClip || weaving}>
                More formats
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                title="Encode the trim as OGG Vorbis through the sidecar. Smaller than WAV."
                onSelect={onExportOgg}
              >
                Export OGG Vorbis
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Hint>
      </div>
    </aside>
  )
}
