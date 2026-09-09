import { describe, expect, it } from 'vitest'
import {
  TRASH_RETENTION_DAYS,
  createMemoryTrash,
  isExpired,
  parseTrashIndex,
  serializeTrashIndex,
  trashFilename,
  type TrashEntry,
} from '@/lib/trash'
import type { Clip } from '@/lib/types'

function clip(id: string): Clip {
  return {
    id,
    prompt: 'a heavy iron door slams',
    duration: 8,
    seed: 1,
    createdAt: '2026-09-01T00:00:00Z',
    cfg: 1,
    negative: '',
    path: `C:\\library\\sfx\\doors\\${id}.wav`,
  }
}

function entry(id: string, deletedAt: string): TrashEntry {
  return {
    id,
    clip: clip(id),
    originalPath: `C:\\library\\sfx\\doors\\${id}.wav`,
    trashPath: `C:\\library\\.trash\\${id}--1.wav`,
    deletedAt,
  }
}

describe('trashFilename', () => {
  it('keeps the id recognisable while making it safe to write', () => {
    expect(trashFilename('sword_swing-03', 1234)).toBe('sword_swing-03--1234.wav')
  })

  it('strips path separators and leading dots so the name cannot escape the trash folder', () => {
    const name = trashFilename('../../etc/passwd', 1)
    expect(name).toBe('etc-passwd--1.wav')
    expect(name).not.toMatch(/[\\/]/)
    expect(name).not.toContain('..')
  })

  it('still produces a usable name when nothing of the id survives', () => {
    expect(trashFilename('...', 7)).toBe('clip--7.wav')
  })

  it('gives two deletions of the same id different filenames', () => {
    expect(trashFilename('a', 1)).not.toBe(trashFilename('a', 2))
  })
})

describe('isExpired', () => {
  const now = Date.parse('2026-09-09T00:00:00Z')

  it('keeps a recent deletion', () => {
    expect(isExpired(entry('a', '2026-09-08T00:00:00Z'), now)).toBe(false)
  })

  it('expires one past the retention window', () => {
    const old = new Date(now - (TRASH_RETENTION_DAYS + 1) * 86_400_000).toISOString()
    expect(isExpired(entry('a', old), now)).toBe(true)
  })

  it('keeps an entry whose timestamp cannot be read rather than purging it', () => {
    expect(isExpired(entry('a', 'not a date'), now)).toBe(false)
  })
})

describe('trash index file', () => {
  it('survives serialize and parse', () => {
    const rows = [entry('a', '2026-09-08T00:00:00Z')]
    expect(parseTrashIndex(serializeTrashIndex(rows))).toEqual(rows)
  })

  it('returns nothing for unreadable JSON rather than throwing', () => {
    expect(parseTrashIndex('{ not json')).toEqual([])
  })

  it('drops rows that are missing the fields restore depends on', () => {
    const text = JSON.stringify({
      version: 1,
      entries: [entry('a', '2026-09-08T00:00:00Z'), { id: 'b' }, null],
    })
    expect(parseTrashIndex(text).map((row) => row.id)).toEqual(['a'])
  })

  it('reads a bare array from a version that had no wrapper', () => {
    const text = JSON.stringify([entry('a', '2026-09-08T00:00:00Z')])
    expect(parseTrashIndex(text).map((row) => row.id)).toEqual(['a'])
  })
})

describe('createMemoryTrash', () => {
  function store(seed: Record<string, ArrayBuffer> = {}) {
    const audio = new Map(Object.entries(seed))
    const restored: { clip: Clip; wav: ArrayBuffer }[] = []
    const trash = createMemoryTrash({
      async getWav(id) {
        return audio.get(id)
      },
      async restoreClip(clip, wav) {
        restored.push({ clip, wav })
      },
    })
    return { trash, restored }
  }

  it('restores the clip it was given', async () => {
    const wav = new ArrayBuffer(8)
    const { trash, restored } = store({ a: wav })

    await trash.trash(clip('a'))
    expect((await trash.list()).map((row) => row.id)).toEqual(['a'])

    const entry = await trash.restore('a')
    expect(entry?.id).toBe('a')
    expect(restored).toHaveLength(1)
    expect(await trash.list()).toEqual([])
  })

  it('carries the metadata row through so a restore keeps its rating', async () => {
    const { trash } = store({ a: new ArrayBuffer(8) })
    await trash.trash(clip('a'), { rating: 5, tags: ['metal'] })
    const [row] = await trash.list()
    expect(row?.meta).toEqual({ rating: 5, tags: ['metal'] })
  })

  it('does not trash a clip whose audio cannot be read', async () => {
    const { trash } = store()
    expect(await trash.trash(clip('missing'))).toBeUndefined()
    expect(await trash.list()).toEqual([])
  })

  it('returns nothing when restoring an id it never held', async () => {
    const { trash } = store()
    expect(await trash.restore('nope')).toBeUndefined()
  })

  it('purges one entry and empties the rest', async () => {
    const { trash } = store({ a: new ArrayBuffer(8), b: new ArrayBuffer(8) })
    await trash.trash(clip('a'))
    await trash.trash(clip('b'))

    await trash.purge('a')
    expect((await trash.list()).map((row) => row.id)).toEqual(['b'])

    await trash.empty()
    expect(await trash.list()).toEqual([])
  })

  it('cannot restore a clip that was purged', async () => {
    const { trash, restored } = store({ a: new ArrayBuffer(8) })
    await trash.trash(clip('a'))
    await trash.purge('a')
    expect(await trash.restore('a')).toBeUndefined()
    expect(restored).toHaveLength(0)
  })
})
