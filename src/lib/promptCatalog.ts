import { clampGenerateSeconds } from '@/lib/duration'

export type CatalogEffect = {
  id: string
  categoryId: string
  category: string
  title: string
  prompt: string
  duration: number
  negative: string
}

export type PromptCategory = {
  id: string
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

function categoryIdFromPath(path: string): string {
  return fileName(path)
    .replace(/\.md$/i, '')
    .toLowerCase()
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
  const id = categoryIdFromPath(path)
  const name = headingName(markdown, id)
  const chunks = markdown.split(/^### /m).slice(1)
  const effects: CatalogEffect[] = []
  for (const chunk of chunks) {
    const newline = chunk.indexOf('\n')
    const title = (newline === -1 ? chunk : chunk.slice(0, newline)).trim()
    const body = newline === -1 ? '' : chunk.slice(newline + 1)
    const duration = parseDuration(body)
    const prompt = parsePrompt(body)
    if (!title || duration === undefined || !prompt) continue
    effects.push({
      id: `${id}:${slugify(title)}`,
      categoryId: id,
      category: name,
      title,
      prompt,
      duration,
      negative: parseNegative(body),
    })
  }
  return { id, name, effects }
}

export function catalogFromFiles(files: Record<string, string>): PromptCategory[] {
  const categories: PromptCategory[] = []
  for (const [path, markdown] of Object.entries(files)) {
    const id = categoryIdFromPath(path)
    if (id === 'readme') continue
    const category = parsePromptMarkdown(path, markdown)
    if (category.effects.length === 0) continue
    categories.push(category)
  }
  categories.sort((a, b) => a.name.localeCompare(b.name))
  return categories
}

const promptFiles = import.meta.glob('../../prompts/*.md', {
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
