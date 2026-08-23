import { describe, expect, it } from 'vitest'
import {
  base64ToBytes,
  bytesToBase64,
  generate,
  probeEngine,
  engineStatus,
  loadModel,
  reportError,
  readErrorLog,
} from '@/lib/engine'
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
    expect(status.loaded).toBe(true)
    const steps: number[] = []
    const phases: string[] = []
    const result = await generate(
      { prompt: 'iron gate', seconds: 1, seed: 9, cfg: 1, negative: '' },
      {
        onProgress: (p) => {
          steps.push(p.step)
          if (p.phase) phases.push(p.phase)
        },
        stepDelayMs: 0,
      },
    )
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(phases).toEqual(Array(8).fill('weaving'))
    expect(result.clip.prompt).toBe('iron gate')
    expect(result.wav.byteLength).toBeGreaterThan(44)
  })

  it('loadModel finishes without generating a clip', async () => {
    const ratios: number[] = []
    await loadModel((ratio) => ratios.push(ratio))
    expect(ratios.at(-1)).toBe(1)
  })

  it('reportError returns the message and ignores abort', () => {
    expect(reportError(new Error('omen'), 'fallback')).toBe('omen')
    expect(reportError('x', 'fallback')).toBe('fallback')
    expect(reportError(new DOMException('Generation cancelled', 'AbortError'), 'fallback')).toBe(
      'Generation cancelled',
    )
  })

  it('readErrorLog is empty outside the desktop keep', async () => {
    await expect(readErrorLog()).resolves.toBe('')
  })

  it('adds top 3 instruments to generated clip', async () => {
    const result = await generate(
      {
        prompt:
          'TrackType: Music, ancient ruins ambient, cello swells, lone flute, soft harp, taiko drums, 45 BPM',
        seconds: 2,
        seed: 1,
        cfg: 1,
        negative: '',
        mode: 'music',
      },
      { stepDelayMs: 0 },
    )
    expect(result.clip.instruments).toEqual(['cello', 'flute', 'harp'])
  })
})
