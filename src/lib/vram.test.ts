import { describe, expect, it } from 'vitest'
import { formatVramLabel, formatVramShort, vramPressure } from '@/lib/vram'

describe('vram', () => {
  it('formats used vs total capacity', () => {
    expect(formatVramShort(4.8, 8)).toBe('4.8 / 8.0 GB')
    expect(formatVramLabel(4.8, 8)).toBe('VRAM: 4.8 / 8.0 GB (60%)')
  })

  it('warns at 85% and goes critical at 95%', () => {
    expect(vramPressure(6.7, 8)).toBe('ok')
    expect(vramPressure(6.8, 8)).toBe('warn')
    expect(vramPressure(7.6, 8)).toBe('critical')
  })
})
