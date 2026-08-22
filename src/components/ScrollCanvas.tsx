import { useEffect, useRef } from 'react'
import { waveformPeaks } from '@/lib/wav'
import { formatClock } from '@/lib/utils'

type ScrollCanvasProps = {
  wav?: ArrayBuffer
  weaving: boolean
  rite: number
  totalRites: number
  elapsedMs: number
  duration: number
  trimStart: number
  trimEnd: number
  playhead: number
  onTrim: (start: number, end: number) => void
  onSeek: (seconds: number) => void
}

export function ScrollCanvas({
  wav,
  weaving,
  rite,
  totalRites,
  elapsedMs,
  duration,
  trimStart,
  trimEnd,
  playhead,
  onTrim,
  onSeek,
}: ScrollCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peaksRef = useRef<Float32Array>(new Float32Array(0))

  useEffect(() => {
    peaksRef.current = wav ? waveformPeaks(wav, 240) : new Float32Array(0)
  }, [wav])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#16110d'
    ctx.fillRect(0, 0, width, height)
    const peaks = peaksRef.current
    const mid = height / 2
    if (peaks.length && !weaving) {
      const bar = width / peaks.length
      ctx.fillStyle = '#c4a35a'
      for (let i = 0; i < peaks.length; i += 1) {
        const h = Math.max(2, peaks[i] * (height * 0.78))
        ctx.globalAlpha = 0.85
        ctx.fillRect(i * bar, mid - h / 2, Math.max(1, bar - 1), h)
      }
      ctx.globalAlpha = 1
      const x0 = (trimStart / duration) * width
      const x1 = (trimEnd / duration) * width
      ctx.fillStyle = 'rgba(228, 195, 106, 0.16)'
      ctx.fillRect(x0, 0, x1 - x0, height)
      ctx.fillStyle = '#e4c36a'
      ctx.fillRect(x0 - 1, 0, 3, height)
      ctx.fillRect(x1 - 1, 0, 3, height)
      const px = (playhead / duration) * width
      ctx.fillStyle = '#f3e6c8'
      ctx.fillRect(px, 0, 2, height)
    } else if (weaving) {
      ctx.strokeStyle = '#c4a35a'
      ctx.lineWidth = 2
      const radius = 42 + Math.sin(elapsedMs / 400) * 4
      ctx.beginPath()
      ctx.arc(width / 2, mid, radius, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < totalRites; i += 1) {
        const a = (Math.PI * 2 * i) / totalRites - Math.PI / 2
        ctx.beginPath()
        ctx.arc(width / 2 + Math.cos(a) * 70, mid + Math.sin(a) * 70, 5, 0, Math.PI * 2)
        ctx.fillStyle = i < rite ? '#e4c36a' : '#3a2e24'
        ctx.fill()
      }
    }
  }, [wav, weaving, rite, totalRites, elapsedMs, duration, trimStart, trimEnd, playhead])

  const dragging = useRef<'start' | 'end' | 'seek' | null>(null)

  function posToTime(clientX: number): number {
    const canvas = canvasRef.current
    if (!canvas || duration <= 0) return 0
    const rect = canvas.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  function applyPointer(clientX: number, mode: 'start' | 'end' | 'seek' | null) {
    const t = posToTime(clientX)
    if (mode === 'start') onTrim(Math.min(t, trimEnd - 0.05), trimEnd)
    else if (mode === 'end') onTrim(trimStart, Math.max(t, trimStart + 0.05))
    else onSeek(t)
  }

  function pickMode(clientX: number): 'start' | 'end' | 'seek' {
    const t = posToTime(clientX)
    const threshold = Math.max(0.05, duration * 0.03)
    if (Math.abs(t - trimStart) <= threshold) return 'start'
    if (Math.abs(t - trimEnd) <= threshold) return 'end'
    return 'seek'
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col px-4 py-3" aria-label="Scroll">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm tracking-[0.2em] text-muted">SCROLL</h2>
        {weaving ? (
          <p role="status" aria-live="polite" className="font-mono text-xs text-amber">
            Rite {rite} of {totalRites} · {formatClock(elapsedMs / 1000)} elapsed
            <span className="sr-only">
              {`Generating, step ${rite} of ${totalRites}`}
            </span>
          </p>
        ) : (
          <p className="font-mono text-xs text-muted">{formatClock(duration)}</p>
        )}
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Waveform. Click to seek. Drag gold handles to trim."
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={playhead}
        className="relative min-h-0 flex-1 overflow-hidden rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)]"
        onPointerDown={(e) => {
          if (!wav || weaving) return
          const mode = pickMode(e.clientX)
          dragging.current = mode
          ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
          applyPointer(e.clientX, mode)
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          applyPointer(e.clientX, dragging.current)
        }}
        onPointerUp={() => {
          dragging.current = null
        }}
      >
        <canvas ref={canvasRef} width={960} height={280} className="size-full" />
        {!wav && !weaving ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-muted">
            The scroll is blank. Speak an incantation and Cast.
          </p>
        ) : null}
      </div>
    </section>
  )
}
