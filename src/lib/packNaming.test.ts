import { describe, expect, it } from 'vitest'
import { buildPackManifest, formatPackFilename } from '@/lib/packNaming'
import type { Clip } from '@/lib/types'

const sword: Clip = {
  id: '1',
  prompt: 'TrackType: SFX, steel shortsword leaving a leather scabbard',
  duration: 2,
  seed: 4,
  createdAt: '2026-08-27T00:00:00.000Z',
  cfg: 4,
  negative: '',
  mode: 'sfx',
  category: 'Combat',
  subcategory: 'Sword',
}

describe('packNaming', () => {
  it('builds SFX_Combat_Sword-style names from a template', () => {
    expect(formatPackFilename('{type}_{category}_{name}_{index}', sword, 1, 'wav')).toBe(
      'SFX_Combat_steel-shortsword-leaving-a-leather-scabbard_01.wav',
    )
    expect(formatPackFilename('[TYPE]_[CATEGORY]_[NAME]_[INDEX]', sword, 2, 'ogg')).toBe(
      'SFX_Combat_steel-shortsword-leaving-a-leather-scabbard_02.ogg',
    )
  })

  it('uses MUS for instrumental clips and AMB for ambience', () => {
    expect(
      formatPackFilename('{type}_{category}_{name}_{index}', { ...sword, mode: 'music', category: 'Tavern' }, 1, 'flac'),
    ).toMatch(/^MUS_Tavern_/)
    expect(
      formatPackFilename('{type}_{category}_{name}_{index}', { ...sword, mode: 'ambience', category: 'Weather' }, 1, 'wav'),
    ).toMatch(/^AMB_Weather_/)
  })

  it('writes a manifest index for the zip', () => {
    const json = JSON.parse(buildPackManifest([{ filename: 'SFX_Combat_Sword_01.wav', clip: sword }]))
    expect(json.app).toBe('Thunder FX')
    expect(json.files[0].filename).toBe('SFX_Combat_Sword_01.wav')
    expect(json.files[0].prompt).toContain('shortsword')
  })
})
