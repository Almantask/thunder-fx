import { useEffect, useRef } from 'react'
import { Hint } from '@/components/Hint'
import { Progress } from '@/components/ui/progress'
import {
  drawGoblinBand,
  getGoblinHitTarget,
  getGoblinInteractionPhrase,
  playGoblinInteractionSound,
  type GoblinInteraction,
  type GoblinTransition,
  type GoblinVisualState,
} from '@/lib/goblinBand'
import type { GenerateMode, WeavePhase } from '@/lib/types'
import { formatClock } from '@/lib/utils'
import { waveformPeaks, type WaveformPeaks } from '@/lib/wav'
import { weaveBarPercent, weaveBusyStatus } from '@/lib/weaveProgress'

type ScrollCanvasProps = {
  wav?: ArrayBuffer
  weaving: boolean
  loadingModel?: boolean
  modelLoaded?: boolean
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
  /**
   * Milliseconds left as of `nowMs`, asked fresh on every frame. A number prop
   * could only be as current as the last progress event; a run that slows down
   * between events would keep counting down at its old pace until the next one.
   */
  remainingAt?: (nowMs: number) => number | undefined
  mode?: GenerateMode
  seed?: number
  startedAt?: number
  completedSubcategoryCount?: number
  onTrim: (start: number, end: number) => void
  onSeek: (seconds: number) => void
  emptyLabel?: string
  stalled?: boolean
}

