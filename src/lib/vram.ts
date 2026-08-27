export type VramPressure = 'ok' | 'warn' | 'critical'

export const VRAM_WARN_RATIO = 0.85
export const VRAM_CRITICAL_RATIO = 0.95

export function vramRatio(usedGb: number, totalGb: number): number {
  if (!(totalGb > 0) || !Number.isFinite(usedGb)) return 0
  return Math.max(0, usedGb) / totalGb
}

export function vramPressure(usedGb: number, totalGb: number): VramPressure {
  const ratio = vramRatio(usedGb, totalGb)
  if (ratio >= VRAM_CRITICAL_RATIO) return 'critical'
  if (ratio >= VRAM_WARN_RATIO) return 'warn'
  return 'ok'
}

export function formatVramShort(usedGb: number, totalGb: number): string {
  return `${usedGb.toFixed(1)} / ${totalGb.toFixed(1)} GB`
}

export function formatVramLabel(usedGb: number, totalGb: number): string {
  const pct = Math.round(vramRatio(usedGb, totalGb) * 100)
  return `VRAM: ${formatVramShort(usedGb, totalGb)} (${pct}%)`
}
