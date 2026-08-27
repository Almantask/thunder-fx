import { promptName, slugifyPrompt, type ClipLike } from '@/lib/filename'
import type { AudioFormat } from '@/lib/audioExport'
import type { Clip } from '@/lib/types'

export const DEFAULT_PACK_TEMPLATE = '{type}_{category}_{name}_{index}'

export type PackClip = ClipLike & {
  prompt: string
  mode?: string
  category?: string
}

function sanitizePart(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
  return cleaned || 'clip'
}

function typeToken(clip: PackClip): string {
  return clip.mode === 'music' ? 'MUS' : 'SFX'
}

function categoryToken(clip: PackClip): string {
  const cat = clip.category?.trim()
  if (!cat || cat.toLowerCase() === 'custom' || cat.toLowerCase() === 'general') {
    return clip.mode === 'music' ? 'Ambience' : 'General'
  }
  return cat
}

export function formatPackFilename(
  template: string,
  clip: PackClip,
  index: number,
  ext: AudioFormat,
): string {
  const name = slugifyPrompt(promptName(clip.prompt, clip))
  const vars: Record<string, string> = {
    type: typeToken(clip),
    category: sanitizePart(categoryToken(clip)),
    name: sanitizePart(name),
    index: String(index).padStart(2, '0'),
    ext,
  }
  const applied = (template.trim() || DEFAULT_PACK_TEMPLATE)
    .replace(/\{(\w+)\}/gi, (_, key: string) => vars[key.toLowerCase()] ?? '')
    .replace(/\[(\w+)\]/gi, (_, key: string) => vars[key.toLowerCase()] ?? '')
  const base = applied.replace(/\.[a-z0-9]+$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
  return `${base || 'clip'}.${ext}`
}

export function buildPackManifest(
  files: { filename: string; clip: Clip }[],
  createdAt = new Date().toISOString(),
): string {
  return `${JSON.stringify(
    {
      app: 'Thunder FX',
      createdAt,
      files: files.map(({ filename, clip }) => ({
        filename,
        prompt: clip.prompt,
        duration: clip.duration,
        seed: clip.seed,
        category: clip.category,
        subcategory: clip.subcategory,
        mode: clip.mode ?? 'sfx',
      })),
    },
    null,
    2,
  )}\n`
}
