import { downloadArrayBuffer } from '@/lib/library'
import {
  mockDownloadProgress,
  mockGenerate,
  mockProbe,
  mockStatus,
  type GenerateHandlers,
} from '@/lib/mockEngine'
import type {
  Clip,
  EngineStatus,
  GenerateRequest,
  GenerateResult,
  SetupProbe,
  WeaveProgress,
} from '@/lib/types'
import { isTauri } from '@/lib/utils'
import { tagMusicWav, wavDurationSeconds } from '@/lib/wav'
import { extractInstruments, musicWavInfo } from '@/lib/instruments'
import { loadSettings } from '@/lib/setup'

function hfToken(): string {
  return loadSettings().hfToken.trim()
}

type EngineMsg = {
  event?: string
  message?: string
  path?: string
  seed?: number
  duration?: number
  prompt?: string
  ready?: boolean
  mock?: boolean
  loaded?: boolean
  device?: string
  ok?: boolean
  flavor?: string
  technical?: string
}

function throwIfEngineError(msg: EngineMsg): void {
  if (msg.event !== 'error') return
  const message = msg.message ?? 'Engine error'
  if (/dispelled|cancelled/i.test(message)) {
    throw new DOMException('Generation cancelled', 'AbortError')
  }
  throw new Error(message)
}

export function reportError(err: unknown, fallback: string): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return err.message || 'Generation cancelled'
  }
  const message = err instanceof Error ? err.message : fallback
  const detail = err instanceof Error ? err.stack : undefined
  void logClientError(message, detail)
  return message
}

export async function logClientError(message: string, detail?: string): Promise<void> {
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('log_error', { message, detail: detail ?? null })
  } catch {
    /* logging must never break the studio */
  }
}

export async function errorLogPath(): Promise<string | null> {
  if (!isTauri()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('error_log_path')
  } catch {
    return null
  }
}

export async function revealErrorLog(): Promise<void> {
  const path = await errorLogPath()
  if (!path) return
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  await revealItemInDir(path)
}

export async function libraryPath(): Promise<string | null> {
  if (!isTauri()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('library_path')
  } catch {
    return null
  }
}

export async function revealLibrary(path?: string): Promise<void> {
  const target = path?.trim() || (await libraryPath())
  if (!target) return
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  await revealItemInDir(target)
}

export async function pickDirectory(defaultPath?: string): Promise<string | null> {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({
    directory: true,
    defaultPath: defaultPath?.trim() || undefined,
  })
  return typeof selected === 'string' ? selected : null
}

export async function readErrorLog(): Promise<string> {
  if (!isTauri()) return ''
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('read_error_log')
  } catch {
    return ''
  }
}

export function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function joinPath(dir: string, file: string): string {
  if (!dir) return file
  const sep = dir.includes('/') && !dir.includes('\\') ? '/' : '\\'
  return `${dir.replace(/[\\/]+$/, '')}${sep}${file}`
}

function clipIdFromPath(path: string): string {
  const name = path.split(/[/\\]/).pop() ?? ''
  return name.replace(/\.wav$/i, '') || crypto.randomUUID()
}

export async function probeEngine(): Promise<SetupProbe> {
  if (!isTauri()) return mockProbe()
  const { invoke } = await import('@tauri-apps/api/core')
  const result = await invoke<EngineMsg>('engine_probe', { hfToken: hfToken() })
  throwIfEngineError(result)
  return {
    ok: Boolean(result.ok),
    flavor: result.flavor ?? '',
    technical: result.technical ?? result.message ?? '',
    device: result.device ?? 'unknown',
  }
}

export async function engineStatus(): Promise<EngineStatus> {
  if (!isTauri()) return mockStatus()
  const { invoke } = await import('@tauri-apps/api/core')
  const result = await invoke<EngineMsg>('engine_status')
  throwIfEngineError(result)
  return {
    ready: Boolean(result.ready),
    mock: Boolean(result.mock),
    loaded: Boolean(result.loaded) || Boolean(result.mock),
    device: result.device ?? 'unknown',
    message: result.message ?? '',
  }
}

export async function cancelGenerate(): Promise<void> {
  if (!isTauri()) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('engine_cancel')
}

