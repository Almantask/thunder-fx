import { describe, expect, it } from 'vitest'
import { appendChip, canCast } from '@/lib/prompt'

describe('canCast', () => {
  it('rejects prompts shorter than 3 trimmed characters', () => {
    expect(canCast('')).toBe(false)
    expect(canCast('  ab  ')).toBe(false)
  })

  it('allows a real prompt', () => {
    expect(canCast('fireball')).toBe(true)
  })
})

describe('appendChip', () => {
  it('inserts the first chip into an empty well', () => {
    expect(appendChip('', 'close mic')).toBe('close mic')
  })

  it('appends with a comma and does not duplicate', () => {
    expect(appendChip('TrackType: SFX', 'close mic')).toBe('TrackType: SFX, close mic')
    expect(appendChip('TrackType: SFX, close mic', 'close mic')).toBe(
      'TrackType: SFX, close mic',
    )
  })
})
