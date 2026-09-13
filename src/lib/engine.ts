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
  PrecisionMode,
  SetupProbe,
  WeaveProgress,
} from '@/lib/types'
import { isTauri } from '@/lib/utils'
import {
  resolveQualityPreset,
  type QualityPreset,
  type SamplerType,
} from '@/lib/qualityPreset'
import type {
  AudioFormat,
  BitDepthOption,
  SampleRateOption,
} from '@/lib/audioExport'
import { formatLabel, formatMime, formatNeedsDesktop, prepareExportWav } from '@/lib/audioExport'
import { buildZipStore } from '@/lib/zipStore'
import { downloadArrayBuffer, wavDurationSeconds } from '@/lib/wav'
import { extractInstruments } from '@/lib/instruments'
import {
  fileNameOf,
  joinPath,
  pickSavePath,
  readFileBytes,
  revealPath,
  tempDir,
  writeFileBytes,
  zipFiles,
  deleteFile as deleteScopedFile,
  pickDirectory as pickScopedDirectory,
} from '@/lib/tauriFs'
import { clampGenerateSeconds } from '@/lib/duration'
import { FIXED_CFG, modeSupportsSeamlessLoop, resolveGenerateMode } from '@/lib/generateMode'
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
  model?: string
  baseModelReady?: boolean
  preset?: QualityPreset
  sampler?: SamplerType
  presetUnavailable?: boolean
  steps?: number
  warnings?: string[]
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
  await revealPath(path)
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

// Tells the backend which folder Generate writes to, so reads and writes under
// it are inside the sandbox even when the path was typed instead of picked.
export async function setLibraryDir(dir: string | undefined): Promise<string | null> {
  if (!isTauri()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('set_library_dir', { dir: dir?.trim() || null })
  } catch {
    return null
  }
}

export async function revealLibrary(path?: string): Promise<void> {
  const target = path?.trim() || (await libraryPath())
  if (!target) return
  await revealPath(target)
}

