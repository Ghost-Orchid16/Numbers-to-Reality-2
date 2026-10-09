import { create } from 'zustand'

/** User / device preferences from media queries, kept live. */
export interface Prefs {
  reducedMotion: boolean
  coarsePointer: boolean
  /** narrow viewport: 3D on top, controls in a bottom sheet */
  compact: boolean
}

const mq = (q: string) => (typeof window !== 'undefined' ? window.matchMedia(q) : null)

const QUERIES = {
  reducedMotion: '(prefers-reduced-motion: reduce)',
  coarsePointer: '(pointer: coarse)',
  compact: '(max-width: 899px)',
} as const

export const usePrefs = create<Prefs>(() => ({
  reducedMotion: mq(QUERIES.reducedMotion)?.matches ?? false,
  coarsePointer: mq(QUERIES.coarsePointer)?.matches ?? false,
  compact: mq(QUERIES.compact)?.matches ?? false,
}))

if (typeof window !== 'undefined') {
  for (const [key, query] of Object.entries(QUERIES) as [keyof Prefs, string][]) {
    mq(query)?.addEventListener('change', (e) => usePrefs.setState({ [key]: e.matches }))
  }
}

export const prefersReducedMotion = (): boolean => usePrefs.getState().reducedMotion
