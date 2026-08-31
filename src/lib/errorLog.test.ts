/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { logEntries } from '@/lib/errorLog'

describe('logEntries', () => {
  it('returns newest entries first', () => {
    const text = '[1] ERROR first\n\n[2] ERROR second\n\n'
    expect(logEntries(text)).toEqual(['[2] ERROR second', '[1] ERROR first'])
  })

  it('is empty when the ledger is blank', () => {
    expect(logEntries('')).toEqual([])
    expect(logEntries('   \n\n  ')).toEqual([])
  })
})
