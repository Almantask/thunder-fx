import type { GenerateMode } from '@/lib/types'

export type WavInfo = {
  title?: string
  comment?: string
  software?: string
  genre?: string
  category?: string
  intensity?: string
  instruments: string[]
}

type InstrumentTerm = {
  term: string
  name: string
}

const INSTRUMENT_TERMS: InstrumentTerm[] = [
  { term: 'fingerpicked acoustic guitar', name: 'acoustic guitar' },
  { term: 'acoustic guitar', name: 'acoustic guitar' },
  { term: 'classical guitar', name: 'classical guitar' },
  { term: '80s rock guitar', name: 'electric guitar' },
  { term: 'rock guitar', name: 'electric guitar' },
  { term: 'electric guitar', name: 'electric guitar' },
  { term: 'plucked strings', name: 'strings' },
  { term: 'string ensemble', name: 'strings' },
  { term: 'string orchestra', name: 'strings' },
  { term: 'string section', name: 'strings' },
  { term: 'string harmonics', name: 'strings' },
  { term: 'string swells', name: 'strings' },
  { term: 'string runs', name: 'strings' },
  { term: 'string pads', name: 'strings' },
  { term: 'string pad', name: 'strings' },
  { term: 'low strings', name: 'strings' },
  { term: 'high strings', name: 'strings' },
  { term: 'warm strings', name: 'strings' },
  { term: 'muted strings', name: 'strings' },
  { term: 'bowed strings', name: 'strings' },
  { term: 'plucked runs', name: 'strings' },
  { term: 'plucked notes', name: 'strings' },
  { term: 'plucked patterns', name: 'strings' },
  { term: 'viola da gamba', name: 'viola da gamba' },
  { term: 'glass harmonica', name: 'glass harmonica' },
  { term: 'glass marimba', name: 'marimba' },
  { term: 'glass bells', name: 'bells' },
  { term: 'glass bell', name: 'bells' },
  { term: 'double bass', name: 'double bass' },
  { term: 'french horn', name: 'french horn' },
  { term: 'english horn', name: 'english horn' },
  { term: 'cor anglais', name: 'english horn' },
  { term: 'steel drums', name: 'steel drum' },
  { term: 'steel drum', name: 'steel drum' },
  { term: 'hurdy-gurdy', name: 'hurdy-gurdy' },
  { term: 'hurdy gurdy', name: 'hurdy-gurdy' },
  { term: 'pan flute', name: 'pan flute' },
  { term: 'pan pipes', name: 'pan flute' },
  { term: 'panpipes', name: 'pan flute' },
  { term: 'tin whistle', name: 'whistle' },
  { term: 'penny whistle', name: 'whistle' },
  { term: 'low whistle', name: 'whistle' },
  { term: 'woodwinds', name: 'woodwinds' },
  { term: 'woodwind', name: 'woodwinds' },
  { term: 'ambient pads', name: 'pad' },
  { term: 'ambient pad', name: 'pad' },
  { term: 'glow pads', name: 'pad' },
  { term: 'glow pad', name: 'pad' },
  { term: 'warm pads', name: 'pad' },
  { term: 'warm pad', name: 'pad' },
  { term: 'synth pads', name: 'synth' },
  { term: 'synth pad', name: 'synth' },
  { term: 'synthesizer', name: 'synth' },
  { term: 'synthwave', name: 'synth' },
  { term: 'analog synths', name: 'synth' },
  { term: 'analog synth', name: 'synth' },
  { term: 'church organ', name: 'organ' },
  { term: 'pipe organ', name: 'organ' },
  { term: 'reed organ', name: 'organ' },
  { term: 'pump organ', name: 'organ' },
  { term: 'finger cymbals', name: 'zils' },
  { term: 'finger cymbal', name: 'zils' },
  { term: 'wordless choir', name: 'choir' },
  { term: 'female choir', name: 'choir' },
  { term: 'male choir', name: 'choir' },
  { term: 'vocal choir', name: 'choir' },
  { term: 'boy choir', name: 'choir' },
  { term: 'choral swells', name: 'choir' },
  { term: 'full orchestra', name: 'orchestra' },
  { term: 'chamber orchestra', name: 'orchestra' },
  { term: 'taiko drums', name: 'taiko' },
  { term: 'taiko drum', name: 'taiko' },
  { term: 'taiko', name: 'taiko' },
  { term: 'war drums', name: 'war drums' },
  { term: 'war drum', name: 'war drums' },
  { term: 'hand drums', name: 'hand drums' },
  { term: 'hand drum', name: 'hand drums' },
  { term: 'snare drum', name: 'snare' },
  { term: 'heavy horns', name: 'horns' },
  { term: 'solo cello', name: 'cello' },
  { term: 'solo violin', name: 'violin' },
  { term: 'solo flute', name: 'flute' },
  { term: 'solo horn', name: 'horn' },
  { term: 'harpsichord', name: 'harpsichord' },
  { term: 'glockenspiel', name: 'glockenspiel' },
  { term: 'celesta', name: 'celesta' },
  { term: 'celeste', name: 'celesta' },
  { term: 'waterphone', name: 'waterphone' },
  { term: 'darbuka', name: 'darbuka' },
  { term: 'dumbek', name: 'darbuka' },
  { term: 'oud', name: 'oud' },
  { term: 'contrabass', name: 'contrabass' },
  { term: 'contra bass', name: 'contrabass' },
  { term: 'gamba', name: 'viola da gamba' },
  { term: 'percussion', name: 'percussion' },
  { term: 'accordion', name: 'accordion' },
  { term: 'bagpipes', name: 'bagpipes' },
  { term: 'mandolin', name: 'mandolin' },
  { term: 'clarinet', name: 'clarinet' },
  { term: 'trombone', name: 'trombone' },
  { term: 'trumpet', name: 'trumpet' },
  { term: 'bassoon', name: 'bassoon' },
  { term: 'piccolo', name: 'piccolo' },
  { term: 'dulcimer', name: 'dulcimer' },
  { term: 'ocarina', name: 'ocarina' },
  { term: 'bodhran', name: 'bodhran' },
  { term: 'timpani', name: 'timpani' },
  { term: 'snare', name: 'snare' },
  { term: 'cymbals', name: 'cymbals' },
  { term: 'cymbal', name: 'cymbals' },
  { term: 'gongs', name: 'gong' },
  { term: 'gong', name: 'gong' },
  { term: 'tambourine', name: 'tambourine' },
  { term: 'shakers', name: 'shaker' },
  { term: 'shaker', name: 'shaker' },
  { term: 'castanets', name: 'castanets' },
  { term: 'xylophone', name: 'xylophone' },
  { term: 'marimba', name: 'marimba' },
  { term: 'vibraphone', name: 'vibraphone' },
  { term: 'kalimba', name: 'kalimba' },
  { term: 'whistle', name: 'whistle' },
  { term: 'recorder', name: 'recorder' },
  { term: 'duduk', name: 'duduk' },
  { term: 'shakuhachi', name: 'shakuhachi' },
  { term: 'erhu', name: 'erhu' },
  { term: 'koto', name: 'koto' },
  { term: 'shamisen', name: 'shamisen' },
  { term: 'sitar', name: 'sitar' },
  { term: 'bouzouki', name: 'bouzouki' },
  { term: 'nyckelharpa', name: 'nyckelharpa' },
  { term: 'cittern', name: 'cittern' },
  { term: 'theorbo', name: 'theorbo' },
  { term: 'zils', name: 'zils' },
  { term: 'zil', name: 'zils' },
  { term: 'ney', name: 'ney' },
  { term: 'shawm', name: 'shawm' },
  { term: 'crumhorn', name: 'crumhorn' },
  { term: 'sackbut', name: 'sackbut' },
  { term: 'lyre', name: 'lyre' },
  { term: 'zither', name: 'zither' },
  { term: 'autoharp', name: 'autoharp' },
  { term: 'didgeridoo', name: 'didgeridoo' },
  { term: 'harmonica', name: 'harmonica' },
  { term: 'theremin', name: 'theremin' },
  { term: 'mellotron', name: 'mellotron' },
  { term: 'orchestra', name: 'orchestra' },
  { term: 'orchestral', name: 'orchestra' },
  { term: 'symphonic', name: 'orchestra' },
  { term: 'choir', name: 'choir' },
  { term: 'choral', name: 'choir' },
  { term: 'vocalise', name: 'choir' },
  { term: 'strings', name: 'strings' },
  { term: 'string', name: 'strings' },
  { term: 'plucked', name: 'strings' },
  { term: 'plucks', name: 'strings' },
  { term: 'strums', name: 'guitar' },
  { term: 'violin', name: 'violin' },
  { term: 'fiddle', name: 'fiddle' },
  { term: 'guitar', name: 'guitar' },
  { term: 'piano', name: 'piano' },
  { term: 'cello', name: 'cello' },
  { term: 'viola', name: 'viola' },
  { term: 'flute', name: 'flute' },
  { term: 'brass', name: 'brass' },
  { term: 'drums', name: 'drums' },
  { term: 'drum', name: 'drums' },
  { term: 'organ', name: 'organ' },
  { term: 'banjo', name: 'banjo' },
  { term: 'harp', name: 'harp' },
  { term: 'lute', name: 'lute' },
  { term: 'oboe', name: 'oboe' },
  { term: 'horns', name: 'horns' },
  { term: 'horn', name: 'horn' },
  { term: 'tuba', name: 'tuba' },
  { term: 'bass', name: 'bass' },
  { term: 'synth', name: 'synth' },
  { term: 'wind chimes', name: 'chimes' },
  { term: 'wind chime', name: 'chimes' },
  { term: 'chimes', name: 'chimes' },
  { term: 'bells', name: 'bells' },
  { term: 'bell', name: 'bells' },
  { term: 'pads', name: 'pad' },
  { term: 'pad', name: 'pad' },
  { term: 'drone', name: 'drone' },
  { term: 'drones', name: 'drone' },
  { term: 'winds', name: 'woodwinds' },
  { term: 'wind', name: 'woodwinds' },
  { term: 'reeds', name: 'woodwinds' },
  { term: 'reed', name: 'woodwinds' },
  { term: 'djembe', name: 'djembe' },
  { term: 'cajon', name: 'cajon' },
  { term: 'congas', name: 'congas' },
  { term: 'conga', name: 'congas' },
  { term: 'bongos', name: 'bongos' },
  { term: 'bongo', name: 'bongos' },
  { term: 'tabla', name: 'tabla' },
  { term: 'kantele', name: 'kantele' },
  { term: 'balalaika', name: 'balalaika' },
  { term: 'santoor', name: 'santoor' },
  { term: 'santur', name: 'santoor' },
  { term: 'psaltery', name: 'psaltery' },
  { term: 'clavichord', name: 'clavichord' },
]

