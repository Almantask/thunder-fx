import type { PrecisionMode } from '@/lib/types'

export type PerfTier = 'micro' | 'quick' | 'standard' | 'extended' | 'epic' | 'max'

export type PerfBenchmarkSetting = {
  name: string
  tier: PerfTier
  precision: PrecisionMode
  duration: number
  steps: number
  mode?: 'sfx' | 'music'
  category?: string
  batchTakes?: boolean
}

export type PerfMetrics = {
  estimatedMs: number
  realTimeFactor: number // ratio of compute time to audio duration (time / duration)
  stepsPerSecond: number
  estimatedVramGb: number
}

/**
 * What a generation costs, split into the three stretches the engine can
 * actually time separately.
 *
 * The split is what makes an estimate correctable. A run reports when its first
 * diffusion step lands, when its last one does, and when the WAV is written, so
 * every term below can be measured against reality and scaled — see
 * `getMeasuredPhaseModel` in `timing.ts`. A single lumped ms-per-second figure
 * cannot be corrected that way: a slow decode and a slow sampler are
 * indistinguishable in it, and they scale with different things.
 */
export type PhaseCostModel = {
  /** Setup before the first step: conditioning, tokenising, allocation. */
  leadMs: number
  /** Per diffusion step, independent of clip length. */
  stepBaseMs: number
  /** Per diffusion step, per second of audio — the latent grows with duration. */
  stepPerSecMs: number
  /** After the last step: VAE decode, mastering, WAV write. */
  tailBaseMs: number
  /** Decode and write cost per second of audio. */
  tailPerSecMs: number
}

export type BaselinePerfModel = {
  loadMs: {
    fp16: number
    fp32: number
    mock: number
  }
  generate: {
    fp16: PhaseCostModel & { vramBaseGb: number; vramPerSecGb: number }
    fp32: PhaseCostModel & { vramBaseGb: number; vramPerSecGb: number }
    mock: PhaseCostModel & { vramBaseGb: number; vramPerSecGb: number }
  }
}

/**
 * Empirically measured baseline estimates.
 *
 * Load times are the NVMe hardware-reference measurements (RTX 3090, Samsung
 * 980 PRO / Kingston SA2000). Generate costs are the phase model that produces
 * the README estimate table; `scripts/bench_estimates.py` reprints both from
 * these constants so the first-run UI and the docs cannot drift apart.
 *
 * The old 12 s FP16 load figure was a mechanical-HDD-class guess. Fast Preview
 * used to measure 12.6 s wall because every clip denoised 6 s of padding
 * (PQ-01); the phase model is the loaded-model cost without that padding.
 */
export const BASELINE_PERF_ESTIMATES: BaselinePerfModel = {
  loadMs: {
    fp16: 3_500,
    fp32: 5_200,
    mock: 2_000,
  },
  generate: {
    fp16: {
      leadMs: 1_600,
      stepBaseMs: 380,
      stepPerSecMs: 21,
      tailBaseMs: 1_600,
      tailPerSecMs: 40,
      vramBaseGb: 6.2,
      vramPerSecGb: 0.008,
    },
    fp32: {
      leadMs: 2_400,
      stepBaseMs: 520,
      stepPerSecMs: 31,
      tailBaseMs: 2_400,
      tailPerSecMs: 60,
      vramBaseGb: 12.8,
      vramPerSecGb: 0.016,
    },
    mock: {
      leadMs: 100,
      stepBaseMs: 50,
      stepPerSecMs: 0,
      tailBaseMs: 50,
      tailPerSecMs: 0,
      vramBaseGb: 0.4,
      vramPerSecGb: 0.0,
    },
  },
}

