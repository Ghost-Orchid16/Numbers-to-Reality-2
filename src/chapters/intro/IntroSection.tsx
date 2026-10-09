import { useRef } from 'react'
import { ChapterWorld } from '../../components/ChapterWorld'
import { CHAPTERS } from '../../content/chapters'
import { gsap, SplitText, ScrollTrigger, useGSAP } from '../../motion/gsap'
import { useDirector } from '../../state/director'
import { usePrefs } from '../../state/prefs'
import { scrollState } from '../../state/scroll'
import { GLYPHS, glyphCount } from '../../scenes/intro/glyphAtlas'

/** The arrow is drawn, so its stroke can thicken with the type's weight. */
function Arrow() {
  return (
    <svg className="hero-arrow" viewBox="0 0 120 64" aria-hidden="true">
      <path d="M4 32 H108 M80 6 L110 32 L80 58" fill="none" stroke="currentColor" strokeLinecap="square" />
    </svg>
  )
}

/**
 * 00 — the entrance. The title's weight runs thin → black as the numbers become real; the
 * section's scroll progress drives the glyph swarm that assembles the rocket (IntroScene).
 */
export function IntroSection() {
  const root = useRef<HTMLDivElement>(null)
  const ready = useDirector((s) => s.ready)
  const reduced = usePrefs((s) => s.reducedMotion)
  const compact = usePrefs((s) => s.compact)
  const quality = useDirector((s) => s.quality)
  const glyphs = glyphCount(quality, compact).toLocaleString('en-US')

  // scroll → hero progress (the 3D handoff reads it every frame)
  useGSAP(
    () => {
      ScrollTrigger.create({
        trigger: root.current,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          scrollState.intro.progress = self.progress
        },
        onLeave: () => {
          scrollState.intro.progress = 1
        },
        onLeaveBack: () => {
          scrollState.intro.progress = 0
        },
      })
    },
    { scope: root },
  )

  // entrance + scroll choreography of the typography
  useGSAP(
    () => {
      if (!ready) return
      const el = root.current!
      const title = el.querySelector<HTMLElement>('.hero-title')!
      const words = el.querySelectorAll<HTMLElement>('.hero-word')
      const fades = el.querySelectorAll<HTMLElement>('[data-hero-fade]')
      const caption = el.querySelector<HTMLElement>('.hero-caption')!
      if (reduced) {
        gsap.set(title, { '--wght': 800 })
        gsap.from([title, ...fades], { autoAlpha: 0, duration: 0.6, ease: 'none' })
      } else {
        const split = SplitText.create(words, { type: 'chars', mask: 'chars' })
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
        tl.from(split.chars, { yPercent: 120, duration: 1.4, stagger: 0.035 }, 0.15)
          .fromTo(title, { '--wght': 200 }, { '--wght': 420, duration: 2.2, ease: 'power2.inOut' }, 0.1)
          .from('.hero-arrow', { scaleX: 0, transformOrigin: '0% 50%', duration: 1.2 }, 0.55)
          .from(fades, { autoAlpha: 0, y: 26, duration: 1.2, stagger: 0.09 }, 0.75)
      }
      // weight thin → black as the numbers become real, then the title clears for the rocket
      const st = { trigger: el, start: 'top top', end: '28% top', scrub: reduced ? true : 1 }
      gsap.fromTo(title, { '--wght': reduced ? 800 : 420 }, { '--wght': 900, ease: 'none', immediateRender: false, scrollTrigger: st })
      gsap.to('.hero-copy', {
        autoAlpha: 0,
        y: reduced ? 0 : -60,
        ease: 'none',
        scrollTrigger: { trigger: el, start: '11% top', end: '25% top', scrub: reduced ? true : 1 },
      })
      gsap.fromTo(
        caption,
        { autoAlpha: 0 },
        {
          autoAlpha: 1,
          ease: 'none',
          scrollTrigger: { trigger: el, start: '30% top', end: '38% top', scrub: true },
        },
      )
      gsap.to(caption, {
        autoAlpha: 0,
        ease: 'none',
        immediateRender: false,
        scrollTrigger: { trigger: el, start: '64% top', end: '74% top', scrub: true },
      })
    },
    { scope: root, dependencies: [ready, reduced] },
  )

  return (
    <ChapterWorld chapter={CHAPTERS[0]} label="Introduction — Numbers to Reality">
      <div ref={root} className="hero-scroll">
        <div className="hero-sticky">
          <div className="hero-scrim" aria-hidden="true" />
          <div className="hero-copy grid-12">
            <p className="label hero-kicker" data-hero-fade>
              [ 00 ] — A museum of working mathematics
            </p>
            <h1 className="hero-title" aria-label="Numbers to Reality">
              <span className="hero-word">Numbers</span>
              <Arrow />
              <span className="hero-word">Reality</span>
            </h1>
            <p className="hero-sub accent-serif" data-hero-fade>
              Where mathematics becomes reality.
            </p>
            <p className="hero-body" data-hero-fade>
              Every rocket launch, satellite position, racing car, intelligent machine and medical image depends on
              mathematics you rarely get to see.
            </p>
            <div className="hero-cue" data-hero-fade>
              <span className="hero-cue-line" aria-hidden="true" />
              <span className="label">Scroll to see the mathematics move.</span>
            </div>
            <p className="label hero-stamp" data-hero-fade>
              FIG. 00 — {glyphs} glyphs · {GLYPHS.length} symbols · [ LIVE ]
            </p>
          </div>
          <div className="hero-caption grid-12" aria-hidden="true">
            <p className="label hero-caption-text">
              FIG. 00-B — every glyph lands on a point sampled from the rocket&rsquo;s hull, then dissolves into it.
            </p>
          </div>
        </div>
      </div>
    </ChapterWorld>
  )
}
