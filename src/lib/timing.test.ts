import { afterEach, describe, expect, it } from 'vitest'
import {
  EMPTY_TIMING,
  TIMING_STORAGE_KEY,
  estimateGenerateMs,
  estimateLoadMs,
  estimateQueueMs,
  estimateRemainingMs,
  formatEstimateClock,
  hasRealMachineSamples,
  loadTimingLog,
  recordGenerate,
  recordLoad,
  saveTimingLog,
  wipeTimingLog,
} from '@/lib/timing'
import { getBaselineGenerateMs, getBaselineLoadMs } from '@/lib/perfBenchmarks'

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
  it('uses performance test baseline estimate when no loads have finished', () => {
    expect(estimateLoadMs(EMPTY_TIMING)).toBe(getBaselineLoadMs('fp16'))
    expect(estimateLoadMs(EMPTY_TIMING, { precision: 'fp32' })).toBe(getBaselineLoadMs('fp32'))
    expect(estimateLoadMs(EMPTY_TIMING, { isMock: true })).toBe(getBaselineLoadMs('fp16', true))
  })

  it('uses the completed load once machine has recorded one', () => {
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
  it('uses baseline performance test estimate when no generates exist', () => {
    const baseline = getBaselineGenerateMs(8, { steps: 20, precision: 'fp16' })
    expect(estimateGenerateMs(EMPTY_TIMING, 8, { steps: 20, precision: 'fp16' })).toBe(baseline)
  })

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
  it('sums per-clip estimates using machine history when available', () => {
    const log = recordGenerate(EMPTY_TIMING, 8, 40_000)
    expect(
      estimateQueueMs(log, [{ duration: 8 }, { duration: 1.5 }, { duration: 8 }]),
    ).toBe(87_500)
  })

  it('uses baseline performance estimates when queue is estimated with empty history', () => {
    const baselineTotal =
      getBaselineGenerateMs(8, { steps: 20, precision: 'fp16' }) +
      getBaselineGenerateMs(1.5, { steps: 20, precision: 'fp16' })
    expect(
      estimateQueueMs(EMPTY_TIMING, [{ duration: 8 }, { duration: 1.5 }], { precision: 'fp16' }),
    ).toBe(baselineTotal)
  })

  it('returns undefined for empty queue', () => {
    expect(estimateQueueMs(EMPTY_TIMING, [])).toBeUndefined()
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

describe('timing persistence and build wiping', () => {
  it('round-trips a log through localStorage with matching build ID', () => {
    const log = recordGenerate(recordLoad(EMPTY_TIMING, 45_000), 8, 40_000)
    saveTimingLog(log)
    expect(localStorage.getItem(TIMING_STORAGE_KEY)).toBeTruthy()
    const loaded = loadTimingLog(log.buildId)
    expect(loaded.loads).toEqual(log.loads)
    expect(loaded.generates).toEqual(log.generates)
  })

  it('wipes previous estimates when a new exe build ID is detected', () => {
    const oldLog = recordGenerate(recordLoad({ buildId: 'build-v1', loads: [], generates: [] }, 45_000), 8, 40_000)
    saveTimingLog(oldLog)
    expect(hasRealMachineSamples(loadTimingLog('build-v1'))).toBe(true)

    // Load with new build ID 'build-v2'
    const newLog = loadTimingLog('build-v2')
    expect(newLog.buildId).toBe('build-v2')
    expect(newLog.loads).toEqual([])
    expect(newLog.generates).toEqual([])
    expect(hasRealMachineSamples(newLog)).toBe(false)
  })

  it('wipeTimingLog removes storage completely', () => {
    saveTimingLog(recordLoad(EMPTY_TIMING, 10_000))
    wipeTimingLog()
    expect(localStorage.getItem(TIMING_STORAGE_KEY)).toBeNull()
  })
})