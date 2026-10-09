import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import type { ChapterMeta } from '../content/chapters'
import { ensureWorldFont } from '../design/fonts'
import { morphToWorld } from '../design/tokens'
import { WORLDS, displayVars, mathVars, worldVars } from '../design/worlds'
import { ScrollTrigger } from '../motion/gsap'
import { neighbourFor, useDirector } from '../state/director'
import { scrollState } from '../state/scroll'

/**
 * A chapter's world: applies its tokens locally (colours, display face, maths colours),
 * lazy-loads its typeface as it approaches, and reports to the ChapterDirector which chapter
 * is active and how far through it we are.
 */
export function ChapterWorld({
  chapter,
  children,
  className = '',
  label,
}: {
  chapter: ChapterMeta
  children: ReactNode
  className?: string
  label: string
}) {
  const ref = useRef<HTMLElement>(null)
  const world = WORLDS[chapter.id]

  const style = useMemo(
    () => ({ ...worldVars(world), ...displayVars(world), ...mathVars(world) }) as CSSProperties,
    [world],
  )
  // colour-coded maths: .v-thrust { color: var(--v-thrust) } …
  const varCss = useMemo(
    () => Object.keys(world.vars).map((k) => `.v-${k}{color:var(--v-${k})}`).join(''),
    [world],
  )

  // Lazy font: start loading well before the chapter enters the viewport.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void ensureWorldFont(chapter.id)
          io.disconnect()
        }
      },
      { rootMargin: '150% 0px 150% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [chapter.id])

  // Director: active chapter + progress + neighbour to pre-mount.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => {
        if (!self.isActive) return
        useDirector.getState().setActive(chapter.id)
        morphToWorld(chapter.id)
      },
      onUpdate: (self) => {
        scrollState.chapter[chapter.id] = self.progress
        if (self.isActive) useDirector.getState().setNeighbour(neighbourFor(chapter.id, self.progress))
      },
    })
    return () => st.kill()
  }, [chapter.id])

  return (
    <section
      ref={ref}
      id={chapter.id}
      data-world={chapter.id}
      aria-label={label}
      className={`chapter-world relative ${className}`}
      style={style}
    >
      {varCss && <style>{varCss}</style>}
      {children}
    </section>
  )
}
