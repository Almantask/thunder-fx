import { describe, expect, it } from 'vitest'
import { toArrayBuffer } from '@/lib/tauriFs'

describe('toArrayBuffer', () => {
  it('returns the same buffer when the view covers it', () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    expect(toArrayBuffer(bytes)).toBe(bytes.buffer)
  })

  it('copies a sliced view so the caller cannot see neighbours', () => {
    const parent = new Uint8Array([9, 1, 2, 3, 8])
    const view = parent.subarray(1, 4)
    const copy = toArrayBuffer(view)
    expect(copy).not.toBe(parent.buffer)
    expect(new Uint8Array(copy)).toEqual(new Uint8Array([1, 2, 3]))
  })
})
