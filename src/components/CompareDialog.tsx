import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { applyGainDb, rmsDbfs } from '@/lib/audioEdit'
import { createPlayback, type PlaybackHandle } from '@/lib/playback'
import { wavDurationSeconds } from '@/lib/wav'
import { cn } from '@/lib/utils'

export type CompareSide = {
  id: string
  name: string
  wav: ArrayBuffer
}

export type CompareDialogProps = {
  open: boolean
  a?: CompareSide
  b?: CompareSide
  onOpenChange: (open: boolean) => void
}

type Slot = 'a' | 'b'

/**
 * Level-matched A/B.
 *
 * Without matching, the louder take wins almost every time regardless of which
 * is better — the single most reliable way to fool yourself when comparing
 * audio. Matching RMS first is what makes the comparison about the sound.
 *
 * Switching sides keeps the playhead, so the same moment is heard both ways.
 */
export function CompareDialog({ open, a, b, onOpenChange }: CompareDialogProps) {
  const [side, setSide] = useState<Slot>('a')
  const [playing, setPlaying] = useState(false)
  const [matched, setMatched] = useState(true)
  const [ready, setReady] = useState(false)
  const handles = useRef<Partial<Record<Slot, PlaybackHandle>>>({})
  const positionRef = useRef(0)

  const trim = useRef({ a: 0, b: 0 })

  useEffect(() => {
    if (!open || !a || !b) return
    let cancelled = false
    setReady(false)
    setPlaying(false)
    positionRef.current = 0

    void (async () => {
      // Bring the quieter clip up to the louder one, so neither is judged on
      // level. Gain is applied to a copy; the library files are untouched.
      const rmsA = rmsDbfs(a.wav)
      const rmsB = rmsDbfs(b.wav)
      const usable = Number.isFinite(rmsA) && Number.isFinite(rmsB)
      const target = usable ? Math.max(rmsA, rmsB) : 0
      const bufferA = matched && usable ? applyGainDb(a.wav, target - rmsA) : a.wav
      const bufferB = matched && usable ? applyGainDb(b.wav, target - rmsB) : b.wav

      try {
        trim.current = {
          a: wavDurationSeconds(a.wav),
          b: wavDurationSeconds(b.wav),
        }
        const [handleA, handleB] = await Promise.all([
          createPlayback(bufferA, () => setPlaying(false)),
          createPlayback(bufferB, () => setPlaying(false)),
        ])
        if (cancelled) {
          handleA.dispose()
          handleB.dispose()
          return
        }
        handles.current = { a: handleA, b: handleB }
        setReady(true)
      } catch {
        /* Preview is optional; the dialog still shows both names. */
      }
    })()

    return () => {
      cancelled = true
      for (const handle of Object.values(handles.current)) handle?.dispose()
      handles.current = {}
    }
  }, [open, a, b, matched])

  useEffect(() => {
    if (!open) {
      for (const handle of Object.values(handles.current)) handle?.stop()
      setPlaying(false)
    }
  }, [open])

  function stop() {
    for (const handle of Object.values(handles.current)) handle?.stop()
    setPlaying(false)
  }

  function start(next: Slot, from: number) {
    const handle = handles.current[next]
    if (!handle) return
    const end = trim.current[next]
    void handle.play(0, end, false, Math.min(from, Math.max(0, end - 0.05)))
    setPlaying(true)
  }

  function togglePlay() {
    if (playing) {
      positionRef.current = handles.current[side]?.getCurrentTime() ?? 0
      stop()
      return
    }
    start(side, positionRef.current)
  }

  /** Swaps sides mid-play without losing the position — the point of an A/B. */
  function selectSide(next: Slot) {
    if (next === side) return
    const at = playing ? (handles.current[side]?.getCurrentTime() ?? 0) : positionRef.current
    positionRef.current = at
    setSide(next)
    if (playing) {
      stop()
      start(next, at)
    }
  }

  // Held in a ref so the listener below registers once, rather than on every
  // position change while a comparison is playing.
  const shortcutRef = useRef({ selectSide, togglePlay, ready })
  shortcutRef.current = { selectSide, togglePlay, ready }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (!shortcutRef.current.ready) return
      const key = event.key.toLowerCase()
      if (key === 'a' || key === 'b') {
        event.preventDefault()
        shortcutRef.current.selectSide(key)
      } else if (event.key === ' ') {
        event.preventDefault()
        shortcutRef.current.togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const sides: { slot: Slot; entry?: CompareSide }[] = [
    { slot: 'a', entry: a },
    { slot: 'b', entry: b },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="compare-desc">
        <DialogTitle>Compare takes</DialogTitle>
        <DialogDescription id="compare-desc">
          Switch between two clips at the same moment in each. Levels are matched by default, so the
          louder take does not simply win.
        </DialogDescription>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Comparison side">
            {sides.map(({ slot, entry }) => (
              <Hint key={slot} label={`Listen to ${entry?.name ?? slot.toUpperCase()}.`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={side === slot}
                  disabled={!entry}
                  className={cn(
                    'flex min-h-16 flex-col justify-center rounded-book border border-[color-mix(in_srgb,var(--color-gold)_28%,transparent)] p-3 text-left transition-colors hover:bg-leather-2/60 focus-visible:ring-1 focus-visible:ring-gold focus-visible:outline-none disabled:opacity-50',
                    side === slot &&
                      'border-gold bg-[color-mix(in_srgb,var(--color-gold)_18%,var(--color-leather))]',
                  )}
                  onClick={() => selectSide(slot)}
                >
                  <span className="font-display text-xs tracking-[0.2em] text-muted">
                    {slot.toUpperCase()}
                  </span>
                  <span className="truncate text-sm text-cream">{entry?.name ?? 'Not selected'}</span>
                </button>
              </Hint>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Hint label={playing ? 'Stop playback.' : 'Play the selected side from where it left off.'}>
              <Button
                type="button"
                variant="outline"
                disabled={!ready}
                onClick={togglePlay}
                aria-label={playing ? 'Stop comparison' : 'Play comparison'}
                aria-pressed={playing}
              >
                {playing ? <Pause /> : <Play />}
                {playing ? 'Stop' : 'Play'}
              </Button>
            </Hint>
            <Hint label="Match the two clips to the same RMS level before playing. Off compares them as generated.">
              <label className="flex items-center gap-2 text-sm text-cream">
                <Checkbox
                  checked={matched}
                  onCheckedChange={(value) => setMatched(value === true)}
                  aria-label="Match levels"
                />
                Match levels
              </label>
            </Hint>
          </div>

          <p className="text-xs text-muted">
            Press A and B while this is open to switch sides, and space to play or stop.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
