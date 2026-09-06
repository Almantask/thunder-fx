import type { GenerateMode } from '@/lib/types'

/** SA3 Medium is post-trained at CFG 1. The UI does not expose a slider. */
export const FIXED_CFG = 1

export type GenerateModeSpec = {
  id: GenerateMode
  label: string
  prefix: string
  placeholder: string
  generateAria: string
  emptyWaveform: string
  defaultDuration: number
  defaultSteps: number
  defaultNegative: string
  negativeHint: string
  chips: readonly string[]
  starters: readonly string[]
}

export const GENERATE_MODES: Record<GenerateMode, GenerateModeSpec> = {
  sfx: {
    id: 'sfx',
    label: 'Sound effects',
    prefix: 'TrackType: SFX',
    placeholder: 'Describe the sound — a door latch, a sword draw, a fireball',
    generateAria: 'Generate sound',
    emptyWaveform: 'Describe a sound, then click Generate.',
    defaultDuration: 5,
    defaultSteps: 20,
    defaultNegative:
      'speech, music, vocals, singing, melody, instrumental, background music, humming, voiceover, distortion, clipping, muffled, low quality',
    negativeHint: 'Sounds to avoid, such as music, voice, or distortion.',
    chips: [
      'TrackType: SFX',
      'close mic',
      'isolated one-shot',
      'punchy transient',
      'fast decay',
      'dry recording',
      'clean attack',
    ],
    starters: [
      'TrackType: SFX, steel shortsword leaving a leather scabbard, crisp scrape, isolated one-shot',
      'TrackType: SFX, heavy tavern door slam on iron hinges, wooden latch impact, isolated one-shot',
      'TrackType: SFX, fireball explosion ignition, close mic, fast decay, dry stone hall',
      'TrackType: SFX, heavy leather boots on wet dungeon stone, single deliberate step, isolated',
      'TrackType: SFX, dragon wing beat overhead, massive leather and rushing wind gust, punchy transient',
      'TrackType: SFX, pouch of gold coins dropped on oak table, bright silver clatter, isolated one-shot',
    ],
  },
  ambience: {
    id: 'ambience',
    label: 'Ambience',
    prefix: 'TrackType: SFX',
    placeholder: 'Describe a background bed — rain on stone, market crowd, forge, cavern drips',
    generateAria: 'Generate ambience',
    emptyWaveform: 'Describe a background bed, then click Generate.',
    defaultDuration: 30,
    defaultSteps: 20,
    defaultNegative:
      'music, melody, instrumental, soundtrack, vocals, singing, lyrics, choir, humming, distortion, clipping, muffled, low quality',
    negativeHint:
      'Sounds to avoid, such as music or melody. Add speech, voices for quiet nature beds.',
    chips: [
      'TrackType: SFX',
      'steady bed',
      'field recording',
      'looping-friendly',
      'distant layers',
      'no music',
    ],
    starters: [
      'TrackType: SFX, temperate forest birdsong, distant woodpecker, leaves in light wind, outdoor, steady bed, looping-friendly',
      'TrackType: SFX, busy open-air market crowd, stall chatter and footsteps on stone, no music, outdoor square, steady bed',
      'TrackType: SFX, blacksmith forge bed, hammer on anvil, bellows, crackling coals, indoor smithy, looping-friendly',
      'TrackType: SFX, limestone cavern ceiling drips into a pool, large cave reverb, occasional drop, steady bed',
      'TrackType: SFX, heavy rain on cobblestone and tile roofs, outdoor alley, steady bed, looping-friendly',
      'TrackType: SFX, wooden harbor at night, water lapping, rope creak, distant gulls, outdoor, steady bed',
    ],
  },
  music: {
    id: 'music',
    label: 'Instrumental',
    prefix: 'TrackType: Music',
    placeholder: 'Describe instrumental music — lute theme, dungeon drone, orchestral bed',
    generateAria: 'Generate music',
    emptyWaveform: 'Describe instrumental music, then click Generate.',
    defaultDuration: 20,
    defaultSteps: 25,
    defaultNegative:
      'vocals, singing, speech, voice, lyrics, spoken words, choir, talking, narration, pop drums, trap beats, harsh distortion, clipping, muffled, low quality',
    negativeHint: 'Parts to avoid, such as vocals, singing, speech, or harsh beats.',
    chips: [
      'TrackType: Music',
      'instrumental',
      'no vocals',
      'rich harmonics',
      'seamless looping',
      'lush acoustics',
      'slow tempo',
      'warm strings',
    ],
    starters: [
      'TrackType: Music, instrumental tavern lute theme, warm and looping-friendly, rich acoustic timbre, no vocals',
      'TrackType: Music, atmospheric dungeon drone with bowed strings and dark reverb pad, looping-friendly, no vocals',
      'TrackType: Music, heroic orchestral brass fanfare, short melodic motif, timpani, no vocals',
      'TrackType: Music, sparse piano and cello melody, melancholy forest bed, slow tempo, no vocals',
      'TrackType: Music, quiet campfire acoustic guitar, fingerpicked folk melody, warm reverb, no vocals',
      'TrackType: Music, enchanted ethereal synth and flute bed, shimmering soundscape, seamless loop, no vocals',
    ],
  },
}

