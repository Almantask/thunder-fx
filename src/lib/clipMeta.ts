/**
 * Per-clip metadata that has nowhere else to live.
 *
 * A library clip is a bare WAV on disk. Its prompt, mode and category are
 * recoverable — from the file's LIST/INFO chunk and from the folder it sits in
 * — but a favourite, a rating, a tag or a display name are not derivable from
 * anything, so they go in one sidecar index next to the audio.
 *
 * One file rather than one per clip: the library scan already walks thousands
 * of WAVs, and adding a second stat call per clip to that walk is the thing
 * that would make it slow.
 *
 * The clip id is the WAV's file stem (see `clip_json_from_path` in
 * src-tauri/src/lib.rs), so renaming a clip changes its id — which is why
 * {@link renameMeta} exists rather than callers mutating the map directly.
 */
import type { Clip } from '@/lib/types'
import { promptName } from '@/lib/filename'

export const META_FILENAME = 'thunder-fx-meta.json'

/** Bumped only for a shape change the loader would otherwise misread. */
export const META_VERSION = 1

export const MAX_RATING = 5
export const MAX_TAG_LENGTH = 32
export const MAX_NAME_LENGTH = 80

export type ClipMeta = {
  /** Starred. Independent of rating: a 3-star clip can still be the pick. */
  favorite?: boolean
  /** Marked as a reject. Hidden by default rather than deleted. */
  rejected?: boolean
  /** 0–5, where 0 means unrated. */
  rating?: number
  tags?: string[]
  /** Display name override. Set when the clip is renamed on disk. */
  name?: string
  updatedAt?: string
}

export type ClipMetaIndex = Record<string, ClipMeta>

export type MetaFile = {
  version: number
  clips: ClipMetaIndex
}

export type LibraryFilter = {
  favoritesOnly: boolean
  showRejected: boolean
  minRating: number
  /** A clip must carry every selected tag, not any of them. */
  tags: string[]
}

export const EMPTY_FILTER: LibraryFilter = {
  favoritesOnly: false,
  showRejected: false,
  minRating: 0,
  tags: [],
}

export function isFilterActive(filter: LibraryFilter): boolean {
  return (
    filter.favoritesOnly ||
    filter.showRejected ||
    filter.minRating > 0 ||
    filter.tags.length > 0
  )
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH)
}

function clampRating(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const rounded = Math.round(value)
  if (rounded <= 0) return undefined
  return Math.min(MAX_RATING, rounded)
}

function sanitizeMeta(value: unknown): ClipMeta | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Record<string, unknown>
  const meta: ClipMeta = {}
  if (row.favorite === true) meta.favorite = true
  if (row.rejected === true) meta.rejected = true
  const rating = clampRating(row.rating)
  if (rating) meta.rating = rating
  if (Array.isArray(row.tags)) {
    const tags = [
      ...new Set(
        row.tags
          .filter((tag): tag is string => typeof tag === 'string')
          .map(normalizeTag)
          .filter(Boolean),
      ),
    ].sort()
    if (tags.length) meta.tags = tags
  }
  if (typeof row.name === 'string' && row.name.trim()) {
    meta.name = row.name.trim().slice(0, MAX_NAME_LENGTH)
  }
  if (typeof row.updatedAt === 'string') meta.updatedAt = row.updatedAt
  return isMetaEmpty(meta) ? undefined : meta
}

/** A row with nothing set is dropped rather than stored, so the file stays small. */
export function isMetaEmpty(meta: ClipMeta): boolean {
  return (
    !meta.favorite &&
    !meta.rejected &&
    !meta.rating &&
    !meta.tags?.length &&
    !meta.name
  )
}

/** Tolerates a truncated or hand-edited file: anything unreadable is dropped. */
export function parseMetaFile(text: string): ClipMetaIndex {
  try {
    const parsed = JSON.parse(text) as Partial<MetaFile> | ClipMetaIndex
    const clips =
      parsed && typeof parsed === 'object' && 'clips' in parsed && parsed.clips
        ? parsed.clips
        : (parsed as ClipMetaIndex)
    if (!clips || typeof clips !== 'object') return {}
    const index: ClipMetaIndex = {}
    for (const [id, value] of Object.entries(clips)) {
      const meta = sanitizeMeta(value)
      if (meta) index[id] = meta
    }
    return index
  } catch {
    return {}
  }
}

export function serializeMetaFile(index: ClipMetaIndex): string {
  const clips: ClipMetaIndex = {}
  for (const id of Object.keys(index).sort()) {
    const meta = index[id]
    if (meta && !isMetaEmpty(meta)) clips[id] = meta
  }
  return `${JSON.stringify({ version: META_VERSION, clips }, null, 2)}\n`
}

