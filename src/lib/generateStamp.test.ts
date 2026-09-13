import { describe, expect, it } from 'vitest'
import { SOFTWARE_NAME, formatSoftwareStamp, parseSoftwareStamp } from '@/lib/generateStamp'

describe('generateStamp', () => {
  it('round-trips seed, cfg, steps, preset and sampler', () => {
    const software = formatSoftwareStamp({
      seed: 7,
      cfg: 1,
      steps: 20,
      preset: 'balanced',
      sampler: 'pingpong',
    })
    expect(software.startsWith(SOFTWARE_NAME)).toBe(true)
    expect(parseSoftwareStamp(software)).toEqual({
      seed: 7,
      cfg: 1,
      steps: 20,
      preset: 'balanced',
      sampler: 'pingpong',
    })
  })

  it('encodes a negative prompt without breaking the tokeniser', () => {
    const software = formatSoftwareStamp({
      seed: 1,
      negative: 'vocals | choir = loud',
    })
    expect(parseSoftwareStamp(software).negative).toBe('vocals | choir = loud')
  })

  it('treats a bare product name as an unstamped legacy clip', () => {
    expect(parseSoftwareStamp(SOFTWARE_NAME)).toEqual({})
    expect(formatSoftwareStamp()).toBe(SOFTWARE_NAME)
  })
})
