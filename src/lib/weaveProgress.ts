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

export function weaveStatusLabel(
  phase: WeavePhase | undefined,
  rite: number,
  total: number,
  elapsedMs: number,
): string {
  const clock = formatClock(elapsedMs / 1000)
  if (phase === 'loading') return `Loading model · ${clock} elapsed`
  if (phase === 'writing') return `Saving WAV · ${clock} elapsed`
  if (rite <= 0) return `Generating · ${clock} elapsed`
  return `Step ${rite} of ${total} · ${clock} elapsed`
}
