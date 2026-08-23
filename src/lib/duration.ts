/** Shortest clip the studio will generate. */
export const MIN_GENERATE_SECONDS = 0.5

/**
 * Stable Audio 3 Medium max length: 6 minutes 20 seconds.
 * https://github.com/Stability-AI/stable-audio-3
 */
export const MAX_GENERATE_SECONDS = 380

const FALLBACK_SECONDS = 8

export function clampGenerateSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return FALLBACK_SECONDS
  return Math.min(MAX_GENERATE_SECONDS, Math.max(MIN_GENERATE_SECONDS, seconds))
}
