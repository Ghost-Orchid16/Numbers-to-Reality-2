import Lenis from 'lenis'
import { useEffect } from 'react'
import { usePrefs } from '../state/prefs'
import { scrollState } from '../state/scroll'
import { gsap, ScrollTrigger } from './gsap'
import { setLenis } from './scroll'

/**
 * Lenis smooth scrolling, synced with ScrollTrigger exactly as the brief specifies.
 * Under prefers-reduced-motion there is no smoothing at all: native scroll only.
 * Pinning only — Lenis smooths the native scroll position, it never hijacks it, so the
 * native scrollbar and keyboard scrolling keep working.
 */
export function SmoothScroll() {
  const reduced = usePrefs((s) => s.reducedMotion)

  useEffect(() => {
    if (reduced) {
      // page height cached on resize, so the scroll handler never reads layout
      let max = 1
      const measure = () => {
        max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      }
      const ro = new ResizeObserver(measure)
      ro.observe(document.body)
      measure()
      const onScroll = () => {
        scrollState.velocity = ScrollTrigger.getAll()[0]?.getVelocity() ?? 0
        scrollState.progress = Math.min(1, Math.max(0, window.scrollY / max))
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('resize', measure)
      return () => {
        window.removeEventListener('scroll', onScroll)
        window.removeEventListener('resize', measure)
        ro.disconnect()
      }
    }
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.2 })
    // Lenis rewrites every lenis-* class on <html> each time its scrolling state flips (removes
    // them all, adds them back). Every rewrite invalidated the whole document's style — a
    // ~2,000-element recalc at the start and end of each scroll gesture, measured at 10–30 ms.
    // Nothing styles the state markers (lenis-scrolling / lenis-smooth: lenis.css only uses the
    // latter for iframes, and there are none), so the root keeps its static `lenis` class and
    // only the two behavioural classes are written, and only when they actually change.
    // (updateClassName is private in Lenis 1.3's typings; re-check this on a Lenis upgrade.)
    const root = document.documentElement
    ;(lenis as unknown as { updateClassName: () => void }).updateClassName = () => {
      root.classList.toggle('lenis-stopped', lenis.isStopped)
      root.classList.toggle('lenis-locked', lenis.isLocked)
    }
    lenis.on('scroll', ScrollTrigger.update)
    lenis.on('scroll', (l: Lenis) => {
      scrollState.velocity = l.velocity * 60
      scrollState.progress = l.progress
    })
    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    setLenis(lenis)
    return () => {
      gsap.ticker.remove(raf)
      lenis.destroy()
      setLenis(null)
    }
  }, [reduced])

  return null
}
