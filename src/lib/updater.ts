/**
 * Update checks for the desktop build.
 *
 * The plugin is always registered in Rust, and tauri.conf.json always carries
 * a `plugins.updater` block, but a build only carries real endpoints when
 * `src-tauri/tauri.updater.conf.json` was merged in at release time. A local
 * `tauri build` therefore has an empty endpoint list, and `check()` fails with
 * a configuration error rather than a network one — which is a state to report
 * plainly ("this build has no update channel"), not an error to log.
 */
import { isTauri } from '@/lib/utils'

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'unsupported'; reason: string }
  | { status: 'current'; version: string }
  | { status: 'available'; version: string; notes?: string; date?: string }
  | { status: 'downloading'; version: string; ratio?: number }
  | { status: 'ready'; version: string }
  | { status: 'failed'; message: string }

/** An empty `plugins.updater` block reads as a config error, not a failure. */
export function isNotConfigured(message: string): boolean {
  const text = message.toLowerCase()
  return (
    text.includes('updater') &&
    (text.includes('not configured') ||
      text.includes('no configuration') ||
      text.includes('missing') ||
      text.includes('endpoint'))
  )
}

export const NOT_CONFIGURED_REASON =
  'This build has no update channel. Installers published from the release workflow update in place.'

type TauriUpdate = {
  version: string
  body?: string
  date?: string
  downloadAndInstall(
    onEvent: (event: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void,
  ): Promise<void>
}

async function checkForUpdate(): Promise<TauriUpdate | null> {
  const { check } = await import('@tauri-apps/plugin-updater')
  return (await check()) as TauriUpdate | null
}

/**
 * Resolves to the state to render. Never throws: a browser build, an
 * unconfigured desktop build and a network failure are all outcomes the
 * Settings panel shows as text.
 */
export async function checkForUpdates(): Promise<UpdateState> {
  if (!isTauri()) {
    return { status: 'unsupported', reason: 'Updates are only available in the desktop app.' }
  }
  try {
    const update = await checkForUpdate()
    if (!update) return { status: 'current', version: '' }
    return {
      status: 'available',
      version: update.version,
      notes: update.body,
      date: update.date,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isNotConfigured(message)) {
      return { status: 'unsupported', reason: NOT_CONFIGURED_REASON }
    }
    return { status: 'failed', message }
  }
}

/**
 * Downloads and installs, reporting progress as a 0–1 ratio. The caller
 * relaunches; this does not, so a generation in flight is never killed by an
 * update that finished behind it.
 */
export async function downloadAndInstall(
  onProgress?: (ratio: number | undefined) => void,
): Promise<UpdateState> {
  if (!isTauri()) {
    return { status: 'unsupported', reason: 'Updates are only available in the desktop app.' }
  }
  try {
    const update = await checkForUpdate()
    if (!update) return { status: 'current', version: '' }
    let total = 0
    let received = 0
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data?.contentLength ?? 0
        received = 0
        onProgress?.(total ? 0 : undefined)
      } else if (event.event === 'Progress') {
        received += event.data?.chunkLength ?? 0
        onProgress?.(total ? Math.min(1, received / total) : undefined)
      } else if (event.event === 'Finished') {
        onProgress?.(1)
      }
    })
    return { status: 'ready', version: update.version }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isNotConfigured(message)) {
      return { status: 'unsupported', reason: NOT_CONFIGURED_REASON }
    }
    return { status: 'failed', message }
  }
}

export async function relaunchApp(): Promise<void> {
  if (!isTauri()) return
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}
