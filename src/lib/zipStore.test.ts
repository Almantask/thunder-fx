import { describe, expect, it } from 'vitest'
import { buildZipStore, crc32 } from '@/lib/zipStore'

describe('zipStore', () => {
  it('builds a ZIP that starts with a local file header', () => {
    const hello = new TextEncoder().encode('hello')
    const zip = new Uint8Array(
      buildZipStore([
        { name: 'manifest.json', data: hello },
        { name: 'SFX_Combat_Sword_01.wav', data: new Uint8Array([1, 2, 3, 4]) },
      ]),
    )
    expect(String.fromCharCode(zip[0], zip[1], zip[2], zip[3])).toBe('PK\u0003\u0004')
    expect(zip.byteLength).toBeGreaterThan(hello.length + 4)
  })

  it('checksums bytes with CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})
