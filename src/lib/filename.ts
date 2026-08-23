const MAX_SLUG = 48

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

export function promptName(prompt: string): string {
  const stripped = prompt.replace(/^tracktype:\s*\w+\s*,?\s*/i, '').trim()
  const clauses = stripped
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (clauses.length === 0) return 'Untitled sound'

  const meaningful = clauses.find((clause) => !GENERIC_PREFIXES.test(clause))
  const target = meaningful || clauses[0]
  return target.charAt(0).toUpperCase() + target.slice(1)
}

export function clipFilename(
  prompt: string,
  durationSeconds: number,
  ext: 'wav' | 'ogg',
): string {
  const dur = Math.round(durationSeconds * 10) / 10
  return `${slugifyPrompt(prompt)}-${dur}s.${ext}`
}
