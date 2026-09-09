import { clampGenerateSeconds } from '@/lib/duration'
import { clipMode } from '@/lib/generateMode'
import { extractInstruments, parseInstrumentKeywords } from '@/lib/instruments'
import type { QualityPreset } from '@/lib/qualityPreset'
import { randomSeed } from '@/lib/seed'
import type { Clip } from '@/lib/types'

export type PromptLibrary = 'fx' | 'ambience' | 'music'

export const PROMPT_LIBRARIES: { id: PromptLibrary; label: string }[] = [
  { id: 'fx', label: 'FX' },
  { id: 'ambience', label: 'Ambience' },
  { id: 'music', label: 'Instrumental' },
]

const LIBRARY_ORDER: PromptLibrary[] = ['fx', 'ambience', 'music']

export type CatalogEffect = {
  id: string
  library?: PromptLibrary
  categoryId: string
  category: string
  subcategoryId?: string
  subcategory?: string
  title: string
  prompt: string
  duration: number
  negative: string
  intensity?: string
  instruments?: string[]
  /** Explicit seed for this queue entry. Set when queueing more than one take so each take is a distinct variation, regardless of the Generate console's seed field. */
  seed?: number
  /** Quality preset captured when the item was queued, so a queue can mix presets. The Generate queue control can override it for one run. */
  preset?: QualityPreset
}

export type PromptCategory = {
  id: string
  library: PromptLibrary
  name: string
  effects: CatalogEffect[]
}

const DURATION = /duration:\s*(\d+(?:\.\d+)?)\s*s\b/i
const NEGATIVE = /negative:\s*(.+)$/im
const INSTRUMENTS_LINE = /instruments:\s*(.+)$/im
const TRACK_TYPE = /^\s*TrackType:\s*.+/im

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function fileName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').pop() ?? path
}

function pathParts(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean)
}

export function libraryFromPath(path: string): PromptLibrary {
  const parts = pathParts(path)
  const parent = parts[parts.length - 2]?.toLowerCase()
  if (parent === 'environment') return 'ambience'
  if (parent === 'ambience' || parent === 'music') return 'music'
  return 'fx'
}

function slugFromPath(path: string): string {
  return fileName(path)
    .replace(/\.md$/i, '')
    .toLowerCase()
}

function categoryIdFromPath(path: string): string {
  return `${libraryFromPath(path)}:${slugFromPath(path)}`
}

function headingName(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() || fallback
}

function parseDuration(block: string): number | undefined {
  const match = block.match(DURATION)
  if (!match) return undefined
  const seconds = Number(match[1])
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  return clampGenerateSeconds(seconds)
}

function parseNegative(block: string): string {
  const match = block.match(NEGATIVE)
  return match?.[1]?.trim() ?? ''
}

function parseInstruments(block: string): string[] {
  const match = block.match(INSTRUMENTS_LINE)
  if (!match) return []
  return parseInstrumentKeywords(match[1])
}

function parsePrompt(block: string): string | undefined {
  const match = block.match(TRACK_TYPE)
  const prompt = match?.[0]?.trim()
  return prompt || undefined
}