export async function pickDirectory(defaultPath?: string): Promise<string | null> {
  return await pickScopedDirectory(defaultPath)
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

export async function deleteDiskFile(path: string): Promise<void> {
  if (!isTauri()) return
  try {
    await deleteScopedFile(path)
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

function clipIdFromPath(path: string): string {
  return fileNameOf(path).replace(/\.wav$/i, '') || crypto.randomUUID()
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
    model: result.model,
    baseModelReady:
      typeof result.baseModelReady === 'boolean' ? result.baseModelReady : undefined,
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
  request = { ...request, seconds: clampGenerateSeconds(request.seconds), cfg: FIXED_CFG }
  const preset = resolveQualityPreset(request.preset ?? loadSettings().defaultPreset)
  // Only the custom preset lets the caller pin a step count; a named preset owns
  // sampler, steps and checkpoint together.
  const presetSteps = preset === 'custom' ? request.steps : undefined
  if (!isTauri()) {
    return mockGenerate({ ...request, preset, steps: presetSteps }, handlers)
  }
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
    const mode = resolveGenerateMode(request.mode)
    const loop = modeSupportsSeamlessLoop(mode) && Boolean(request.seamlessLoop)
    const detectedInstruments =
      mode === 'music'
        ? request.instruments?.length
          ? request.instruments
          : extractInstruments(request.prompt)
        : []
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
      (mode !== 'music' ? inferClipSubcategory(dummyClip) : undefined)
    const resolvedIntensity =
      request.intensity?.trim() ||
      (mode === 'music' ? inferClipIntensity(dummyClip) : undefined)

    const result = await invoke<EngineMsg>('engine_generate', {
      prompt: request.prompt,
      seconds: request.seconds,
      seed: request.seed,
      cfg: request.cfg,
      preset,
      sampler: request.sampler ?? null,
      steps: preset === 'custom' ? (request.steps ?? null) : null,
      negative: request.negative,
      hfToken: hfToken(),
      libraryDir: request.libraryDir?.trim() || loadSettings().libraryDir.trim() || null,
      mode,
      category: resolvedCategory,
      subcategory: resolvedSubcategory || resolvedIntensity,
      intensity: resolvedIntensity,
      instruments: topInstruments,
      seamlessLoop: loop,
    })
    throwIfEngineError(result)
    if (!result.path) throw new Error('Engine did not return a WAV path')
    // The worker already embedded the RIFF INFO tags from the same fields sent
    // above, so this is a plain read — no second parse-and-rewrite of the file.
    const wav = await readFileBytes(result.path)
    if (!wav) throw new Error('Could not read the generated WAV')
    const clip: Clip = {
      id: clipIdFromPath(result.path),
      path: result.path,
      prompt: request.prompt.trim(),
      duration: wavDurationSeconds(wav),
      seed: result.seed ?? request.seed,
      createdAt: new Date().toISOString(),
      cfg: request.cfg,
      steps: result.steps ?? request.steps,
      negative: request.negative,
      mode,
      preset: result.preset ?? preset,
      sampler: result.sampler,
      instruments: topInstruments.length ? topInstruments : undefined,
      category: resolvedCategory,
      subcategory: resolvedSubcategory,
      intensity: resolvedIntensity,
    }

    return { clip, wav, warnings: result.warnings }
  } finally {
    handlers.signal?.removeEventListener('abort', onAbort)
    unlisten()
  }
}

export async function loadModel(
  onProgress?: (ratio: number) => void,
  options?: { signal?: AbortSignal; precision?: PrecisionMode; model?: string },
): Promise<void> {
  await scribeWeights(onProgress ?? (() => {}), options)
}

export async function scribeWeights(
  onProgress: (ratio: number) => void,
  options?: { signal?: AbortSignal; precision?: PrecisionMode; model?: string },
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
      precision: options?.precision ?? loadSettings().precision ?? 'fp16',
      model: options?.model ?? null,
      preset: options?.model ? null : loadSettings().defaultPreset,
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
  bitrateKbps?: number
  vorbisQuality?: number
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
  const filterName = formatLabel(options.format)
  const path = await pickSavePath({
    defaultPath: joinPath(options.defaultDir ?? '', options.filename),
    filterName,
    extensions: [options.format],
  })
  if (!path) return null
  if (options.format === 'wav') {
    await writeFileBytes(path, prepared)
  } else {
    const wavPath = joinPath(await tempDir(), `thunder-fx-export-${crypto.randomUUID()}.wav`)
    await writeFileBytes(wavPath, prepared)
    const encoded = await invoke<EngineMsg>('engine_encode_audio', {
      wavPath,
      destPath: path,
      format: options.format,
      sampleRate: options.sampleRate ?? 44100,
      bitDepth: options.bitDepth ?? 16,
      mono: Boolean(options.mono),
      bitrate: options.bitrateKbps,
      quality: options.vorbisQuality,
    })
    throwIfEngineError(encoded)
    await deleteDiskFile(wavPath)
  }
  await revealPath(path).catch(() => {
    /* reveal is best-effort */
  })
  return path
}

export async function exportSoundPack(options: {
  files: { name: string; buffer: ArrayBuffer }[]
  /**
   * Already-encoded files sitting on disk. When present the archive is built
   * straight from these paths, so encoded audio is never carried back through
   * the webview only to be written out again.
   */
  encodedFiles?: { path: string; name: string }[]
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
  const path = await pickSavePath({
    defaultPath: joinPath(options.defaultDir ?? '', options.zipName),
    filterName: 'ZIP archive',
    extensions: ['zip'],
  })
  if (!path) return null
  if (options.encodedFiles?.length) {
    await zipFiles({
      entries: options.encodedFiles.map((file) => ({ src: file.path, dest: file.name })),
      dest: path,
      manifest: options.manifest,
    })
    await revealPath(path).catch(() => {
      /* reveal is best-effort */
    })
    return path
  }
  const temp = await tempDir()
  const entries: { src: string; dest: string }[] = []
  for (const [index, file] of options.files.entries()) {
    const src = joinPath(temp, `thunder-fx-pack-${index}-${file.name.replace(/[\\/]/g, '_')}`)
    await writeFileBytes(src, file.buffer)
    entries.push({ src, dest: file.name })
  }
  try {
    await zipFiles({ entries, dest: path, manifest: options.manifest })
  } finally {
    // The zip has the bytes now; don't leave a copy of every clip in temp.
    for (const entry of entries) {
      await deleteDiskFile(entry.src)
    }
  }
  await revealPath(path).catch(() => {
    /* reveal is best-effort */
  })
  return path
}

export async function writeEncodedFile(options: {
  buffer: ArrayBuffer
  path: string
  format: AudioFormat
  sampleRate?: SampleRateOption
  bitDepth?: BitDepthOption
  mono?: boolean
  bitrateKbps?: number
  vorbisQuality?: number
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
  if (options.format === 'wav') {
    await writeFileBytes(options.path, prepared)
    return
  }
  const { invoke } = await import('@tauri-apps/api/core')
  const wavPath = joinPath(await tempDir(), `thunder-fx-encode-${crypto.randomUUID()}.wav`)
  await writeFileBytes(wavPath, prepared)
  const encoded = await invoke<EngineMsg>('engine_encode_audio', {
    wavPath,
    destPath: options.path,
    format: options.format,
    sampleRate: options.sampleRate ?? 44100,
    bitDepth: options.bitDepth ?? 16,
    mono: Boolean(options.mono),
    bitrate: options.bitrateKbps,
    quality: options.vorbisQuality,
  })
  throwIfEngineError(encoded)
  await deleteDiskFile(wavPath)
}
