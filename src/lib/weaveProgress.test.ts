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