export function parsePromptMarkdown(path: string, markdown: string): PromptCategory {
  const library = libraryFromPath(path)
  const id = categoryIdFromPath(path)
  const name = headingName(markdown, slugFromPath(path))
  const chunks = markdown.split(/^### /m).slice(1)
  const effects: CatalogEffect[] = []
  for (const chunk of chunks) {
    const newline = chunk.indexOf('\n')
    const title = (newline === -1 ? chunk : chunk.slice(0, newline)).trim()
    const body = newline === -1 ? '' : chunk.slice(newline + 1)
    const duration = parseDuration(body)
    const prompt = parsePrompt(body)
    if (!title || duration === undefined || !prompt) continue
    const intensityMatch = title.match(/\((I{1,3}|IV|V)\)/i)
    const intensity = intensityMatch ? intensityMatch[1].toUpperCase() : undefined
    const effectSubcategory =
      library !== 'music' ? inferSubcategoryFromCategoryAndPrompt(name, prompt) : undefined
    const effectInstruments =
      library === 'music'
        ? Array.from(new Set([...parseInstruments(body), ...extractInstruments(prompt)]))
        : undefined
    effects.push({
      id: `${id}:${slugify(title)}`,
      library,
      categoryId: id,
      category: name,
      subcategoryId: effectSubcategory ? `${id}:${slugify(effectSubcategory)}` : undefined,
      subcategory: effectSubcategory,
      title,
      prompt,
      duration,
      negative: parseNegative(body),
      intensity,
      instruments: effectInstruments,
    })
  }
  return { id, library, name, effects }
}

export function catalogFromFiles(files: Record<string, string>): PromptCategory[] {
  const categories: PromptCategory[] = []
  for (const [path, markdown] of Object.entries(files)) {
    if (slugFromPath(path) === 'readme') continue
    const category = parsePromptMarkdown(path, markdown)
    if (category.effects.length === 0) continue
    categories.push(category)
  }
  categories.sort((a, b) => {
    const order = LIBRARY_ORDER.indexOf(a.library) - LIBRARY_ORDER.indexOf(b.library)
    if (order !== 0) return order
    return a.name.localeCompare(b.name)
  })
  return categories
}

const promptFiles = import.meta.glob('../../prompts/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

let _cachedCatalog: PromptCategory[] | null = null
export function loadPromptCatalog(): PromptCategory[] {
  if (!_cachedCatalog) {
    _cachedCatalog = catalogFromFiles(promptFiles)
  }
  return _cachedCatalog
}

export const MIN_QUEUE_TAKES = 1
export const MAX_QUEUE_TAKES = 10

export function clampQueueTakes(takes: number): number {
  if (!Number.isFinite(takes)) return MIN_QUEUE_TAKES
  return Math.min(MAX_QUEUE_TAKES, Math.max(MIN_QUEUE_TAKES, Math.round(takes)))
}

/**
 * Expands a single catalog effect into `takes` queue entries. Beyond the
 * first, each entry gets a distinct id (so it survives mergeQueue's dedupe)
 * and an explicit random seed, so every take is a fresh variation no matter
 * what the Generate console's seed field is set to.
 */
export function expandEffectTakes(effect: CatalogEffect, takes: number): CatalogEffect[] {
  const count = clampQueueTakes(takes)
  if (count <= 1) return [effect]
  const items: CatalogEffect[] = [{ ...effect, seed: randomSeed() }]
  for (let n = 2; n <= count; n += 1) {
    items.push({
      ...effect,
      id: `${effect.id}::take-${n}`,
      title: `${effect.title} (Take ${n})`,
      seed: randomSeed(),
    })
  }
  return items
}

export function expandTakes(effects: CatalogEffect[], takes: number): CatalogEffect[] {
  return effects.flatMap((effect) => expandEffectTakes(effect, takes))
}

export function mergeQueue(queue: CatalogEffect[], added: CatalogEffect[]): CatalogEffect[] {
  const seen = new Set(queue.map((item) => item.id))
  const next = [...queue]
  for (const item of added) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    next.push(item)
  }
  return next
}

export function removeFromQueue(queue: CatalogEffect[], id: string): CatalogEffect[] {
  return queue.filter((item) => item.id !== id)
}

function stem(word: string): string {
  return word
    .toLowerCase()
    .replace(/(?:ing|ies|es|s|ed|ly)$/i, '')
    .trim()
}

const STOP_WORDS = new Set([
  'tracktype',
  'music',
  'sfx',
  'sound',
  'effects',
  'with',
  'from',
  'and',
  'the',
  'for',
  'close',
  'mic',
  'dry',
  'studio',
  'fast',
  'decay',
  'short',
  'long',
  'soft',
  'hard',
  'instrumental',
  'vocals',
  'singing',
  'speech',
  'looping',
  'friendly',
])

function isValidCategoryName(name?: string): boolean {
  if (!name) return false
  const trimmed = name.trim()
  if (!trimmed) return false
  const lower = trimmed.toLowerCase()
  if (
    lower === 'music-and-fx-generated-library' ||
    lower.includes('-generated-library') ||
    lower.includes('thunder-fx')
  ) {
    return false
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(trimmed) || /^[0-9a-f]{32}$/i.test(trimmed)) {
    return false
  }
  return true
}

/**
 * Category inference scans every effect in the catalog, so results are cached
 * per clip. Bounded because the key includes the clip id: a long session that
 * generates thousands of clips would otherwise grow this without limit.
 */
const CATEGORY_CACHE_LIMIT = 2_000
const _categoryCache = new Map<string, string>()

function cacheCategory(key: string, value: string): string {
  if (_categoryCache.size >= CATEGORY_CACHE_LIMIT) {
    // Oldest insertion first — Map preserves insertion order.
    const oldest = _categoryCache.keys().next()
    if (!oldest.done) _categoryCache.delete(oldest.value)
  }
  _categoryCache.set(key, value)
  return value
}

export function inferClipCategory(clip: Clip, catalog?: PromptCategory[]): string {
  if (isValidCategoryName(clip.category)) {
    return clip.category!.trim()
  }
  const cacheKey = `${clip.id}::${clip.prompt}`
  const cached = _categoryCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }
  const catList = catalog ?? loadPromptCatalog()
  const mode = clipMode(clip)
  const targetLibrary: PromptLibrary =
    mode === 'music' ? 'music' : mode === 'ambience' ? 'ambience' : 'fx'
  const normPrompt = clip.prompt
    .toLowerCase()
    .replace(/^tracktype:\s*\w+\s*,?\s*/i, '')
    .trim()

  if (!normPrompt) {
    return cacheCategory(cacheKey, 'Custom')
  }

  const libraryCats = catList.filter((c) => c.library === targetLibrary)
  const promptWords = normPrompt
    .split(/[^a-z0-9]+/i)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  const promptStems = new Set(promptWords.map(stem))

  let bestCat = 'Custom'
  let bestScore = 0

  for (const cat of libraryCats) {
    let catScore = 0
    const catNameLower = cat.name.toLowerCase()
    const catWords = catNameLower
      .split(/[^a-z0-9]+/i)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    const catStems = new Set(catWords.map(stem))

    // 1. Category name exact match in prompt
    if (normPrompt.includes(catNameLower)) {
      catScore += 200
    }

    // 2. Stem / word match between prompt and category name
    for (const s of promptStems) {
      if (catStems.has(s)) {
        catScore += 100
      }
    }

    // 3. Find best matching effect in this category
    let bestEffectScore = 0
    for (const effect of cat.effects) {
      let effectScore = 0
      const effectNorm = effect.prompt
        .toLowerCase()
        .replace(/^tracktype:\s*\w+\s*,?\s*/i, '')
        .trim()
      if (normPrompt === effectNorm) {
        return cat.name
      }
      if (
        normPrompt.length >= 8 &&
        (effectNorm.startsWith(normPrompt) ||
          normPrompt.startsWith(effectNorm) ||
          effectNorm.includes(normPrompt) ||
          normPrompt.includes(effectNorm))
      ) {
        effectScore += 1000
      }
      const titleLower = effect.title.toLowerCase().trim()
      if (
        titleLower.length >= 4 &&
        (normPrompt.includes(titleLower) || titleLower.includes(normPrompt))
      ) {
        effectScore += 300
      }

      const titleWords = effect.title
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
      for (const w of titleWords) {
        if (promptStems.has(stem(w))) {
          effectScore += 20
        }
      }

      if (effectScore > bestEffectScore) {
        bestEffectScore = effectScore
      }
    }

    const totalScore = catScore + bestEffectScore
    const isFlavorCategory = catNameLower.includes('flavor') || catNameLower.includes('variation')
    const finalScore = isFlavorCategory ? totalScore - 50 : totalScore

    if (finalScore > bestScore) {
      bestScore = finalScore
      bestCat = cat.name
    }
  }

  return cacheCategory(cacheKey, bestScore >= 50 ? bestCat : 'Custom')
}

