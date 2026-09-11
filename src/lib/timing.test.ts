/**
 * @vitest-environment jsdom
 */
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
  type TimingLog,
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
    expect(log.loads[0]?.elapsedMs).toBe(40_006)
    expect(log.loads.at(-1)?.elapsedMs).toBe(40_029)
  })

  it('ignores invalid load samples', () => {
    expect(recordLoad(EMPTY_TIMING, 0).loads).toEqual([])
    expect(recordLoad(EMPTY_TIMING, Number.NaN).loads).toEqual([])
  })

  it('keeps the configuration a load was measured under', () => {
    const log = recordLoad(EMPTY_TIMING, 30_000, { precision: 'fp32', model: 'medium-base' })
    expect(log.loads[0]).toMatchObject({
      elapsedMs: 30_000,
      precision: 'fp32',
      model: 'medium-base',
    })
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
    const estimate = estimateLoadMs(log)
    expect(estimate).toBeGreaterThan(42_000)
    expect(estimate).toBeLessThan(48_000)
  })

  it('discounts loads of a different precision', () => {
    // One slow fp32 load should not become the quote for an fp16 load.
    let log = recordLoad(EMPTY_TIMING, 60_000, { precision: 'fp32' })
    log = recordLoad(log, 10_000, { precision: 'fp16' })
    expect(estimateLoadMs(log, { precision: 'fp16' })).toBeLessThan(14_000)
    expect(estimateLoadMs(log, { precision: 'fp32' })).toBeGreaterThan(40_000)
  })

  it('ignores loads of a different checkpoint entirely', () => {
    let log = recordLoad(EMPTY_TIMING, 200_000, { model: 'medium-base' })
    log = recordLoad(log, 12_000, { model: 'medium' })
    expect(estimateLoadMs(log, { model: 'medium' })).toBe(12_000)
  })

  it('falls back to the baseline rather than quoting another checkpoint', () => {
    // The 9GB Medium-Base download is not a slow version of a Medium load.
    const log = recordLoad(EMPTY_TIMING, 400_000, { model: 'medium-base' })
    expect(estimateLoadMs(log, { model: 'medium' })).toBe(getBaselineLoadMs('fp16'))
  })

  it('leans on the newest loads when the machine changes pace', () => {
    let log = EMPTY_TIMING
    for (let i = 0; i < 6; i += 1) log = recordLoad(log, 60_000)
    for (let i = 0; i < 6; i += 1) log = recordLoad(log, 20_000)
    // Recency weighting has to pull the estimate below the midpoint of the two
    // regimes, or a machine that got faster keeps being quoted its old pace.
    expect(estimateLoadMs(log)).toBeLessThan(35_000)
  })
})

describe('estimateGenerateMs', () => {
  it('uses baseline performance test estimate when no generates exist', () => {
    const baseline = getBaselineGenerateMs(8, { steps: 20, precision: 'fp16' })
    expect(estimateGenerateMs(EMPTY_TIMING, 8, { steps: 20, precision: 'fp16' })).toBe(baseline)
  })

  it('reproduces a single sample at its own clip length', () => {
    const log = recordGenerate(EMPTY_TIMING, 8, 40_000)
    expect(estimateGenerateMs(log, 8)).toBe(40_000)
  })

  it('does not scale a short clip down in proportion to its length', () => {
    // A 1.5s clip is not 3/16 of an 8s one: setup, per-step overhead and the
    // decode barely move with duration. Straight proportional scaling is what
    // made short clips read as near-instant and then overrun by minutes.
    const log = recordGenerate(EMPTY_TIMING, 8, 40_000)
    const short = estimateGenerateMs(log, 1.5)
    expect(short).toBeGreaterThan(40_000 * 0.5)
    expect(short).toBeLessThan(40_000)
  })

  it('prices guidance separately from step count', () => {
    // Max quality runs classifier-free guidance, which runs a doubled batch.
    const guided = estimateGenerateMs(EMPTY_TIMING, 8, { steps: 20, cfg: 4 })
    const unguided = estimateGenerateMs(EMPTY_TIMING, 8, { steps: 20, cfg: 1 })
    expect(guided).toBeGreaterThan(unguided * 1.5)
  })

  it('keeps guided and unguided runs from averaging into one wrong number', () => {
    // A machine running at exactly twice the baseline cost, sampled under both
    // Balanced (cfg 1) and Max quality (cfg 4). Before guidance was priced in,
    // these two populations averaged together and predicted neither.
    const guidedTruth = getBaselineGenerateMs(8, { steps: 20, cfg: 4 }) * 2
    const plainTruth = getBaselineGenerateMs(8, { steps: 20, cfg: 1 }) * 2
    let log = EMPTY_TIMING
    for (let i = 0; i < 3; i += 1) {
      log = recordGenerate(log, 8, guidedTruth, { steps: 20, cfg: 4 })
      log = recordGenerate(log, 8, plainTruth, { steps: 20, cfg: 1 })
    }
    expect(estimateGenerateMs(log, 8, { steps: 20, cfg: 4 })).toBeCloseTo(guidedTruth, -2)
    expect(estimateGenerateMs(log, 8, { steps: 20, cfg: 1 })).toBeCloseTo(plainTruth, -2)
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
    const total = estimateQueueMs(log, [{ duration: 8 }, { duration: 1.5 }, { duration: 8 }])
    expect(total).toBe(
      estimateGenerateMs(log, 8) * 2 + estimateGenerateMs(log, 1.5),
    )
  })

  it('prices each queue item on its own step count and guidance', () => {
    const cheap = estimateQueueMs(EMPTY_TIMING, [{ duration: 8, steps: 8, cfg: 1 }])!
    const dear = estimateQueueMs(EMPTY_TIMING, [{ duration: 8, steps: 50, cfg: 4 }])!
    expect(dear).toBeGreaterThan(cheap * 3)
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

  it('scales the estimate with step count, not just duration', () => {
    // Samples all recorded at 10 steps: 8s took 8s, 16s took 16s.
    let log: TimingLog = { buildId: 'b', loads: [], generates: [] }
    log = recordGenerate(log, 8, 8_000, { steps: 10 })
    log = recordGenerate(log, 16, 16_000, { steps: 10 })
    log = recordGenerate(log, 24, 24_000, { steps: 10 })
    log = recordGenerate(log, 32, 32_000, { steps: 10 })

    const atTenSteps = estimateGenerateMs(log, 16, { steps: 10 })
    const atTwentySteps = estimateGenerateMs(log, 16, { steps: 20 })

    expect(atTenSteps).toBeGreaterThan(0)
    // Sampling dominates, but not entirely: setup and the decode do not double
    // with the step count, so twice the steps is well under twice the wait.
    expect(atTwentySteps / atTenSteps).toBeGreaterThan(1.5)
    expect(atTwentySteps / atTenSteps).toBeLessThan(2.0)
  })

  it('does not let samples at different step counts skew each other', () => {
    // A mix of cheap draft runs and expensive hi-fi runs of the same duration.
    let log: TimingLog = { buildId: 'b', loads: [], generates: [] }
    log = recordGenerate(log, 10, 5_000, { steps: 8 })
    log = recordGenerate(log, 10, 5_000, { steps: 8 })
    log = recordGenerate(log, 10, 20_000, { steps: 32 })
    log = recordGenerate(log, 10, 20_000, { steps: 32 })

    // Each quality setting should predict close to what it actually took.
    expect(estimateGenerateMs(log, 10, { steps: 8 })).toBeLessThan(9_000)
    expect(estimateGenerateMs(log, 10, { steps: 32 })).toBeGreaterThan(16_000)
  })
})