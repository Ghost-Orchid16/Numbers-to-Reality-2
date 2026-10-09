import { useEffect, useRef } from 'react'
import { CHAPTER_COUNT, chapterById } from '../content/chapters'
import { gsap } from '../motion/gsap'
import { useDirector } from '../state/director'

/** "01 / 08" in the chapter colour, with page progress as a hairline. */
export function ScrollHUD() {
  const active = useDirector((s) => s.active)
  const ready = useDirector((s) => s.ready)
  const bar = useRef<HTMLDivElement>(null)
  const meta = chapterById(active)

  useEffect(() => {
    const tick = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? window.scrollY / max : 0
      if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(4)})`
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
      <div className="label scroll-hud-name">{meta.nav}</div>
      <div className="scroll-hud-track">
        <div ref={bar} className="scroll-hud-bar" />
      </div>
    </div>
  )
}