export type GenerateCostOptions = {
  steps?: number
  precision?: PrecisionMode
  isMock?: boolean
  /**
   * Guidance scale. Above 1, classifier-free guidance runs the conditioned and
   * unconditioned batches together, so a step costs close to twice as much.
   * Max quality is the preset that turns this on, and before it was priced in,
   * its first run was estimated at roughly half its real cost.
   */
  cfg?: number
  /**
   * Checkpoint the run will load. Medium and Medium-Base do not share a step
   * cost, so the measured model is fitted per name rather than averaged.
   */
  model?: string
}

/** Steps outside this range are not configurations the engine will run. */
export function clampSteps(steps: number | undefined): number {
  return Math.max(4, Math.min(100, Math.round(steps ?? 20)))
}

/** Classifier-free guidance runs a doubled batch; the extra is not quite 2x. */
export function guidanceFactor(cfg: number | undefined): number {
  return cfg != null && Number.isFinite(cfg) && cfg > 1 ? 1.85 : 1
}

export function getBaselinePhaseModel(options?: GenerateCostOptions): PhaseCostModel {
  const isMock = Boolean(options?.isMock)
  const model = isMock
    ? BASELINE_PERF_ESTIMATES.generate.mock
    : options?.precision === 'fp32'
      ? BASELINE_PERF_ESTIMATES.generate.fp32
      : BASELINE_PERF_ESTIMATES.generate.fp16
  const guidance = isMock ? 1 : guidanceFactor(options?.cfg)
  return {
    leadMs: model.leadMs,
    stepBaseMs: model.stepBaseMs * guidance,
    stepPerSecMs: model.stepPerSecMs * guidance,
    tailBaseMs: model.tailBaseMs,
    tailPerSecMs: model.tailPerSecMs,
  }
}

/** Cost of one diffusion step at this clip length, under a phase model. */
export function phaseStepMs(model: PhaseCostModel, seconds: number): number {
  return model.stepBaseMs + model.stepPerSecMs * Math.max(0, seconds)
}

/** Cost of the decode-and-write tail at this clip length, under a phase model. */
export function phaseTailMs(model: PhaseCostModel, seconds: number): number {
  return model.tailBaseMs + model.tailPerSecMs * Math.max(0, seconds)
}

/** Whole-run cost under a phase model: lead, then every step, then the tail. */
export function phaseTotalMs(
  model: PhaseCostModel,
  seconds: number,
  steps: number,
): number {
  return model.leadMs + steps * phaseStepMs(model, seconds) + phaseTailMs(model, seconds)
}

export function getBaselineLoadMs(precision: PrecisionMode = 'fp16', isMock = false): number {
  if (isMock) return BASELINE_PERF_ESTIMATES.loadMs.mock
  return precision === 'fp32'
    ? BASELINE_PERF_ESTIMATES.loadMs.fp32
    : BASELINE_PERF_ESTIMATES.loadMs.fp16
}

export function getBaselineGenerateMs(
  seconds: number,
  options?: GenerateCostOptions,
): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  const steps = clampSteps(options?.steps)
  return Math.round(phaseTotalMs(getBaselinePhaseModel(options), seconds, steps))
}

export function getTakesGenerateMs(
  seconds: number,
  options?: GenerateCostOptions,
): number {
  const single = getBaselineGenerateMs(seconds, options)
  return single * 4
}

/** A queue entry priced on its own terms — presets can differ per item. */
export type QueueCostItem = { duration: number; steps?: number; cfg?: number; model?: string }

export function getBaselineQueueMs(
  items: QueueCostItem[],
  options?: {
    precision?: PrecisionMode
    isMock?: boolean
  },
): number {
  let total = 0
  for (const item of items) {
    total += getBaselineGenerateMs(item.duration, {
      steps: item.steps,
      cfg: item.cfg,
      model: item.model,
      precision: options?.precision,
      isMock: options?.isMock,
    })
  }
  return total
}

export function getBatchQueuePace(
  items: QueueCostItem[],
  options?: {
    precision?: PrecisionMode
    isMock?: boolean
  },
): { totalMs: number; averageClipMs: number; clipCount: number } {
  const totalMs = getBaselineQueueMs(items, options)
  const clipCount = items.length
  const averageClipMs = clipCount > 0 ? Math.round(totalMs / clipCount) : 0
  return { totalMs, averageClipMs, clipCount }
}

