import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SidecarCorruptError,
  corruptSidecarPath,
  createDebouncedSaver,
  isJsonParseable,
} from '@/lib/sidecarFile'

describe('sidecarFile', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('names a quarantine copy next to the original', () => {
    expect(corruptSidecarPath('C:\\lib\\thunder-fx-meta.json', 99)).toBe(
      'C:\\lib\\thunder-fx-meta.json.corrupt-99',
    )
  })

  it('treats truncated JSON as unreadable', () => {
    expect(isJsonParseable('{"version":1}')).toBe(true)
    expect(isJsonParseable('{ "clips": {')).toBe(false)
    expect(isJsonParseable('')).toBe(false)
  })

  it('debounces a burst of saves into one write', async () => {
    vi.useFakeTimers()
    const write = vi.fn(async () => {})
    const saver = createDebouncedSaver<number>(write, 300)
    await saver.schedule(1)
    await saver.schedule(2)
    await saver.schedule(3)
    expect(write).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(3)
  })

  it('refuses to save while blocked after a corrupt load', async () => {
    const write = vi.fn(async () => {})
    const saver = createDebouncedSaver<number>(write, 0)
    saver.block()
    await expect(saver.schedule(1)).rejects.toThrow(/paused/i)
    expect(write).not.toHaveBeenCalled()
    saver.unblock()
    await saver.schedule(1)
    await saver.flush()
    expect(write).toHaveBeenCalledWith(1)
  })

  it('carries the quarantine path on SidecarCorruptError', () => {
    const err = new SidecarCorruptError('meta.json', 'meta.json.corrupt-1')
    expect(err.path).toBe('meta.json')
    expect(err.backupPath).toBe('meta.json.corrupt-1')
    expect(err.message).toMatch(/meta\.json\.corrupt-1/)
  })
})
