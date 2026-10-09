import { gsap } from '../motion/gsap'
import { prefersReducedMotion } from '../state/prefs'
import { WORLDS, worldVars, type WorldId } from './worlds'

let current: WorldId | null = null

/**
 * Morph the global tokens on :root to a world with a GSAP tween (colours interpolate).
 * The canvas clear colour, chrome (nav, HUD, cursor) and page background follow.
 */
export function morphToWorld(id: WorldId, duration = 1.2): void {
  if (current === id) return
  current = id
  const w = WORLDS[id]
  const root = document.documentElement
  root.dataset.world = id
  root.style.colorScheme = w.theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', w.colors.bg)
  gsap.to(root, {
    ...worldVars(w),
    duration: prefersReducedMotion() ? 0 : duration,
    ease: 'power2.inOut',
    overwrite: 'auto',
  })
}

export const currentWorld = (): WorldId | null => current
