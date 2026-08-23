import { describe, expect, it } from 'vitest'
import {
  MAX_GENERATE_SECONDS,
  MIN_GENERATE_SECONDS,
  clampGenerateSeconds,
} from '@/lib/duration'

describe('clampGenerateSeconds', () => {
  it('keeps the Stable Audio 3 Medium maximum', () => {
    expect(MAX_GENERATE_SECONDS).toBe(380)
    expect(clampGenerateSeconds(380)).toBe(380)
  })

  it('rejects values above the model limit', () => {
    expect(clampGenerateSeconds(381)).toBe(380)
    expect(clampGenerateSeconds(600)).toBe(380)
  })

  it('rejects values below the minimum', () => {
    expect(MIN_GENERATE_SECONDS).toBe(0.5)
    expect(clampGenerateSeconds(0.1)).toBe(0.5)
    expect(clampGenerateSeconds(-4)).toBe(0.5)
  })

  it('falls back for non-finite numbers', () => {
    expect(clampGenerateSeconds(Number.NaN)).toBe(8)
    expect(clampGenerateSeconds(Number.POSITIVE_INFINITY)).toBe(8)
  })
})
