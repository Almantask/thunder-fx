import {
  mockDownloadProgress,
  mockGenerate,
  mockProbe,
  mockStatus,
  type GenerateHandlers,
} from '@/lib/mockEngine'
import type {
  CategorySummary,
  Clip,
  EngineStatus,
  GenerateMode,
  GenerateRequest,
  GenerateResult,
  PrecisionMode,
  SetupProbe,
  WeaveProgress,
} from '@/lib/types'
import { isTauri } from '@/lib/utils'
import type {
  AudioFormat,
  BitDepthOption,
  SampleRateOption,
} from '@/lib/audioExport'
import { formatMime, formatNeedsDesktop, prepareExportWav } from '@/lib/audioExport'
import { buildZipStore } from '@/lib/zipStore'
import { downloadArrayBuffer, tagWav, wavDurationSeconds } from '@/lib/wav'
import { clipWavInfo, extractInstruments } from '@/lib/instruments'
import { clampGenerateSeconds } from '@/lib/duration'
import { loadSettings } from '@/lib/setup'
import {
  inferClipCategory,
  inferClipIntensity,
  inferClipSubcategory,
} from '@/lib/promptCatalog'

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
  vramUsedGb?: number
  vramTotalGb?: number
  vramAllocatedGb?: number
  vramReservedGb?: number
  gpuName?: string
  gpuTempC?: number
  precision?: PrecisionMode
}

function throwIfEngineError(msg: EngineMsg): void {
  if (msg.event !== 'error') return
  const message = msg.message ?? 'Engine error'
  if (/dispelled|cancelled/i.test(message)) {
    throw new DOMException(message || 'Cancelled', 'AbortError')
  }
  throw new Error(message)
}

export function reportError(err: unknown, fallback: string): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return err.message || 'Cancelled'
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

export async function scanDiskLibrary(dir?: string): Promise<Clip[]> {
  if (!isTauri()) return []
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<Clip[]>('scan_library_dir', { dir: dir?.trim() || null })
  } catch {
    return []
  }
}

export async function scanDiskCategories(
  dir?: string,
  mode?: GenerateMode,
): Promise<CategorySummary[]> {
  if (!isTauri()) return []
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<CategorySummary[]>('scan_library_categories', {
      dir: dir?.trim() || null,
      mode: mode || null,
    })
  } catch {
    return []
  }
}

export async function scanDiskCategoryTracks(folderPath: string): Promise<Clip[]> {
  if (!isTauri()) return []
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<Clip[]>('scan_folder_tracks', { folderPath })
  } catch {
    return []
  }
}

