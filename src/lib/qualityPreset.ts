/**
 * Quality presets.
 *
 * Steps are not the quality dial on Stable Audio 3 Medium. That checkpoint is
 * ARC-distilled and sampled with `pingpong`, which re-injects fresh noise on
 * every step, so raising the step count buys hallucinated detail rather than
 * fidelity — and swapping in a deterministic solver averages the texture away
 * entirely, which sounds muffled and flat. Neither knob buys quality there, so
 * Balanced is the ceiling on Medium.
 *
 * A preset therefore changes the *checkpoint*. `medium-base` is the un-distilled
 * model: real CFG works there, and a deterministic sampler is correct, so its
 * extra steps genuinely converge.
 *
 * Mirrors PRESETS / resolve_preset in engine/worker.py — keep the two in step.
 */

export type QualityPreset = 'speed' | 'balanced' | 'quality' | 'custom'

/** Every preset except 'custom', which has no fixed table entry. */
export type NamedPreset = Exclude<QualityPreset, 'custom'>

/** Samplers the rf_denoiser objective accepts (inference/sampling.py). */
export type SamplerType = 'pingpong' | 'euler' | 'dpmpp' | 'rk4'

/**
 * Deterministic solvers. They only belong on a checkpoint that was never
 * distilled. `medium` is ARC post-trained and its texture comes from pingpong
 * re-noising at every step, so stepping through it deterministically averages
 * the detail away and sounds muffled and lifeless. Enforced below.
 */
export const DETERMINISTIC_SAMPLERS: readonly SamplerType[] = ['euler', 'dpmpp', 'rk4']

export type PresetPlan = {
  model: string
  sampler: SamplerType
  steps: number
  cfg: number
}

export type PresetSpec = PresetPlan & {
  id: NamedPreset
  label: string
  hint: string
}

export const DEFAULT_MODEL = 'medium'
export const BASE_MODEL = 'medium-base'
export const DEFAULT_PRESET: NamedPreset = 'balanced'

export const QUALITY_PRESETS: Record<NamedPreset, PresetSpec> = {
  speed: {
    id: 'speed',
    label: 'Max speed',
    hint: "Stability's own default for this checkpoint: 8 steps, pingpong sampler. Around 2.5x faster than Balanced.",
    model: DEFAULT_MODEL,
    sampler: 'pingpong',
    steps: 8,
    cfg: 1,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    hint: 'Twenty pingpong steps. More texture than Max speed at the same fidelity.',
    model: DEFAULT_MODEL,
    sampler: 'pingpong',
    steps: 20,
    cfg: 1,
  },
  quality: {
    id: 'quality',
    label: 'Max quality',
    hint: 'Un-distilled Medium-Base with a deterministic sampler and real guidance, so negative prompts work and extra steps genuinely converge. Guidance is tuned per content type — more of it sharpens a one-shot and dulls a bed. Instrumental stays on Medium, which measured better for it. Needs a separate download.',
    model: BASE_MODEL,
    sampler: 'euler',
    steps: 50,
    cfg: 4,
  },
}

/**
 * What Max quality actually runs, per content type, measured against Balanced
 * by sweeping CFG 1/2/4/7 on medium-base.
 *
 * Guidance strength has to differ by material: more of it sharpens a one-shot
 * and dulls a bed. A door slam was brightest at CFG 4-7; a rain bed gained 24%
 * brightness and 84% high-band at CFG 2 but lost both by CFG 7.
 *
 * Instrumental is the honest exception — no CFG tested beat Balanced, so Max
 * quality keeps music on the checkpoint that measured better instead of
 * promising an upgrade it does not deliver. Mirrors QUALITY_BY_MODE in
 * engine/worker.py; keep the two in step.
 */
export const QUALITY_BY_MODE: Record<string, PresetPlan> = {
  sfx: { model: BASE_MODEL, sampler: 'euler', steps: 50, cfg: 4 },
  ambience: { model: BASE_MODEL, sampler: 'euler', steps: 50, cfg: 2 },
  music: { model: DEFAULT_MODEL, sampler: 'pingpong', steps: 20, cfg: 1 },
}

