import { describe, expect, it } from 'vitest'
import {
  PERF_TEST_SETTINGS_MATRIX,
  getBaselineGenerateMs,
  getBaselineLoadMs,
  getBaselineQueueMs,
  getBatchQueuePace,
  getPerfMetrics,
  getTakesGenerateMs,
} from '@/lib/perfBenchmarks'

describe('perfBenchmarks', () => {
  describe('getBaselineLoadMs', () => {
    it('returns FP16 load baseline by default', () => {
      expect(getBaselineLoadMs()).toBe(12_000)
    })

    it('returns FP32 load baseline when specified', () => {
      expect(getBaselineLoadMs('fp32')).toBe(18_000)
    })

    it('returns mock load baseline in mock mode', () => {
      expect(getBaselineLoadMs('fp16', true)).toBe(2_000)
    })
  })

  describe('getBaselineGenerateMs', () => {
    it('returns 0 for invalid duration', () => {
      expect(getBaselineGenerateMs(0)).toBe(0)
      expect(getBaselineGenerateMs(-5)).toBe(0)
    })

    it('clamps step counts between 4 and 100', () => {
      const minStepMs = getBaselineGenerateMs(8.0, { steps: 1, precision: 'fp16' })
      const clamped4Ms = getBaselineGenerateMs(8.0, { steps: 4, precision: 'fp16' })
      expect(minStepMs).toBe(clamped4Ms)

      const maxStepMs = getBaselineGenerateMs(8.0, { steps: 200, precision: 'fp16' })
      const clamped100Ms = getBaselineGenerateMs(8.0, { steps: 100, precision: 'fp16' })
      expect(maxStepMs).toBe(clamped100Ms)
    })

    it('estimates micro tier effect (0.5s @ 4 steps) in FP16', () => {
      const ms = getBaselineGenerateMs(0.5, { steps: 4, precision: 'fp16' })
      expect(ms).toBeGreaterThan(4_000)
      expect(ms).toBeLessThan(7_000)
    })

    it('estimates quick tier effect (1.5s @ 8 steps) in FP16', () => {
      const ms = getBaselineGenerateMs(1.5, { steps: 8, precision: 'fp16' })
      expect(ms).toBeGreaterThan(5_000)
      expect(ms).toBeLessThan(9_000)
    })

    it('estimates standard 8s clip @ 20 steps in FP16', () => {
      const ms = getBaselineGenerateMs(8.0, { steps: 20, precision: 'fp16' })
      expect(ms).toBeGreaterThan(12_000)
      expect(ms).toBeLessThan(20_000)
    })

    it('estimates long ambience (120s @ 20 steps) in FP16', () => {
      const ms = getBaselineGenerateMs(120.0, { steps: 20, precision: 'fp16' })
      expect(ms).toBeGreaterThan(50_000)
      expect(ms).toBeLessThan(80_000)
    })

    it('estimates max duration limit (380s @ 20 steps) in FP16', () => {
      const ms = getBaselineGenerateMs(380.0, { steps: 20, precision: 'fp16' })
      expect(ms).toBeGreaterThan(150_000)
      expect(ms).toBeLessThan(220_000)
    })

    it('monotonically increases with duration', () => {
      const durations = [0.5, 1.5, 8.0, 20.0, 60.0, 120.0, 380.0]
      for (let i = 0; i < durations.length - 1; i += 1) {
        const ms1 = getBaselineGenerateMs(durations[i]!, { steps: 20, precision: 'fp16' })
        const ms2 = getBaselineGenerateMs(durations[i + 1]!, { steps: 20, precision: 'fp16' })
        expect(ms2).toBeGreaterThan(ms1)
      }
    })

    it('monotonically increases with steps', () => {
      const stepsList = [4, 10, 20, 35, 50, 100]
      for (let i = 0; i < stepsList.length - 1; i += 1) {
        const ms1 = getBaselineGenerateMs(8.0, { steps: stepsList[i]!, precision: 'fp16' })
        const ms2 = getBaselineGenerateMs(8.0, { steps: stepsList[i + 1]!, precision: 'fp16' })
        expect(ms2).toBeGreaterThan(ms1)
      }
    })

    it('consistently scales FP32 higher than FP16 across duration tiers', () => {
      const testCases = [0.5, 3.0, 8.0, 20.0, 120.0, 380.0]
      for (const dur of testCases) {
        const fp16 = getBaselineGenerateMs(dur, { steps: 20, precision: 'fp16' })
        const fp32 = getBaselineGenerateMs(dur, { steps: 20, precision: 'fp32' })
        expect(fp32).toBeGreaterThan(fp16)
      }
    })

    it('handles mock engine timing cleanly', () => {
      const mockMs = getBaselineGenerateMs(8.0, { steps: 20, isMock: true })
      expect(mockMs).toBe(150 + 20 * 50)
    })
  })

  describe('getTakesGenerateMs', () => {
    it('accurately quadruples the single generate estimate for 4-takes batch', () => {
      const single = getBaselineGenerateMs(8.0, { steps: 20, precision: 'fp16' })
      const takes = getTakesGenerateMs(8.0, { steps: 20, precision: 'fp16' })
      expect(takes).toBe(single * 4)
    })
  })

  describe('getBaselineQueueMs and getBatchQueuePace', () => {
    it('sums baseline estimates for mixed duration queues', () => {
      const items = [
        { duration: 1.5, steps: 4 },
        { duration: 8.0, steps: 20 },
        { duration: 20.0, steps: 20 },
      ]
      const queueMs = getBaselineQueueMs(items, { precision: 'fp16' })
      const expected =
        getBaselineGenerateMs(1.5, { steps: 4, precision: 'fp16' }) +
        getBaselineGenerateMs(8.0, { steps: 20, precision: 'fp16' }) +
        getBaselineGenerateMs(20.0, { steps: 20, precision: 'fp16' })
      expect(queueMs).toBe(expected)

      const pace = getBatchQueuePace(items, { precision: 'fp16' })
      expect(pace.totalMs).toBe(expected)
      expect(pace.clipCount).toBe(3)
      expect(pace.averageClipMs).toBe(Math.round(expected / 3))
    })

    it('handles empty queue in getBatchQueuePace gracefully', () => {
      const pace = getBatchQueuePace([])
      expect(pace.totalMs).toBe(0)
      expect(pace.clipCount).toBe(0)
      expect(pace.averageClipMs).toBe(0)
    })
  })

  describe('getPerfMetrics', () => {
    it('calculates throughput, real-time factor, and VRAM correctly for standard setting', () => {
      const setting = PERF_TEST_SETTINGS_MATRIX.find(
        (s) => s.name === 'Standard SFX Default (FP16, 20 steps)',
      )!
      expect(setting).toBeDefined()
      const metrics = getPerfMetrics(setting)
      expect(metrics.estimatedMs).toBeGreaterThan(10_000)
      expect(metrics.realTimeFactor).toBeGreaterThan(0)
      expect(metrics.stepsPerSecond).toBeGreaterThan(0)
      expect(metrics.estimatedVramGb).toBeGreaterThanOrEqual(6.0)
    })

    it('calculates metrics for 4-takes batch settings', () => {
      const takesSetting = PERF_TEST_SETTINGS_MATRIX.find((s) => s.batchTakes)!
      expect(takesSetting).toBeDefined()
      const metrics = getPerfMetrics(takesSetting)
      expect(metrics.estimatedMs).toBeGreaterThan(0)
      expect(metrics.realTimeFactor).toBeGreaterThan(0)
    })
  })

  describe('PERF_TEST_SETTINGS_MATRIX', () => {
    it('contains comprehensive variations across all tiers', () => {
      expect(PERF_TEST_SETTINGS_MATRIX.length).toBeGreaterThanOrEqual(25)

      const tiers = new Set(PERF_TEST_SETTINGS_MATRIX.map((s) => s.tier))
      expect(tiers.has('micro')).toBe(true)
      expect(tiers.has('quick')).toBe(true)
      expect(tiers.has('standard')).toBe(true)
      expect(tiers.has('extended')).toBe(true)
      expect(tiers.has('epic')).toBe(true)
      expect(tiers.has('max')).toBe(true)

      const precisions = new Set(PERF_TEST_SETTINGS_MATRIX.map((s) => s.precision))
      expect(precisions.has('fp16')).toBe(true)
      expect(precisions.has('fp32')).toBe(true)

      for (const setting of PERF_TEST_SETTINGS_MATRIX) {
        const metrics = getPerfMetrics(setting)
        expect(metrics.estimatedMs).toBeGreaterThan(0)
        expect(metrics.realTimeFactor).toBeGreaterThan(0)
        expect(metrics.stepsPerSecond).toBeGreaterThan(0)
        expect(metrics.estimatedVramGb).toBeGreaterThan(0)
      }
    })
  })
})