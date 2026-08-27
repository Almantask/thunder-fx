import { clampGenerateSeconds } from '@/lib/duration'
import { parseInstrumentKeywords, type WavInfo } from '@/lib/instruments'

export const SAMPLE_RATE = 44_100
export const CHANNELS = 2
export const BITS_PER_SAMPLE = 16

export type WavAudio = {
  sampleRate: number
  channels: number
  bitsPerSample: number
  pcm: Int16Array
  info?: WavInfo
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

function latin1Zstr(text: string): Uint8Array {
  const chars = [...text].map((ch) => {
    const code = ch.charCodeAt(0)
    return code < 256 ? code : 63
  })
  chars.push(0)
  return Uint8Array.from(chars)
}

function readZstr(view: DataView, offset: number, size: number): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, size)
  let end = bytes.length
  const nul = bytes.indexOf(0)
  if (nul >= 0) end = nul
  return String.fromCharCode(...bytes.subarray(0, end))
}

function parseListInfo(view: DataView, offset: number, size: number): WavInfo | undefined {
  if (size < 4) return undefined
  const form = String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
  if (form !== 'INFO') return undefined
  const fields: Record<string, string> = {}
  let cursor = offset + 4
  const end = offset + size
  while (cursor + 8 <= end) {
    const id = String.fromCharCode(
      view.getUint8(cursor),
      view.getUint8(cursor + 1),
      view.getUint8(cursor + 2),
      view.getUint8(cursor + 3),
    )
    const chunkSize = view.getUint32(cursor + 4, true)
    if (cursor + 8 + chunkSize > end) break
    fields[id] = readZstr(view, cursor + 8, chunkSize)
    cursor += 8 + chunkSize + (chunkSize % 2)
  }
  const instruments = fields.IKEY
    ? parseInstrumentKeywords(fields.IKEY)
    : fields.ICMT
      ? parseInstrumentKeywords(fields.ICMT)
      : []
  if (!fields.INAM && !fields.ICMT && !fields.ISFT && !fields.IGNR && instruments.length === 0) {
    return undefined
  }
  return {
    title: fields.INAM || undefined,
    comment: fields.ICMT || undefined,
    software: fields.ISFT || undefined,
    genre: fields.IGNR || undefined,
    instruments,
  }
}

function infoSubchunk(id: string, text: string): Uint8Array {
  const payload = latin1Zstr(text)
  const pad = payload.length % 2
  const bytes = new Uint8Array(8 + payload.length + pad)
  for (let i = 0; i < 4; i += 1) bytes[i] = id.charCodeAt(i)
  new DataView(bytes.buffer).setUint32(4, payload.length, true)
  bytes.set(payload, 8)
  return bytes
}

function encodeListInfo(info: WavInfo): Uint8Array | undefined {
  const parts: Uint8Array[] = []
  if (info.title) parts.push(infoSubchunk('INAM', info.title))
  if (info.genre) parts.push(infoSubchunk('IGNR', info.genre))
  if (info.software) parts.push(infoSubchunk('ISFT', info.software))
  if (info.instruments.length) {
    parts.push(infoSubchunk('IKEY', info.instruments.join(';')))
    parts.push(infoSubchunk('ICMT', info.comment ?? `Instruments: ${info.instruments.join(', ')}`))
  } else if (info.comment) {
    parts.push(infoSubchunk('ICMT', info.comment))
  }
  if (!parts.length) return undefined
  const bodyLen = 4 + parts.reduce((sum, part) => sum + part.length, 0)
  const pad = bodyLen % 2
  const chunk = new Uint8Array(8 + bodyLen + pad)
  const view = new DataView(chunk.buffer)
  chunk[0] = 0x4c
  chunk[1] = 0x49
  chunk[2] = 0x53
  chunk[3] = 0x54
  view.setUint32(4, bodyLen, true)
  chunk[8] = 0x49
  chunk[9] = 0x4e
  chunk[10] = 0x46
  chunk[11] = 0x4f
  let offset = 12
  for (const part of parts) {
    chunk.set(part, offset)
    offset += part.length
  }
  return chunk
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
  let info: WavInfo | undefined
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
    } else if (id === 'LIST') {
      info = parseListInfo(view, offset + 8, size) ?? info
    }
    offset += 8 + size + (size % 2)
  }
  if (dataOffset < 0) throw new Error('WAVE data chunk missing')
  if (bitsPerSample !== 16) throw new Error('Only 16-bit PCM is supported')
  const pcm = new Int16Array(buffer, dataOffset, dataSize / 2)
  return { sampleRate, channels, bitsPerSample, pcm: new Int16Array(pcm), info }
}

