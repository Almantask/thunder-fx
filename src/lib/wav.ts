export const SAMPLE_RATE = 44_100
export const CHANNELS = 2
export const BITS_PER_SAMPLE = 16

export type WavAudio = {
  sampleRate: number
  channels: number
  bitsPerSample: number
  pcm: Int16Array
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function parseWav(buffer: ArrayBuffer): WavAudio {
  const view = new DataView(buffer)
  const tag = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    )
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file')
  }
  let offset = 12
  let sampleRate = SAMPLE_RATE
  let channels = CHANNELS
  let bitsPerSample = BITS_PER_SAMPLE
  let dataOffset = -1
  let dataSize = 0
  while (offset + 8 <= view.byteLength) {
    const id = tag(offset)
    const size = view.getUint32(offset + 4, true)
    if (id === 'fmt ') {
      channels = view.getUint16(offset + 10, true)
      sampleRate = view.getUint32(offset + 12, true)
      bitsPerSample = view.getUint16(offset + 22, true)
    } else if (id === 'data') {
      dataOffset = offset + 8
      dataSize = size
      break
    }
    offset += 8 + size + (size % 2)
  }
  if (dataOffset < 0) throw new Error('WAVE data chunk missing')
  if (bitsPerSample !== 16) throw new Error('Only 16-bit PCM is supported')
  const pcm = new Int16Array(buffer, dataOffset, dataSize / 2)
  return { sampleRate, channels, bitsPerSample, pcm: new Int16Array(pcm) }
}

export function writeWav(audio: WavAudio): ArrayBuffer {
  const dataSize = audio.pcm.byteLength
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, audio.channels, true)
  view.setUint32(24, audio.sampleRate, true)
  const byteRate = (audio.sampleRate * audio.channels * audio.bitsPerSample) / 8
  view.setUint32(28, byteRate, true)
  view.setUint16(32, (audio.channels * audio.bitsPerSample) / 8, true)
  view.setUint16(34, audio.bitsPerSample, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  new Int16Array(buffer, 44).set(audio.pcm)
  return buffer
}

export function wavDurationSeconds(buffer: ArrayBuffer): number {
  const wav = parseWav(buffer)
  return wav.pcm.length / wav.channels / wav.sampleRate
}

export function trimWav(
  buffer: ArrayBuffer,
  startSec: number,
  endSec: number,
): ArrayBuffer {
  const wav = parseWav(buffer)
  const total = wav.pcm.length / wav.channels
  const start = Math.max(0, Math.min(total - 1, Math.floor(startSec * wav.sampleRate)))
  const end = Math.max(start + 1, Math.min(total, Math.ceil(endSec * wav.sampleRate)))
  const frames = end - start
  const pcm = new Int16Array(frames * wav.channels)
  pcm.set(wav.pcm.subarray(start * wav.channels, end * wav.channels))
  return writeWav({ ...wav, pcm })
}

export function generateMockSfxWav(seconds: number, seed: number): ArrayBuffer {
  const duration = Math.min(30, Math.max(0.5, seconds))
  const frames = Math.round(duration * SAMPLE_RATE)
  const pcm = new Int16Array(frames * CHANNELS)
  const rand = mulberry32(seed <= 0 ? 1 : seed)
  for (let i = 0; i < frames; i += 1) {
    const t = i / SAMPLE_RATE
    const env = Math.exp(-t * 3.2) * (t < 0.012 ? t / 0.012 : 1)
    const hit = Math.sin(2 * Math.PI * (90 + t * 40) * t) * 0.55
    const grit = (rand() * 2 - 1) * 0.35
    const body = Math.sin(2 * Math.PI * 55 * t) * 0.4
    const sample = Math.max(-1, Math.min(1, (hit + grit + body) * env))
    const v = Math.round(sample * 0.85 * 32767)
    pcm[i * 2] = v
    pcm[i * 2 + 1] = Math.round(v * 0.92)
  }
  return writeWav({
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitsPerSample: BITS_PER_SAMPLE,
    pcm,
  })
}

export function waveformPeaks(buffer: ArrayBuffer, buckets: number): Float32Array {
  const wav = parseWav(buffer)
  const frames = wav.pcm.length / wav.channels
  const peaks = new Float32Array(Math.max(1, buckets))
  const step = frames / peaks.length
  for (let i = 0; i < peaks.length; i += 1) {
    const start = Math.floor(i * step)
    const end = Math.floor((i + 1) * step)
    let max = 0
    for (let f = start; f < end; f += 1) {
      const s = Math.abs(wav.pcm[f * wav.channels] ?? 0) / 32768
      if (s > max) max = s
    }
    peaks[i] = max
  }
  return peaks
}
