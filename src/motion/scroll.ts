import type Lenis from 'lenis'
import { prefersReducedMotion } from '../state/prefs'

let lenis: Lenis | null = null

export const setLenis = (l: Lenis | null): void => {
  lenis = l
}
export const getLenis = (): Lenis | null => lenis

/** Scroll to an element or y position — smooth via Lenis, instant under reduced motion. */
export function scrollToTarget(target: HTMLElement | number, offset = 0): void {
  if (lenis && !prefersReducedMotion()) {
    lenis.scrollTo(target, { offset, duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) })
    return
  }
  const y = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY
  window.scrollTo({ top: y + offset, behavior: 'auto' })
}