const ROMAN_BY_DIGIT: Record<string, string> = {
  '1': 'I',
  '2': 'II',
  '3': 'III',
  '4': 'IV',
  '5': 'V',
}

/**
 * Collapses an intensity to the bare roman numeral the prompt library uses in
 * its own headings (`## I — quietest looping bed`, `### Cue title (II)`).
 * Input can be a numeral, a digit, or a whole label read back off a stored clip
 * — running this on its own output has to be a no-op, since clips persist
 * whatever it returned when they were generated.
 */
export function formatIntensityLabel(code: string): string {
  const trimmed = code.trim()
  const match = trimmed.toUpperCase().match(/\b(I{1,3}|IV|V|[1-5])\b/)
  if (!match) return trimmed
  return ROMAN_BY_DIGIT[match[1]] ?? match[1]
}

export function inferEffectIntensity(effect: CatalogEffect): string {
  if (effect.intensity && effect.intensity.trim()) {
    return formatIntensityLabel(effect.intensity.trim())
  }
  const match =
    effect.title.match(/\((I{1,3}|IV|V)\)/i) ||
    effect.prompt.match(/\b\((I{1,3})\)|\bLevel\s+(I{1,3}|\d)\b|\bIntensity\s+(I{1,3}|\d)\b/i)
  if (match) {
    const raw = (match[1] || match[2] || match[3]).toUpperCase()
    const num = raw === '1' ? 'I' : raw === '2' ? 'II' : raw === '3' ? 'III' : raw
    return formatIntensityLabel(num)
  }
  const lower = (effect.title + ' ' + effect.prompt).toLowerCase()
  if (
    lower.includes('steady texture with no ending') ||
    lower.includes('quietest') ||
    lower.includes('drone ambient') ||
    lower.includes('ruins ambient') ||
    lower.includes('sparse and patient')
  ) {
    return formatIntensityLabel('I')
  }
  if (
    lower.includes('epic') ||
    lower.includes('monumental') ||
    lower.includes('battle') ||
    lower.includes('full orchestra') ||
    lower.includes('climax') ||
    lower.includes('thunderous') ||
    lower.includes('colossal') ||
    lower.includes('finale') ||
    lower.includes('awakening')
  ) {
    return formatIntensityLabel('III')
  }
  if (
    lower.includes('cinematic') ||
    lower.includes('chamber') ||
    lower.includes('orchestral') ||
    lower.includes('theme') ||
    lower.includes('piece')
  ) {
    return formatIntensityLabel('II')
  }
  return formatIntensityLabel('I')
}

