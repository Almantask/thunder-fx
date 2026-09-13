/** Largest seed the engine accepts (int32 max minus one). */
export const MAX_SEED = 2_147_483_646

/** A fresh positive seed, so each take is a distinct variation. */
export function randomSeed(): number {
  return 1 + Math.floor(Math.random() * MAX_SEED)
}

/** Keeps an explicit seed, or picks a random one when the field says "-1". */
export function resolveSeed(seed: number): number {
  return seed > 0 ? seed : randomSeed()
}

function u32(n: number): number {
  return n >>> 0
}

function imul(a: number, b: number): number {
  return Math.imul(a, b)
}

/**
 * Derive a reproducible per-take seed from a parent seed and 0-based take index.
 * Same parent + index always yields the same take; a take set of four can be
 * reproduced from one number.
 */
export function deriveTakeSeed(parentSeed: number, takeIndex: number): number {
  let n = u32(u32(parentSeed) ^ imul(takeIndex + 1, 0x9e3779b9))
  n = imul(n ^ (n >>> 16), 0x7feb352d)
  n = imul(n ^ (n >>> 15), 0x846ca68b)
  n = u32(n ^ (n >>> 16))
  return 1 + (n % MAX_SEED)
}