/**
 * There is deliberately no fallback. A preset that cannot run as specified fails
 * with advice instead of quietly generating something else: an earlier version
 * substituted a deterministic sampler on the distilled checkpoint, which sounds
 * muffled and flat, and the substitution made that impossible to notice.
 */
export function presetUnavailableMessage(preset: QualityPreset): string {
  return (
    `The ${presetLabel(preset)} preset needs the ${BASE_MODEL} checkpoint, which is not ` +
    `downloaded. Open Settings and choose "Download Medium-Base" (about 9 GB; it shares ` +
    `Medium's text encoder, so Medium must already be installed), or switch to Balanced — on the distilled ` +
    `Medium checkpoint Balanced is the best quality available, so nothing is lost by using ` +
    `it in the meantime.`
  )
}

export const PRESET_ORDER: readonly QualityPreset[] = ['speed', 'balanced', 'quality']

export function isQualityPreset(value: unknown): value is QualityPreset {
  return value === 'speed' || value === 'balanced' || value === 'quality' || value === 'custom'
}

export function resolveQualityPreset(value: unknown): QualityPreset {
  return isQualityPreset(value) ? value : DEFAULT_PRESET
}

export function presetLabel(preset: QualityPreset): string {
  if (preset === 'custom') return 'Custom'
  return QUALITY_PRESETS[preset].label
}

export type ResolvedPreset = PresetPlan & {
  preset: QualityPreset
  /** Its checkpoint is not installed, so generation will refuse rather than substitute. */
  unavailable: boolean
}

export function resolvePresetPlan(
  preset: QualityPreset,
  options: {
    steps?: number
    sampler?: SamplerType
    baseAvailable?: boolean
    /** Content type, so Max quality can pick the guidance its material wants. */
    mode?: string
  } = {},
): ResolvedPreset {
  if (preset === 'custom') {
    const base = QUALITY_PRESETS[DEFAULT_PRESET]
    return enforceSamplerInvariant({
      model: base.model,
      sampler: options.sampler ?? base.sampler,
      steps: options.steps ?? base.steps,
      cfg: base.cfg,
      preset: 'custom',
      unavailable: false,
    })
  }
  const base = QUALITY_PRESETS[preset] ?? QUALITY_PRESETS[DEFAULT_PRESET]
  const perMode = preset === 'quality' && options.mode ? QUALITY_BY_MODE[options.mode] : undefined
  const spec = perMode ? { ...base, ...perMode } : base
  return enforceSamplerInvariant({
    model: spec.model,
    sampler: spec.sampler,
    steps: spec.steps,
    cfg: spec.cfg,
    preset,
    // Reported, never substituted — the engine refuses the run with advice.
    unavailable: spec.model === BASE_MODEL && options.baseAvailable === false,
  })
}

/**
 * Keep deterministic samplers off the distilled checkpoint. A hard rule rather
 * than a default, because getting it wrong is not subtle: the output goes
 * muffled, loses its dynamics, and sounds the same all the way through.
 */
function enforceSamplerInvariant(plan: ResolvedPreset): ResolvedPreset {
  if (plan.model !== BASE_MODEL && DETERMINISTIC_SAMPLERS.includes(plan.sampler)) {
    return { ...plan, sampler: 'pingpong' }
  }
  return plan
}

/** Negative prompts only reach the model through CFG, which is off at cfg 1. */
export function presetUsesNegativePrompt(plan: { cfg: number }): boolean {
  return plan.cfg !== 1
}

/**
 * A high step count on pingpong is the configuration that adds invented detail
 * instead of fidelity, so the UI warns about exactly that combination.
 */
export const PINGPONG_STEP_WARNING_THRESHOLD = 24

export function stepsWarning(steps: number, sampler: SamplerType): string | null {
  if (sampler !== 'pingpong' || steps <= PINGPONG_STEP_WARNING_THRESHOLD) return null
  return `${steps} steps on the pingpong sampler. It re-noises every step, so past about ${PINGPONG_STEP_WARNING_THRESHOLD} the model invents detail rather than refining it. There is no step count that beats Balanced here — real headroom needs the Medium-Base checkpoint.`
}
