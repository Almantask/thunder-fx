import type { KeepSettings } from '@/lib/types'
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, SETUP_STORAGE_KEY } from '@/lib/types'

export function isFirstWatchComplete(): boolean {
  try {
    return localStorage.getItem(SETUP_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function completeFirstWatch(): void {
  localStorage.setItem(SETUP_STORAGE_KEY, '1')
}

export function loadSettings(): KeepSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: KeepSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}
