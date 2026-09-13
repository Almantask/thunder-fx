/**
 * Deleting a clip moves it aside instead of destroying it.
 *
 * A library clip can be several minutes of GPU time, and delete used to call
 * `remove_file` straight away — one misclick and the render was gone. Clips now
 * go to `<library>/.trash/` and stay there until they are purged on purpose.
 * The 30-day sweep runs in Rust after the window shows (`sweep_trash`), so
 * opening the trash view is just a read. `move_file` refuses a cross-volume
 * copy so a library on another drive cannot silently duplicate a deleted clip.
 *
 * The index records where each file came from, plus the metadata row it had, so
 * restoring puts the audio back at its original path *and* brings its rating
 * and tags with it.
 */
import type { ClipMeta } from '@/lib/clipMeta'
import type { Clip } from '@/lib/types'
import { reportError } from '@/lib/engine'
import {
  SidecarCorruptError,
  corruptSidecarPath,
  isJsonParseable,
} from '@/lib/sidecarFile'
import { copyFile, deleteFile, joinPath, moveFile, readFileBytes, writeTextFile, writeTextFileAtomic } from '@/lib/tauriFs'

export const TRASH_DIRNAME = '.trash'
export const TRASH_INDEX_FILENAME = 'thunder-fx-trash.json'

/** Purged automatically once older than this on startup. */
export const TRASH_RETENTION_DAYS = 30

export type TrashEntry = {
  id: string
  /** Snapshot, so the trash view renders without rescanning anything. */
  clip: Clip
  originalPath: string
  trashPath: string
  deletedAt: string
  meta?: ClipMeta
}

export type TrashStore = {
  list(): Promise<TrashEntry[]>
  trash(clip: Clip, meta?: ClipMeta): Promise<TrashEntry | undefined>
  /** Returns the restored clip, or undefined if the audio has gone missing. */
  restore(id: string): Promise<TrashEntry | undefined>
  purge(id: string): Promise<void>
  empty(): Promise<void>
}

function decodeUtf8(buffer: ArrayBuffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
}

export function parseTrashIndex(text: string): TrashEntry[] {
  try {
    const parsed = JSON.parse(text) as unknown
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { entries?: unknown }).entries)
        ? (parsed as { entries: unknown[] }).entries
        : []
    return rows.filter((row): row is TrashEntry => {
      if (!row || typeof row !== 'object') return false
      const entry = row as Partial<TrashEntry>
      return (
        typeof entry.id === 'string' &&
        typeof entry.originalPath === 'string' &&
        typeof entry.trashPath === 'string' &&
        typeof entry.deletedAt === 'string' &&
        Boolean(entry.clip)
      )
    })
  } catch {
    return []
  }
}

export function serializeTrashIndex(entries: TrashEntry[]): string {
  return `${JSON.stringify({ version: 1, entries }, null, 2)}\n`
}

export function isExpired(entry: TrashEntry, now = Date.now()): boolean {
  const at = Date.parse(entry.deletedAt)
  if (!Number.isFinite(at)) return false
  return now - at > TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000
}

/**
 * Unique within `.trash` even when two clips share a stem.
 *
 * The id comes from a filename on disk, so it is already tame — but it reaches
 * here as a string, and this builds a path from it. Everything outside
 * `[A-Za-z0-9._-]` becomes a dash, and a leading dot is dropped so the result
 * can never read as a traversal or hide itself as a dotfile.
 */
export function trashFilename(id: string, at = Date.now()): string {
  const safe = id
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    // A run of dots is the only shape that can still mean "parent directory".
    .replace(/\.{2,}/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 96)
  return `${safe || 'clip'}--${at}.wav`
}