export function getPerfMetrics(
  setting: PerfBenchmarkSetting,
  isMock = false,
): PerfMetrics {
  const count = setting.batchTakes ? 4 : 1
  const singleMs = getBaselineGenerateMs(setting.duration, {
    steps: setting.steps,
    precision: setting.precision,
    isMock,
  })
  const estimatedMs = singleMs * count
  const durationSec = setting.duration * count
  const realTimeFactor = durationSec > 0 ? (estimatedMs / 1000) / durationSec : 0

  const totalSteps = setting.steps * count
  const elapsedSec = estimatedMs / 1000
  const stepsPerSecond = elapsedSec > 0 ? Math.round((totalSteps / elapsedSec) * 10) / 10 : 0

  const model = isMock
    ? BASELINE_PERF_ESTIMATES.generate.mock
    : setting.precision === 'fp32'
      ? BASELINE_PERF_ESTIMATES.generate.fp32
      : BASELINE_PERF_ESTIMATES.generate.fp16

  const estimatedVramGb = Math.round((model.vramBaseGb + setting.duration * model.vramPerSecGb) * 10) / 10

  return {
    estimatedMs,
    realTimeFactor: Math.round(realTimeFactor * 100) / 100,
    stepsPerSecond,
    estimatedVramGb,
  }
}

