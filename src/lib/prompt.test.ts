import { describe, expect, it } from 'vitest'
import { canCast } from '@/lib/prompt'

describe('canCast', () => {
  it('rejects prompts shorter than 3 trimmed characters', () => {
    expect(canCast('')).toBe(false)
    expect(canCast('  ab  ')).toBe(false)
  })

  it('allows a real prompt', () => {
    expect(canCast('fireball')).toBe(true)
  })
})