const _intensityCache = new Map<string, string>()

export function inferClipIntensity(clip: Clip, catalog?: PromptCategory[]): string {
  if (clip.intensity && clip.intensity.trim()) {
    return formatIntensityLabel(clip.intensity.trim())
  }
  const cacheKey = `${clip.id}::${clip.prompt}`
  const cached = _intensityCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }
  const catList = catalog ?? loadPromptCatalog()
  const normPrompt = clip.prompt
    .toLowerCase()
    .replace(/^tracktype:\s*\w+\s*,?\s*/i, '')
    .trim()

  for (const cat of catList) {
    if (cat.library !== 'ambience') continue
    for (const effect of cat.effects) {
      const effectNorm = effect.prompt
        .toLowerCase()
        .replace(/^tracktype:\s*\w+\s*,?\s*/i, '')
        .trim()
      if (
        normPrompt === effectNorm ||
        (normPrompt.length >= 10 && effectNorm.startsWith(normPrompt)) ||
        (effectNorm.length >= 10 && normPrompt.startsWith(effectNorm))
      ) {
        if (effect.intensity) {
          const res = formatIntensityLabel(effect.intensity)
          _intensityCache.set(cacheKey, res)
          return res
        }
      }
    }
  }

  const match = clip.prompt.match(/\b\((I{1,3})\)|\bLevel\s+(I{1,3}|\d)\b|\bIntensity\s+(I{1,3}|\d)\b/i)
  if (match) {
    const raw = (match[1] || match[2] || match[3]).toUpperCase()
    const num = raw === '1' ? 'I' : raw === '2' ? 'II' : raw === '3' ? 'III' : raw
    const res = formatIntensityLabel(num)
    _intensityCache.set(cacheKey, res)
    return res
  }

  const lower = clip.prompt.toLowerCase()
  let result = formatIntensityLabel('I')
  if (
    lower.includes('steady texture with no ending') ||
    lower.includes('quietest') ||
    lower.includes('drone ambient') ||
    lower.includes('ruins ambient') ||
    lower.includes('sparse and patient')
  ) {
    result = formatIntensityLabel('I')
  } else if (
    lower.includes('epic') ||
    lower.includes('monumental') ||
    lower.includes('battle') ||
    lower.includes('full orchestra') ||
    lower.includes('climax') ||
    lower.includes('thunderous') ||
    lower.includes('colossal') ||
    lower.includes('finale') ||
    lower.includes('awakening')
  ) {
    result = formatIntensityLabel('III')
  } else if (
    lower.includes('cinematic') ||
    lower.includes('chamber') ||
    lower.includes('orchestral') ||
    lower.includes('theme') ||
    lower.includes('piece')
  ) {
    result = formatIntensityLabel('II')
  }

  _intensityCache.set(cacheKey, result)
  return result
}

