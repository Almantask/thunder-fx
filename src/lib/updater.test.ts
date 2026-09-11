import { describe, expect, it } from 'vitest'
import {
  NOT_CONFIGURED_REASON,
  checkForUpdates,
  downloadAndInstall,
  isNotConfigured,
  relaunchApp,
} from '@/lib/updater'

describe('isNotConfigured', () => {
  it('recognises a build that carries no update channel', () => {
    // A local `tauri build` has an empty `plugins.updater` block, and the
    // plugin reports that as an error. It is a state to explain, not a failure
    // to log. The first case is verbatim what tauri-plugin-updater raises for
    // an empty endpoint list; the rest guard against it rewording that.
    expect(isNotConfigured('Updater does not have any endpoints set.')).toBe(true)
    expect(isNotConfigured('updater is not configured')).toBe(true)
    expect(isNotConfigured('Updater: no configuration found')).toBe(true)
    expect(isNotConfigured('the updater endpoint is missing')).toBe(true)
  })

  it('does not swallow a real failure', () => {
    expect(isNotConfigured('network error: connection refused')).toBe(false)
    expect(isNotConfigured('signature verification failed')).toBe(false)
    expect(isNotConfigured('')).toBe(false)
  })
})

describe('outside the desktop app', () => {
  it('reports checking for updates as unsupported rather than failing', async () => {
    const state = await checkForUpdates()
    expect(state).toEqual({
      status: 'unsupported',
      reason: 'Updates are only available in the desktop app.',
    })
  })

  it('reports installing as unsupported too', async () => {
    const state = await downloadAndInstall()
    expect(state.status).toBe('unsupported')
  })

  it('does nothing when asked to relaunch', async () => {
    await expect(relaunchApp()).resolves.toBeUndefined()
  })
})

describe('the not-configured message', () => {
  it('says what the state is without reading as an error', () => {
    expect(NOT_CONFIGURED_REASON).toMatch(/no update channel/i)
    expect(NOT_CONFIGURED_REASON).not.toMatch(/error|failed/i)
  })
})