export async function deleteDiskFile(path: string): Promise<void> {
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('delete_file', { path })
  } catch {
    /* ignore error */
  }
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
    vramUsedGb: typeof result.vramUsedGb === 'number' ? result.vramUsedGb : undefined,
    vramTotalGb: typeof result.vramTotalGb === 'number' ? result.vramTotalGb : undefined,
    vramAllocatedGb: typeof result.vramAllocatedGb === 'number' ? result.vramAllocatedGb : undefined,
    vramReservedGb: typeof result.vramReservedGb === 'number' ? result.vramReservedGb : undefined,
    gpuName: result.gpuName,
    gpuTempC: typeof result.gpuTempC === 'number' ? result.gpuTempC : undefined,
    precision: result.precision === 'fp16' ? 'fp16' : result.precision === 'fp32' ? 'fp32' : undefined,
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
  request = { ...request, seconds: clampGenerateSeconds(request.seconds) }
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
    const detectedInstruments = request.instruments?.length
      ? request.instruments
      : extractInstruments(request.prompt)
    const topInstruments = detectedInstruments.slice(0, 3)

    const dummyClip: Clip = {
      id: '',
      prompt: request.prompt,
      duration: request.seconds,
      seed: request.seed,
      createdAt: '',
      cfg: request.cfg,
      negative: request.negative,
      mode,
    }
    const resolvedCategory = request.category?.trim() || inferClipCategory(dummyClip)
    const resolvedSubcategory =
      request.subcategory?.trim() ||
      (mode === 'sfx' ? inferClipSubcategory(dummyClip) : undefined)
    const resolvedIntensity =
      request.intensity?.trim() ||
      (mode === 'music' ? inferClipIntensity(dummyClip) : undefined)

    const result = await invoke<EngineMsg>('engine_generate', {
      prompt: request.prompt,
      seconds: request.seconds,
      seed: request.seed,
      cfg: request.cfg,
      steps: request.steps ?? 20,
      negative: request.negative,
      hfToken: hfToken(),
      libraryDir: request.libraryDir?.trim() || loadSettings().libraryDir.trim() || null,
      mode,
      category: resolvedCategory,
      subcategory: resolvedSubcategory || resolvedIntensity,
      intensity: resolvedIntensity,
      instruments: topInstruments,
    })
    throwIfEngineError(result)
    if (!result.path) throw new Error('Engine did not return a WAV path')
    const b64 = await invoke<string>('read_file_b64', { path: result.path })
    let wav = base64ToBytes(b64)
    const wavInfo = clipWavInfo(request.prompt, mode, topInstruments)
    wav = tagWav(wav, wavInfo)
    await invoke('write_file_b64', { path: result.path, data: bytesToBase64(wav) })
    const clip: Clip = {
      id: clipIdFromPath(result.path),
      path: result.path,
      prompt: request.prompt.trim(),
      duration: wavDurationSeconds(wav),
      seed: result.seed ?? request.seed,
      createdAt: new Date().toISOString(),
      cfg: request.cfg,
      steps: request.steps ?? 20,
      negative: request.negative,
      mode,
      instruments: topInstruments.length ? topInstruments : undefined,
      category: resolvedCategory,
      subcategory: resolvedSubcategory,
      intensity: resolvedIntensity,
    }

    return { clip, wav }
  } finally {
    handlers.signal?.removeEventListener('abort', onAbort)
    unlisten()
  }
}

export async function loadModel(
  onProgress?: (ratio: number) => void,
  options?: { signal?: AbortSignal; precision?: PrecisionMode },
): Promise<void> {
  await scribeWeights(onProgress ?? (() => {}), options)
}

