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
      const onScroll = () => {
        scrollState.velocity = ScrollTrigger.getAll()[0]?.getVelocity() ?? 0
      }
      window.addEventListener('scroll', onScroll, { passive: true })
      return () => window.removeEventListener('scroll', onScroll)
    }
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.2 })
    lenis.on('scroll', ScrollTrigger.update)
    lenis.on('scroll', (l: Lenis) => {
      scrollState.velocity = l.velocity * 60
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
