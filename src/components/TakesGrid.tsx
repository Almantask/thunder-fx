import { useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { promptName } from '@/lib/filename'
import { createPlayback, type PlaybackHandle } from '@/lib/playback'
import type { Clip } from '@/lib/types'
import { waveformPeaks } from '@/lib/wav'

export type TakeCandidate = {
  clip: Clip
  wav: ArrayBuffer
}

type TakesGridProps = {
  open: boolean
  takes: TakeCandidate[]
  parentSeed?: number
  onOpenChange: (open: boolean) => void
  onKeep: (ids: string[]) => void
  onDiscard: (ids: string[]) => void
}

export function TakesGrid({ open, takes, parentSeed, onOpenChange, onKeep, onDiscard }: TakesGridProps) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [kept, setKept] = useState<Set<string>>(() => new Set())
  const playbackRef = useRef<PlaybackHandle | null>(null)

  const tiles = useMemo(
    () =>
      takes.map((take, index) => ({
        ...take,
        index: index + 1,
        peaks: waveformPeaks(take.wav, 40),
      })),
    [takes],
  )

  async function playTake(take: TakeCandidate) {
    playbackRef.current?.dispose()
    playbackRef.current = null
    if (playingId === take.clip.id) {
      setPlayingId(null)
      return
    }
    const handle = await createPlayback(take.wav, () => setPlayingId(null))
    playbackRef.current = handle
    setPlayingId(take.clip.id)
    await handle.play(0, take.clip.duration, false, 0)
  }

  function stopPlayback() {
    playbackRef.current?.dispose()
    playbackRef.current = null
    setPlayingId(null)
  }

  function keepOne(id: string) {
    setKept((prev) => new Set(prev).add(id))
  }

  function discardOne(id: string) {
    if (playingId === id) stopPlayback()
    onDiscard([id])
  }

  function keepSelected() {
    stopPlayback()
    const ids = kept.size ? [...kept] : takes[0] ? [takes[0].clip.id] : []
    const leftover = takes.filter((take) => !ids.includes(take.clip.id)).map((take) => take.clip.id)
    if (ids.length) onKeep(ids)
    if (leftover.length) onDiscard(leftover)
    onOpenChange(false)
  }

  function closeAndDiscardRest(nextOpen: boolean) {
    if (!nextOpen) {
      stopPlayback()
      const leftover = takes.filter((take) => !kept.has(take.clip.id)).map((take) => take.clip.id)
      if (leftover.length) onDiscard(leftover)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={closeAndDiscardRest}>
      <DialogContent className="max-w-3xl" aria-describedby="takes-grid-desc">
        <DialogTitle>Four takes</DialogTitle>
        <DialogDescription id="takes-grid-desc">
          Same prompt, four seeds derived from one parent
          {Number.isFinite(parentSeed) ? ` (${parentSeed})` : ''}. Keep the ones you want in
          the library.
        </DialogDescription>
        <ul className="mt-4 grid grid-cols-2 gap-3" aria-label="Generation takes">
          {tiles.map((take) => {
            const selected = kept.has(take.clip.id)
            const playing = playingId === take.clip.id
            return (
              <li
                key={take.clip.id}
                className={`rounded-book border p-3 ${
                  selected
                    ? 'border-gold bg-leather-2'
                    : 'border-[color-mix(in_srgb,var(--color-gold)_28%,transparent)] bg-leather-2/50'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-sm text-cream">
                    Take {take.index}
                    <span className="ml-2 font-mono text-[11px] text-muted">seed {take.clip.seed}</span>
                  </p>
                  <Hint label={playing ? 'Stop this take.' : `Play ${promptName(take.clip.prompt, take.clip)}.`}>
                    <Button
                      type="button"
                      size="icon"
                      variant={playing ? 'default' : 'ghost'}
                      aria-label={playing ? `Stop take ${take.index}` : `Play take ${take.index}`}
                      onClick={() => void playTake(take)}
                    >
                      {playing ? <Pause /> : <Play />}
                    </Button>
                  </Hint>
                </div>
                <div className="mb-3 flex h-10 items-end gap-px" aria-hidden>
                  {Array.from(take.peaks.max, (peak, i) => {
                    const mag = Math.max(-(take.peaks.min[i] ?? 0), peak)
                    return (
                      <span
                        key={i}
                        className="flex-1 rounded-t-sm bg-gold/80"
                        style={{ height: `${Math.max(8, mag * 100)}%` }}
                      />
                    )
                  })}
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={selected ? 'default' : 'outline'} onClick={() => keepOne(take.clip.id)}>
                    Keep
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => discardOne(take.clip.id)}>
                    Discard
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => closeAndDiscardRest(false)}>
            Discard rest
          </Button>
          <Button type="button" onClick={keepSelected}>
            Keep selected
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
