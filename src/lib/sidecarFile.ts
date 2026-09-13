/**
 * Shared helpers for the JSON sidecars that must not be truncated mid-write.
 *
 * Meta, trash, and the allowed-path list are rewritten often. A crash in the
 * middle of a plain overwrite left a file `JSON.parse` could not read, and the
 * next save then replaced it with an empty index.
 */

export const SIDECAR_SAVE_DEBOUNCE_MS = 300

export class SidecarCorruptError extends Error {
  readonly path: string
  readonly backupPath: string

  constructor(path: string, backupPath: string) {
    super(
      `Could not read ${path}. A copy was saved as ${backupPath}. Saving is paused until you confirm starting a new file.`,
    )
    this.name = 'SidecarCorruptError'
    this.path = path
    this.backupPath = backupPath
  }
}

export function corruptSidecarPath(path: string, at = Date.now()): string {
  return `${path}.corrupt-${at}`
}

export function isJsonParseable(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

export function createDebouncedSaver<T>(
  write: (value: T) => Promise<void>,
  delayMs = SIDECAR_SAVE_DEBOUNCE_MS,
): {
  schedule(value: T): Promise<void>
  flush(): Promise<void>
  blocked(): boolean
  block(): void
  unblock(): void
} {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: T | undefined
  let writing: Promise<void> = Promise.resolve()
  let blocked = false

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    const value = pending
    pending = undefined
    if (value === undefined || blocked) return
    writing = writing.then(() => write(value), () => write(value))
    await writing
  }

  return {
    schedule(value) {
      if (blocked) {
        return Promise.reject(
          new Error('Saving is paused until the corrupt sidecar is acknowledged.'),
        )
      }
      pending = value
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        void flush()
      }, delayMs)
      return Promise.resolve()
    },
    flush,
    blocked: () => blocked,
    block() {
      blocked = true
    },
    unblock() {
      blocked = false
    },
  }
}
