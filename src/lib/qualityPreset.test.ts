import { describe, expect, it } from 'vitest'
import {
  BASE_MODEL,
  DEFAULT_PRESET,
  DETERMINISTIC_SAMPLERS,
  PINGPONG_STEP_WARNING_THRESHOLD,
  QUALITY_PRESETS,
  presetLabel,
  presetUnavailableMessage,
  presetUsesNegativePrompt,
  resolvePresetPlan,
  resolveQualityPreset,
  stepsWarning,
  type QualityPreset,
} from '@/lib/qualityPreset'

describe('quality presets', () => {
  it('keeps the fast presets on the distilled checkpoint', () => {
    const speed = resolvePresetPlan('speed', { baseAvailable: false })
    expect(speed).toMatchObject({ model: 'medium', sampler: 'pingpong', steps: 8, cfg: 1 })
    const balanced = resolvePresetPlan('balanced', { baseAvailable: false })
    expect(balanced).toMatchObject({ model: 'medium', sampler: 'pingpong', steps: 20, cfg: 1 })
  })

  it('runs Max quality on the un-distilled checkpoint with real guidance', () => {
    const plan = resolvePresetPlan('quality', { mode: 'sfx', baseAvailable: true })
    expect(plan.model).toBe(BASE_MODEL)
    expect(plan.sampler).toBe('euler')
    expect(plan.cfg).toBeGreaterThan(1)
    expect(plan.unavailable).toBe(false)
  })

  it('picks guidance strength per content type', () => {
    // Measured: more guidance sharpens a one-shot and dulls a bed, so a rain
    // bed wants materially less of it than a door slam.
    const sfx = resolvePresetPlan('quality', { mode: 'sfx', baseAvailable: true })
    const ambience = resolvePresetPlan('quality', { mode: 'ambience', baseAvailable: true })
    expect(sfx.cfg).toBeGreaterThan(ambience.cfg)
    // Guidance off would switch the negative prompt back off too.
    expect(ambience.cfg).toBeGreaterThan(1)
  })

  it('keeps instrumental on the checkpoint that measured better', () => {
    // No CFG tested beat Balanced for music, so Max quality does not pretend.
    for (const baseAvailable of [true, false]) {
      const plan = resolvePresetPlan('quality', { mode: 'music', baseAvailable })
      const balanced = resolvePresetPlan('balanced')
      expect(plan.model).toBe(balanced.model)
      expect(plan.sampler).toBe(balanced.sampler)
      expect(plan.steps).toBe(balanced.steps)
      // Needing no extra checkpoint, it never refuses.
      expect(plan.unavailable).toBe(false)
    }
  })

  it('reports Max quality as unavailable rather than substituting for it', () => {
    const plan = resolvePresetPlan('quality', { mode: 'sfx', baseAvailable: false })
    expect(plan.unavailable).toBe(true)
    // It must keep describing what Max quality *is*, not quietly become another
    // preset. Generation refuses with advice; nothing else runs in its place.
    expect(plan.model).toBe(BASE_MODEL)
    expect(plan.sampler).toBe('euler')
    expect(plan.steps).toBe(50)
    expect(plan.cfg).toBeGreaterThan(1)
  })

  it('explains how to fix an unavailable preset', () => {
    const message = presetUnavailableMessage('quality')
    expect(message).toMatch(/Max quality/)
    expect(message).toMatch(/Download Medium-Base/i)
    expect(message).toMatch(/switch to Balanced/i)
  })

  it('never marks a preset that runs on Medium as unavailable', () => {
    for (const preset of ['speed', 'balanced', 'custom'] as QualityPreset[]) {
      expect(resolvePresetPlan(preset, { baseAvailable: false }).unavailable).toBe(false)
    }
    // And Max quality for instrumental, which stays on Medium.
    expect(
      resolvePresetPlan('quality', { mode: 'music', baseAvailable: false }).unavailable,
    ).toBe(false)
  })

  it('never puts a deterministic sampler on the distilled checkpoint', () => {
    // The regression that made Max quality sound underwater: `medium` is
    // ARC-distilled and its texture depends on pingpong re-noising every step.
    // A deterministic solver averages that away — dull, flat, and the same all
    // the way through.
    const presets: QualityPreset[] = ['speed', 'balanced', 'quality', 'custom']
    for (const preset of presets) {
      for (const baseAvailable of [true, false]) {
        for (const sampler of DETERMINISTIC_SAMPLERS) {
          const plan = resolvePresetPlan(preset, { baseAvailable, sampler })
          if (plan.model !== BASE_MODEL) {
            expect(
              DETERMINISTIC_SAMPLERS.includes(plan.sampler),
              `${preset} put ${plan.sampler} on ${plan.model}`,
            ).toBe(false)
          }
        }
      }
    }
  })

  it('allows deterministic sampling on the un-distilled checkpoint', () => {
    const plan = resolvePresetPlan('quality', { mode: 'sfx', baseAvailable: true })
    expect(plan.model).toBe(BASE_MODEL)
    expect(plan.sampler).toBe('euler')
  })

  it('never raises steps on pingpong to chase quality', () => {
    // The regression this whole preset table exists to prevent: a "better"
    // preset must not just be more pingpong steps.
    for (const spec of Object.values(QUALITY_PRESETS)) {
      if (spec.sampler === 'pingpong') {
        expect(spec.steps).toBeLessThanOrEqual(PINGPONG_STEP_WARNING_THRESHOLD)
      }
    }
  })

  it('lets a custom preset override steps, but not into a degraded sampler', () => {
    const plan = resolvePresetPlan('custom', { steps: 42, sampler: 'euler' })
    expect(plan.steps).toBe(42)
    expect(plan.preset).toBe('custom')
    expect(plan.sampler).toBe('pingpong')
  })

  it('falls back to the default for an unknown preset name', () => {
    expect(resolveQualityPreset('nonsense')).toBe(DEFAULT_PRESET)
    expect(resolveQualityPreset(undefined)).toBe(DEFAULT_PRESET)
    expect(resolveQualityPreset('quality')).toBe('quality')
  })

  it('reports the negative prompt as live only when CFG is on', () => {
    // The fast presets run at CFG 1, where the model skips its guidance branch
    // entirely, so the negative prompt is never read.
    expect(presetUsesNegativePrompt(resolvePresetPlan('speed'))).toBe(false)
    expect(presetUsesNegativePrompt(resolvePresetPlan('balanced'))).toBe(false)
    expect(presetUsesNegativePrompt(resolvePresetPlan('custom', { steps: 40 }))).toBe(false)
    // Max quality is CFG 7 whether or not it is installed — whether it can run
    // is a separate question, answered by `unavailable`.
    for (const baseAvailable of [true, false]) {
      expect(
        presetUsesNegativePrompt(
          resolvePresetPlan('quality', { mode: 'sfx', baseAvailable }),
        ),
      ).toBe(true)
    }
  })

  it('warns about high step counts only on the re-noising sampler', () => {
    expect(stepsWarning(50, 'pingpong')).toMatch(/re-noises/i)
    expect(stepsWarning(8, 'pingpong')).toBeNull()
    expect(stepsWarning(50, 'euler')).toBeNull()
    expect(stepsWarning(50, 'dpmpp')).toBeNull()
  })

  it('labels every preset', () => {
    expect(presetLabel('speed')).toBe('Max speed')
    expect(presetLabel('balanced')).toBe('Balanced')
    expect(presetLabel('quality')).toBe('Max quality')
    expect(presetLabel('custom')).toBe('Custom')
  })
})
