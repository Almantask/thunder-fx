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

describe('mockGenerate', () => {
  it('reports eight steps then returns a clip', async () => {
    const steps: number[] = []
    const result = await mockGenerate(
      { prompt: 'tavern door', seconds: 1, seed: 4, cfg: 1, negative: '' },
      { onProgress: (p) => steps.push(p.step), stepDelayMs: 0 },
    )
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(result.clip.prompt).toBe('tavern door')
    expect(result.clip.seed).toBe(4)
    expect(result.clip.mode).toBe('sfx')
    expect(result.wav.byteLength).toBeGreaterThan(44)
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
    expect(parseWav(music.wav).info?.comment).toBe('Instruments: lute')
    expect([...new Uint8Array(music.wav)]).not.toEqual([...new Uint8Array(sfx.wav)])
  })
})
