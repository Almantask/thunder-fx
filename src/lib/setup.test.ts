/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearQueueStorage,
  completeFirstWatch,
  isFirstWatchComplete,
  loadQueue,
  loadSettings,
  saveQueue,
  saveSettings,
} from '@/lib/setup'
import { QUEUE_STORAGE_KEY, SETTINGS_STORAGE_KEY, SETUP_STORAGE_KEY } from '@/lib/types'
import type { CatalogEffect } from '@/lib/promptCatalog'

describe('setup and queue storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('checks and completes first watch', () => {
    expect(isFirstWatchComplete()).toBe(false)
    completeFirstWatch()
    expect(isFirstWatchComplete()).toBe(true)
    expect(localStorage.getItem(SETUP_STORAGE_KEY)).toBe('1')
  })

  it('loads and saves settings with fallbacks', () => {
    const settings = loadSettings()
    expect(settings.generateMode).toBe('sfx')
    expect(settings.defaultDuration).toBe(8)

    saveSettings({ ...settings, defaultDuration: 12, generateMode: 'music', precision: 'fp16' })
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain('"generateMode":"music"')
    const reloaded = loadSettings()
    expect(reloaded.defaultDuration).toBe(12)
    expect(reloaded.generateMode).toBe('music')
    expect(reloaded.precision).toBe('fp16')
  })

  it('defaults the audio format to opus and keeps a saved one', () => {
    expect(loadSettings().defaultExportFormat).toBe('opus')

    saveSettings({ ...loadSettings(), defaultExportFormat: 'flac' })
    expect(loadSettings().defaultExportFormat).toBe('flac')
  })

  it('falls back to the default when the stored audio format is not a format', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ defaultExportFormat: 'wma' }))
    expect(loadSettings().defaultExportFormat).toBe('opus')
  })

  it('loads, saves and clears queue in storage', () => {
    expect(loadQueue()).toEqual([])

    const mockEffects: CatalogEffect[] = [
      {
        id: 'fx:combat:sword-draw',
        categoryId: 'fx:combat',
        category: 'Combat',
        title: 'Steel sword draw',
        prompt: 'TrackType: SFX, steel sword draw',
        duration: 2.5,
        negative: '',
      },
      {
        id: 'ambience:dungeon:crypt',
        categoryId: 'ambience:dungeon',
        category: 'Dungeon',
        title: 'Ancient crypt atmosphere',
        prompt: 'TrackType: Music, deep drone crypt',
        duration: 16,
        negative: 'vocals',
      },
    ]

    saveQueue(mockEffects)
    expect(loadQueue()).toEqual(mockEffects)
    expect(localStorage.getItem(QUEUE_STORAGE_KEY)).toContain('Steel sword draw')

    clearQueueStorage()
    expect(loadQueue()).toEqual([])
    expect(localStorage.getItem(QUEUE_STORAGE_KEY)).toBeNull()
  })

  it('handles invalid or corrupted queue JSON gracefully', () => {
    localStorage.setItem(QUEUE_STORAGE_KEY, 'not-valid-json{{{')
    expect(loadQueue()).toEqual([])

    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(['invalid-item', 123, null]))
    expect(loadQueue()).toEqual([])
  })
})
