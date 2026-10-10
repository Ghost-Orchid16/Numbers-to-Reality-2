import type { ChapterId } from '../content/chapters'

/**
 * Transient scroll state, written by ScrollTrigger callbacks and read inside useFrame /
 * tickers. Deliberately NOT React state: it changes every frame.
 */
export const scrollState = {
  /** smoothed scroll velocity (px/s, signed) */
  velocity: 0,
  /** page scroll progress 0..1 (top → bottom) */
  progress: 0,
  /** progress 0..1 through each chapter's section */
  chapter: {} as Partial<Record<ChapterId, number>>,
  /** hero: 0 at the top, 1 when the glyphs have become the rocket */
  intro: { progress: 0 },
}