const TRACK_TYPE = /^tracktype:\s*\w+/i
const TRACK_TYPE_ONLY = /^tracktype:\s*\w+\s*$/i

export function isGenerateMode(value: unknown): value is GenerateMode {
  return value === 'sfx' || value === 'ambience' || value === 'music'
}

export function resolveGenerateMode(value: unknown): GenerateMode {
  return isGenerateMode(value) ? value : 'sfx'
}

export function inferGenerateMode(prompt: string): GenerateMode {
  return /tracktype:\s*music\b/i.test(prompt) ? 'music' : 'sfx'
}

export function modeSupportsSeamlessLoop(mode: GenerateMode): boolean {
  return mode === 'music' || mode === 'ambience'
}

export function modeFromCatalog(effect: { library?: string; prompt: string }): GenerateMode {
  if (effect.library === 'music') return 'music'
  if (effect.library === 'ambience') return 'ambience'
  if (effect.library === 'fx') return 'sfx'
  return inferGenerateMode(effect.prompt)
}

export function applyGenerateMode(prompt: string, mode: GenerateMode): string {
  const prefix = GENERATE_MODES[mode].prefix
  const trimmed = prompt.trim()
  if (!trimmed || TRACK_TYPE_ONLY.test(trimmed)) return prefix
  if (TRACK_TYPE.test(trimmed)) return trimmed.replace(TRACK_TYPE, prefix)
  return prompt
}

export function ensureTrackType(prompt: string, mode: GenerateMode): string {
  const prefix = GENERATE_MODES[mode].prefix
  const trimmed = prompt.trim()
  if (TRACK_TYPE.test(trimmed)) return trimmed.replace(TRACK_TYPE, prefix)
  return `${prefix}, ${trimmed}`
}

export function applyModeNegative(
  negative: string,
  from: GenerateMode,
  to: GenerateMode,
): string {
  const trimmed = negative.trim()
  if (!trimmed || trimmed === GENERATE_MODES[from].defaultNegative) {
    return GENERATE_MODES[to].defaultNegative
  }
  return negative
}

export function applyModeDuration(
  duration: number,
  from: GenerateMode,
  to: GenerateMode,
): number {
  if (duration === GENERATE_MODES[from].defaultDuration) {
    return GENERATE_MODES[to].defaultDuration
  }
  return duration
}

export function applyModeSteps(
  steps: number,
  from: GenerateMode,
  to: GenerateMode,
): number {
  if (steps === GENERATE_MODES[from].defaultSteps) {
    return GENERATE_MODES[to].defaultSteps
  }
  return steps
}

export function clipMode(clip: { mode?: GenerateMode; prompt: string }): GenerateMode {
  return isGenerateMode(clip.mode) ? clip.mode : inferGenerateMode(clip.prompt)
}

export const LOOP_PROMPT_CUE =
  'seamless looping, starts and ends the same, no fade in, no fade out, steady texture with no ending'

export const LOOP_NEGATIVE_CUE =
  'fade in, fade out, abrupt ending, silence at the start, silence at the end'

export function promptLooksLoopable(prompt: string): boolean {
  return /\bloop(?:ing|able)?\b|seamless\s+loop|no ending|looping-friendly/i.test(prompt)
}

