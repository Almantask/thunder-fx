import { estimateRemainingMs, formatEstimateMs } from '@/lib/timing'
import type { WeavePhase, WeaveProgress } from '@/lib/types'
import { formatClock } from '@/lib/utils'

export function weaveBarPercent(
  progress: Pick<WeaveProgress, 'step' | 'total' | 'phase' | 'ratio'>,
): number | null {
  if (typeof progress.ratio === 'number' && Number.isFinite(progress.ratio) && progress.ratio > 0) {
    return Math.min(100, Math.max(0, progress.ratio * 100))
  }
  if ((progress.phase ?? 'loading') === 'loading' && progress.step <= 0) {
    return null
  }
  const total = progress.total || 8
  if (progress.step <= 0) return null
  return Math.min(100, Math.max(0, (progress.step / total) * 100))
}

export function weaveProgressRatio(
  progress: Pick<WeaveProgress, 'step' | 'total' | 'phase' | 'ratio'>,
): number | undefined {
  if (typeof progress.ratio === 'number' && Number.isFinite(progress.ratio) && progress.ratio > 0) {
    return Math.min(1, Math.max(0, progress.ratio))
  }
  if (progress.phase === 'writing') return 0.95
  const total = progress.total || 8
  if (progress.step > 0 && total > 0) return Math.min(1, progress.step / total)
  return undefined
}

export function weaveBusyStatus(args: {
  phase: WeavePhase | undefined
  rite: number
  total: number
  elapsedMs: number
  remainingMs?: number
  ratio?: number
  historicalEstimateMs?: number
  queueTailEstimateMs?: number
}): string {
  const remaining =
    args.remainingMs ??
    estimateRemainingMs({
      elapsedMs: args.elapsedMs,
      historicalTotalMs: args.historicalEstimateMs,
      progress: weaveProgressRatio({
        step: args.rite,
        total: args.total,
        phase: args.phase,
        ratio: args.ratio,
      }),
      queueTailMs: args.queueTailEstimateMs,
    })
  return weaveStatusLabel(args.phase, args.rite, args.total, args.elapsedMs, remaining)
}

export function weaveStatusLabel(
  phase: WeavePhase | undefined,
  rite: number,
  total: number,
  elapsedMs: number,
  remainingMs?: number,
): string {
  const clock = formatClock(elapsedMs / 1000)
  let label = `Generating · ${clock} elapsed`
  if (phase === 'loading') label = `Loading model · ${clock} elapsed`
  else if (phase === 'writing') label = `Saving WAV · ${clock} elapsed`
  else if (rite > 0) label = `Step ${rite} of ${total} · ${clock} elapsed`
  const remaining = formatEstimateMs(remainingMs)
  if (remaining) return `${label} · ${remaining} remaining`
  return label
}
