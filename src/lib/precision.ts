import type { PrecisionMode } from '@/lib/types'

export function isPrecisionMode(value: unknown): value is PrecisionMode {
  return value === 'fp32' || value === 'fp16'
}

export function precisionLabel(mode: PrecisionMode): string {
  return mode === 'fp16' ? 'Low VRAM (FP16)' : 'Full precision (FP32)'
}
