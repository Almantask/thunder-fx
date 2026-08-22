export type Clip = {
  id: string
  prompt: string
  duration: number
  seed: number
  createdAt: string
  cfg: number
  negative: string
}

export type EngineStatus = {
  ready: boolean
  mock: boolean
  device: string
  message: string
}

export type WeaveProgress = {
  step: number
  total: number
  elapsedMs: number
}

export type GenerateRequest = {
  prompt: string
  seconds: number
  seed: number
  cfg: number
  negative: string
  libraryDir?: string
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
export const TOTAL_RITES = 8

export type KeepSettings = {
  hfToken: string
  defaultDuration: number
  alwaysOnTop: boolean
  defaultExportDir: string
  libraryDir: string
}

export type KeepTab = 'library' | 'generate' | 'settings'

export const DEFAULT_SETTINGS: KeepSettings = {
  hfToken: '',
  defaultDuration: 8,
  alwaysOnTop: false,
  defaultExportDir: '',
  libraryDir: '',
}

export const DEFAULT_LIBRARY_PLACEHOLDER = '%LOCALAPPDATA%\\thunder-fx\\library'