export function createDiskTrash(getLibraryDir: () => string): TrashStore {
  const indexPath = () => joinPath(getLibraryDir(), TRASH_INDEX_FILENAME)
  const trashDir = () => joinPath(getLibraryDir(), TRASH_DIRNAME)

  async function readIndex(): Promise<TrashEntry[]> {
    if (!getLibraryDir()) return []
    const path = indexPath()
    try {
      const bytes = await readFileBytes(path)
      if (!bytes || bytes.byteLength === 0) return []
      const text = decodeUtf8(bytes)
      if (!text.trim()) return []
      if (!isJsonParseable(text)) {
        const backupPath = corruptSidecarPath(path)
        try {
          await copyFile(path, backupPath)
        } catch {
          await writeTextFile(backupPath, text)
        }
        throw new SidecarCorruptError(path, backupPath)
      }
      return parseTrashIndex(text)
    } catch (err) {
      if (err instanceof SidecarCorruptError) throw err
      return []
    }
  }

  async function writeIndex(entries: TrashEntry[]): Promise<void> {
    if (!getLibraryDir()) return
    await writeTextFileAtomic(indexPath(), serializeTrashIndex(entries))
  }

  async function removeEntry(entries: TrashEntry[], id: string): Promise<TrashEntry[]> {
    const entry = entries.find((row) => row.id === id)
    if (entry) {
      try {
        await deleteFile(entry.trashPath)
      } catch {
        // Already gone from disk; dropping the index row is still correct.
      }
    }
    return entries.filter((row) => row.id !== id)
  }

  return {
    async list() {
      const entries = await readIndex()
      return [...entries].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    },

    async trash(clip, meta) {
      if (!clip.path || !getLibraryDir()) return undefined
      const deletedAt = new Date().toISOString()
      const destination = joinPath(trashDir(), trashFilename(clip.id))
      try {
        await moveFile(clip.path, destination)
      } catch (err) {
        reportError(err, 'Could not move clip to trash')
        throw err
      }
      const entry: TrashEntry = {
        id: clip.id,
        clip,
        originalPath: clip.path,
        trashPath: destination,
        deletedAt,
        ...(meta ? { meta } : {}),
      }
      const entries = await readIndex()
      await writeIndex([entry, ...entries.filter((row) => row.id !== clip.id)])
      return entry
    },

    async restore(id) {
      const entries = await readIndex()
      const entry = entries.find((row) => row.id === id)
      if (!entry) return undefined
      try {
        await moveFile(entry.trashPath, entry.originalPath)
      } catch (err) {
        reportError(err, 'Could not restore clip from trash')
        // The audio is gone, or something already occupies the original path.
        // Leave the row alone so the trash view can still show and purge it.
        return undefined
      }
      await writeIndex(entries.filter((row) => row.id !== id))
      return entry
    },

    async purge(id) {
      const entries = await readIndex()
      await writeIndex(await removeEntry(entries, id))
    },

    async empty() {
      const entries = await readIndex()
      let kept = entries
      for (const entry of entries) {
        kept = await removeEntry(kept, entry.id)
      }
      await writeIndex(kept)
    },
  }
}

/**
 * Browser fallback. IndexedDB clips have no path to move, so the audio is held
 * in memory for the session and restored through the library store. It is the
 * same undo, minus the survival across a reload — the desktop build is where a
 * deleted clip represents real GPU time.
 */
export function createMemoryTrash(options: {
  getWav: (id: string) => Promise<ArrayBuffer | undefined>
  restoreClip: (clip: Clip, wav: ArrayBuffer) => Promise<void>
  /**
   * Removes the clip from the library once its audio is safely held here. The
   * disk store gets this for free — moving the file *is* the removal — but
   * IndexedDB needs the two steps done in the right order, so it belongs in
   * the store rather than at every call site.
   */
  removeClip?: (id: string) => Promise<void>
}): TrashStore {
  const entries = new Map<string, TrashEntry>()
  const audio = new Map<string, ArrayBuffer>()

  return {
    async list() {
      return [...entries.values()].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    },
    async trash(clip, meta) {
      const wav = await options.getWav(clip.id)
      if (!wav) return undefined
      audio.set(clip.id, wav)
      const entry: TrashEntry = {
        id: clip.id,
        clip,
        originalPath: clip.path ?? clip.id,
        trashPath: `memory:${clip.id}`,
        deletedAt: new Date().toISOString(),
        ...(meta ? { meta } : {}),
      }
      entries.set(clip.id, entry)
      // Only after the audio is held: a failure here leaves the clip in the
      // library, which is the safe direction to fail in.
      await options.removeClip?.(clip.id)
      return entry
    },
    async restore(id) {
      const entry = entries.get(id)
      const wav = audio.get(id)
      if (!entry || !wav) return undefined
      await options.restoreClip(entry.clip, wav)
      entries.delete(id)
      audio.delete(id)
      return entry
    },
    async purge(id) {
      entries.delete(id)
      audio.delete(id)
    },
    async empty() {
      entries.clear()
      audio.clear()
    },
  }
}
