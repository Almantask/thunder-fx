import type { PrecisionMode } from '@/lib/types'

export function isPrecisionMode(value: unknown): value is PrecisionMode {
  return value === 'fp32' || value === 'fp16'
}

