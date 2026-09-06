import { DEFAULT_EXPORT_FORMAT, type AudioFormat } from '@/lib/audioExport'
import { DEFAULT_PRESET, type QualityPreset, type SamplerType } from '@/lib/qualityPreset'

export type GenerateMode = 'sfx' | 'ambience' | 'music'

export type Clip = {
  id: string
  prompt: string
  duration: number
  seed: number
  createdAt: string
  cfg: number
  negative: string
  steps?: number
  mode?: GenerateMode
  instruments?: string[]
  category?: string
  subcategory?: string
  intensity?: string
  path?: string
  /** Which quality preset produced this clip. */
  preset?: QualityPreset
  sampler?: SamplerType
}

export type SubcategorySummary = {
  name: string
  path: string
  count: number
}

export type CategorySummary = {
  name: string
  mode: GenerateMode
  path: string
  count: number
  subcategories: SubcategorySummary[]
}

export type PrecisionMode = 'fp32' | 'fp16'

export type EngineStatus = {
  ready: boolean
  mock: boolean
  loaded: boolean
  device: string
  message: string
  vramUsedGb?: number
  vramTotalGb?: number
  vramAllocatedGb?: number
  vramReservedGb?: number
  gpuName?: string
  gpuTempC?: number
  precision?: PrecisionMode
  /** Checkpoint currently in VRAM, e.g. "medium" or "medium-base". */
  model?: string
  /** Whether the medium-base weights Max quality needs are already on disk. */
  baseModelReady?: boolean
}

export type WeavePhase = 'loading' | 'weaving' | 'writing'

export type WeaveProgress = {
  step: number
  total: number
  elapsedMs: number
  phase?: WeavePhase
  ratio?: number
  message?: string
}

export type GenerateRequest = {
  prompt: string
  seconds: number
  seed: number
  cfg: number
  negative: string
  steps?: number
  libraryDir?: string
  mode?: GenerateMode
  instruments?: string[]
  category?: string
  subcategory?: string
  intensity?: string
  seamlessLoop?: boolean
  preset?: QualityPreset
  sampler?: SamplerType
}

export type GenerateResult = {
  clip: Clip
  wav: ArrayBuffer
  /** Non-blocking notices from the engine, e.g. an over-long prompt. */
  warnings?: string[]
}

export type SetupProbe = {
  ok: boolean
  flavor: string
  technical: string
  device: string
}

export const SETUP_STORAGE_KEY = 'thunder-fx.first-watch.complete'
export const SETTINGS_STORAGE_KEY = 'thunder-fx.keep'
export const QUEUE_STORAGE_KEY = 'thunder-fx.queue'

export type KeepSettings = {
  hfToken: string
  defaultDuration: number
  qualitySteps: number
  alwaysOnTop: boolean
  defaultExportDir: string
  libraryDir: string
  generateMode: GenerateMode
  precision: PrecisionMode
  defaultExportFormat: AudioFormat
  defaultPreset: QualityPreset
}

export type KeepTab = 'library' | 'generate' | 'settings'

export const DEFAULT_SETTINGS: KeepSettings = {
  hfToken: '',
  defaultDuration: 8,
  qualitySteps: 20,
  alwaysOnTop: false,
  defaultExportDir: '',
  libraryDir: '',
  generateMode: 'sfx',
  // fp16 matches the worker, the Stable Audio library default, and the README.
  // fp32 also disables chunked decode in the worker, roughly doubling peak VRAM.
  precision: 'fp16',
  defaultExportFormat: DEFAULT_EXPORT_FORMAT,
  defaultPreset: DEFAULT_PRESET,
}


export const DEFAULT_LIBRARY_PLACEHOLDER = '%LOCALAPPDATA%\\thunder-fx\\library'