export function inferSubcategoryFromCategoryAndPrompt(category: string, prompt: string): string {
  const normPrompt = prompt
    .toLowerCase()
    .replace(/^tracktype:\s*\w+\s*,?\s*/i, '')
    .trim()

  const lowerCat = category.toLowerCase()

  // 1. Combat
  if (lowerCat === 'combat') {
    if (
      /\b(sword|shortsword|greatsword|broadsword|katana|rapier|scimitar|claymore|blade|sheath|scabbard|parry clang|whetstone|saber|cutlass|stiletto|dagger|katar|parry)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Sword'
    }
    if (
      /\b(bow|arrow|bowstring|longbow|composite bow|crossbow|blowpipe|dart|sling|bola|boomerang|javelin)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Bow & Arrow'
    }
    if (
      /\b(pistol|rifle|shotgun|sniper|submachine|smg|revolver|musket|blunderbuss|arquebus|machine gun|bullet|silencer|suppressor|magazine|laser sight|mortar|rpg|firearm|ammo|chamber round|taser|flashbang)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Firearms'
    }
    if (
      /\b(axe|hatchet|mace|hammer|warhammer|morningstar|flail|poleaxe|halberd|quarterstaff|scythe|spear|staff|club)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Axe & Blunt'
    }
    if (
      /\b(shield|buckler|armor|breastplate|chainmail|helmet|gauntlet|kevlar|riot shield|cuirass|greaves)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Shield & Armor'
    }
    if (
      /\b(punch|fist|kick|strike|grapple|throw|judo|elbow|sweep|tackle|bone fracture|choke|brass knuckles|nunchaku|palm strike|backhand)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Unarmed & Martial'
    }
    if (
      /\b(catapult|trebuchet|ballista|battering ram|cannon|boulder|greek fire|chain-shot|c4|claymore mine|grenade|smoke bomb|caltrops|spike trap|garrote|bayonet|war horn|battle drum|spike barricade|shuriken|throwing star|throwing knife|thrown rock)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Siege & Thrown'
    }
    return 'General'
  }

  // 2. Doors
  if (lowerCat === 'doors') {
    if (
      /\b(oak|timber|barn|stable|shoji|fusuma|wardrobe|cabinet|bifold|wooden|wood|cupboard|screen door)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Wood'
    }
    if (
      /\b(iron|steel|dungeon|castle gate|wrought iron|prison|portcullis|drawbridge|gate|grate|bars)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Metal & Gates'
    }
    if (
      /\b(airlock|blast door|iris|hydraulic|subway|pneumatic|elevator|revolving|automatic|supermarket|sliding)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Sci-Fi & Modern'
    }
    if (
      /\b(vault|safe|submarine|hatch|cellar|trapdoor|attic|sarcophagus)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Vaults & Hatches'
    }
    if (
      /\b(key|lock|deadbolt|padlock|keycard|keypad|lockpick|chain|latch|unlock|unlatch|combination)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Locks & Keys'
    }
    if (
      /\b(knock|slam|knocker|rattle|push bar|slap|creak)\b/i.test(
        normPrompt,
      )
    ) {
      return 'Knocks & Slams'
    }
    return 'General'
  }

  // 3. Magic
  if (lowerCat === 'magic') {
    if (/\b(fire|flame|fireball|blaze|ignite|burn|heat|torch|ember|pyro)\b/i.test(normPrompt)) {
      return 'Fire'
    }
    if (/\b(ice|frost|freeze|blizzard|chill|shard|frozen|glacier|cold)\b/i.test(normPrompt)) {
      return 'Ice & Frost'
    }
    if (/\b(lightning|thunder|spark|shock|electric|arc|voltage|storm)\b/i.test(normPrompt)) {
      return 'Lightning'
    }
    if (/\b(teleport|portal|arcane|rune|summon|dispel|time|rewind|dimension|warp|phase)\b/i.test(normPrompt)) {
      return 'Arcane & Teleport'
    }
    if (/\b(heal|holy|blessing|prayer|cure|chime|angel|radiant|sanctuary|divine)\b/i.test(normPrompt)) {
      return 'Holy & Healing'
    }
    if (/\b(curse|dark|shadow|necrotic|blood|crypt|hex|whisper|evil|void)\b/i.test(normPrompt)) {
      return 'Dark & Curse'
    }
    if (/\b(shield|dome|ward|barrier|buff|sparkle|staff|enchant|charge|aura)\b/i.test(normPrompt)) {
      return 'Shields & Buffs'
    }
    return 'Arcane'
  }

  // 4. UI
  if (lowerCat === 'ui') {
    if (/\b(click|tap|press|select|tick|toggle|button|mouse|switch)\b/i.test(normPrompt)) {
      return 'Clicks & Taps'
    }
    if (/\b(beep|tone|chime|bell|synth|sonar|ring|ping)\b/i.test(normPrompt)) {
      return 'Beeps & Chimes'
    }
    if (/\b(whoosh|swell|slide|swipe|transition|popup|window|tab|scroll)\b/i.test(normPrompt)) {
      return 'Transitions'
    }
    if (/\b(confirm|accept|complete|unlock|reward|level up|win|success|purchase|coin)\b/i.test(normPrompt)) {
      return 'Success & Confirm'
    }
    if (/\b(error|fail|deny|reject|buzz|alarm|warning|cancel|invalid)\b/i.test(normPrompt)) {
      return 'Error & Warning'
    }
    return 'Interface'
  }

  // 5. Footsteps
  if (lowerCat === 'footsteps') {
    if (/\b(stone|cobblestone|flagstone|tile|marble|concrete|rock)\b/i.test(normPrompt)) {
      return 'Stone & Tile'
    }
    if (/\b(wood|wooden|floorboard|plank|bridge|creak|parquet)\b/i.test(normPrompt)) {
      return 'Wood'
    }
    if (/\b(dirt|gravel|soil|earth|grass|lawn|leaves|foliage|path)\b/i.test(normPrompt)) {
      return 'Dirt & Grass'
    }
    if (/\b(snow|powder|crunch|ice|slush|frost)\b/i.test(normPrompt)) {
      return 'Snow & Ice'
    }
    if (/\b(water|puddle|splash|mud|squelch|marsh|swamp)\b/i.test(normPrompt)) {
      return 'Water & Mud'
    }
    if (/\b(metal|grating|ladder|stairs|iron|steel)\b/i.test(normPrompt)) {
      return 'Metal'
    }
    return 'Movement'
  }

  // 6. Explosions
  if (lowerCat === 'explosions') {
    if (/\b(grenade|flashbang|smoke|dynamite|pipe bomb|molotov)\b/i.test(normPrompt)) {
      return 'Grenades & Thrown'
    }
    if (/\b(cannon|mortar|artillery|shell|tank|flak|howitzer)\b/i.test(normPrompt)) {
      return 'Artillery & Cannons'
    }
    if (/\b(c4|mine|explosive|breach|charge|detonator|demolition)\b/i.test(normPrompt)) {
      return 'Charges & Mines'
    }
    if (/\b(plasma|laser|energy|orbital|reactor|nuke|atomic|sci-fi)\b/i.test(normPrompt)) {
      return 'Sci-Fi & Energy'
    }
    return 'Blasts'
  }

  // 7. Foley
  if (lowerCat === 'foley') {
    if (/\b(cloth|fabric|clothes|cloak|leather|backpack|pouch|zipper|pocket|strap)\b/i.test(normPrompt)) {
      return 'Cloth & Leather'
    }
    if (/\b(chain|keys|coin|coins|metal|tools|buckle|ring|clatter)\b/i.test(normPrompt)) {
      return 'Metal & Items'
    }
    if (/\b(pour|bottle|cup|drink|liquid|spill|splash|glass|flask)\b/i.test(normPrompt)) {
      return 'Liquid & Pour'
    }
    if (/\b(paper|parchment|book|page|map|scroll|envelope|letter)\b/i.test(normPrompt)) {
      return 'Paper & Books'
    }
    if (/\b(breath|heart|chew|swallow|gasp|rustle|body)\b/i.test(normPrompt)) {
      return 'Body & Movement'
    }
    return 'Foley'
  }

  // 8. Water
  if (lowerCat === 'water') {
    if (/\b(splash|drip|drop|ripple|droplet|splatter)\b/i.test(normPrompt)) {
      return 'Splashes & Drops'
    }
    if (/\b(bubble|submerged|underwater|dive|drown|gurgle|sink)\b/i.test(normPrompt)) {
      return 'Underwater & Bubbles'
    }
    if (/\b(wave|ocean|surf|stream|river|current|waterfall|flow|tide)\b/i.test(normPrompt)) {
      return 'Waves & Flow'
    }
    if (/\b(pour|fill|cup|glass|spill|drain|faucet|hose)\b/i.test(normPrompt)) {
      return 'Pouring & Streams'
    }
    return 'Water'
  }

  // 9. Fire
  if (lowerCat === 'fire') {
    if (/\b(ignite|spark|match|flint|lighter|flash|strike)\b/i.test(normPrompt)) {
      return 'Ignite & Sparks'
    }
    if (/\b(campfire|torch|crackle|ember|embers|wood burning|fireplace)\b/i.test(normPrompt)) {
      return 'Campfire & Torch'
    }
    if (/\b(roar|roaring|bonfire|inferno|flame jet|wildfire|blaze)\b/i.test(normPrompt)) {
      return 'Blaze & Roar'
    }
    if (/\b(sizzle|extinguish|hiss|water on fire|smother|smoke)\b/i.test(normPrompt)) {
      return 'Extinguish & Smoke'
    }
    return 'Fire'
  }

  // 10. Weather
  if (lowerCat === 'weather') {
    if (/\b(rain|drizzle|downpour|shower|drops on roof)\b/i.test(normPrompt)) {
      return 'Rain'
    }
    if (/\b(thunder|lightning|crack|rumble|storm)\b/i.test(normPrompt)) {
      return 'Thunder & Storm'
    }
    if (/\b(wind|breeze|gust|howling|gale)\b/i.test(normPrompt)) {
      return 'Wind'
    }
    if (/\b(snow|hail|sleet|snowfall|ice storm|blizzard)\b/i.test(normPrompt)) {
      return 'Snow & Ice'
    }
    return 'Weather'
  }

  // 11. Creatures
  if (lowerCat === 'creatures') {
    if (/\b(roar|growl|hiss|snarl|screech|howl|bark|vocal|cry|screaming)\b/i.test(normPrompt)) {
      return 'Vocal & Roars'
    }
    if (/\b(bite|snap|chomp|claw|scratch|sting|tail)\b/i.test(normPrompt)) {
      return 'Bites & Attacks'
    }
    if (/\b(wing|flap|flutter|swoop|buzz|glide|feather)\b/i.test(normPrompt)) {
      return 'Wings & Flight'
    }
    if (/\b(stomp|scuttle|slither|gallop|crawl|footstep|step)\b/i.test(normPrompt)) {
      return 'Movement & Steps'
    }
    return 'Creatures'
  }

  // 12. Sci-Fi
  if (lowerCat === 'sci-fi' || lowerCat === 'scifi') {
    if (/\b(laser|blaster|plasma|beam|railgun|pulse|phaser)\b/i.test(normPrompt)) {
      return 'Weapons & Lasers'
    }
    if (/\b(forcefield|shield|barrier|deflector|energy field)\b/i.test(normPrompt)) {
      return 'Shields & Energy'
    }
    if (/\b(warp|hyperdrive|thruster|reactor|engine|power|generator)\b/i.test(normPrompt)) {
      return 'Engines & Power'
    }
    if (/\b(scanner|hologram|holographic|computer|interface|telemetry|droid|robot)\b/i.test(normPrompt)) {
      return 'Computers & Droids'
    }
    return 'Sci-Fi'
  }

  // 13. Destruction / Debris
  if (lowerCat.includes('destruction') || lowerCat.includes('debris')) {
    if (/\b(glass|window|bottle|crystal|mirror)\b/i.test(normPrompt)) {
      return 'Glass'
    }
    if (/\b(wood|timber|plank|crate|barrel|furniture)\b/i.test(normPrompt)) {
      return 'Wood'
    }
    if (/\b(stone|brick|rock|boulder|masonry|concrete|wall)\b/i.test(normPrompt)) {
      return 'Stone & Masonry'
    }
    if (/\b(metal|iron|steel|car|pipe|sheet)\b/i.test(normPrompt)) {
      return 'Metal'
    }
    return 'Collapse & Debris'
  }

  return 'General'
}

