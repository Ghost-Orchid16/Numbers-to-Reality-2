import { useRef } from 'react'
import type { ChapterMeta } from '../content/chapters'
import { gsap, SplitText, useGSAP } from '../motion/gsap'
import { usePrefs } from '../state/prefs'

/**
 * Chapter opener: a giant outlined chapter number (parallax, filling with the chapter colour
 * as it scrolls in) and the title in the chapter typeface, revealed with SplitText.
 */
export function ChapterTitle({
  chapter,
  accentWord,
  kicker,
}: {
  chapter: ChapterMeta
  /** optional accent phrase set in Instrument Serif Italic */
  accentWord?: string
  kicker?: string
}) {
  const root = useRef<HTMLElement>(null)
  const reduced = usePrefs((s) => s.reducedMotion)

  useGSAP(
    () => {
      const el = root.current!
      const num = el.querySelector<HTMLElement>('.chapter-num')!
      const title = el.querySelector<HTMLElement>('.chapter-title-text')!
      const fades = el.querySelectorAll<HTMLElement>('[data-fade]')
      if (reduced) {
        gsap.set(num, { '--fill': '100%' })
        gsap.from([title, ...fades], {
          autoAlpha: 0,
          duration: 0.6,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top 70%' },
        })
        return
      }
      const split = SplitText.create(title, { type: 'chars,words', mask: 'chars', charsClass: 'split-char' })
      gsap.from(split.chars, {
        yPercent: 115,
        rotate: 6,
        duration: 1.3,
        ease: 'expo.out',
        stagger: 0.035,
        scrollTrigger: { trigger: el, start: 'top 72%' },
      })
      gsap.from(fades, {
        autoAlpha: 0,
        y: 24,
        duration: 1.2,
        ease: 'expo.out',
        stagger: 0.08,
        scrollTrigger: { trigger: el, start: 'top 68%' },
      })
      // outline → filled with the chapter colour, scrubbed with scroll
      gsap.fromTo(
        num,
        { '--fill': '0%' },
        { '--fill': '100%', ease: 'none', scrollTrigger: { trigger: el, start: 'top 85%', end: 'center 40%', scrub: 1 } },
      )
      // parallax: the numeral drifts slower than the page
      gsap.fromTo(
        num,
        { yPercent: 18 },
        { yPercent: -22, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 1 } },
      )
      return () => split.revert()
    },
    { scope: root, dependencies: [reduced] },
  )

  return (
    <header ref={root} className="chapter-title grid-12">
      <div className="chapter-num display" aria-hidden="true">
        {chapter.code}
      </div>
      <div className="chapter-title-body">
        <p className="label" data-fade>
          {kicker ?? `Chapter ${chapter.code} — ${chapter.nav}`}
        </p>
        <h2 id={`${chapter.id}-title`} className="display chapter-title-text">
          {chapter.title}
        </h2>
        <p className="chapter-subtitle" data-fade>
          {accentWord ? (
            <>
              {chapter.subtitle.replace(accentWord, '')}
              <span className="accent-serif">{accentWord}</span>
            </>
          ) : (
            chapter.subtitle
          )}
        </p>
      </div>
    </header>
  )
}
