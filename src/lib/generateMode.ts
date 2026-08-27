import type { GenerateMode } from '@/lib/types'

export type GenerateModeSpec = {
  id: GenerateMode
  label: string
  prefix: string
  placeholder: string
  generateAria: string
  emptyWaveform: string
  defaultDuration: number
  defaultCfg: number
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
    defaultDuration: 8,
    defaultCfg: 4.0,
    defaultNegative: 'speech, music, vocals, singing, melody, distortion, clipping, muffled, background noise',
    negativeHint: 'Sounds to avoid, such as music, voice, or distortion.',
    chips: [
      'TrackType: SFX',
      'close mic',
      'large stone hall',
      'fast decay',
      'leather and steel',
      'wet dungeon stone',
    ],
    starters: [
      'TrackType: SFX, steel shortsword leaving a leather scabbard',
      'TrackType: SFX, heavy tavern door on a busy night, oak and iron latch',
      'TrackType: SFX, fireball ignition close-mic, fast decay, dry stone hall',
      'TrackType: SFX, boots on wet dungeon stone, slow cautious steps',
      'TrackType: SFX, dragon wing beat overhead, massive leather and wind',
      'TrackType: SFX, coin purse dropped on oak table, silver scatter',
    ],
  },
  music: {
    id: 'music',
    label: 'Instrumental',
    prefix: 'TrackType: Music',
    placeholder: 'Describe instrumental music — lute theme, brass fanfare, sparse piano',
    generateAria: 'Generate music',
    emptyWaveform: 'Describe instrumental music, then click Generate.',
    defaultDuration: 20,
    defaultCfg: 3.0,
    defaultNegative: 'vocals, singing, speech, lyrics, choir, pop drums, trap beats, EDM, clipping, distortion',
    negativeHint: 'Parts to avoid, such as vocals, singing, or speech.',
    chips: [
      'TrackType: Music',
      'instrumental',
      'no vocals',
      'lute and bodhran',
      'slow tempo',
      'warm strings',
    ],
    starters: [
      'TrackType: Music, instrumental tavern lute theme, warm and looping-friendly, no vocals',
      'TrackType: Music, heroic brass fanfare, short motif, percussion, no vocals',
      'TrackType: Music, sparse piano and cello, melancholy forest, slow, no vocals',
      'TrackType: Music, tense dungeon drone with plucked strings, no vocals',
      'TrackType: Music, bright folk jig, fiddle and flute, dance tempo, no vocals',
      'TrackType: Music, quiet campfire acoustic guitar, fingerpicked, no vocals',
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

export function applyModeCfg(
  cfg: number,
  from: GenerateMode,
  to: GenerateMode,
): number {
  if (cfg === GENERATE_MODES[from].defaultCfg) {
    return GENERATE_MODES[to].defaultCfg
  }
  return cfg
}

export function clipMode(clip: { mode?: GenerateMode; prompt: string }): GenerateMode {
  return isGenerateMode(clip.mode) ? clip.mode : inferGenerateMode(clip.prompt)
}
