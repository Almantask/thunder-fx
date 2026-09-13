import { formatEstimateMs } from '@/lib/timing'
import type { WeavePhase, WeaveProgress } from '@/lib/types'
import { formatClock } from '@/lib/utils'

/**
 * Progress bar fill. One estimator: `remainingMs` from `liveRemainingMs` once a
 * run exists, the historical total before the first event, otherwise
 * indeterminate. Never a synthetic curve.
 */
export function weaveBarPercent(
  progress: Pick<WeaveProgress, 'step' | 'total' | 'phase' | 'ratio'> & {
    elapsedMs?: number
    historicalEstimateMs?: number
    remainingMs?: number
    queueTailEstimateMs?: number
  },
): number | null {
  if (typeof progress.ratio === 'number' && Number.isFinite(progress.ratio) && progress.ratio > 0) {
    return Math.min(100, Math.max(0, progress.ratio * 100))
  }
  if (progress.phase === 'writing') {
    return 96
  }

  const elapsed = progress.elapsedMs
  const remaining = progress.remainingMs
  if (
    remaining != null &&
    Number.isFinite(remaining) &&
    elapsed != null &&
    Number.isFinite(elapsed) &&
    elapsed + remaining > 0
  ) {
    return Math.min(95, Math.max(1, (elapsed / (elapsed + remaining)) * 100))
  }

  if (
    elapsed != null &&
    Number.isFinite(elapsed) &&
    elapsed >= 0 &&
    progress.historicalEstimateMs != null &&
    progress.historicalEstimateMs > 0
  ) {
    if (elapsed <= 0) return 1
    return Math.min(95, Math.max(1, (elapsed / progress.historicalEstimateMs) * 100))
  }

  return null
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

function statusRemainingMs(args: {
  elapsedMs: number
  remainingMs?: number
  historicalEstimateMs?: number
  queueTailEstimateMs?: number
}): number | undefined {
  if (args.remainingMs != null && Number.isFinite(args.remainingMs)) return args.remainingMs
  const historical =
    args.historicalEstimateMs != null
      ? Math.max(0, args.historicalEstimateMs - args.elapsedMs)
      : undefined
  const tail = Math.max(0, args.queueTailEstimateMs ?? 0)
  if (historical == null) return tail > 0 ? tail : undefined
  return historical + tail
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
  return weaveStatusLabel(
    args.phase,
    args.rite,
    args.total,
    args.elapsedMs,
    statusRemainingMs(args),
  )
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
