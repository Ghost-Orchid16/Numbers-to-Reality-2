import type { Quality } from '../state/director'

/**
 * Diagnostic URL flags, read once at start-up. Everything they switch on is either lazy-loaded
 * or a constant branch, so a normal visit pays nothing for them.
 *
 *   ?perf                       live performance overlay (fps, frame-time percentiles, JS ms,
 *                               renderer.info, DPR, chapter, long animation frames)
 *   ?bench                      scripted scroll benchmark (top → bottom → top, twice) with a
 *                               results card; implies ?perf. Options: &speed=<px/s> (default
 *                               1500, time-based) or &step=<px/frame> (frame-based, for
 *                               software-rendered CI); &passes=<n> (default 2)
 *   ?quality=high|medium|low    pin the render tier (the adaptive monitor is switched off)
 *   ?dpr=<n>                    pin the canvas pixel ratio (software-rendered CI: DOM, JS and
 *                               draw calls are unchanged, only the pixel count drops)
 *   ?still                      deterministic frames for pixel comparisons: frozen ambient
 *                               clock, seeded randomness, no CSS motion. Dev and `--mode qa`
 *                               builds only — compiled out of production.
 *   ?qa                         exposes the renderer to the QA scripts
 */
const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)

const STILL_ALLOWED = import.meta.env.DEV || import.meta.env.MODE === 'qa'

const QUALITIES: readonly Quality[] = ['high', 'medium', 'low']
const pinned = params.get('quality') as Quality | null

const num = (key: string): number => {
  const v = Number(params.get(key))
  return Number.isFinite(v) && v > 0 ? v : 0
}

export const FLAGS = {
  perf: params.has('perf') || params.has('bench'),
  bench: params.has('bench'),
  /** bench scroll speed, px per second (time-based) */
  benchSpeed: num('speed') || 1500,
  /** bench scroll step, px per frame (frame-based); 0 = use speed */
  benchStep: num('step'),
  benchPasses: Math.min(4, num('passes') || 2),
  /** the bench waits for an external harness (npm run bench) at pass boundaries */
  harness: params.has('harness'),
  still: STILL_ALLOWED && params.has('still'),
  quality: pinned && QUALITIES.includes(pinned) ? pinned : null,
  dpr: num('dpr'),
  qa: params.has('qa'),
} as const

/** The adaptive quality monitor only runs when nothing pins the tier. */
export const ADAPTIVE_QUALITY = !FLAGS.quality && !FLAGS.still && !FLAGS.dpr
