import { describe, expect, it } from 'vitest'
import { clipFilename, slugifyPrompt } from '@/lib/filename'

describe('clipFilename', () => {
  it('builds a stable game-ready name', () => {
    expect(
      clipFilename('TrackType: SFX, steel shortsword leaving a leather scabbard', 8, 'wav'),
    ).toBe('steel-shortsword-leaving-a-leather-scabbard-8s.wav')
  })

  it('falls back when the prompt is empty', () => {
    expect(slugifyPrompt('!!!')).toBe('incantation')
  })
})