const _subcategoryCache = new Map<string, string>()

export function inferClipSubcategory(clip: Clip, catalog?: PromptCategory[]): string {
  if (isValidCategoryName(clip.subcategory)) {
    return clip.subcategory!.trim()
  }
  const cacheKey = `${clip.id}::${clip.prompt}`
  const cached = _subcategoryCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const category = inferClipCategory(clip, catalog)

  const result = inferSubcategoryFromCategoryAndPrompt(category, clip.prompt)
  _subcategoryCache.set(cacheKey, result)
  return result
}

function normalizePrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/^tracktype:\s*\w+\s*,?\s*/i, '')
    .trim()
}

/**
 * Returns the list of fully completed subcategory keys from the prompt catalog.
 * A subcategory is complete when all of its prompt effects exist in the provided clips.
 */
export function getCompletedSubcategories(clips: Clip[], catalog?: PromptCategory[]): string[] {
  if (!clips.length) return []
  const catList = catalog ?? loadPromptCatalog()
  if (!catList.length) return []

  const clipPromptSet = new Set<string>()
  for (const c of clips) {
    clipPromptSet.add(normalizePrompt(c.prompt))
  }

  const completed: string[] = []

  for (const cat of catList) {
    // Group catalog effects by subcategory
    const subcategoryMap = new Map<string, CatalogEffect[]>()
    for (const effect of cat.effects) {
      let subKey = ''
      if (cat.library === 'music') {
        subKey = effect.intensity || inferEffectIntensity(effect) || 'I'
      } else {
        subKey =
          effect.subcategory ||
          inferSubcategoryFromCategoryAndPrompt(cat.name, effect.prompt)
      }
      const list = subcategoryMap.get(subKey) ?? []
      list.push(effect)
      subcategoryMap.set(subKey, list)
    }

    for (const [subKey, effects] of subcategoryMap.entries()) {
      if (effects.length === 0) continue
      const allDone = effects.every((eff) => {
        const normEff = normalizePrompt(eff.prompt)
        if (clipPromptSet.has(normEff)) return true
        for (const cp of clipPromptSet) {
          if (
            cp.length >= 10 &&
            (normEff.startsWith(cp) || cp.startsWith(normEff))
          ) {
            return true
          }
        }
        return false
      })

      if (allDone) {
        completed.push(`${cat.id}::${subKey.toLowerCase()}`)
      }
    }
  }

  return completed
}

/**
 * Returns the count of whole subcategories that have been completely generated.
 */
export function getCompletedSubcategoryCount(clips: Clip[], catalog?: PromptCategory[]): number {
  return getCompletedSubcategories(clips, catalog).length
}



