export type WavInfo = {
  title?: string
  comment?: string
  software?: string
  genre?: string
  instruments: string[]
}

type InstrumentTerm = {
  term: string
  name: string
}

const INSTRUMENT_TERMS: InstrumentTerm[] = [
  { term: 'acoustic guitar', name: 'acoustic guitar' },
  { term: 'classical guitar', name: 'classical guitar' },
  { term: 'electric guitar', name: 'electric guitar' },
  { term: 'plucked strings', name: 'strings' },
  { term: 'double bass', name: 'double bass' },
  { term: 'french horn', name: 'french horn' },
  { term: 'english horn', name: 'english horn' },
  { term: 'steel drum', name: 'steel drum' },
  { term: 'hurdy-gurdy', name: 'hurdy-gurdy' },
  { term: 'pan flute', name: 'pan flute' },
  { term: 'woodwinds', name: 'woodwinds' },
  { term: 'woodwind', name: 'woodwinds' },
  { term: 'synthesizer', name: 'synth' },
  { term: 'harpsichord', name: 'harpsichord' },
  { term: 'glockenspiel', name: 'glockenspiel' },
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
  { term: 'strings', name: 'strings' },
  { term: 'violin', name: 'violin' },
  { term: 'fiddle', name: 'fiddle' },
  { term: 'guitar', name: 'guitar' },
  { term: 'piano', name: 'piano' },
  { term: 'cello', name: 'cello' },
  { term: 'viola', name: 'viola' },
  { term: 'flute', name: 'flute' },
  { term: 'brass', name: 'brass' },
  { term: 'drums', name: 'drums' },
  { term: 'organ', name: 'organ' },
  { term: 'banjo', name: 'banjo' },
  { term: 'harp', name: 'harp' },
  { term: 'lute', name: 'lute' },
  { term: 'oboe', name: 'oboe' },
  { term: 'horn', name: 'horn' },
  { term: 'tuba', name: 'tuba' },
  { term: 'bass', name: 'bass' },
  { term: 'drum', name: 'drums' },
  { term: 'synth', name: 'synth' },
  { term: 'chimes', name: 'chimes' },
  { term: 'bells', name: 'bells' },
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
    .replace(/\s+/g, ' ')
    .trim()
  return title.slice(0, 80)
}

export function musicWavInfo(prompt: string, instruments = extractInstruments(prompt)): WavInfo {
  const title = titleFromPrompt(prompt)
  return {
    instruments,
    software: 'Thunder FX',
    genre: 'Instrumental',
    title: title || 'Instrumental',
    comment: instruments.length ? `Instruments: ${instruments.join(', ')}` : undefined,
  }
}

export function parseInstrumentKeywords(value: string): string[] {
  const body = value.trim().replace(/^instruments:\s*/i, '')
  return body
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
}
