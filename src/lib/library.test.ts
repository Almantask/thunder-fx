import { describe, expect, it } from 'vitest'
import { createMemoryLibrary } from '@/lib/library'
import { mockGenerate } from '@/lib/mockEngine'
import { generateMockSfxWav, parseWav } from '@/lib/wav'

describe('memory library', () => {
  it('saves newest first and deletes', async () => {
    const wav = generateMockSfxWav(1, 1)
    const store = createMemoryLibrary()
    await store.save(
      {
        id: 'a',
        prompt: 'first',
        duration: 1,
        seed: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        cfg: 1,
        negative: '',
      },
      wav,
    )
    await store.save(
      {
        id: 'b',
        prompt: 'second',
        duration: 1,
        seed: 2,
        createdAt: '2026-01-02T00:00:00.000Z',
        cfg: 1,
        negative: '',
      },
      wav,
    )
    expect((await store.list()).map((c) => c.id)).toEqual(['b', 'a'])
    await store.delete('b')
    expect((await store.list()).map((c) => c.id)).toEqual(['a'])
  })
})

describe('app and disk library', () => {
  it('creates a disk library that delegates to scanDiskLibrary and handles save as no-op', async () => {
    const { createDiskLibrary } = await import('@/lib/library')
    const diskLib = createDiskLibrary(() => 'E:\\sfx')
    expect(diskLib).toBeDefined()
    expect(typeof diskLib.list).toBe('function')
    expect(typeof diskLib.getWav).toBe('function')
    expect(typeof diskLib.delete).toBe('function')
    expect(typeof diskLib.save).toBe('function')
    // save is a safe no-op on desktop
    await expect(
      diskLib.save(
        {
          id: 'test',
          prompt: 'test',
          duration: 1,
          seed: 1,
          createdAt: '',
          cfg: 1,
          negative: '',
        },
        new ArrayBuffer(0),
      ),
    ).resolves.toBeUndefined()
  })

  it('selects memory/idb library when not running in Tauri', async () => {
    const { createAppLibrary } = await import('@/lib/library')
    const appLib = createAppLibrary(() => 'E:\\sfx')
    expect(appLib).toBeDefined()
  })
})

describe('mockGenerate', () => {
  it('reports default twenty steps then returns a clip', async () => {
    const steps: number[] = []
    const result = await mockGenerate(
      { prompt: 'tavern door', seconds: 1, seed: 4, cfg: 1, negative: '' },
      { onProgress: (p) => steps.push(p.step), stepDelayMs: 0 },
    )
    expect(steps).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(result.clip.prompt).toBe('tavern door')
    expect(result.clip.seed).toBe(4)
    expect(result.clip.steps).toBe(20)
    expect(result.clip.mode).toBe('sfx')
    expect(result.wav.byteLength).toBeGreaterThan(44)
  })

  it('supports explicit step count in mockGenerate', async () => {
    const steps: number[] = []
    const result = await mockGenerate(
      { prompt: 'tavern door', seconds: 1, seed: 4, cfg: 1, steps: 8, negative: '' },
      { onProgress: (p) => steps.push(p.step), stepDelayMs: 0 },
    )
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(result.clip.steps).toBe(8)
  })


  it('tags music clips and uses the instrumental mock', async () => {
    const sfx = await mockGenerate(
      { prompt: 'door', seconds: 1, seed: 4, cfg: 1, negative: '', mode: 'sfx' },
      { stepDelayMs: 0 },
    )
    const music = await mockGenerate(
      { prompt: 'lute', seconds: 1, seed: 4, cfg: 1, negative: '', mode: 'music' },
      { stepDelayMs: 0 },
    )
    expect(music.clip.mode).toBe('music')
    expect(music.clip.instruments).toEqual(['lute'])
    expect(parseWav(music.wav).info?.instruments).toEqual(['lute'])
    expect(parseWav(music.wav).info?.category).toBe('Custom')
    expect(parseWav(music.wav).info?.intensity).toBe('Level I — Quiet looping bed')
    expect(parseWav(music.wav).info?.comment).toContain('Instruments: lute')
    expect([...new Uint8Array(music.wav)]).not.toEqual([...new Uint8Array(sfx.wav)])
  })

  it('bakes a seamless wrap into looped music at the requested length', async () => {
    const { loopWrapJump } = await import('@/lib/seamlessLoop')
    const raw = await mockGenerate(
      { prompt: 'lute', seconds: 4, seed: 4, cfg: 1, negative: '', mode: 'music' },
      { stepDelayMs: 0 },
    )
    const looped = await mockGenerate(
      {
        prompt: 'lute',
        seconds: 4,
        seed: 4,
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

  it('tags ambience clips without instruments and can loop them', async () => {
    const raw = await mockGenerate(
      {
        prompt: 'TrackType: SFX, heavy rain, steady bed',
        seconds: 4,
        seed: 4,
        cfg: 1,
        negative: '',
        mode: 'ambience',
      },
      { stepDelayMs: 0 },
    )
    const looped = await mockGenerate(
      {
        prompt: 'TrackType: SFX, heavy rain, steady bed',
        seconds: 4,
        seed: 4,
        cfg: 1,
        negative: '',
        mode: 'ambience',
        seamlessLoop: true,
      },
      { stepDelayMs: 0 },
    )
    expect(raw.clip.mode).toBe('ambience')
    expect(raw.clip.instruments).toBeUndefined()
    expect(parseWav(raw.wav).info?.genre).toBe('Ambience')
    expect(looped.clip.duration).toBeCloseTo(4, 1)
    expect(new Uint8Array(looped.wav).slice(44, 200)).not.toEqual(new Uint8Array(raw.wav).slice(44, 200))
  })
})
