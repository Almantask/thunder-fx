const MAX_SLUG = 48

export function isUuidOrSymbol(text: string): boolean {
  const cleaned = text.trim()
  if (!cleaned) return false
  // Standard 8-4-4-4-12 UUID format
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned)) {
    return true
  }
  // 32-char hex string
  if (/^[0-9a-f]{32}$/i.test(cleaned)) {
    return true
  }
  // 8+ hex chars without dashes/spaces
  if (/^[0-9a-f]{8,}$/i.test(cleaned)) {
    return true
  }
  // Hex with dashes or underscores
  if (/^[0-9a-f_-]{8,}$/i.test(cleaned) && !/[g-z]/i.test(cleaned)) {
    return true
  }
  // Standard UUID prefix (e.g. 67de8afe-9708)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(cleaned) && !/\s/.test(cleaned)) {
    return true
  }
  // Pure digits or symbols
  if (/^[\d_-]+$/.test(cleaned) || /^[^a-zA-Z0-9]+$/.test(cleaned)) {
    return true
  }
  return false
}

export function slugToTitle(slug: string): string {
  let cleaned = slug.trim()
  // Strip trailing unique hex suffix e.g. -a1b2c3d4 or _a1b2c3d4 (6 to 12 hex chars)
  cleaned = cleaned.replace(/[-_][0-9a-f]{6,12}$/i, '')
  // Strip trailing duration e.g. -8s or -8.5s or _8s
  cleaned = cleaned.replace(/[-_]\d+(\.\d+)?s$/i, '')
  // Strip secondary trailing unique hex suffix if duration came after hex
  cleaned = cleaned.replace(/[-_][0-9a-f]{6,12}$/i, '')

  const words = cleaned
    .split(/[-_\s]+/)
    .map((w) => w.trim())
    .filter(Boolean)

  if (words.length === 0) return 'Sound Effect'
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

export function slugifyPrompt(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/tracktype:\s*\w+,?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '')
  return slug || 'sound'
}

const GENERIC_PREFIXES = /^(instrumental|music|sfx|sound effects?|ambience)$/i

export type ClipLike = {
  category?: string
  subcategory?: string
  intensity?: string
  mode?: string
}

function isGenericCategory(name?: string): boolean {
  if (!name) return true
  const lower = name.trim().toLowerCase()
  return (
    lower === 'custom' ||
    lower === 'general' ||
    lower === 'level i' ||
    lower === 'music-and-fx-generated-library' ||
    isUuidOrSymbol(name)
  )
}

export function promptName(prompt: string, clip?: ClipLike): string {
  const raw = prompt.trim()
  if (!raw || isUuidOrSymbol(raw)) {
    if (clip?.subcategory && !isGenericCategory(clip.subcategory)) {
      return `${clip.subcategory.trim()} Sound`
    }
    if (clip?.category && !isGenericCategory(clip.category)) {
      return `${clip.category.trim()} Sound`
    }
    if (clip?.mode === 'music') {
      return 'Ambient Track'
    }
    return 'Sound Effect'
  }

  const stripped = raw
    .replace(/^tracktype:\s*\w+\s*,?\s*/i, '')
    .replace(/^(sfx|music|ambience|sound effects?)\s*,\s*/i, '')
    .trim()
  if (!stripped) return 'Untitled sound'

  if (!stripped.includes(',') && !stripped.includes(' ') && (stripped.includes('-') || stripped.includes('_'))) {
    const fromSlug = slugToTitle(stripped)
    if (!isUuidOrSymbol(fromSlug)) return fromSlug
  }

  const clauses = stripped
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (clauses.length === 0) return 'Untitled sound'

  const meaningful = clauses.find((clause) => !GENERIC_PREFIXES.test(clause))
  const target = meaningful || clauses[0]
  if (!target) return 'Untitled sound'

  if (isUuidOrSymbol(target)) {
    if (clip?.subcategory && !isGenericCategory(clip.subcategory)) {
      return `${clip.subcategory.trim()} Sound`
    }
    if (clip?.category && !isGenericCategory(clip.category)) {
      return `${clip.category.trim()} Sound`
    }
    return clip?.mode === 'music' ? 'Ambient Track' : 'Sound Effect'
  }

  return target.charAt(0).toUpperCase() + target.slice(1)
}

export type AudioExt = 'wav' | 'ogg' | 'flac' | 'mp3'

export function clipFilename(
  prompt: string,
  durationSeconds: number,
  ext: AudioExt,
): string {
  const dur = Math.round(durationSeconds * 10) / 10
  return `${slugifyPrompt(prompt)}-${dur}s.${ext}`
}
