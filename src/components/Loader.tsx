import { useProgress } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import { loadLabel } from '../lib/loading'
import { gsap } from '../motion/gsap'
import { useDirector } from '../state/director'
import { usePrefs } from '../state/prefs'

/**
 * LOADING REALITY. The counter is drei's useProgress — fed by the real start-up work
 * registered in lib/loading.ts — eased for display but never ahead of the true value.
 * Exits with a mask wipe once every item has finished.
 */
export function Loader() {
  const { progress, item, loaded, total, active } = useProgress()
  const setReady = useDirector((s) => s.setReady)
  const reduced = usePrefs((s) => s.reducedMotion)
  const root = useRef<HTMLDivElement>(null)
  const counter = useRef<HTMLSpanElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const target = useRef(0)
  const shown = useRef(0)
  const [gone, setGone] = useState(false)
  const exiting = useRef(false)

  target.current = progress

  useEffect(() => {
    const tick = () => {
      const t = target.current
      shown.current = Math.min(t, shown.current + Math.max(0.35, (t - shown.current) * 0.12))
      const n = Math.floor(shown.current + 1e-6)
      if (counter.current) counter.current.textContent = String(n).padStart(3, '0')
      if (bar.current) bar.current.style.transform = `scaleX(${(shown.current / 100).toFixed(4)})`
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])

  const done = total > 0 && loaded >= total && !active

  useEffect(() => {
    if (!done || exiting.current) return
    exiting.current = true
    const el = root.current!
    const wait = () =>
      new Promise<void>((resolve) => {
        const check = () => (shown.current >= 99.999 ? resolve() : requestAnimationFrame(check))
        check()
      })
    void wait().then(() => {
      const tl = gsap.timeline({ delay: reduced ? 0.1 : 0.35, onComplete: () => setGone(true) })
      tl.call(() => setReady())
      if (reduced) tl.to(el, { autoAlpha: 0, duration: 0.4, ease: 'none' })
      else
        tl.to(el.querySelector('.loader-inner'), { yPercent: -12, autoAlpha: 0, duration: 0.9, ease: 'expo.in' }, 0).to(
          el,
          { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.25, ease: 'expo.inOut' },
          0.25,
        )
    })
  }, [done, reduced, setReady])

  if (gone) return null
  return (
    <div ref={root} className="loader" role="status" aria-live="polite" aria-label="Loading">
      <div className="loader-inner">
        <div className="loader-top">
          <span className="label">Numbers → Reality</span>
          <span className="label">A museum of working mathematics</span>
        </div>
        <div className="loader-center">
          <p className="label loader-title">Loading reality</p>
          <div className="loader-count data" aria-hidden="true">
            <span ref={counter}>000</span>
          </div>
          <div className="loader-track">
            <div ref={bar} className="loader-bar" />
          </div>
          <p className="label loader-item">
            {done ? 'Ready' : item ? loadLabel(item) : 'Starting'}
            <span className="loader-items data">
              {' '}
              · {loaded}/{total}
            </span>
          </p>
        </div>
        <p className="label loader-foot">Every number on screen is computed by the model that moves what you see.</p>
      </div>
      <span className="sr-only">{done ? 'Loaded' : `Loading, ${Math.round(progress)} percent`}</span>
    </div>
  )
}
