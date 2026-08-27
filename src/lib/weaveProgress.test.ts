import { describe, expect, it } from 'vitest'
import { weaveBarPercent, weaveBusyStatus, weaveProgressRatio, weaveStatusLabel } from '@/lib/weaveProgress'

describe('weaveBarPercent', () => {
  it('is indeterminate while Medium is loading without a ratio', () => {
    expect(weaveBarPercent({ step: 0, total: 8, phase: 'loading' })).toBeNull()
  })

  it('uses a download ratio when the sidecar reports one', () => {
    expect(weaveBarPercent({ step: 0, total: 8, phase: 'loading', ratio: 0.4 })).toBe(40)
  })

  it('maps weaving rites to a percent', () => {
    expect(weaveBarPercent({ step: 4, total: 8, phase: 'weaving' })).toBe(50)
  })

  it('calculates consistent percent from elapsed and estimated remaining time', () => {
    // Explicit 20s elapsed and 20s remaining -> 50%
    expect(
      weaveBarPercent({
        step: 1,
        total: 8,
        phase: 'weaving',
        elapsedMs: 20_000,
        remainingMs: 20_000,
      }),
    ).toBe(50)

    // Explicit 30s elapsed and 10s remaining -> 75%
    expect(
      weaveBarPercent({
        step: 2,
        total: 8,
        phase: 'weaving',
        elapsedMs: 30_000,
        remainingMs: 10_000,
      }),
    ).toBe(75)

    // Automatic estimate from historical estimate
    const percent = weaveBarPercent({
      step: 4,
      total: 8,
      phase: 'weaving',
      elapsedMs: 20_000,
      historicalEstimateMs: 40_000,
    })
    expect(percent).toBe(50)
  })

  it('returns high percent on writing phase', () => {
    expect(weaveBarPercent({ step: 8, total: 8, phase: 'writing' })).toBe(96)
  })
})

describe('weaveProgressRatio', () => {
  it('prefers an explicit ratio', () => {
    expect(weaveProgressRatio({ step: 1, total: 8, phase: 'loading', ratio: 0.4 })).toBe(0.4)
  })
})

describe('weaveStatusLabel', () => {
  it('names the loading phase so the app does not look stuck', () => {
    expect(weaveStatusLabel('loading', 0, 8, 1500)).toMatch(/loading model/i)
    expect(weaveStatusLabel('loading', 0, 8, 1500)).toMatch(/0:01/)
  })

  it('appends an estimated remaining clock', () => {
    expect(weaveStatusLabel('weaving', 3, 8, 41_000, 28_000)).toMatch(/~0:28 remaining/)
    expect(
      weaveBusyStatus({
        phase: 'weaving',
        rite: 4,
        total: 8,
        elapsedMs: 20_000,
        historicalEstimateMs: 40_000,
      }),
    ).toMatch(/~0:20 remaining/)
  })
})
