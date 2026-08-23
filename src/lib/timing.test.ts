import { afterEach, describe, expect, it } from 'vitest'
import {
  EMPTY_TIMING,
  TIMING_STORAGE_KEY,
  estimateGenerateMs,
  estimateLoadMs,
  estimateQueueMs,
  estimateRemainingMs,
  formatEstimateClock,
  loadTimingLog,
  recordGenerate,
  recordLoad,
  saveTimingLog,
} from '@/lib/timing'

afterEach(() => {
  localStorage.clear()
})

describe('formatEstimateClock', () => {
  it('formats whole seconds with a tilde', () => {
    expect(formatEstimateClock(40)).toBe('~0:40')
    expect(formatEstimateClock(75)).toBe('~1:15')
  })

  it('rounds a short remainder up to one second', () => {
    expect(formatEstimateClock(0.4)).toBe('~0:01')
  })
})

describe('recordLoad', () => {
  it('keeps the newest load samples', () => {
    let log = EMPTY_TIMING
    for (let i = 0; i < 30; i += 1) {
      log = recordLoad(log, 40_000 + i)
    }
    expect(log.loads).toHaveLength(24)
    expect(log.loads[0]).toBe(40_006)
    expect(log.loads.at(-1)).toBe(40_029)
  })

  it('ignores invalid load samples', () => {
    expect(recordLoad(EMPTY_TIMING, 0).loads).toEqual([])
    expect(recordLoad(EMPTY_TIMING, Number.NaN).loads).toEqual([])
  })
})

describe('estimateLoadMs', () => {
  it('has no estimate until a load has finished', () => {
    expect(estimateLoadMs(EMPTY_TIMING)).toBeUndefined()
  })

  it('uses the only completed load', () => {
    expect(estimateLoadMs(recordLoad(EMPTY_TIMING, 45_000))).toBe(45_000)
  })

  it('drops a one-off cold download when later loads are faster', () => {
    let log = recordLoad(EMPTY_TIMING, 600_000)
    log = recordLoad(log, 42_000)
    log = recordLoad(log, 45_000)
    log = recordLoad(log, 48_000)
    expect(estimateLoadMs(log)).toBe(45_000)
  })
})

describe('estimateGenerateMs', () => {
  it('scales a single sample to the requested clip length', () => {
    const log = recordGenerate(EMPTY_TIMING, 8, 40_000)
    expect(estimateGenerateMs(log, 8)).toBe(40_000)
    expect(estimateGenerateMs(log, 1.5)).toBe(7_500)
  })

  it('fits a line across short and long clips', () => {
    let log = recordGenerate(EMPTY_TIMING, 1.5, 20_000)
    log = recordGenerate(log, 20, 80_000)
    const estimate = estimateGenerateMs(log, 8)
    expect(estimate).toBeGreaterThan(30_000)
    expect(estimate).toBeLessThan(55_000)
  })
})

describe('estimateQueueMs', () => {
  it('sums per-clip estimates', () => {
    const log = recordGenerate(EMPTY_TIMING, 8, 40_000)
    expect(
      estimateQueueMs(log, [{ duration: 8 }, { duration: 1.5 }, { duration: 8 }]),
    ).toBe(87_500)
  })

  it('has no queue estimate without history', () => {
    expect(estimateQueueMs(EMPTY_TIMING, [{ duration: 8 }])).toBeUndefined()
  })
})

describe('estimateRemainingMs', () => {
  it('subtracts elapsed from a historical total before progress exists', () => {
    expect(estimateRemainingMs({ elapsedMs: 10_000, historicalTotalMs: 40_000 })).toBe(30_000)
  })

  it('uses live pace once steps have started', () => {
    expect(
      estimateRemainingMs({ elapsedMs: 20_000, progress: 0.5 }),
    ).toBe(20_000)
  })

  it('adds the rest of a queue', () => {
    expect(
      estimateRemainingMs({
        elapsedMs: 10_000,
        historicalTotalMs: 40_000,
        queueTailMs: 20_000,
      }),
    ).toBe(50_000)
  })
})

describe('timing persistence', () => {
  it('round-trips a log through localStorage', () => {
    const log = recordGenerate(recordLoad(EMPTY_TIMING, 45_000), 8, 40_000)
    saveTimingLog(log)
    expect(localStorage.getItem(TIMING_STORAGE_KEY)).toBeTruthy()
    expect(loadTimingLog()).toEqual(log)
  })

  it('returns an empty log when storage is missing', () => {
    expect(loadTimingLog()).toEqual(EMPTY_TIMING)
  })
})
