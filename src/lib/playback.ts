export type PlaybackHandle = {
  play(startSec: number, endSec: number, loop: boolean): Promise<void>
  stop(): void
  seek(seconds: number): void
  getCurrentTime(): number
  dispose(): void
}

export async function createPlayback(buffer: ArrayBuffer): Promise<PlaybackHandle> {
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(buffer.slice(0))
  let source: AudioBufferSourceNode | null = null
  let startedAt = 0
  let offset = 0
  let trimStart = 0
  let trimEnd = decoded.duration
  let looping = false
  let playing = false

  const stop = () => {
    if (source) {
      try {
        source.stop()
      } catch {
        /* already stopped */
      }
      source.disconnect()
      source = null
    }
    playing = false
  }

  const startFrom = (from: number) => {
    stop()
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    const clamped = Math.max(trimStart, Math.min(from, trimEnd - 0.01))
    source = ctx.createBufferSource()
    source.buffer = decoded
    source.loop = looping
    if (looping) {
      source.loopStart = trimStart
      source.loopEnd = trimEnd
    }
    source.connect(ctx.destination)
    source.onended = () => {
      playing = false
    }
    source.start(0, clamped, looping ? undefined : Math.max(0.01, trimEnd - clamped))
    startedAt = ctx.currentTime
    offset = clamped
    playing = true
  }

  const onVisibility = () => {
    if (document.hidden) stop()
  }
  document.addEventListener('visibilitychange', onVisibility)

  return {
    async play(startSec, endSec, loop) {
      trimStart = startSec
      trimEnd = endSec
      looping = loop
      startFrom(startSec)
    },
    stop,
    seek(seconds) {
      if (playing) startFrom(seconds)
      else offset = seconds
    },
    getCurrentTime() {
      if (!playing) return offset
      return offset + (ctx.currentTime - startedAt)
    },
    dispose() {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      void ctx.close()
    },
  }
}