export const PERF_TEST_SETTINGS_MATRIX: PerfBenchmarkSetting[] = [
  // 1. Micro Tier (0.5s - 1.0s): UI clicks, glitches, tiny foley
  { name: 'Micro UI Click (FP16, 4 steps)', tier: 'micro', precision: 'fp16', duration: 0.5, steps: 4, mode: 'sfx' },
  { name: 'Micro UI Click (FP32, 4 steps)', tier: 'micro', precision: 'fp32', duration: 0.5, steps: 4, mode: 'sfx' },
  { name: 'Micro Glitch (FP16, 10 steps)', tier: 'micro', precision: 'fp16', duration: 1.0, steps: 10, mode: 'sfx' },
  
  // 2. Quick Tier (1.5s - 4.0s): Footsteps, sword swings, punches, spells
  { name: 'Quick Footstep (FP16, 8 steps)', tier: 'quick', precision: 'fp16', duration: 1.5, steps: 8, mode: 'sfx' },
  { name: 'Quick Footstep (FP32, 8 steps)', tier: 'quick', precision: 'fp32', duration: 1.5, steps: 8, mode: 'sfx' },
  { name: 'Action Impact (FP16, 15 steps)', tier: 'quick', precision: 'fp16', duration: 3.0, steps: 15, mode: 'sfx' },
  { name: 'Action Impact (FP32, 15 steps)', tier: 'quick', precision: 'fp32', duration: 3.0, steps: 15, mode: 'sfx' },
  
  // 3. Standard Tier (6.0s - 20.0s): Standard sound effects and music starters
  { name: 'Standard SFX Default (FP16, 20 steps)', tier: 'standard', precision: 'fp16', duration: 8.0, steps: 20, mode: 'sfx' },
  { name: 'Standard SFX Default (FP32, 20 steps)', tier: 'standard', precision: 'fp32', duration: 8.0, steps: 20, mode: 'sfx' },
  { name: 'Detailed Creature Roar (FP16, 30 steps)', tier: 'standard', precision: 'fp16', duration: 10.0, steps: 30, mode: 'sfx' },
  { name: 'Detailed Creature Roar (FP32, 30 steps)', tier: 'standard', precision: 'fp32', duration: 10.0, steps: 30, mode: 'sfx' },
  { name: 'Short Music Stinger (FP16, 20 steps)', tier: 'standard', precision: 'fp16', duration: 15.0, steps: 20, mode: 'music' },
  { name: 'Music Default Bed (FP16, 20 steps)', tier: 'standard', precision: 'fp16', duration: 20.0, steps: 20, mode: 'music' },
  { name: 'Music Default Bed (FP32, 20 steps)', tier: 'standard', precision: 'fp32', duration: 20.0, steps: 20, mode: 'music' },
  
  // 4. Extended Tier (30.0s - 90.0s): Loops, refined themes, ambience beds
  { name: 'Refined Music Track (FP16, 35 steps)', tier: 'extended', precision: 'fp16', duration: 30.0, steps: 35, mode: 'music' },
  { name: 'Refined Music Track (FP32, 35 steps)', tier: 'extended', precision: 'fp32', duration: 30.0, steps: 35, mode: 'music' },
  { name: 'Seamless Loop Bed (FP16, 20 steps)', tier: 'extended', precision: 'fp16', duration: 45.0, steps: 20, mode: 'music' },
  { name: 'Extended Atmosphere (FP16, 25 steps)', tier: 'extended', precision: 'fp16', duration: 60.0, steps: 25, mode: 'sfx' },
  { name: 'Tavern Ambience (FP16, 20 steps)', tier: 'extended', precision: 'fp16', duration: 90.0, steps: 20, mode: 'sfx' },
  
  // 5. Epic Tier (120.0s - 240.0s): Long ambient soundscapes
  { name: 'Long Ambience Cue (FP16, 20 steps)', tier: 'epic', precision: 'fp16', duration: 120.0, steps: 20, mode: 'sfx' },
  { name: 'Long Ambience Cue (FP32, 20 steps)', tier: 'epic', precision: 'fp32', duration: 120.0, steps: 20, mode: 'sfx' },
  { name: 'Dungeon Exploration Bed (FP16, 20 steps)', tier: 'epic', precision: 'fp16', duration: 180.0, steps: 20, mode: 'sfx' },
  { name: 'Epic Siege Ambience (FP16, 20 steps)', tier: 'epic', precision: 'fp16', duration: 240.0, steps: 20, mode: 'sfx' },
  
  // 6. Max Duration Tier (300.0s - 380.0s SA3 Medium Limit)
  { name: 'Extended Forest Ambience (FP16, 20 steps)', tier: 'max', precision: 'fp16', duration: 300.0, steps: 20, mode: 'sfx' },
  { name: 'Max Duration Limit (FP16, 20 steps)', tier: 'max', precision: 'fp16', duration: 380.0, steps: 20, mode: 'sfx' },
  { name: 'Max Duration Limit (FP32, 20 steps)', tier: 'max', precision: 'fp32', duration: 380.0, steps: 20, mode: 'sfx' },
  
  // 7. Master Quality Tier (High step counts)
  { name: 'Studio High-Fidelity Master (FP32, 50 steps)', tier: 'standard', precision: 'fp32', duration: 8.0, steps: 50, mode: 'sfx' },
  { name: 'Studio Ultra Master (FP32, 100 steps)', tier: 'standard', precision: 'fp32', duration: 8.0, steps: 100, mode: 'sfx' },
  { name: 'Music High-Step Master (FP32, 50 steps)', tier: 'standard', precision: 'fp32', duration: 20.0, steps: 50, mode: 'music' },
  
  // 8. 4-Takes Batch Casting Variations
  { name: 'Fast 4-Takes Casting (FP16, 4 steps)', tier: 'quick', precision: 'fp16', duration: 1.5, steps: 4, mode: 'sfx', batchTakes: true },
  { name: 'Standard 4-Takes Casting (FP16, 20 steps)', tier: 'standard', precision: 'fp16', duration: 8.0, steps: 20, mode: 'sfx', batchTakes: true },
  { name: 'Music 4-Takes Casting (FP16, 20 steps)', tier: 'standard', precision: 'fp16', duration: 20.0, steps: 20, mode: 'music', batchTakes: true },
]