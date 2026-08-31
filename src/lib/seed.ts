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