export function ensureLoopPrompt(prompt: string): string {
  if (/starts and ends the same/i.test(prompt)) return prompt
  const trimmed = prompt.trim().replace(/,+$/, '')
  if (!trimmed) return LOOP_PROMPT_CUE
  return `${trimmed}, ${LOOP_PROMPT_CUE}`
}

export function ensureLoopNegative(negative: string): string {
  if (/fade in/i.test(negative) && /fade out/i.test(negative)) return negative
  const trimmed = negative.trim().replace(/,+$/, '')
  if (!trimmed) return LOOP_NEGATIVE_CUE
  return `${trimmed}, ${LOOP_NEGATIVE_CUE}`
}

/**
 * Prompt normalization — twin of normalize_prompt() in engine/worker.py.
 *
 * Stable Audio 3 was trained on AudioSparx metadata tags, and Stability's own
 * prompt rewriter (stable_audio_3/interface/reprompt.py) always emits:
 *   TrackType: SFX, <description>. Length: N seconds
 *   TrackType: Music, VocalType: Instrumental, <description>. BPM: N. Length: N seconds
 * It then rejects its own output when the Length suffix is missing or the
 * prompt runs past 45 words. VocalType is a positive control tag, so unlike the
 * negative prompt it still works at cfg 1 — which is the only way to suppress
 * vocals on the distilled checkpoint.
 */
const MODE_TRACK_TYPES: Record<GenerateMode, string> = {
  sfx: 'SFX',
  ambience: 'SFX',
  music: 'Music',
}

export const PROMPT_WORD_LIMIT = 45

const TRACK_TYPE_TAG = /^\s*TrackType:\s*[A-Za-z]+\s*,?\s*/i
const VOCAL_TYPE_TAG = /\s*VocalType:\s*[A-Za-z]+\s*,?\s*/gi
const LENGTH_TAG = /[.,;]?\s*Length:\s*\d+(?:\.\d+)?\s*seconds?\.?/gi
const BPM_TAG = /[.,;]?\s*BPM:\s*(\d{1,3})\s*\.?/i
const INLINE_BPM = /,?\s*\b(\d{2,3})\s*BPM\b/i
const BARE_INSTRUMENTAL = /(?:^|,)\s*instrumental\s*(?=,|$)/gi

function lengthPhrase(seconds: number): string {
  const n = Math.max(1, Math.round(Number.isFinite(seconds) ? seconds : 1))
  return `Length: ${n} second${n === 1 ? '' : 's'}`
}

export function promptWordCount(prompt: string): number {
  return prompt.trim() ? prompt.trim().split(/\s+/).length : 0
}

export function normalizePrompt(prompt: string, mode: GenerateMode, seconds: number): string {
  const track = MODE_TRACK_TYPES[mode] ?? 'SFX'
  const music = track === 'Music'

  // Strip the tags that get re-emitted canonically below.
  let text = (prompt ?? '').trim().replace(TRACK_TYPE_TAG, '')
  text = text.replace(VOCAL_TYPE_TAG, ' ').replace(LENGTH_TAG, '')

  let bpm: string | null = null
  if (music) {
    // Lift a BPM out of either form so it lands in the trailing tag slot.
    const tagged = text.match(BPM_TAG)
    if (tagged) {
      bpm = tagged[1] ?? null
      text = text.replace(BPM_TAG, '')
    }
    const inline = text.match(INLINE_BPM)
    if (inline) {
      bpm = bpm ?? inline[1] ?? null
      text = text.replace(INLINE_BPM, '')
    }
    // "instrumental" as a bare term is superseded by the VocalType tag.
    text = text.replace(BARE_INSTRUMENTAL, '')
  } else {
    text = text.replace(BPM_TAG, '')
  }

  const body = text
    .replace(/\s*,(?:\s*,)+/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .replace(/^,+|[,.;]+$/g, '')
    .trim()

  const head = `TrackType: ${track}, ${music ? 'VocalType: Instrumental, ' : ''}`
  let out = body ? head + body : head.replace(/,\s*$/, '')
  if (music && bpm) out = `${out}. BPM: ${bpm}`
  return `${out}. ${lengthPhrase(seconds)}`
}