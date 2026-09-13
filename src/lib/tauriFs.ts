/**
 * Scoped filesystem access for the desktop build.
 *
 * Audio moves over the IPC boundary as raw bytes: `read_file` hands back an
 * ArrayBuffer and `write_file` takes one as the request body, so a long clip
 * never becomes a multi-megabyte base64 string on either side.
 *
 * Every path is checked against Rust's `PathScope` before it is touched, and
 * the only way to widen that scope is a native dialog — which is why the save
 * and folder pickers live here rather than in the JS dialog plugin.
 */
import { isTauri } from '@/lib/utils'

/** Joins with the separator the directory already uses (Windows or POSIX). */
export function joinPath(dir: string, file: string): string {
  if (!dir) return file
  const sep = dir.includes('/') && !dir.includes('\\') ? '/' : '\\'
  return `${dir.replace(/[\\/]+$/, '')}${sep}${file}`
}

export function fileNameOf(path: string): string {
  return path.split(/[/\\]/).pop() ?? ''
}

async function core() {
  return await import('@tauri-apps/api/core')
}

/**
 * Paths ride in an HTTP header, which is ASCII-only, so they are base64'd.
 * Paths are short; the spread is safe at this size.
 */
function encodePathHeader(path: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(path)))
}

function toArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof Uint8Array) {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    ) as ArrayBuffer
  }
  return value
}

export async function readFileBytes(path: string): Promise<ArrayBuffer | undefined> {
  if (!isTauri()) return undefined
  const { invoke } = await core()
  const result = await invoke<ArrayBuffer | Uint8Array>('read_file', { path })
  return result ? toArrayBuffer(result) : undefined
}

export async function writeFileBytes(path: string, data: ArrayBuffer): Promise<void> {
  const { invoke } = await core()
  await invoke('write_file', new Uint8Array(data), {
    headers: { 'x-thunder-path': encodePathHeader(path) },
  })
}

export async function writeTextFile(path: string, text: string): Promise<void> {
  const encoded = new TextEncoder().encode(text)
  await writeFileBytes(path, toArrayBuffer(encoded))
}

/** Atomic write for JSON sidecars: tmp + fsync + rename, with a `.bak`. */
export async function writeTextFileAtomic(path: string, text: string): Promise<void> {
  if (!isTauri()) {
    await writeTextFile(path, text)
    return
  }
  const { invoke } = await core()
  const encoded = new TextEncoder().encode(text)
  await invoke('write_file_atomic', new Uint8Array(encoded), {
    headers: { 'x-thunder-path': encodePathHeader(path) },
  })
}

export async function copyFile(src: string, dest: string): Promise<void> {
  const { invoke } = await core()
  await invoke('copy_file', { src, dest })
}

/**
 * Rename or move within a granted root. Rust falls back to copy-then-delete
 * when the two paths sit on different volumes.
 */
export async function moveFile(src: string, dest: string): Promise<void> {
  const { invoke } = await core()
  await invoke('move_file', { src, dest })
}

export async function deleteFile(path: string): Promise<void> {
  const { invoke } = await core()
  await invoke('delete_file', { path })
}

export async function tempDir(): Promise<string> {
  const { invoke } = await core()
  return await invoke<string>('temp_dir')
}

export async function zipFiles(options: {
  entries: { src: string; dest: string }[]
  dest: string
  manifest?: string
}): Promise<string> {
  const { invoke } = await core()
  return await invoke<string>('zip_files', {
    entries: options.entries,
    dest: options.dest,
    manifest: options.manifest ?? null,
  })
}

/** Native save dialog. The picked folder is what grants write access to it. */
export async function pickSavePath(options: {
  defaultPath?: string
  filterName?: string
  extensions?: string[]
}): Promise<string | null> {
  if (!isTauri()) return null
  const { invoke } = await core()
  return await invoke<string | null>('pick_save_path', {
    defaultPath: options.defaultPath?.trim() || null,
    filterName: options.filterName ?? null,
    extensions: options.extensions ?? null,
  })
}

export async function pickDirectory(defaultPath?: string): Promise<string | null> {
  if (!isTauri()) return null
  const { invoke } = await core()
  return await invoke<string | null>('pick_directory', {
    defaultPath: defaultPath?.trim() || null,
  })
}

export async function revealPath(path: string): Promise<void> {
  if (!isTauri() || !path) return
  const { invoke } = await core()
  await invoke('reveal_path', { path })
}
