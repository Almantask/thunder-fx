import { Download, Pause, Play, Repeat } from 'lucide-react'
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
      <h2 className="font-display text-sm tracking-[0.2em] text-muted">ALTAR</h2>
      <div className="flex flex-wrap gap-2">
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
      </div>
      <div>
        <Label htmlFor="trim-in">In</Label>
        <Input
          id="trim-in"
          className="mt-1 font-mono"
          value={trimStart.toFixed(2)}
          onChange={(e) => onTrimStart(Number(e.target.value) || 0)}
          aria-label="Trim start seconds"
        />
      </div>
      <div>
        <Label htmlFor="trim-out">Out</Label>
        <Input
          id="trim-out"
          className="mt-1 font-mono"
          value={trimEnd.toFixed(2)}
          onChange={(e) => onTrimEnd(Number(e.target.value) || 0)}
          aria-label="Trim end seconds"
        />
      </div>
      <p className="font-mono text-xs text-muted">
        Export {formatClock(Math.max(0, trimEnd - trimStart))} of {formatClock(duration)}
      </p>
      <div className="mt-auto flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!hasClip || weaving}
          onClick={onExportWav}
          aria-label="Export WAV"
        >
          <Download /> Export WAV
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" disabled={!hasClip || weaving}>
              More formats
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onExportOgg}>Export OGG Vorbis</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
