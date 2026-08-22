const MAX_SLUG = 48

export function slugifyPrompt(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/tracktype:\s*sfx,?/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '')
  return slug || 'incantation'
}

export function clipFilename(
  prompt: string,
  durationSeconds: number,
  ext: 'wav' | 'ogg',
): string {
  const dur = Math.round(durationSeconds * 10) / 10
  return `${slugifyPrompt(prompt)}-${dur}s.${ext}`
}