export async function generate(
  request: GenerateRequest,
  handlers: GenerateHandlers = {},
): Promise<GenerateResult> {
  if (!isTauri()) return mockGenerate(request, handlers)
  const { invoke } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')
  const unlisten = await listen<WeaveProgress>('weave-progress', (ev) => {
    handlers.onProgress?.(ev.payload)
  })
  const onAbort = () => {
    void cancelGenerate()
  }
  handlers.signal?.addEventListener('abort', onAbort)
  if (handlers.signal?.aborted) {
    onAbort()
  }
  try {
    const mode = request.mode === 'music' ? 'music' : 'sfx'
    const instruments =
      mode === 'music' ? (request.instruments ?? extractInstruments(request.prompt)) : []
    const result = await invoke<EngineMsg>('engine_generate', {
      prompt: request.prompt,
      seconds: request.seconds,
      seed: request.seed,
      cfg: request.cfg,
      negative: request.negative,
      hfToken: hfToken(),
      libraryDir: request.libraryDir?.trim() || loadSettings().libraryDir.trim() || null,
      mode,
      instruments,
    })
    throwIfEngineError(result)
    if (!result.path) throw new Error('Engine did not return a WAV path')
    const b64 = await invoke<string>('read_file_b64', { path: result.path })
    let wav = base64ToBytes(b64)
    if (mode === 'music') {
      wav = tagMusicWav(wav, musicWavInfo(request.prompt, instruments))
      await invoke('write_file_b64', { path: result.path, data: bytesToBase64(wav) })
    }
    const clip: Clip = {
      id: clipIdFromPath(result.path),
      prompt: request.prompt.trim(),
      duration: wavDurationSeconds(wav),
      seed: result.seed ?? request.seed,
      createdAt: new Date().toISOString(),
      cfg: request.cfg,
      negative: request.negative,
      mode,
      instruments: instruments.length ? instruments : undefined,
    }
    return { clip, wav }
  } finally {
    handlers.signal?.removeEventListener('abort', onAbort)
    unlisten()
  }
}

export async function loadModel(onProgress?: (ratio: number) => void): Promise<void> {
  await scribeWeights(onProgress ?? (() => {}))
}

export async function scribeWeights(onProgress: (ratio: number) => void): Promise<void> {
  if (!isTauri()) return mockDownloadProgress(onProgress, 40)
  const status = await engineStatus()
  if (status.mock) {
    await mockDownloadProgress(onProgress, 40)
    return
  }
  const { invoke } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')
  const unlisten = await listen<WeaveProgress>('scribe-progress', (ev) => {
    const ratio = ev.payload.ratio
    if (typeof ratio === 'number' && Number.isFinite(ratio) && ratio > 0) {
      onProgress(Math.min(1, ratio))
      return
    }
    if (ev.payload.phase === 'loading' && ev.payload.step <= 0) return
    const total = ev.payload.total || 1
    onProgress(Math.min(1, ev.payload.step / total))
  })
  try {
    const result = await invoke<EngineMsg>('engine_warmup', { hfToken: hfToken() })
    throwIfEngineError(result)
    onProgress(1)
  } finally {
    unlisten()
  }
}

export async function exportClipFile(options: {
  buffer: ArrayBuffer
  filename: string
  format: 'wav' | 'ogg'
  defaultDir?: string
}): Promise<string | null> {
  if (!isTauri()) {
    if (options.format === 'ogg') {
      throw new Error('OGG export needs the desktop app.')
    }
    downloadArrayBuffer(options.buffer, options.filename, 'audio/wav')
    return null
  }
  const { invoke } = await import('@tauri-apps/api/core')
  const { save } = await import('@tauri-apps/plugin-dialog')
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  const defaultPath = joinPath(options.defaultDir ?? '', options.filename)
  const path = await save({
    defaultPath,
    filters:
      options.format === 'ogg'
        ? [{ name: 'OGG Vorbis', extensions: ['ogg'] }]
        : [{ name: 'WAV', extensions: ['wav'] }],
  })
  if (!path) return null
  if (options.format === 'ogg') {
    const temp = await invoke<string>('temp_dir')
    const wavPath = joinPath(temp, 'thunder-fx-export.wav')
    await invoke('write_file_b64', { path: wavPath, data: bytesToBase64(options.buffer) })
    const encoded = await invoke<EngineMsg>('engine_encode_ogg', {
      wavPath,
      oggPath: path,
    })
    throwIfEngineError(encoded)
  } else {
    await invoke('write_file_b64', { path, data: bytesToBase64(options.buffer) })
  }
  try {
    await revealItemInDir(path)
  } catch {
    /* reveal is best-effort */
  }
  return path
}
