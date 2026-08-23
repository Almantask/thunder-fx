export type PlaybackHandle = {
  play(startSec: number, endSec: number, loop: boolean, fromSec?: number): Promise<void>
  stop(): void
  seek(seconds: number): void
  getCurrentTime(): number
  dispose(): void
}

export async function createPlayback(
  buffer: ArrayBuffer,
  onEnded?: () => void,
): Promise<PlaybackHandle> {
  const Ctx = globalThis.AudioContext
  if (typeof Ctx === 'undefined') {
    let offset = 0
    return {
      async play(_startSec, _endSec, _loop, fromSec) {
        if (typeof fromSec === 'number') {
          offset = fromSec
        }
      },
      stop() {},
      seek(seconds) {
        offset = seconds
      },
      getCurrentTime() {
        return offset
      },
      dispose() {},
    }
  }
  const ctx = new Ctx()
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
      const s = source
      source = null
      s.onended = null
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
      s.disconnect()
      offset = Math.min(trimEnd, offset + (ctx.currentTime - startedAt))
    }
    playing = false
  }

  const startFrom = (from: number) => {
    stop()
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    const clamped = Math.max(trimStart, Math.min(from, trimEnd - 0.01))
    const currentSource = ctx.createBufferSource()
    source = currentSource
    currentSource.buffer = decoded
    currentSource.loop = looping
    if (looping) {
      currentSource.loopStart = trimStart
      currentSource.loopEnd = trimEnd
    }
    currentSource.connect(ctx.destination)
    currentSource.onended = () => {
      if (source === currentSource) {
        source = null
        playing = false
        offset = trimEnd
        onEnded?.()
      }
    }
    currentSource.start(0, clamped, looping ? undefined : Math.max(0.01, trimEnd - clamped))
    startedAt = ctx.currentTime
    offset = clamped
    playing = true
  }

  const onVisibility = () => {
    if (document.hidden) stop()
  }
  document.addEventListener('visibilitychange', onVisibility)

  return {
    async play(startSec, endSec, loop, fromSec) {
      trimStart = startSec
      trimEnd = endSec
      looping = loop
      const startPoint =
        typeof fromSec === 'number'
          ? fromSec
          : offset >= startSec && offset < endSec
            ? offset
            : startSec
      startFrom(startPoint)
    },
    stop,
    seek(seconds) {
      if (playing) startFrom(seconds)
      else offset = seconds
    },
    getCurrentTime() {
      if (!playing) return offset
      if (looping && trimEnd > trimStart) {
        const elapsed = ctx.currentTime - startedAt
        const firstSegment = trimEnd - offset
        if (elapsed < firstSegment) {
          return offset + elapsed
        }
        const loopDuration = trimEnd - trimStart
        return trimStart + ((elapsed - firstSegment) % loopDuration)
      }
      return Math.min(trimEnd, offset + (ctx.currentTime - startedAt))
    },
    dispose() {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      void ctx.close()
    },
  }
}
