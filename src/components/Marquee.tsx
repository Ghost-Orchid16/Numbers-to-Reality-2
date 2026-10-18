import { useEffect, useRef } from 'react'
import { onFrame } from '../motion/frame'
import { gsap } from '../motion/gsap'
import { STILL } from '../perf/still'
import { usePrefs } from '../state/prefs'
import { scrollState } from '../state/scroll'

/**
 * A band of the chapter's key quantities in its display face. It drifts, accelerates with
 * scroll speed and skews with scroll velocity. The items are computed by the model.
 * Its width is measured only when it changes (ResizeObserver) and it rests while off-screen:
 * reading scrollWidth every frame forced a layout per frame.
 */
export function Marquee({ items, speed = 60 }: { items: string[]; speed?: number }) {
  const track = useRef<HTMLDivElement>(null)
  const reduced = usePrefs((s) => s.reducedMotion)

  useEffect(() => {
    const el = track.current
    if (!el || reduced || STILL) return
    let x = 0
    let skew = 0
    let half = 0
    let onScreen = true
    const ro = new ResizeObserver(() => {
      half = el.scrollWidth / 2
    })
    ro.observe(el)
    const io = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting
    })
    io.observe(el.parentElement ?? el)
    const tick = (_t: number, dt: number) => {
      if (!onScreen || half <= 0) return
      const v = scrollState.velocity
      x -= (speed + Math.min(Math.abs(v) * 0.25, 900)) * dt
      if (x <= -half) x += half
      const targetSkew = gsap.utils.clamp(-12, 12, -v * 0.006)
      skew += (targetSkew - skew) * 0.12
      el.style.transform = `translate3d(${x.toFixed(2)}px,0,0) skewX(${skew.toFixed(2)}deg)`
    }
    const offFrame = onFrame('dom', tick)
    return () => {
      offFrame()
      ro.disconnect()
      io.disconnect()
    }
  }, [reduced, speed])

  const row = items.map((it, i) => (
    <span key={i} className="marquee-item">
      {it}
      <span className="marquee-sep" aria-hidden="true" />
    </span>
  ))
  return (
    <div className="marquee" aria-label={items.join(', ')} role="marquee">
      <div ref={track} className="marquee-track display" aria-hidden="true">
        <div className="marquee-row">{row}</div>
        <div className="marquee-row">{row}</div>
      </div>
    </div>
  )
}
