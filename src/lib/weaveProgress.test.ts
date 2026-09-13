import { describe, expect, it } from 'vitest'
import { weaveBarPercent, weaveBusyStatus, weaveProgressRatio, weaveStatusLabel } from '@/lib/weaveProgress'

describe('weaveBarPercent', () => {
  it('is indeterminate while Medium is loading without a ratio', () => {
    expect(weaveBarPercent({ step: 0, total: 8, phase: 'loading' })).toBeNull()
  })

  it('uses a download ratio when the sidecar reports one', () => {
    expect(weaveBarPercent({ step: 0, total: 8, phase: 'loading', ratio: 0.4 })).toBe(40)
  })

  it('is indeterminate when weaving has no remaining and no historical total', () => {
    expect(weaveBarPercent({ step: 4, total: 8, phase: 'weaving' })).toBeNull()
    expect(
      weaveBarPercent({
        step: 4,
        total: 8,
        phase: 'weaving',
        elapsedMs: 20_000,
      }),
    ).toBeNull()
  })

  it('uses live remaining once a run exists, not the step ratio', () => {
    expect(
      weaveBarPercent({
        step: 4,
        total: 8,
        phase: 'weaving',
        elapsedMs: 10_000,
        remainingMs: 90_000,
      }),
    ).toBe(10)
  })

  it('calculates percent from elapsed and remaining time', () => {
    expect(
      weaveBarPercent({
        step: 1,
        total: 8,
        phase: 'weaving',
        elapsedMs: 20_000,
        remainingMs: 20_000,
      }),
    ).toBe(50)

    expect(
      weaveBarPercent({
        step: 2,
        total: 8,
        phase: 'weaving',
        elapsedMs: 30_000,
        remainingMs: 10_000,
      }),
    ).toBe(75)

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

  it('prefers live remaining over a historical countdown', () => {
    expect(
      weaveBusyStatus({
        phase: 'weaving',
        rite: 4,
        total: 8,
        elapsedMs: 20_000,
        historicalEstimateMs: 40_000,
        remainingMs: 70_000,
      }),
    ).toMatch(/~1:10 remaining/)
  })
})
