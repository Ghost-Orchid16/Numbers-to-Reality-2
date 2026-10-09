import { useEffect, useRef } from 'react'
import { gsap } from '../motion/gsap'
import { usePrefs } from '../state/prefs'

/**
 * Custom cursor: an exact dot plus a trailing ring in the world's accent colour. It grows over
 * real controls and shows a hint label from `data-cursor` (e.g. "DRAG"). Hidden on touch
 * devices; the native cursor is only hidden while this one is active.
 */
export function Cursor() {
  const coarse = usePrefs((s) => s.coarsePointer)
  const reduced = usePrefs((s) => s.reducedMotion)
  const dot = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const hint = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (coarse) return
    const root = document.documentElement
    root.classList.add('has-custom-cursor')
    const d = dot.current!
    const r = ring.current!
    const k = reduced ? 1 : 0.18
    const pos = { x: -100, y: -100 }
    const lag = { x: -100, y: -100 }
    let visible = false

    const hover = (el: Element | null) => {
      const target = el?.closest<HTMLElement>('a, button, input, select, label, [role="slider"], [data-cursor]')
      const label = target?.dataset.cursor ?? ''
      r.classList.toggle('is-active', !!target)
      if (hint.current && hint.current.textContent !== label) hint.current.textContent = label
      r.classList.toggle('has-hint', !!label)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      pos.x = e.clientX
      pos.y = e.clientY
      if (!visible) {
        visible = true
        lag.x = pos.x
        lag.y = pos.y
        gsap.to([d, r], { autoAlpha: 1, duration: 0.3, overwrite: 'auto' })
      }
      hover(e.target as Element | null)
    }
    // the page scrolls under a still pointer: re-check what is under it
    const onScroll = () => visible && hover(document.elementFromPoint(pos.x, pos.y))
    const onLeave = () => {
      visible = false
      gsap.to([d, r], { autoAlpha: 0, duration: 0.3, overwrite: 'auto' })
    }
    const onDown = () => r.classList.add('is-down')
    const onUp = () => {
      r.classList.remove('is-down')
      // labels change on click (Launch → Pause): re-read after React re-renders
      requestAnimationFrame(() => visible && hover(document.elementFromPoint(pos.x, pos.y)))
    }
    const tick = () => {
      lag.x += (pos.x - lag.x) * k
      lag.y += (pos.y - lag.y) * k
      d.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
      r.style.transform = `translate3d(${lag.x}px, ${lag.y}px, 0)`
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    gsap.ticker.add(tick)
    return () => {
      root.classList.remove('has-custom-cursor')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      gsap.ticker.remove(tick)
    }
  }, [coarse, reduced])

  if (coarse) return null
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70]">
      <div ref={ring} className="cursor-ring">
        <span ref={hint} className="cursor-hint label" />
      </div>
      <div ref={dot} className="cursor-dot" />
    </div>
  )
}