export function ScrollCanvas({
  wav,
  weaving,
  loadingModel = false,
  modelLoaded = false,
  rite,
  totalRites,
  elapsedMs,
  startedAt,
  duration,
  trimStart,
  trimEnd,
  playhead,
  phase,
  ratio,
  historicalEstimateMs,
  queueTailEstimateMs,
  remainingAt,
  mode = 'sfx',
  seed,
  completedSubcategoryCount = 0,
  onTrim,
  onSeek,
  emptyLabel = 'Describe a sound, then click Generate.',
  stalled = false,
}: ScrollCanvasProps) {
  const busy = weaving || loadingModel
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const statusRef = useRef<HTMLSpanElement>(null)
  const peaksRef = useRef<WaveformPeaks>({ min: new Float32Array(0), max: new Float32Array(0) })
  const riteRef = useRef(rite)
  const phaseRef = useRef<WeavePhase | undefined>(loadingModel ? 'loading' : phase)
  const ratioRef = useRef(ratio)
  const etaRef = useRef(historicalEstimateMs)
  const tailRef = useRef(queueTailEstimateMs)
  const remainingRef = useRef(remainingAt)
  const modeRef = useRef(mode)
  const startedAtRef = useRef(startedAt)
  const completedCountRef = useRef(completedSubcategoryCount)
  const playheadRef = useRef(playhead)
  const trimStartRef = useRef(trimStart)
  const trimEndRef = useRef(trimEnd)
  const durationRef = useRef(duration)
  const elapsedRef = useRef(elapsedMs)
  const totalRitesRef = useRef(totalRites)
  playheadRef.current = playhead
  trimStartRef.current = trimStart
  trimEndRef.current = trimEnd
  durationRef.current = duration
  elapsedRef.current = elapsedMs
  totalRitesRef.current = totalRites

  const targetVisualState: GoblinVisualState = loadingModel
    ? 'loading'
    : weaving
      ? 'playing'
      : modelLoaded && !wav
        ? 'resting'
        : 'hidden'

  const visualStateRef = useRef<GoblinVisualState>(targetVisualState)
  const prevTargetRef = useRef<GoblinVisualState>(targetVisualState)
  const transitionRef = useRef<{
    from: GoblinVisualState
    to: GoblinVisualState
    startTime: number
    duration: number
  } | null>(null)

  const interactionsRef = useRef<Map<number, GoblinInteraction>>(new Map())

  useEffect(() => {
    const prev = prevTargetRef.current
    if (prev !== targetVisualState) {
      prevTargetRef.current = targetVisualState
      if (targetVisualState === 'hidden') {
        visualStateRef.current = 'hidden'
        transitionRef.current = null
      } else if (prev !== 'hidden') {
        const fromState = visualStateRef.current
        let durationMs = 1200
        if (fromState === 'loading' && targetVisualState === 'resting') {
          durationMs = 1500
        } else if (fromState === 'resting' && targetVisualState === 'playing') {
          durationMs = 1000
        } else if (fromState === 'playing' && targetVisualState === 'resting') {
          durationMs = 1500
        } else if (fromState === 'hidden' && targetVisualState === 'loading') {
          durationMs = 600
        } else if (fromState === 'hidden' && targetVisualState === 'playing') {
          durationMs = 600
        } else if (fromState === 'hidden' && targetVisualState === 'resting') {
          durationMs = 600
        }

        transitionRef.current = {
          from: fromState,
          to: targetVisualState,
          startTime: Date.now(),
          duration: durationMs,
        }
      } else {
        visualStateRef.current = targetVisualState
      }
    }
  }, [targetVisualState])

  useEffect(() => {
    riteRef.current = rite
    phaseRef.current = loadingModel ? 'loading' : phase
    ratioRef.current = ratio
    etaRef.current = historicalEstimateMs
    tailRef.current = queueTailEstimateMs
    remainingRef.current = remainingAt
    modeRef.current = mode
    startedAtRef.current = startedAt
    completedCountRef.current = completedSubcategoryCount
  }, [
    rite,
    phase,
    loadingModel,
    ratio,
    historicalEstimateMs,
    queueTailEstimateMs,
    remainingAt,
    mode,
    startedAt,
    completedSubcategoryCount,
  ])

  const barIndicatorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    peaksRef.current = wav ? waveformPeaks(wav, 240) : { min: new Float32Array(0), max: new Float32Array(0) }
  }, [wav])

  const shouldAnimate = busy || targetVisualState !== 'hidden' || transitionRef.current !== null

  function drawStaticWaveform(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#16110d'
    ctx.fillRect(0, 0, width, height)
    const peaks = peaksRef.current
    const mid = height / 2
    if (!peaks.max.length) return
    const bar = width / peaks.max.length
    ctx.fillStyle = '#c4a35a'
    for (let i = 0; i < peaks.max.length; i += 1) {
      const hi = Math.max(0, peaks.max[i] ?? 0) * (height * 0.39)
      const lo = Math.max(0, -(peaks.min[i] ?? 0)) * (height * 0.39)
      const top = mid - Math.max(1, hi)
      const h = Math.max(2, hi + lo)
      ctx.globalAlpha = 0.85
      ctx.fillRect(i * bar, top, Math.max(1, bar - 1), h)
    }
    ctx.globalAlpha = 1
    const dur = durationRef.current || 1
    const x0 = (trimStartRef.current / dur) * width
    const x1 = (trimEndRef.current / dur) * width
    ctx.fillStyle = 'rgba(228, 195, 106, 0.16)'
    ctx.fillRect(x0, 0, x1 - x0, height)
    ctx.fillStyle = '#e4c36a'
    ctx.fillRect(x0 - 1, 0, 3, height)
    ctx.fillRect(x1 - 1, 0, 3, height)
    const px = (playheadRef.current / dur) * width
    ctx.fillStyle = '#f3e6c8'
    ctx.fillRect(px, 0, 2, height)
  }

  useEffect(() => {
    if (shouldAnimate) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawStaticWaveform(ctx, canvas.width, canvas.height)
  }, [shouldAnimate, wav, playhead, trimStart, trimEnd, duration])

  useEffect(() => {
    if (!shouldAnimate) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let raf = 0
    const tick = () => {
      const localStart =
        startedAtRef.current && startedAtRef.current > 0
          ? startedAtRef.current
          : Date.now() - (elapsedRef.current || 0)
      const localElapsed = Math.max(0, Date.now() - localStart)
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)

      // Handle active transitions
      let transitionData: GoblinTransition | undefined
      if (transitionRef.current) {
        const elapsedTrans = Date.now() - transitionRef.current.startTime
        const p = Math.min(1, elapsedTrans / transitionRef.current.duration)
        transitionData = {
          from: transitionRef.current.from,
          to: transitionRef.current.to,
          progress: p,
        }
        if (p >= 1) {
          visualStateRef.current = transitionRef.current.to
          transitionRef.current = null
        }
      }

      // Clean up expired interactions
      const now = Date.now()
      for (const [slot, inter] of interactionsRef.current.entries()) {
        if (now - inter.startTime >= inter.duration) {
          interactionsRef.current.delete(slot)
        }
      }

      drawGoblinBand({
        ctx,
        width,
        height,
        elapsedMs: localElapsed,
        rite: riteRef.current,
        totalRites: totalRitesRef.current,
        phase: phaseRef.current,
        mode: modeRef.current,
        completedCount: completedCountRef.current,
        visualState: visualStateRef.current,
        transition: transitionData,
        interactions: Object.fromEntries(interactionsRef.current.entries()),
      })

      if (busy) {
        // Recomputed per frame, not read from a prop: this is the number that
        // has to track the run's real pace rather than the last event's.
        const remainingMs = remainingRef.current?.(now)
        const pct = weaveBarPercent({
          step: riteRef.current,
          total: totalRitesRef.current,
          phase: phaseRef.current,
          ratio: ratioRef.current,
          elapsedMs: localElapsed,
          historicalEstimateMs: etaRef.current,
          queueTailEstimateMs: tailRef.current,
          remainingMs,
        })
        if (barIndicatorRef.current && pct != null) {
          barIndicatorRef.current.style.transform = `translateX(-${100 - pct}%)`
        }
        if (statusRef.current) {
          statusRef.current.textContent = weaveBusyStatus({
            phase: phaseRef.current,
            rite: riteRef.current,
            total: totalRitesRef.current,
            elapsedMs: localElapsed,
            ratio: ratioRef.current,
            historicalEstimateMs: etaRef.current,
            queueTailEstimateMs: tailRef.current,
            remainingMs,
          })
        }
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [shouldAnimate, busy, wav])

  const dragging = useRef<'start' | 'end' | 'seek' | null>(null)

  function posToTime(clientX: number): number {
    const canvas = canvasRef.current
    if (!canvas || duration <= 0) return 0
    const rect = canvas.getBoundingClientRect()
    const width = rect.width || canvas.clientWidth || canvas.width || 1
    const left = rect.left || 0
    const ratioX = Math.max(0, Math.min(1, (clientX - left) / width))
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

  const releaseCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = null
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      // setPointerCapture is not required; mouse move still drives the trim.
    }
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
                : 'Generation progress. Step count comes from the quality preset. Elapsed is wall clock. Remaining is recalculated from the measured pace of this run.'
            }
          >
            <p role="status" aria-live="polite" className="font-mono text-xs text-amber">
              {stalled ? (
                <span>Stalled · Cancel if it does not resume</span>
              ) : (
                <span ref={statusRef} />
              )}
              <span className="sr-only">
                {loadingModel || phase === 'loading'
                  ? 'Loading model'
                  : `Generating, step ${rite} of ${totalRites}`}
              </span>
            </p>
          </Hint>
        ) : (
          <Hint
            label={
              wav && Number.isFinite(seed)
                ? 'Length of the clip, in minutes:seconds.tenths, and the seed used to generate it.'
                : 'Length of the clip, in minutes:seconds.tenths.'
            }
          >
            <p className="font-mono text-xs text-muted">
              {formatClock(duration)}
              {wav && Number.isFinite(seed) ? ` · seed ${seed}` : ''}
            </p>
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
            indicatorRef={barIndicatorRef}
            indeterminate={false}
            mode={mode}
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
            const canvas = canvasRef.current
            if (canvas && visualStateRef.current !== 'hidden') {
              const rect = canvas.getBoundingClientRect()
              const w = rect.width || canvas.clientWidth || canvas.width || 960
              const h = rect.height || canvas.clientHeight || canvas.height || 280
              const left = rect.left || 0
              const top = rect.top || 0
              const canvasX = Math.max(0, Math.min(canvas.width, ((e.clientX - left) / w) * canvas.width))
              const canvasY = Math.max(0, Math.min(canvas.height, ((e.clientY - top) / h) * canvas.height))
              const hit = getGoblinHitTarget(
                canvasX,
                canvasY,
                canvas.width,
                canvas.height,
                visualStateRef.current,
                completedSubcategoryCount,
              )
              if (hit) {
                const phrase = getGoblinInteractionPhrase(
                  hit.slotIndex,
                  visualStateRef.current,
                  hit.member,
                  hit.instrument,
                  hit.role,
                )
                interactionsRef.current.set(hit.slotIndex, {
                  startTime: Date.now(),
                  duration: 1600,
                  text: phrase,
                })
                playGoblinInteractionSound(hit.slotIndex, visualStateRef.current)
                return
              }
            }

            if (!wav || busy) return
            const mode = pickMode(e.clientX)
            dragging.current = mode
            try {
              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
            } catch {
              // setPointerCapture can throw on a detached node; the drag still works.
            }
            applyPointer(e.clientX, mode)
          }}
          onPointerMove={(e) => {
            if (!dragging.current) {
              const canvas = canvasRef.current
              if (canvas && visualStateRef.current !== 'hidden') {
                const rect = canvas.getBoundingClientRect()
                const w = rect.width || canvas.clientWidth || canvas.width || 960
                const h = rect.height || canvas.clientHeight || canvas.height || 280
                const left = rect.left || 0
                const top = rect.top || 0
                const canvasX = Math.max(0, Math.min(canvas.width, ((e.clientX - left) / w) * canvas.width))
                const canvasY = Math.max(0, Math.min(canvas.height, ((e.clientY - top) / h) * canvas.height))
                const hit = getGoblinHitTarget(
                  canvasX,
                  canvasY,
                  canvas.width,
                  canvas.height,
                  visualStateRef.current,
                  completedSubcategoryCount,
                )
                if (hit) {
                  e.currentTarget.style.cursor = 'pointer'
                  return
                }
              }
              e.currentTarget.style.cursor = wav && !busy ? 'col-resize' : 'default'
              return
            }
            applyPointer(e.clientX, dragging.current)
          }}
          onPointerUp={releaseCapture}
          onPointerCancel={releaseCapture}
          onLostPointerCapture={() => {
            dragging.current = null
          }}
        >
          <canvas ref={canvasRef} width={960} height={280} className="size-full" />
          {!wav && !busy && !modelLoaded ? (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-muted">
              {emptyLabel}
            </p>
          ) : null}
        </div>
      </Hint>
    </section>
  )
}
