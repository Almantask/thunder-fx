import type { Clip } from '@/lib/types'
import { isTauri } from '@/lib/utils'
import { deleteDiskFile, scanDiskLibrary } from '@/lib/engine'
import { readFileBytes } from '@/lib/tauriFs'

const DB_NAME = 'thunder-fx'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | undefined

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('clips')) {
          db.createObjectStore('clips', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('wavs')) {
          db.createObjectStore('wavs')
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        dbPromise = undefined
        reject(req.error)
      }
    })
  }
  return dbPromise
}

export type LibraryStore = {
  list(): Promise<Clip[]>
  getWav(id: string): Promise<ArrayBuffer | undefined>
  save(clip: Clip, wav: ArrayBuffer): Promise<void>
  delete(id: string): Promise<void>
  clear(): Promise<void>
}

/**
 * Disk clips always carry the path the worker wrote them to, and they live
 * under `mode/category/subcategory`, so there is no flat `<dir>/<id>.wav` to
 * fall back to guessing.
 */
function findClipPath(getClips: (() => Clip[]) | undefined, id: string): string | undefined {
  return getClips?.().find((clip) => clip.id === id)?.path
}

export function createDiskLibrary(
  getLibraryDir: () => string,
  getClips?: () => Clip[],
): LibraryStore {
  return {
    async list() {
      return await scanDiskLibrary(getLibraryDir())
    },
    async getWav(id: string) {
      if (!isTauri()) return undefined
      try {
        const filePath = findClipPath(getClips, id)
        if (!filePath) return undefined
        return await readFileBytes(filePath)
      } catch {
        return undefined
      }
    },
    async save() {
      // In desktop/Tauri mode, worker.py writes directly to disk. IDB is not touched.
    },
    async delete(id: string) {
      if (!isTauri()) return
      try {
        const filePath = findClipPath(getClips, id)
        if (filePath) {
          await deleteDiskFile(filePath)
        }
      } catch {
        /* ignore delete error */
      }
    },
    async clear() {
      // In desktop/Tauri mode, disk is the sole source of truth.
    },
  }
}

export function createAppLibrary(
  getLibraryDir: () => string,
  getClips?: () => Clip[],
): LibraryStore {
  if (isTauri()) {
    return createDiskLibrary(getLibraryDir, getClips)
  }
  if (typeof indexedDB !== 'undefined') {
    return createIdbLibrary()
  }
  return createMemoryLibrary()
}

export function createMemoryLibrary(seed: { clip: Clip; wav: ArrayBuffer }[] = []): LibraryStore {
  const clips = new Map(seed.map((row) => [row.clip.id, row.clip]))
  const wavs = new Map(seed.map((row) => [row.clip.id, row.wav]))
  return {
    async list() {
      return [...clips.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    },
    async getWav(id) {
      const buf = wavs.get(id)
      return buf ? buf.slice(0) : undefined
    },
    async save(clip, wav) {
      clips.set(clip.id, clip)
      wavs.set(clip.id, wav.slice(0))
    },
    async delete(id) {
      clips.delete(id)
      wavs.delete(id)
    },
    async clear() {
      clips.clear()
      wavs.clear()
    },
  }
}

export function createIdbLibrary(): LibraryStore {
  return {
    async list() {
      const db = await openDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('clips', 'readonly')
        const req = tx.objectStore('clips').getAll()
        req.onsuccess = () => {
          const rows = (req.result as Clip[]).sort((a, b) =>
            b.createdAt.localeCompare(a.createdAt),
          )
          resolve(rows)
        }
        req.onerror = () => reject(req.error)
      })
    },
    async getWav(id) {
      const db = await openDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction('wavs', 'readonly')
        const req = tx.objectStore('wavs').get(id)
        req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined)
        req.onerror = () => reject(req.error)
      })
    },
    async save(clip, wav) {
      const db = await openDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['clips', 'wavs'], 'readwrite')
        tx.objectStore('clips').put(clip)
        tx.objectStore('wavs').put(wav.slice(0), clip.id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
    async delete(id) {
      const db = await openDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['clips', 'wavs'], 'readwrite')
        tx.objectStore('clips').delete(id)
        tx.objectStore('wavs').delete(id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
    async clear() {
      const db = await openDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['clips', 'wavs'], 'readwrite')
        tx.objectStore('clips').clear()
        tx.objectStore('wavs').clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
  }
}
