import { useEffect, useRef } from 'react'
import { Hint } from '@/components/Hint'
import { Progress } from '@/components/ui/progress'
import type { WeavePhase } from '@/lib/types'
import { formatClock } from '@/lib/utils'
import { waveformPeaks } from '@/lib/wav'
import { weaveBarPercent, weaveBusyStatus } from '@/lib/weaveProgress'

type ScrollCanvasProps = {
  wav?: ArrayBuffer
  weaving: boolean
  loadingModel?: boolean
  rite: number
  totalRites: number
  elapsedMs: number
  duration: number
  trimStart: number
  trimEnd: number
  playhead: number
  phase?: WeavePhase
  ratio?: number
  historicalEstimateMs?: number
  queueTailEstimateMs?: number
  onTrim: (start: number, end: number) => void
  onSeek: (seconds: number) => void
  emptyLabel?: string
}

function drawSigil(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
  rite: number,
  totalRites: number,
) {
  const mid = height / 2
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

export function ScrollCanvas({
  wav,
  weaving,
  loadingModel = false,
  rite,
  totalRites,
  elapsedMs,
  duration,
  trimStart,
  trimEnd,
  playhead,
  phase,
  ratio,
  historicalEstimateMs,
  queueTailEstimateMs,
  onTrim,
  onSeek,
  emptyLabel = 'Describe a sound, then click Generate.',
}: ScrollCanvasProps) {
  const busy = weaving || loadingModel
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const statusRef = useRef<HTMLSpanElement>(null)
  const peaksRef = useRef<Float32Array>(new Float32Array(0))
  const riteRef = useRef(rite)
  const phaseRef = useRef<WeavePhase | undefined>(loadingModel ? 'loading' : phase)
  const ratioRef = useRef(ratio)
  const etaRef = useRef(historicalEstimateMs)
  const tailRef = useRef(queueTailEstimateMs)

  useEffect(() => {
    riteRef.current = rite
    phaseRef.current = loadingModel ? 'loading' : phase
    ratioRef.current = ratio
    etaRef.current = historicalEstimateMs
    tailRef.current = queueTailEstimateMs
  }, [rite, phase, loadingModel, ratio, historicalEstimateMs, queueTailEstimateMs])

  const barValue = weaveBarPercent({
    step: rite,
    total: totalRites,
    phase,
    ratio,
  })

  useEffect(() => {
    peaksRef.current = wav ? waveformPeaks(wav, 240) : new Float32Array(0)
  }, [wav])

  useEffect(() => {
    if (busy) return
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
    if (!peaks.length) return
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
  }, [wav, busy, duration, trimStart, trimEnd, playhead])

  useEffect(() => {
    if (!busy) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const started = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const localElapsed = now - started
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#16110d'
      ctx.fillRect(0, 0, width, height)
      drawSigil(ctx, width, height, localElapsed, riteRef.current, totalRites)
      if (statusRef.current) {
        statusRef.current.textContent = weaveBusyStatus({
          phase: phaseRef.current,
          rite: riteRef.current,
          total: totalRites,
          elapsedMs: localElapsed,
          ratio: ratioRef.current,
          historicalEstimateMs: etaRef.current,
          queueTailEstimateMs: tailRef.current,
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [busy, totalRites])

  const dragging = useRef<'start' | 'end' | 'seek' | null>(null)

  function posToTime(clientX: number): number {
    const canvas = canvasRef.current
    if (!canvas || duration <= 0) return 0
    const rect = canvas.getBoundingClientRect()
    const ratioX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return ratioX * duration
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
    <section className="flex min-h-0 flex-1 flex-col px-4 py-3" aria-label="Waveform" aria-busy={busy}>
      <div className="mb-2 flex items-center justify-between">
        <Hint label="Waveform of the current clip. Blank until you generate or open a library clip.">
          <h2 className="font-display text-sm tracking-[0.2em] text-muted">WAVEFORM</h2>
        </Hint>
        {busy ? (
          <Hint
            label={
              loadingModel
                ? 'Model load progress. Elapsed is wall clock. Remaining is an estimate from this machine and current pace.'
                : 'Generation progress. Eight steps. Elapsed is wall clock. Remaining is an estimate from this machine and current pace.'
            }
          >
            <p role="status" aria-live="polite" className="font-mono text-xs text-amber">
              <span ref={statusRef}>
                {weaveBusyStatus({
                  phase: loadingModel ? 'loading' : phase,
                  rite,
                  total: totalRites,
                  elapsedMs,
                  ratio,
                  historicalEstimateMs,
                  queueTailEstimateMs,
                })}
              </span>
              <span className="sr-only">
                {loadingModel || phase === 'loading'
                  ? 'Loading model'
                  : `Generating, step ${rite} of ${totalRites}`}
              </span>
            </p>
          </Hint>
        ) : (
          <Hint label="Length of the clip, in minutes:seconds.tenths.">
            <p className="font-mono text-xs text-muted">{formatClock(duration)}</p>
          </Hint>
        )}
      </div>
      {busy ? (
        <Hint
          className="mb-2 w-full"
          label={
            loadingModel
              ? 'Model load progress. Putting Medium into VRAM. This is not generating a clip.'
              : 'Generation progress. The bar stays in motion so the app does not look frozen.'
          }
        >
          <Progress
            className="w-full"
            value={barValue ?? 0}
            indeterminate={barValue == null}
            aria-label={loadingModel ? 'Model load progress' : 'Generation progress'}
          />
        </Hint>
      ) : null}
      <Hint
        className="flex min-h-0 w-full flex-1"
        label={
          loadingModel
            ? 'Putting Medium into VRAM. This is not generating a clip.'
            : weaving
              ? 'Generation is in progress. The waveform appears when it finishes.'
              : wav
                ? 'Click to seek. Drag the gold handles to set In and Out for export.'
                : emptyLabel
        }
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label="Waveform. Click to seek. Drag gold handles to trim."
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={playhead}
          className="relative min-h-0 w-full flex-1 overflow-hidden rounded-book border border-[color-mix(in_srgb,var(--color-gold)_35%,transparent)]"
          onPointerDown={(e) => {
            if (!wav || busy) return
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
          {!wav && !busy ? (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-muted">
              {emptyLabel}
            </p>
          ) : null}
        </div>
      </Hint>
    </section>
  )
}
