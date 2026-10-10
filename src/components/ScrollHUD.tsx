import { useEffect, useRef } from 'react'
import { CHAPTER_COUNT, chapterById } from '../content/chapters'
import { gsap } from '../motion/gsap'
import { getLenis } from '../motion/scroll'
import { useDirector } from '../state/director'
import { scrollState } from '../state/scroll'

/** "01 / 08" in the chapter colour, with page progress as a hairline. */
export function ScrollHUD() {
  const active = useDirector((s) => s.active)
  const ready = useDirector((s) => s.ready)
  const bar = useRef<HTMLDivElement>(null)
  const meta = chapterById(active)

  useEffect(() => {
    // progress from Lenis (its page size is cached by a ResizeObserver) or, without smooth
    // scrolling, from the scroll handler: reading scrollHeight / scrollY here forced a layout
    // every frame. The bar is written only when its value changes.
    let last = ''
    const tick = () => {
      const scale = (getLenis()?.progress ?? scrollState.progress).toFixed(4)
      if (scale === last || !bar.current) return
      last = scale
      bar.current.style.transform = `scaleX(${scale})`
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])

  return (
    <div className={`scroll-hud ${ready ? 'is-ready' : ''}`} aria-hidden="true">
      <div className="data scroll-hud-count">
        <span className="scroll-hud-current">{meta.code}</span>
        <span className="scroll-hud-sep"> / </span>
        <span>{String(CHAPTER_COUNT).padStart(2, '0')}</span>
      </div>
      <div className="scroll-hud-track">
        <div ref={bar} className="scroll-hud-bar" />
      </div>
      <div className="label scroll-hud-name">{meta.nav}</div>
    </div>
  )
}