const TERMS_LONGEST_FIRST = [...INSTRUMENT_TERMS].sort((a, b) => b.term.length - a.term.length)

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractInstruments(prompt: string): string[] {
  const haystack = fold(prompt)
  const hits: { start: number; end: number; name: string }[] = []
  for (const { term, name } of TERMS_LONGEST_FIRST) {
    const pattern = new RegExp(`(?:^|[^a-z0-9])(${escapeRegExp(term)})(?![a-z0-9])`, 'g')
    let match: RegExpExecArray | null
    while ((match = pattern.exec(haystack))) {
      const captured = match[1] ?? term
      const start = match.index + match[0].length - captured.length
      const end = start + captured.length
      const overlaps = hits.some((hit) => start < hit.end && end > hit.start)
      if (!overlaps) hits.push({ start, end, name })
    }
  }
  hits.sort((a, b) => a.start - b.start)
  const seen = new Set<string>()
  const names: string[] = []
  for (const hit of hits) {
    if (seen.has(hit.name)) continue
    seen.add(hit.name)
    names.push(hit.name)
  }
  return names
}

export function titleFromPrompt(prompt: string): string {
  const title = prompt
    .replace(/tracktype:\s*\w+,?/gi, '')
    .replace(/^(\s*instrumental\s*,\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return title.slice(0, 80)
}

export function buildMusicComment(
  instruments: string[],
  category?: string,
  intensity?: string,
): string | undefined {
  const parts: string[] = []
  if (category?.trim()) {
    parts.push(`Category: ${category.trim()}`)
  }
  if (intensity?.trim()) {
    parts.push(`Intensity: ${intensity.trim()}`)
  }
  if (instruments.length) {
    parts.push(`Instruments: ${instruments.join(', ')}`)
  }
  return parts.length ? parts.join(' · ') : undefined
}

export function musicWavInfo(
  prompt: string,
  instruments = extractInstruments(prompt),
  category?: string,
  intensity?: string,
): WavInfo {
  const title = titleFromPrompt(prompt)
  return {
    instruments,
    software: 'Thunder FX',
    genre: 'Instrumental',
    title: title || 'Instrumental',
    category: category?.trim() || undefined,
    intensity: intensity?.trim() || undefined,
    comment: buildMusicComment(instruments, category, intensity),
  }
}

export function clipWavInfo(
  prompt: string,
  mode: GenerateMode = 'sfx',
  instruments = extractInstruments(prompt),
  category?: string,
  intensity?: string,
): WavInfo {
  const title = titleFromPrompt(prompt)
  if (mode === 'music') {
    return {
      instruments,
      software: 'Thunder FX',
      genre: 'Instrumental',
      title: title || 'Instrumental',
      category: category?.trim() || undefined,
      intensity: intensity?.trim() || undefined,
      comment: buildMusicComment(instruments, category, intensity),
    }
  }
  if (mode === 'ambience') {
    return {
      instruments: [],
      software: 'Thunder FX',
      genre: 'Ambience',
      title: title || 'Ambience',
      category: category?.trim() || undefined,
      intensity: undefined,
      comment: prompt.trim() || undefined,
    }
  }
  return {
    instruments: [],
    software: 'Thunder FX',
    genre: 'Sound Effects',
    title: title || 'Sound Effect',
    category: category?.trim() || undefined,
    intensity: undefined,
    comment: prompt.trim() || undefined,
  }
}

export function parseInstrumentKeywords(value: string): string[] {
  let body = value.trim()
  const match = body.match(/instruments:\s*([^·|;]+(?:\s*,\s*[^·|;]+)*)/i)
  if (match) {
    body = match[1]
  } else {
    body = body.replace(/^instruments:\s*/i, '')
  }
  return body
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

const BPM_PATTERN = /\b(\d{2,3})\s*bpm\b/i

export function extractBpm(prompt: string): number | undefined {
  const match = prompt.match(BPM_PATTERN)
  if (!match) return undefined
  const num = Number(match[1])
  return Number.isFinite(num) && num > 0 ? num : undefined
}

