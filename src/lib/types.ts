export type GenerateMode = 'sfx' | 'music'

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
}

export type GenerateResult = {
  clip: Clip
  wav: ArrayBuffer
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
export const TOTAL_RITES = 20

export type KeepSettings = {
  hfToken: string
  defaultDuration: number
  qualitySteps: number
  alwaysOnTop: boolean
  defaultExportDir: string
  libraryDir: string
  generateMode: GenerateMode
  precision: PrecisionMode
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
  precision: 'fp32',
}


export const DEFAULT_LIBRARY_PLACEHOLDER = '%LOCALAPPDATA%\\thunder-fx\\library'
