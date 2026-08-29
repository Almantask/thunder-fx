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
  music: {
    id: 'music',
    label: 'Instrumental',
    prefix: 'TrackType: Music',
    placeholder: 'Describe instrumental music or ambient soundscape — lute theme, dungeon drone, orchestral bed',
    generateAria: 'Generate music',
    emptyWaveform: 'Describe instrumental music or ambience, then click Generate.',
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
      'TrackType: Music, atmospheric dungeon drone with bowed strings and dark reverb pad, loopable ambience, no vocals',
      'TrackType: Music, heroic orchestral brass fanfare, short melodic motif, timpani, no vocals',
      'TrackType: Music, sparse piano and cello melody, melancholy forest ambience, slow tempo, no vocals',
      'TrackType: Music, quiet campfire acoustic guitar, fingerpicked folk melody, warm reverb, no vocals',
      'TrackType: Music, enchanted ethereal synth and flute bed, shimmering soundscape, seamless loop, no vocals',
    ],
  },
}

const TRACK_TYPE = /^tracktype:\s*\w+/i
const TRACK_TYPE_ONLY = /^tracktype:\s*\w+\s*$/i

export function isGenerateMode(value: unknown): value is GenerateMode {
  return value === 'sfx' || value === 'music'
}

export function inferGenerateMode(prompt: string): GenerateMode {
  return /tracktype:\s*music\b/i.test(prompt) ? 'music' : 'sfx'
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