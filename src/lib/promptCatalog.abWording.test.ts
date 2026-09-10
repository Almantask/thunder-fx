import { describe, expect, it } from 'vitest'
import { loadPromptCatalog } from '@/lib/promptCatalog'
import { modeFromCatalog } from '@/lib/generateMode'
import { normalizePrompt, promptWordCount, PROMPT_WORD_LIMIT } from '@/lib/generateMode'

describe('ab-wording catalog', () => {
  const catalog = loadPromptCatalog()
  const cats = catalog.filter((c) => c.id.endsWith(':ab-wording'))

  it('registers one category per library', () => {
    expect(cats.map((c) => c.id).sort()).toEqual([
      'ambience:ab-wording',
      'fx:ab-wording',
      'music:ab-wording',
    ])
  })

  it('parses every entry', () => {
    const counts = Object.fromEntries(cats.map((c) => [c.id, c.effects.length]))
    expect(counts).toEqual({
      'fx:ab-wording': 61,
      'ambience:ab-wording': 32,
      'music:ab-wording': 28,
    })
  })

  it('maps each library to the right generate mode', () => {
    const modes = Object.fromEntries(
      cats.map((c) => [c.id, new Set(c.effects.map((e) => modeFromCatalog(e)))]),
    )
    expect([...modes['fx:ab-wording']]).toEqual(['sfx'])
    expect([...modes['ambience:ab-wording']]).toEqual(['ambience'])
    expect([...modes['music:ab-wording']]).toEqual(['music'])
  })

  it('keeps every prompt under the word limit', () => {
    for (const cat of cats) {
      for (const eff of cat.effects) {
        expect(promptWordCount(eff.prompt), eff.title).toBeLessThanOrEqual(PROMPT_WORD_LIMIT)
      }
    }
  })

  it('pairs each variant with a partner at the same duration and negative', () => {
    for (const cat of cats) {
      const groups = new Map<string, typeof cat.effects>()
      for (const eff of cat.effects) {
        const key = eff.title.match(/^(W\d+)\b/)?.[1]
        expect(key, `untagged title: ${eff.title}`).toBeTruthy()
        const list = groups.get(key!) ?? []
        list.push(eff)
        groups.set(key!, list)
      }
      for (const [key, effects] of groups) {
        expect(effects.length, `${key} needs 2+ sides`).toBeGreaterThanOrEqual(2)
        const durations = new Set(effects.map((e) => e.duration))
        expect(durations.size, `${key} durations differ`).toBe(1)
        const negatives = new Set(effects.map((e) => e.negative))
        expect(negatives.size, `${key} negatives differ`).toBe(1)
      }
    }
  })

  /**
   * The documented workflow is to type a pair's tag into Browse prompts and press
   * "Add visible". That search trims its input and matches on substring, so an
   * unpadded `W4` would also pull in W40-W45 and queue seven pairs instead of one.
   * Tags are zero-padded to keep every one of them an unambiguous search.
   */
  it('keeps every pair tag globally unique and free of prefix collisions', () => {
    const tags = new Set<string>()
    for (const cat of cats) {
      for (const eff of cat.effects) tags.add(eff.title.match(/^(W\d+)\b/)![1])
    }
    for (const tag of tags) {
      expect(tag, `${tag} is not zero-padded`).toMatch(/^W\d{2}$/)
      for (const other of tags) {
        if (other === tag) continue
        expect(other.startsWith(tag), `${other} collides with a search for ${tag}`).toBe(false)
      }
    }
  })

  it('makes each pair differ in the body, not in the tags the engine rewrites', () => {
    for (const cat of cats) {
      const groups = new Map<string, typeof cat.effects>()
      for (const eff of cat.effects) {
        const key = eff.title.match(/^(W\d+)\b/)![1]
        groups.set(key, [...(groups.get(key) ?? []), eff])
      }
      for (const [key, effects] of groups) {
        const mode = modeFromCatalog(effects[0])
        const normalized = effects.map((e) => normalizePrompt(e.prompt, mode, e.duration))
        expect(new Set(normalized).size, `${key} sides are identical after normalization`).toBe(
          effects.length,
        )
      }
    }
  })
})
