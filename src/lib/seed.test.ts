import { describe, expect, it } from 'vitest'
import { deriveTakeSeed, MAX_SEED, resolveSeed } from '@/lib/seed'

describe('deriveTakeSeed', () => {
  it('is stable for a parent seed and take index', () => {
    expect(deriveTakeSeed(42, 0)).toBe(deriveTakeSeed(42, 0))
    expect(deriveTakeSeed(42, 1)).not.toBe(deriveTakeSeed(42, 0))
    expect(deriveTakeSeed(42, 0)).not.toBe(deriveTakeSeed(43, 0))
  })

  it('stays inside the engine seed range', () => {
    for (const parent of [1, 42, MAX_SEED, 0x7fffffff]) {
      for (let i = 0; i < 8; i += 1) {
        const seed = deriveTakeSeed(parent, i)
        expect(seed).toBeGreaterThan(0)
        expect(seed).toBeLessThanOrEqual(MAX_SEED)
      }
    }
  })

  it('keeps a take set of four distinct', () => {
    const seeds = [0, 1, 2, 3].map((i) => deriveTakeSeed(99, i))
    expect(new Set(seeds).size).toBe(4)
  })
})

describe('resolveSeed', () => {
  it('keeps an explicit seed and replaces -1', () => {
    expect(resolveSeed(7)).toBe(7)
    expect(resolveSeed(-1)).toBeGreaterThan(0)
  })
})
