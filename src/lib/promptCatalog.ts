import { clampGenerateSeconds } from '@/lib/duration'
import { clipMode } from '@/lib/generateMode'
import type { Clip } from '@/lib/types'

export type PromptLibrary = 'fx' | 'ambience'

export const PROMPT_LIBRARIES: { id: PromptLibrary; label: string }[] = [
  { id: 'fx', label: 'FX' },
  { id: 'ambience', label: 'Ambience' },
]

export type CatalogEffect = {
  id: string
  library?: PromptLibrary
  categoryId: string
  category: string
  title: string
  prompt: string
  duration: number
  negative: string
  intensity?: string
}

export type PromptCategory = {
  id: string
  library: PromptLibrary
  name: string
  effects: CatalogEffect[]
}

const DURATION = /duration:\s*(\d+(?:\.\d+)?)\s*s\b/i
const NEGATIVE = /negative:\s*(.+)$/im
const TRACK_TYPE = /^\s*TrackType:\s*.+/im

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function fileName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').pop() ?? path
}

function pathParts(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean)
}

export function libraryFromPath(path: string): PromptLibrary {
  const parts = pathParts(path)
  const parent = parts[parts.length - 2]?.toLowerCase()
  if (parent === 'ambience') return 'ambience'
  return 'fx'
}

function slugFromPath(path: string): string {
  return fileName(path)
    .replace(/\.md$/i, '')
    .toLowerCase()
}

function categoryIdFromPath(path: string): string {
  return `${libraryFromPath(path)}:${slugFromPath(path)}`
}

function headingName(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() || fallback
}

function parseDuration(block: string): number | undefined {
  const match = block.match(DURATION)
  if (!match) return undefined
  const seconds = Number(match[1])
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  return clampGenerateSeconds(seconds)
}

function parseNegative(block: string): string {
  const match = block.match(NEGATIVE)
  return match?.[1]?.trim() ?? ''
}

function parsePrompt(block: string): string | undefined {
  const match = block.match(TRACK_TYPE)
  const prompt = match?.[0]?.trim()
  return prompt || undefined
}

