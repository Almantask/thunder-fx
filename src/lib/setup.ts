import { isAudioFormat, clampBitrateKbps, clampVorbisQuality } from '@/lib/audioExport'
import { clampGenerateSeconds } from '@/lib/duration'
import { isGenerateMode } from '@/lib/generateMode'
import { isPrecisionMode } from '@/lib/precision'
import type { CatalogEffect } from '@/lib/promptCatalog'
import type { KeepSettings } from '@/lib/types'
import {
  DEFAULT_SETTINGS,
  QUEUE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  SETUP_STORAGE_KEY,
} from '@/lib/types'

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
    const parsed = JSON.parse(raw) as Partial<KeepSettings>
    const generateMode = isGenerateMode(parsed.generateMode) ? parsed.generateMode : 'sfx'
    const precision = isPrecisionMode(parsed.precision) ? parsed.precision : DEFAULT_SETTINGS.precision
    const defaultDuration = clampGenerateSeconds(
      typeof parsed.defaultDuration === 'number' ? parsed.defaultDuration : DEFAULT_SETTINGS.defaultDuration,
    )
    const defaultExportFormat = isAudioFormat(parsed.defaultExportFormat)
      ? parsed.defaultExportFormat
      : DEFAULT_SETTINGS.defaultExportFormat
    const defaultOpusBitrateKbps = clampBitrateKbps(
      typeof parsed.defaultOpusBitrateKbps === 'number'
        ? parsed.defaultOpusBitrateKbps
        : DEFAULT_SETTINGS.defaultOpusBitrateKbps,
    )
    const defaultVorbisQuality = clampVorbisQuality(
      typeof parsed.defaultVorbisQuality === 'number'
        ? parsed.defaultVorbisQuality
        : DEFAULT_SETTINGS.defaultVorbisQuality,
    )
    const defaultMp3BitrateKbps = clampBitrateKbps(
      typeof parsed.defaultMp3BitrateKbps === 'number'
        ? parsed.defaultMp3BitrateKbps
        : DEFAULT_SETTINGS.defaultMp3BitrateKbps,
    )
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      generateMode,
      precision,
      defaultDuration,
      defaultExportFormat,
      defaultOpusBitrateKbps,
      defaultVorbisQuality,
      defaultMp3BitrateKbps,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: KeepSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

export function loadQueue(): CatalogEffect[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is CatalogEffect =>
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.prompt === 'string' &&
        typeof item.title === 'string' &&
        typeof item.duration === 'number' &&
        Number.isFinite(item.duration),
    )
  } catch {
    return []
  }
}

export function saveQueue(queue: CatalogEffect[]): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue))
  } catch {
    /* storage is best-effort */
  }
}

export function clearQueueStorage(): void {
  try {
    localStorage.removeItem(QUEUE_STORAGE_KEY)
  } catch {
    /* storage is best-effort */
  }
}

