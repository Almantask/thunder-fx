import { describe, expect, it } from 'vitest'
import { createPlayback } from '@/lib/playback'
import { generateMockSfxWav } from '@/lib/wav'

describe('createPlayback', () => {
  it('returns a silent handle when AudioContext is missing', async () => {
    const handle = await createPlayback(generateMockSfxWav(0.5, 1))
    await expect(handle.play(0, 0.5, false)).resolves.toBeUndefined()
    handle.seek(0.2)
    expect(handle.getCurrentTime()).toBe(0.2)
    handle.dispose()
  })
})