function writePcm24(bytes: Uint8Array, offset: number, pcm: Int16Array): void {
  for (let i = 0; i < pcm.length; i += 1) {
    const v = (pcm[i] ?? 0) << 8
    const o = offset + i * 3
    bytes[o] = v & 0xff
    bytes[o + 1] = (v >> 8) & 0xff
    bytes[o + 2] = (v >> 16) & 0xff
  }
}

export function writeWav(audio: WavAudio): ArrayBuffer {
  const bits = audio.bitsPerSample === 24 ? 24 : 16
  const bytesPerSample = bits / 8
  const dataSize = (audio.pcm.length * bytesPerSample)
  const dataPad = dataSize % 2
  const list = audio.info ? encodeListInfo(audio.info) : undefined
  const listSize = list?.byteLength ?? 0
  const buffer = new ArrayBuffer(44 + dataSize + dataPad + listSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize + dataPad + listSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, audio.channels, true)
  view.setUint32(24, audio.sampleRate, true)
  const byteRate = (audio.sampleRate * audio.channels * bits) / 8
  view.setUint32(28, byteRate, true)
  view.setUint16(32, audio.channels * bytesPerSample, true)
  view.setUint16(34, bits, true)
  let dataHeader = 36
  if (list) {
    bytes.set(list, 36)
    dataHeader = 36 + listSize
  }
  writeStr(dataHeader, 'data')
  view.setUint32(dataHeader + 4, dataSize, true)
  if (bits === 24) {
    writePcm24(bytes, dataHeader + 8, audio.pcm)
  } else {
    new Int16Array(buffer, dataHeader + 8, audio.pcm.length).set(audio.pcm)
  }
  return buffer
}

export function tagWav(buffer: ArrayBuffer, info: WavInfo): ArrayBuffer {
  const wav = parseWav(buffer)
  return writeWav({ ...wav, info })
}

export const tagMusicWav = tagWav

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

export function generateMockMusicWav(seconds: number, seed: number): ArrayBuffer {
  const duration = clampGenerateSeconds(seconds)
  const frames = Math.round(duration * SAMPLE_RATE)
  const pcm = new Int16Array(frames * CHANNELS)
  const rand = mulberry32(seed <= 0 ? 1 : seed)
  const roots = [261.63, 329.63, 392.0, 349.23]
  for (let i = 0; i < frames; i += 1) {
    const t = i / SAMPLE_RATE
    const bar = Math.floor(t / 0.5) % roots.length
    const root = roots[bar] ?? 261.63
    const fifth = root * 1.5
    const oct = root * 2
    const pulse = 0.72 + 0.18 * Math.sin(2 * Math.PI * 2 * t)
    const melody = Math.sin(2 * Math.PI * oct * t) * 0.22
    const drone = Math.sin(2 * Math.PI * root * t) * 0.28 + Math.sin(2 * Math.PI * fifth * t) * 0.16
    const air = (rand() * 2 - 1) * 0.02
    const sample = Math.max(-1, Math.min(1, (drone + melody + air) * pulse))
    const v = Math.round(sample * 0.7 * 32767)
    pcm[i * 2] = v
    pcm[i * 2 + 1] = Math.round(v * 0.94)
  }
  return writeWav({
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitsPerSample: BITS_PER_SAMPLE,
    pcm,
  })
}

export function generateMockSfxWav(seconds: number, seed: number): ArrayBuffer {
  const duration = clampGenerateSeconds(seconds)
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

export function downloadArrayBuffer(
  buffer: ArrayBuffer,
  filename: string,
  mime = 'audio/wav',
): void {
  const blob = new Blob([buffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
