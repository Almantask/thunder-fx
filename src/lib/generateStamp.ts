/**
 * Generate knobs stored in the WAV's ISFT tag so a library rescan can recover
 * seed, CFG, steps, preset and sampler. ICMT stays the prompt; Explorer still
 * sees "Thunder FX" as the software prefix.
 */

export const SOFTWARE_NAME = 'Thunder FX'

export type GenerateStamp = {
  seed?: number
  cfg?: number
  steps?: number
  preset?: string
  sampler?: string
  negative?: string
}

function encodeStampValue(value: string): string {
  return encodeURIComponent(value)
}

function decodeStampValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** `Thunder FX` or `Thunder FX | seed=7 cfg=1 steps=20 preset=balanced sampler=pingpong`. */
export function formatSoftwareStamp(stamp?: GenerateStamp): string {
  if (!stamp) return SOFTWARE_NAME
  const bits: string[] = []
  if (stamp.seed != null && Number.isFinite(stamp.seed)) bits.push(`seed=${Math.round(stamp.seed)}`)
  if (stamp.cfg != null && Number.isFinite(stamp.cfg)) bits.push(`cfg=${stamp.cfg}`)
  if (stamp.steps != null && Number.isFinite(stamp.steps)) bits.push(`steps=${Math.round(stamp.steps)}`)
  if (stamp.preset?.trim()) bits.push(`preset=${stamp.preset.trim()}`)
  if (stamp.sampler?.trim()) bits.push(`sampler=${stamp.sampler.trim()}`)
  if (stamp.negative?.trim()) bits.push(`neg=${encodeStampValue(stamp.negative.trim())}`)
  if (!bits.length) return SOFTWARE_NAME
  return `${SOFTWARE_NAME} | ${bits.join(' ')}`
}

export function parseSoftwareStamp(software?: string): GenerateStamp {
  if (!software || !software.startsWith(SOFTWARE_NAME)) return {}
  const rest = software.slice(SOFTWARE_NAME.length).replace(/^\s*\|\s*/, '').trim()
  if (!rest) return {}
  const out: GenerateStamp = {}
  for (const token of rest.split(/\s+/)) {
    const eq = token.indexOf('=')
    if (eq <= 0) continue
    const key = token.slice(0, eq)
    const raw = decodeStampValue(token.slice(eq + 1))
    if (key === 'seed') {
      const n = Number(raw)
      if (Number.isFinite(n)) out.seed = Math.round(n)
    } else if (key === 'cfg') {
      const n = Number(raw)
      if (Number.isFinite(n)) out.cfg = n
    } else if (key === 'steps') {
      const n = Number(raw)
      if (Number.isFinite(n)) out.steps = Math.round(n)
    } else if (key === 'preset' && raw) {
      out.preset = raw
    } else if (key === 'sampler' && raw) {
      out.sampler = raw
    } else if (key === 'neg' && raw) {
      out.negative = raw
    }
  }
  return out
}
