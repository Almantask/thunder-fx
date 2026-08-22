import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, generate, probeEngine, engineStatus } from '@/lib/engine'
import { isTauri } from '@/lib/utils'

describe('engine bridge', () => {
  it('is not Tauri inside Vitest', () => {
    expect(isTauri()).toBe(false)
  })

  it('round-trips base64', () => {
    const src = new Uint8Array([0, 1, 2, 250, 255]).buffer
    expect([...new Uint8Array(base64ToBytes(bytesToBase64(src)))]).toEqual([0, 1, 2, 250, 255])
  })

  it('falls back to the mock probe and generate', async () => {
    const probe = await probeEngine()
    expect(probe.ok).toBe(true)
    expect(probe.device).toBe('mock')
    const status = await engineStatus()
    expect(status.mock).toBe(true)
    const steps: number[] = []
    const result = await generate(
      { prompt: 'iron gate', seconds: 1, seed: 9, cfg: 1, negative: '' },
      { onProgress: (p) => steps.push(p.step), stepDelayMs: 0 },
    )
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(result.clip.prompt).toBe('iron gate')
    expect(result.wav.byteLength).toBeGreaterThan(44)
  })
})
