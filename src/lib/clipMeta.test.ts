import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILTER,
  EMPTY_META,
  addTag,
  clipDisplayName,
  filterClips,
  forgetMeta,
  getMeta,
  isFilterActive,
  matchesFilter,
  normalizeTag,
  parseMetaFile,
  removeTag,
  renameMeta,
  serializeMetaFile,
  setName,
  setRating,
  tagCounts,
  toggleFavorite,
  toggleRejected,
  type ClipMetaIndex,
} from '@/lib/clipMeta'
import type { Clip } from '@/lib/types'

function clip(id: string, prompt = 'a heavy iron door slams'): Clip {
  return {
    id,
    prompt,
    duration: 8,
    seed: 1,
    createdAt: '2026-09-01T00:00:00Z',
    cfg: 1,
    negative: '',
  }
}

describe('clipMeta', () => {
  it('returns the same empty row for clips with no metadata', () => {
    expect(getMeta({}, 'missing')).toBe(EMPTY_META)
    expect(getMeta({}, 'also-missing')).toBe(getMeta({}, 'missing'))
  })

  it('toggles a favourite on and back off', () => {
    let index: ClipMetaIndex = {}
    index = toggleFavorite(index, 'a')
    expect(getMeta(index, 'a').favorite).toBe(true)
    index = toggleFavorite(index, 'a')
    expect(getMeta(index, 'a').favorite).toBeUndefined()
  })

  it('drops the row entirely once nothing is set on it', () => {
    let index: ClipMetaIndex = {}
    index = toggleFavorite(index, 'a')
    index = toggleFavorite(index, 'a')
    // An `updatedAt` on its own is not content worth persisting.
    expect(Object.keys(index)).toHaveLength(0)
  })

  it('treats favourite and reject as contradictory verdicts', () => {
    let index: ClipMetaIndex = {}
    index = toggleRejected(index, 'a')
    expect(getMeta(index, 'a').rejected).toBe(true)
    index = toggleFavorite(index, 'a')
    expect(getMeta(index, 'a').favorite).toBe(true)
    expect(getMeta(index, 'a').rejected).toBe(false)
  })

  it('clears the rating when the star already set is clicked again', () => {
    let index: ClipMetaIndex = {}
    index = setRating(index, 'a', 4)
    expect(getMeta(index, 'a').rating).toBe(4)
    index = setRating(index, 'a', 4)
    expect(getMeta(index, 'a').rating).toBeUndefined()
  })

  it('caps a rating at five and treats zero as unrated', () => {
    let index = setRating({}, 'a', 99)
    expect(getMeta(index, 'a').rating).toBe(5)
    index = setRating(index, 'a', 0)
    expect(getMeta(index, 'a').rating).toBeUndefined()
  })

  it('normalises tags and keeps them unique and sorted', () => {
    expect(normalizeTag('  Loud   Impact ')).toBe('loud impact')
    let index = addTag({}, 'a', 'Whoosh')
    index = addTag(index, 'a', 'brass')
    index = addTag(index, 'a', 'WHOOSH')
    expect(getMeta(index, 'a').tags).toEqual(['brass', 'whoosh'])
  })

  it('removes the tags array once the last tag goes', () => {
    let index = addTag({}, 'a', 'whoosh')
    index = removeTag(index, 'a', 'whoosh')
    expect(getMeta(index, 'a').tags).toBeUndefined()
  })

  it('counts tags across clips, most used first', () => {
    let index = addTag({}, 'a', 'metal')
    index = addTag(index, 'b', 'metal')
    index = addTag(index, 'b', 'wood')
    expect(tagCounts(index)).toEqual([
      { tag: 'metal', count: 2 },
      { tag: 'wood', count: 1 },
    ])
  })

  describe('renameMeta', () => {
    it('carries a rating and tags across to the new id', () => {
      let index = setRating({}, 'old-stem', 5)
      index = addTag(index, 'old-stem', 'metal')
      index = renameMeta(index, 'old-stem', 'sword_swing_03', 'Sword swing 03')

      expect(index['old-stem']).toBeUndefined()
      expect(getMeta(index, 'sword_swing_03')).toMatchObject({
        rating: 5,
        tags: ['metal'],
        name: 'Sword swing 03',
      })
    })

    it('records a display name for a clip that had no metadata at all', () => {
      const index = renameMeta({}, 'old', 'new', 'Cellar door')
      expect(getMeta(index, 'new').name).toBe('Cellar door')
    })

    it('stores a name change against the same id when the stem is unchanged', () => {
      const index = renameMeta({}, 'same', 'same', 'Renamed')
      expect(getMeta(index, 'same').name).toBe('Renamed')
    })
  })

  it('forgets a row outright', () => {
    const index = forgetMeta(toggleFavorite({}, 'a'), 'a')
    expect(index.a).toBeUndefined()
  })

  describe('display name', () => {
    it('prefers the rename over the name derived from the prompt', () => {
      const index = setName({}, 'a', 'Cellar door')
      expect(clipDisplayName(clip('a'), index)).toBe('Cellar door')
    })

    it('falls back to the prompt when there is no rename', () => {
      expect(clipDisplayName(clip('a'), {})).toBe('A heavy iron door slams')
    })
  })

  describe('filtering', () => {
    it('hides rejects by default without any filter being active', () => {
      const index = toggleRejected({}, 'b')
      const clips = [clip('a'), clip('b')]
      expect(isFilterActive(EMPTY_FILTER)).toBe(false)
      expect(filterClips(clips, index, EMPTY_FILTER).map((c) => c.id)).toEqual(['a'])
    })

    it('brings rejects back when they are asked for', () => {
      const index = toggleRejected({}, 'b')
      const clips = [clip('a'), clip('b')]
      const shown = filterClips(clips, index, { ...EMPTY_FILTER, showRejected: true })
      expect(shown.map((c) => c.id)).toEqual(['a', 'b'])
    })

    it('keeps only favourites when asked', () => {
      const index = toggleFavorite({}, 'a')
      const clips = [clip('a'), clip('b')]
      const shown = filterClips(clips, index, { ...EMPTY_FILTER, favoritesOnly: true })
      expect(shown.map((c) => c.id)).toEqual(['a'])
    })

    it('applies a rating floor', () => {
      let index = setRating({}, 'a', 5)
      index = setRating(index, 'b', 2)
      const shown = filterClips([clip('a'), clip('b')], index, {
        ...EMPTY_FILTER,
        minRating: 3,
      })
      expect(shown.map((c) => c.id)).toEqual(['a'])
    })

    it('requires every selected tag, not any of them', () => {
      let index = addTag({}, 'a', 'metal')
      index = addTag(index, 'a', 'impact')
      index = addTag(index, 'b', 'metal')
      const shown = filterClips([clip('a'), clip('b')], index, {
        ...EMPTY_FILTER,
        tags: ['metal', 'impact'],
      })
      expect(shown.map((c) => c.id)).toEqual(['a'])
    })

    it('still hides a reject that would otherwise match the filter', () => {
      let index = toggleFavorite({}, 'a')
      index = toggleRejected(index, 'a')
      expect(matchesFilter(getMeta(index, 'a'), { ...EMPTY_FILTER, favoritesOnly: true })).toBe(
        false,
      )
    })
  })

  describe('file round trip', () => {
    it('survives serialize and parse', () => {
      let index = toggleFavorite({}, 'a')
      index = setRating(index, 'a', 3)
      index = addTag(index, 'a', 'metal')
      index = setName(index, 'a', 'Door slam')
      const parsed = parseMetaFile(serializeMetaFile(index))
      expect(parsed.a).toMatchObject({
        favorite: true,
        rating: 3,
        tags: ['metal'],
        name: 'Door slam',
      })
    })

    it('returns an empty index for unreadable JSON rather than throwing', () => {
      expect(parseMetaFile('{ not json')).toEqual({})
      expect(parseMetaFile('null')).toEqual({})
      expect(parseMetaFile('[1,2,3]')).toEqual({})
    })

    it('discards junk rows and out-of-range values from a hand-edited file', () => {
      const parsed = parseMetaFile(
        JSON.stringify({
          version: 1,
          clips: {
            a: { rating: 99, tags: ['Metal', 'metal', 42], favorite: 'yes' },
            b: { nothing: true },
            c: 'not an object',
          },
        }),
      )
      expect(parsed.a).toEqual({ rating: 5, tags: ['metal'] })
      expect(parsed.b).toBeUndefined()
      expect(parsed.c).toBeUndefined()
    })

    it('reads a bare map from a version that had no wrapper', () => {
      const parsed = parseMetaFile(JSON.stringify({ a: { favorite: true } }))
      expect(parsed.a?.favorite).toBe(true)
    })
  })
})
