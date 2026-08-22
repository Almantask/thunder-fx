export function canCast(prompt: string): boolean {
  return prompt.trim().length >= 3
}

export function appendChip(prompt: string, chip: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return chip
  if (trimmed.includes(chip)) return prompt
  if (trimmed.endsWith(',')) return `${trimmed} ${chip}`
  return `${trimmed}, ${chip}`
}