export function parsePromptMarkdown(path: string, markdown: string): PromptCategory {
  const library = libraryFromPath(path)
  const id = categoryIdFromPath(path)
  const name = headingName(markdown, slugFromPath(path))
  const chunks = markdown.split(/^### /m).slice(1)
  const effects: CatalogEffect[] = []
  for (const chunk of chunks) {
    const newline = chunk.indexOf('\n')
    const title = (newline === -1 ? chunk : chunk.slice(0, newline)).trim()
    const body = newline === -1 ? '' : chunk.slice(newline + 1)
    const duration = parseDuration(body)
    const prompt = parsePrompt(body)
    if (!title || duration === undefined || !prompt) continue
    const intensityMatch = title.match(/\((I{1,3}|IV|V)\)/i)
    const intensity = intensityMatch ? intensityMatch[1].toUpperCase() : undefined
    effects.push({
      id: `${id}:${slugify(title)}`,
      library,
      categoryId: id,
      category: name,
      title,
      prompt,
      duration,
      negative: parseNegative(body),
      intensity,
    })
  }
  return { id, library, name, effects }
}

export function catalogFromFiles(files: Record<string, string>): PromptCategory[] {
  const categories: PromptCategory[] = []
  for (const [path, markdown] of Object.entries(files)) {
    if (slugFromPath(path) === 'readme') continue
    const category = parsePromptMarkdown(path, markdown)
    if (category.effects.length === 0) continue
    categories.push(category)
  }
  categories.sort((a, b) => {
    if (a.library !== b.library) return a.library === 'fx' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return categories
}

const promptFiles = import.meta.glob('../../prompts/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export function loadPromptCatalog(): PromptCategory[] {
  return catalogFromFiles(promptFiles)
}

export function mergeQueue(queue: CatalogEffect[], added: CatalogEffect[]): CatalogEffect[] {
  const seen = new Set(queue.map((item) => item.id))
  const next = [...queue]
  for (const item of added) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    next.push(item)
  }
  return next
}

export function removeFromQueue(queue: CatalogEffect[], id: string): CatalogEffect[] {
  return queue.filter((item) => item.id !== id)
}

function stem(word: string): string {
  return word
    .toLowerCase()
    .replace(/(?:ing|ies|es|s|ed|ly)$/i, '')
    .trim()
}

const STOP_WORDS = new Set([
  'tracktype',
  'music',
  'sfx',
  'sound',
  'effects',
  'with',
  'from',
  'and',
  'the',
  'for',
  'close',
  'mic',
  'dry',
  'studio',
  'fast',
  'decay',
  'short',
  'long',
  'soft',
  'hard',
  'instrumental',
  'vocals',
  'singing',
  'speech',
  'looping',
  'friendly',
])

export function inferClipCategory(clip: Clip, catalog?: PromptCategory[]): string {
  if (clip.category && clip.category.trim()) {
    return clip.category.trim()
  }
  const catList = catalog ?? loadPromptCatalog()
  const mode = clipMode(clip)
  const targetLibrary: PromptLibrary = mode === 'music' ? 'ambience' : 'fx'
  const normPrompt = clip.prompt
    .toLowerCase()
    .replace(/^tracktype:\s*\w+\s*,?\s*/i, '')
    .trim()

  if (!normPrompt) return 'Custom'

  const libraryCats = catList.filter((c) => c.library === targetLibrary)
  const promptWords = normPrompt
    .split(/[^a-z0-9]+/i)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  const promptStems = new Set(promptWords.map(stem))

  let bestCat = 'Custom'
  let bestScore = 0

  for (const cat of libraryCats) {
    let catScore = 0
    const catNameLower = cat.name.toLowerCase()
    const catWords = catNameLower
      .split(/[^a-z0-9]+/i)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    const catStems = new Set(catWords.map(stem))

    // 1. Category name exact match in prompt
    if (normPrompt.includes(catNameLower)) {
      catScore += 200
    }

    // 2. Stem / word match between prompt and category name
    for (const s of promptStems) {
      if (catStems.has(s)) {
        catScore += 100
      }
    }

    // 3. Find best matching effect in this category
    let bestEffectScore = 0
    for (const effect of cat.effects) {
      let effectScore = 0
      const effectNorm = effect.prompt
        .toLowerCase()
        .replace(/^tracktype:\s*\w+\s*,?\s*/i, '')
        .trim()
      if (normPrompt === effectNorm) {
        return cat.name
      }
      if (
        normPrompt.length >= 8 &&
        (effectNorm.startsWith(normPrompt) ||
          normPrompt.startsWith(effectNorm) ||
          effectNorm.includes(normPrompt) ||
          normPrompt.includes(effectNorm))
      ) {
        effectScore += 1000
      }
      const titleLower = effect.title.toLowerCase().trim()
      if (
        titleLower.length >= 4 &&
        (normPrompt.includes(titleLower) || titleLower.includes(normPrompt))
      ) {
        effectScore += 300
      }

      const titleWords = effect.title
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
      for (const w of titleWords) {
        if (promptStems.has(stem(w))) {
          effectScore += 20
        }
      }

      if (effectScore > bestEffectScore) {
        bestEffectScore = effectScore
      }
    }

    const totalScore = catScore + bestEffectScore
    const isFlavorCategory = catNameLower.includes('flavor') || catNameLower.includes('variation')
    const finalScore = isFlavorCategory ? totalScore - 50 : totalScore

    if (finalScore > bestScore) {
      bestScore = finalScore
      bestCat = cat.name
    }
  }

  return bestScore >= 50 ? bestCat : 'Custom'
}

export function formatIntensityLabel(code: string): string {
  const norm = code.toUpperCase().trim()
  if (norm === 'I' || norm === '1') return 'Level I — Quiet looping bed'
  if (norm === 'II' || norm === '2') return 'Level II — Mood in motion'
  if (norm === 'III' || norm === '3') return 'Level III — Full intensity'
  return `Level ${norm}`
}

export function inferClipIntensity(clip: Clip, catalog?: PromptCategory[]): string {
  if (clip.intensity && clip.intensity.trim()) {
    return formatIntensityLabel(clip.intensity.trim())
  }
  const catList = catalog ?? loadPromptCatalog()
  const normPrompt = clip.prompt
    .toLowerCase()
    .replace(/^tracktype:\s*\w+\s*,?\s*/i, '')
    .trim()

  for (const cat of catList) {
    if (cat.library !== 'ambience') continue
    for (const effect of cat.effects) {
      const effectNorm = effect.prompt
        .toLowerCase()
        .replace(/^tracktype:\s*\w+\s*,?\s*/i, '')
        .trim()
      if (
        normPrompt === effectNorm ||
        (normPrompt.length >= 10 && effectNorm.startsWith(normPrompt)) ||
        (effectNorm.length >= 10 && normPrompt.startsWith(effectNorm))
      ) {
        if (effect.intensity) {
          return formatIntensityLabel(effect.intensity)
        }
      }
    }
  }

  const match = clip.prompt.match(/\b\((I{1,3})\)|\bLevel\s+(I{1,3}|\d)\b|\bIntensity\s+(I{1,3}|\d)\b/i)
  if (match) {
    const raw = (match[1] || match[2] || match[3]).toUpperCase()
    const num = raw === '1' ? 'I' : raw === '2' ? 'II' : raw === '3' ? 'III' : raw
    return formatIntensityLabel(num)
  }

  const lower = clip.prompt.toLowerCase()
  if (
    lower.includes('steady texture with no ending') ||
    lower.includes('quietest') ||
    lower.includes('drone ambient') ||
    lower.includes('ruins ambient') ||
    lower.includes('sparse and patient')
  ) {
    return formatIntensityLabel('I')
  }
  if (
    lower.includes('epic') ||
    lower.includes('monumental') ||
    lower.includes('battle') ||
    lower.includes('full orchestra') ||
    lower.includes('climax') ||
    lower.includes('thunderous') ||
    lower.includes('colossal') ||
    lower.includes('finale') ||
    lower.includes('awakening')
  ) {
    return formatIntensityLabel('III')
  }
  if (
    lower.includes('cinematic') ||
    lower.includes('chamber') ||
    lower.includes('orchestral') ||
    lower.includes('theme') ||
    lower.includes('piece')
  ) {
    return formatIntensityLabel('II')
  }

  return formatIntensityLabel('I')
}


