/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlayback } from '@/lib/playback'
import { generateMockSfxWav } from '@/lib/wav'

class MockAudioBufferSourceNode {
  buffer: unknown = null
  loop: boolean = false
  loopStart: number = 0
  loopEnd: number = 0
  onended: (() => void) | null = null
  started = false
  stopped = false
  startOffset = 0
  startDuration?: number

  connect() {}
  disconnect() {}
  start(_when = 0, offset = 0, duration?: number) {
    this.started = true
    this.startOffset = offset
    this.startDuration = duration
  }
  stop() {
    this.stopped = true
    // Simulate real browser behavior: stopping schedules an async ended event
    queueMicrotask(() => {
      if (this.onended) {
        this.onended()
      }
    })
  }
}

class MockAudioContext {
  currentTime = 10
  state = 'running'
  destination = {}
  createdSources: MockAudioBufferSourceNode[] = []

  async decodeAudioData(_buffer: ArrayBuffer) {
    return {
      duration: 5.0,
      numberOfChannels: 2,
      sampleRate: 44100,
    }
  }

  createBufferSource() {
    const src = new MockAudioBufferSourceNode()
    this.createdSources.push(src)
    return src as unknown as AudioBufferSourceNode
  }

  async resume() {
    this.state = 'running'
  }

  async close() {
    this.state = 'closed'
  }
}

describe('createPlayback', () => {
  it('returns a silent handle when AudioContext is missing', async () => {
    const handle = await createPlayback(generateMockSfxWav(0.5, 1))
    await expect(handle.play(0, 0.5, false)).resolves.toBeUndefined()
    handle.seek(0.2)
    expect(handle.getCurrentTime()).toBe(0.2)
    handle.dispose()
  })

  describe('with AudioContext', () => {
    const originalAudioContext = globalThis.AudioContext

    beforeEach(() => {
      vi.stubGlobal('AudioContext', MockAudioContext)
    })

    afterEach(() => {
      if (originalAudioContext) {
        vi.stubGlobal('AudioContext', originalAudioContext)
      } else {
        vi.unstubAllGlobals()
      }
    })

    it('allows seeking forward multiple times during playback', async () => {
      const handle = await createPlayback(generateMockSfxWav(5.0, 1))
      await handle.play(0, 5.0, false)

      // First seek forward to 1.5s
      handle.seek(1.5)
      // Allow any queued microtasks (e.g. previous node stop onended) to fire
      await new Promise((r) => setTimeout(r, 10))

      // Second seek forward to 3.0s
      handle.seek(3.0)
      await new Promise((r) => setTimeout(r, 10))

      // Third seek forward to 4.2s
      handle.seek(4.2)
      await new Promise((r) => setTimeout(r, 10))

      expect(handle.getCurrentTime()).toBe(4.2)
      handle.dispose()
    })

    it('updates position when seeking multiple times while paused and resumes from seek point', async () => {
      const handle = await createPlayback(generateMockSfxWav(5.0, 1))
      handle.seek(1.5)
      expect(handle.getCurrentTime()).toBe(1.5)
      handle.seek(3.2)
      expect(handle.getCurrentTime()).toBe(3.2)
      handle.seek(0.8)
      expect(handle.getCurrentTime()).toBe(0.8)

      await handle.play(0, 5.0, false)
      expect(handle.getCurrentTime()).toBe(0.8)
      handle.dispose()
    })

    it('allows stopping and seeking again repeatedly', async () => {
      const handle = await createPlayback(generateMockSfxWav(5.0, 1))
      await handle.play(0, 5.0, false)
      handle.seek(2.0)
      expect(handle.getCurrentTime()).toBe(2.0)

      handle.stop()
      handle.seek(1.0)
      expect(handle.getCurrentTime()).toBe(1.0)

      handle.seek(3.5)
      expect(handle.getCurrentTime()).toBe(3.5)

      await handle.play(0, 5.0, false)
      expect(handle.getCurrentTime()).toBe(3.5)
      handle.dispose()
    })
  })
})

