import type { Clip } from '@/lib/types'

const DB_NAME = 'thunder-fx'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
    req.onerror = () => reject(req.error)
  })
}

export type LibraryStore = {
  list(): Promise<Clip[]>
  getWav(id: string): Promise<ArrayBuffer | undefined>
  save(clip: Clip, wav: ArrayBuffer): Promise<void>
  delete(id: string): Promise<void>
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
  }
}

export function downloadArrayBuffer(
  buffer: ArrayBuffer,
  filename: string,
  mime = 'audio/wav',
): void {
  const blob = new Blob([buffer], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
