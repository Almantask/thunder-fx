import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkBundleSizes, jsFilesIn, MAX_JS_FILE_BYTES } from './check-bundle-size.mjs'

describe('checkBundleSizes', () => {
  it('passes files under the budget', () => {
    const result = checkBundleSizes([
      { name: 'index.js', bytes: 7_480_000 },
      { name: 'react.js', bytes: 200_000 },
    ])
    expect(result.errors).toEqual([])
    expect(result.total).toBe(7_680_000)
  })

  it('fails a file over the per-chunk budget', () => {
    const result = checkBundleSizes([{ name: 'index.js', bytes: MAX_JS_FILE_BYTES + 1 }])
    expect(result.errors.some((error) => error.includes('index.js'))).toBe(true)
  })

  it('fails when the total JS budget is exceeded', () => {
    const result = checkBundleSizes(
      [
        { name: 'a.js', bytes: 6_000_000 },
        { name: 'b.js', bytes: 6_000_000 },
      ],
      { maxFile: 8_500_000, maxTotal: 11_000_000 },
    )
    expect(result.errors.some((error) => error.includes('Total JS'))).toBe(true)
  })

  it('reads only .js files from a directory', () => {
    const dir = join(tmpdir(), `thunder-fx-bundle-${process.pid}-${Date.now()}`)
    mkdirSync(dir)
    try {
      writeFileSync(join(dir, 'index-abc.js'), 'x'.repeat(100))
      writeFileSync(join(dir, 'notes.txt'), 'nope')
      const files = jsFilesIn(dir)
      expect(files).toEqual([{ name: 'index-abc.js', bytes: 100 }])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
