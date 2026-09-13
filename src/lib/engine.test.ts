/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import {
  generate,
  probeEngine,
  engineStatus,
  enginePing,
  loadModel,
  unloadModel,
  reportError,
  readErrorLog,
} from '@/lib/engine'
import { parseWav } from '@/lib/wav'
import { isTauri } from '@/lib/utils'

describe('engine bridge', () => {
  it('is not Tauri inside Vitest', () => {
    expect(isTauri()).toBe(false)
  })

  it('falls back to the mock probe and generate', async () => {
    const probe = await probeEngine()
    expect(probe.ok).toBe(true)
    expect(probe.device).toBe('mock')
    const status = await engineStatus()
    expect(status.mock).toBe(true)
    expect(status.loaded).toBe(true)
    expect(status.vramTotalGb).toBe(8)
    expect(status.gpuName).toBe('mock')
    expect(await enginePing()).toBe(false)
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
    expect(steps).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(phases).toEqual(Array(20).fill('weaving'))
    expect(result.clip.prompt).toBe('iron gate')
    expect(result.clip.steps).toBe(20)
    expect(result.clip.cfg).toBe(1)
    expect(result.wav.byteLength).toBeGreaterThan(44)

  })

  it('locks CFG at 1 even when a request asks for more', async () => {
    const result = await generate(
      { prompt: 'iron gate', seconds: 1, seed: 9, cfg: 7, negative: '' },
      { stepDelayMs: 0 },
    )
    expect(result.clip.cfg).toBe(1)
  })

  it('loadModel finishes without generating a clip', async () => {
    const ratios: number[] = []
    await loadModel((ratio) => ratios.push(ratio))
    expect(ratios.at(-1)).toBe(1)
  })

  it('unloadModel finishes without error outside Tauri', async () => {
    await expect(unloadModel()).resolves.toBeUndefined()
  })

  it('loadModel can be cancelled via AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(loadModel(undefined, { signal: controller.signal })).rejects.toThrow(
      'Model load cancelled',
    )
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

  it('passes a looped ambience generate through the mock engine', async () => {
    const raw = await generate(
      {
        prompt: 'TrackType: SFX, heavy rain, steady bed',
        seconds: 4,
        seed: 1,
        cfg: 1,
        negative: '',
        mode: 'ambience',
      },
      { stepDelayMs: 0 },
    )
    const looped = await generate(
      {
        prompt: 'TrackType: SFX, heavy rain, steady bed',
        seconds: 4,
        seed: 1,
        cfg: 1,
        negative: '',
        mode: 'ambience',
        seamlessLoop: true,
      },
      { stepDelayMs: 0 },
    )
    expect(looped.clip.mode).toBe('ambience')
    expect(looped.clip.instruments).toBeUndefined()
    expect(looped.clip.duration).toBeCloseTo(4, 1)
    expect(parseWav(looped.wav).pcm.subarray(0, 2048)).not.toEqual(parseWav(raw.wav).pcm.subarray(0, 2048))
  })

  it('passes a looped music generate through the mock engine', async () => {
    const { loopWrapJump } = await import('@/lib/seamlessLoop')
    const raw = await generate(
      {
        prompt: 'TrackType: Music, lute',
        seconds: 4,
        seed: 1,
        cfg: 1,
        negative: '',
        mode: 'music',
      },
      { stepDelayMs: 0 },
    )
    const looped = await generate(
      {
        prompt: 'TrackType: Music, lute',
        seconds: 4,
        seed: 1,
        cfg: 1,
        negative: '',
        mode: 'music',
        seamlessLoop: true,
      },
      { stepDelayMs: 0 },
    )
    expect(looped.clip.duration).toBeCloseTo(4, 1)
    expect(loopWrapJump(looped.wav)).toBeLessThan(loopWrapJump(raw.wav))
  })
})
