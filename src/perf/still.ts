import { FLAGS } from './flags'

/**
 * ?still — deterministic frames for before/after pixel comparisons (dev and qa builds only).
 * Ambient, time-driven motion (glyph drift, star twinkle, plume flicker, vapour, heat shimmer,
 * beacons, the marquee) freezes on one fixed instant; everything driven by scroll or by the
 * simulation still runs, so each scroll position renders the same frame on every run.
 */
export const STILL = FLAGS.still

/** The frozen ambient clock (s). */
export const STILL_TIME = 2.5

/** Time step for ambient animation: 0 under ?still. */
export const ambientDt = (dt: number): number => (STILL ? 0 : dt)

/** Clock reading for ambient animation (blink, flicker, drift): fixed under ?still. */
export const ambientTime = (t: number): number => (STILL ? STILL_TIME : t)

/** Small fast seeded PRNG (mulberry32), uniform in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
