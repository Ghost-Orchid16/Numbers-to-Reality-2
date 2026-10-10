import type { WorldId } from './worlds'

/**
 * Font pipeline.
 *
 * Up front (imported in main.tsx): Manrope, JetBrains Mono, Unbounded, Instrument Serif Italic.
 * Each chapter's display face is a dynamic import of its Fontsource CSS — its own chunk — plus a
 * `document.fonts.load()` so the file is actually fetched before the chapter scrolls in.
 * All faces use font-display: swap with metric-matched fallbacks (styles/font-fallbacks.css).
 */

interface FaceLoader {
  /** dynamic import of the Fontsource stylesheet (registers @font-face) */
  css: () => Promise<unknown>
  /** CSS font shorthand used to fetch the file */
  probe: string
}

const CHAPTER_FACES: Partial<Record<WorldId, FaceLoader>> = {
  rocket: {
    css: () => import('@fontsource-variable/big-shoulders-stencil/opsz.css'),
    probe: "800 72px 'Big Shoulders Stencil Variable'",
  },
  gps: { css: () => import('@fontsource-variable/doto/rond.css'), probe: "800 64px 'Doto Variable'" },
  f1: { css: () => import('@fontsource-variable/archivo/wdth-italic.css'), probe: "italic 900 64px 'Archivo Variable'" },
  ai: { css: () => import('@fontsource-variable/syne/wght.css'), probe: "800 64px 'Syne Variable'" },
  ct: { css: () => import('@fontsource-variable/fraunces/soft-italic.css'), probe: "italic 600 64px 'Fraunces Variable'" },
  skyscraper: {
    css: () => import('@fontsource-variable/bodoni-moda/opsz.css'),
    probe: "700 64px 'Bodoni Moda Variable'",
  },
  robot: { css: () => import('@fontsource-variable/tektur/wdth.css'), probe: "800 64px 'Tektur Variable'" },
  accelerator: { css: () => import('@fontsource/michroma/400.css'), probe: "400 64px 'Michroma'" },
}

/** Faces registered by main.tsx; the loader fetches them explicitly to report real progress. */
export const UPFRONT_FACES = [
  { id: 'font:manrope', label: 'Manrope', probe: "400 16px 'Manrope Variable'" },
  { id: 'font:jetbrains', label: 'JetBrains Mono', probe: "500 16px 'JetBrains Mono Variable'" },
  { id: 'font:unbounded', label: 'Unbounded', probe: "900 64px 'Unbounded Variable'" },
  { id: 'font:instrument', label: 'Instrument Serif', probe: "italic 400 64px 'Instrument Serif'" },
] as const

const pending = new Map<WorldId, Promise<void>>()

/** Load (once) the display face of a world. Resolves when the file is ready or on failure. */
export function ensureWorldFont(id: WorldId): Promise<void> {
  const face = CHAPTER_FACES[id]
  if (!face) return Promise.resolve()
  let p = pending.get(id)
  if (!p) {
    p = face
      .css()
      .then(() => document.fonts.load(face.probe))
      .then(() => undefined)
      .catch(() => undefined) // swap keeps the metric-matched fallback; never block the page
    pending.set(id, p)
  }
  return p
}

export const isWorldFontRequested = (id: WorldId): boolean => pending.has(id)

/**
 * Fetch a world's face one chapter ahead, when the main thread is idle: registering the face and
 * swapping it in then happen while that chapter is still far off-screen, not as it scrolls in.
 */
export function prefetchWorldFont(id: WorldId): void {
  if (!CHAPTER_FACES[id] || pending.has(id)) return
  const run = () => void ensureWorldFont(id)
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 })
  else setTimeout(run, 1000)
}