export async function scribeWeights(
  onProgress: (ratio: number) => void,
  options?: { signal?: AbortSignal; precision?: PrecisionMode },
): Promise<void> {
  if (!isTauri()) return mockDownloadProgress(onProgress, 40, options?.signal)
  const status = await engineStatus()
  if (status.mock) {
    await mockDownloadProgress(onProgress, 40, options?.signal)
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
  const onAbort = () => {
    void cancelGenerate()
  }
  options?.signal?.addEventListener('abort', onAbort)
  if (options?.signal?.aborted) {
    onAbort()
  }
  try {
    const result = await invoke<EngineMsg>('engine_warmup', {
      hfToken: hfToken(),
      precision: options?.precision ?? loadSettings().precision ?? 'fp32',
    })
    throwIfEngineError(result)
    onProgress(1)
  } finally {
    options?.signal?.removeEventListener('abort', onAbort)
    unlisten()
  }
}

export async function unloadModel(): Promise<void> {
  if (!isTauri()) return
  const status = await engineStatus()
  if (status.mock) return
  const { invoke } = await import('@tauri-apps/api/core')
  const result = await invoke<EngineMsg>('engine_unload')
  throwIfEngineError(result)
}

export async function exportClipFile(options: {
  buffer: ArrayBuffer
  filename: string
  format: AudioFormat
  sampleRate?: SampleRateOption
  bitDepth?: BitDepthOption
  mono?: boolean
  defaultDir?: string
}): Promise<string | null> {
  const prepared = prepareExportWav(options.buffer, {
    format: options.format,
    sampleRate: options.sampleRate ?? 44100,
    bitDepth: options.bitDepth ?? 16,
    mono: Boolean(options.mono),
  })
  if (!isTauri()) {
    if (formatNeedsDesktop(options.format)) {
      throw new Error(`${options.format.toUpperCase()} export needs the desktop app.`)
    }
    downloadArrayBuffer(prepared, options.filename, formatMime(options.format))
    return null
  }
  const { invoke } = await import('@tauri-apps/api/core')
  const { save } = await import('@tauri-apps/plugin-dialog')
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  const defaultPath = joinPath(options.defaultDir ?? '', options.filename)
  const filterName =
    options.format === 'ogg'
      ? 'OGG Vorbis'
      : options.format === 'flac'
        ? 'FLAC'
        : options.format === 'mp3'
          ? 'MP3'
          : 'WAV'
  const path = await save({
    defaultPath,
    filters: [{ name: filterName, extensions: [options.format] }],
  })
  if (!path) return null
  if (options.format === 'wav') {
    await invoke('write_file_b64', { path, data: bytesToBase64(prepared) })
  } else {
    const temp = await invoke<string>('temp_dir')
    const wavPath = joinPath(temp, 'thunder-fx-export.wav')
    await invoke('write_file_b64', { path: wavPath, data: bytesToBase64(prepared) })
    const encoded = await invoke<EngineMsg>('engine_encode_audio', {
      wavPath,
      destPath: path,
      format: options.format,
      sampleRate: options.sampleRate ?? 44100,
      bitDepth: options.bitDepth ?? 16,
      mono: Boolean(options.mono),
    })
    throwIfEngineError(encoded)
  }
  try {
    await revealItemInDir(path)
  } catch {
    /* reveal is best-effort */
  }
  return path
}

export async function exportSoundPack(options: {
  files: { name: string; buffer: ArrayBuffer }[]
  zipName: string
  manifest?: string
  defaultDir?: string
}): Promise<string | null> {
  if (!isTauri()) {
    const zip = buildZipStore([
      ...options.files.map((file) => ({ name: file.name, data: new Uint8Array(file.buffer) })),
      ...(options.manifest
        ? [{ name: 'manifest.json', data: new TextEncoder().encode(options.manifest) }]
        : []),
    ])
    downloadArrayBuffer(zip, options.zipName, 'application/zip')
    return null
  }
  const { invoke } = await import('@tauri-apps/api/core')
  const { save } = await import('@tauri-apps/plugin-dialog')
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  const defaultPath = joinPath(options.defaultDir ?? '', options.zipName)
  const path = await save({
    defaultPath,
    filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
  })
  if (!path) return null
  const temp = await invoke<string>('temp_dir')
  const entries: { src: string; dest: string }[] = []
  for (const [index, file] of options.files.entries()) {
    const src = joinPath(temp, `thunder-fx-pack-${index}-${file.name.replace(/[\\/]/g, '_')}`)
    await invoke('write_file_b64', { path: src, data: bytesToBase64(file.buffer) })
    entries.push({ src, dest: file.name })
  }
  await invoke('zip_files', {
    entries,
    dest: path,
    manifest: options.manifest ?? null,
  })
  try {
    await revealItemInDir(path)
  } catch {
    /* reveal is best-effort */
  }
  return path
}

export async function writeEncodedFile(options: {
  buffer: ArrayBuffer
  path: string
  format: AudioFormat
  sampleRate?: SampleRateOption
  bitDepth?: BitDepthOption
  mono?: boolean
}): Promise<void> {
  const prepared = prepareExportWav(options.buffer, {
    format: options.format,
    sampleRate: options.sampleRate ?? 44100,
    bitDepth: options.bitDepth ?? 16,
    mono: Boolean(options.mono),
  })
  if (!isTauri()) {
    if (formatNeedsDesktop(options.format)) {
      throw new Error(`${options.format.toUpperCase()} export needs the desktop app.`)
    }
    downloadArrayBuffer(prepared, options.path.split(/[/\\]/).pop() ?? 'export.wav', formatMime(options.format))
    return
  }
  const { invoke } = await import('@tauri-apps/api/core')
  if (options.format === 'wav') {
    await invoke('write_file_b64', { path: options.path, data: bytesToBase64(prepared) })
    return
  }
  const temp = await invoke<string>('temp_dir')
  const wavPath = joinPath(temp, `thunder-fx-encode-${crypto.randomUUID()}.wav`)
  await invoke('write_file_b64', { path: wavPath, data: bytesToBase64(prepared) })
  const encoded = await invoke<EngineMsg>('engine_encode_audio', {
    wavPath,
    destPath: options.path,
    format: options.format,
    sampleRate: options.sampleRate ?? 44100,
    bitDepth: options.bitDepth ?? 16,
    mono: Boolean(options.mono),
  })
  throwIfEngineError(encoded)
}