function withMeta(index: ClipMetaIndex, id: string, patch: ClipMeta): ClipMetaIndex {
  const next = { ...index }
  const merged: ClipMeta = {
    ...(index[id] ?? {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  // `updatedAt` alone is not content, so an emptied row is removed outright.
  if (isMetaEmpty(merged)) delete next[id]
  else next[id] = merged
  return next
}

/** Shared empty row so cards without metadata keep a stable prop identity. */
export const EMPTY_META: ClipMeta = Object.freeze({})

export function getMeta(index: ClipMetaIndex, id: string): ClipMeta {
  return index[id] ?? EMPTY_META
}

export function toggleFavorite(index: ClipMetaIndex, id: string): ClipMetaIndex {
  const current = getMeta(index, id)
  return withMeta(index, id, {
    favorite: !current.favorite,
    // Favouriting a reject un-rejects it; the two are contradictory verdicts.
    rejected: current.favorite ? current.rejected : false,
  })
}

export function toggleRejected(index: ClipMetaIndex, id: string): ClipMetaIndex {
  const current = getMeta(index, id)
  return withMeta(index, id, {
    rejected: !current.rejected,
    favorite: current.rejected ? current.favorite : false,
  })
}

/** Clicking the star already set clears the rating, as in every photo tool. */
export function setRating(index: ClipMetaIndex, id: string, rating: number): ClipMetaIndex {
  const current = getMeta(index, id)
  const wanted = clampRating(rating)
  return withMeta(index, id, {
    rating: current.rating === wanted ? undefined : wanted,
  })
}

export function addTag(index: ClipMetaIndex, id: string, tag: string): ClipMetaIndex {
  const clean = normalizeTag(tag)
  if (!clean) return index
  const current = getMeta(index, id).tags ?? []
  if (current.includes(clean)) return index
  return withMeta(index, id, { tags: [...current, clean].sort() })
}

export function removeTag(index: ClipMetaIndex, id: string, tag: string): ClipMetaIndex {
  const clean = normalizeTag(tag)
  const current = getMeta(index, id).tags ?? []
  if (!current.includes(clean)) return index
  const tags = current.filter((entry) => entry !== clean)
  return withMeta(index, id, { tags: tags.length ? tags : undefined })
}

export function setName(index: ClipMetaIndex, id: string, name: string): ClipMetaIndex {
  const clean = name.trim().slice(0, MAX_NAME_LENGTH)
  return withMeta(index, id, { name: clean || undefined })
}

/**
 * Moves a clip's row to a new id. The id is the file stem, so this runs
 * alongside every rename — without it a renamed clip silently loses its
 * favourite, rating and tags.
 */
export function renameMeta(
  index: ClipMetaIndex,
  fromId: string,
  toId: string,
  displayName?: string,
): ClipMetaIndex {
  if (fromId === toId && displayName === undefined) return index
  const next = { ...index }
  const existing = next[fromId]
  delete next[fromId]
  const merged: ClipMeta = {
    ...(existing ?? {}),
    ...(displayName === undefined ? {} : { name: displayName.trim() || undefined }),
    updatedAt: new Date().toISOString(),
  }
  if (!isMetaEmpty(merged)) next[toId] = merged
  else delete next[toId]
  return next
}

export function forgetMeta(index: ClipMetaIndex, id: string): ClipMetaIndex {
  if (!(id in index)) return index
  const next = { ...index }
  delete next[id]
  return next
}

/**
 * Drop sidecar rows whose WAV is neither in the library nor in the trash.
 * An Explorer delete (or a hand-emptied folder) otherwise leaves the rating
 * and tags behind forever.
 */
export function pruneMissingMeta(
  index: ClipMetaIndex,
  liveIds: Iterable<string>,
  trashIds: Iterable<string> = [],
): { index: ClipMetaIndex; removed: number } {
  const keep = new Set<string>()
  for (const id of liveIds) keep.add(id)
  for (const id of trashIds) keep.add(id)
  const next: ClipMetaIndex = {}
  let removed = 0
  for (const [id, row] of Object.entries(index)) {
    if (keep.has(id)) next[id] = row
    else removed += 1
  }
  return { index: next, removed }
}

/** Every tag in use, with counts, for the filter bar. Most used first. */
export function tagCounts(index: ClipMetaIndex): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const meta of Object.values(index)) {
    for (const tag of meta.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

/** The rename, if there is one; otherwise the name derived from the prompt. */
export function clipDisplayName(clip: Clip, index: ClipMetaIndex): string {
  return getMeta(index, clip.id).name || promptName(clip.prompt, clip)
}

/**
 * Rejected clips are hidden unless asked for. That is the default because a
 * reject is a triage verdict — the point is to get it out of the way — but it
 * is never a delete, so `showRejected` brings them straight back.
 */
export function matchesFilter(meta: ClipMeta, filter: LibraryFilter): boolean {
  if (meta.rejected && !filter.showRejected) return false
  if (filter.favoritesOnly && !meta.favorite) return false
  if (filter.minRating > 0 && (meta.rating ?? 0) < filter.minRating) return false
  if (filter.tags.length) {
    const tags = meta.tags ?? []
    if (!filter.tags.every((tag) => tags.includes(tag))) return false
  }
  return true
}

export function filterClips(
  clips: Clip[],
  index: ClipMetaIndex,
  filter: LibraryFilter,
): Clip[] {
  if (!isFilterActive(filter)) {
    return clips.filter((clip) => !getMeta(index, clip.id).rejected)
  }
  return clips.filter((clip) => matchesFilter(getMeta(index, clip.id), filter))
}
