/**
 * Where the clip metadata index is kept.
 *
 * Desktop writes `thunder-fx-meta.json` into the library folder, so the ratings
 * and tags travel with the audio: back the folder up, or move it to another
 * machine, and the triage comes with it. The library scanner only collects
 * `.wav`, so the sidecar is invisible to it.
 *
 * The browser build has no library folder — clips live in IndexedDB — so it
 * falls back to localStorage under the same shape.
 */
import {
  META_FILENAME,
  parseMetaFile,
  serializeMetaFile,
  type ClipMetaIndex,
} from '@/lib/clipMeta'
import {
  SidecarCorruptError,
  corruptSidecarPath,
  createDebouncedSaver,
  isJsonParseable,
} from '@/lib/sidecarFile'
import { copyFile, joinPath, readFileBytes, writeTextFile, writeTextFileAtomic } from '@/lib/tauriFs'
import { isTauri } from '@/lib/utils'

export const META_STORAGE_KEY = 'thunder-fx.clip-meta'

export type ClipMetaStore = {
  load(): Promise<ClipMetaIndex>
  save(index: ClipMetaIndex): Promise<void>
  flush(): Promise<void>
  acknowledgeCorrupt(): void
}

function decodeUtf8(buffer: ArrayBuffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer)
}

export function createLocalStorageMetaStore(): ClipMetaStore {
  return {
    async load() {
      try {
        const raw = localStorage.getItem(META_STORAGE_KEY)
        return raw ? parseMetaFile(raw) : {}
      } catch {
        return {}
      }
    },
    async save(index) {
      try {
        localStorage.setItem(META_STORAGE_KEY, serializeMetaFile(index))
      } catch {
        /* A full or blocked quota must not fail the action that triggered it. */
      }
    },
    async flush() {
      /* localStorage writes are already synchronous */
    },
    acknowledgeCorrupt() {
      /* browser storage is not a sidecar */
    },
  }
}

export function createDiskMetaStore(getLibraryDir: () => string): ClipMetaStore {
  const saver = createDebouncedSaver<ClipMetaIndex>(async (index) => {
    const dir = getLibraryDir()
    if (!dir) return
    await writeTextFileAtomic(joinPath(dir, META_FILENAME), serializeMetaFile(index))
  })

  return {
    async load() {
      const dir = getLibraryDir()
      if (!dir) return {}
      const path = joinPath(dir, META_FILENAME)
      try {
        const bytes = await readFileBytes(path)
        if (!bytes || bytes.byteLength === 0) return {}
        const text = decodeUtf8(bytes)
        if (!text.trim()) return {}
        if (!isJsonParseable(text)) {
          const backupPath = corruptSidecarPath(path)
          try {
            await copyFile(path, backupPath)
          } catch {
            await writeTextFile(backupPath, text)
          }
          saver.block()
          throw new SidecarCorruptError(path, backupPath)
        }
        return parseMetaFile(text)
      } catch (err) {
        if (err instanceof SidecarCorruptError) throw err
        // A first run has no sidecar yet, which is not an error.
        return {}
      }
    },
    async save(index) {
      await saver.schedule(index)
    },
    async flush() {
      await saver.flush()
    },
    acknowledgeCorrupt() {
      saver.unblock()
    },
  }
}

export function createClipMetaStore(getLibraryDir: () => string): ClipMetaStore {
  return isTauri() ? createDiskMetaStore(getLibraryDir) : createLocalStorageMetaStore()
}

/** In-memory store for tests and for a build with neither disk nor storage. */
export function createMemoryMetaStore(seed: ClipMetaIndex = {}): ClipMetaStore {
  let index: ClipMetaIndex = { ...seed }
  return {
    async load() {
      return { ...index }
    },
    async save(next) {
      index = { ...next }
    },
    async flush() {
      /* already in memory */
    },
    acknowledgeCorrupt() {
      /* nothing to acknowledge */
    },
  }
}
