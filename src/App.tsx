import { lazy, Suspense, useEffect } from 'react'
import { IntroSection } from './chapters/intro/IntroSection'
import { ChapterNav } from './components/ChapterNav'
import { Closing } from './components/Closing'
import { Cursor } from './components/Cursor'
import { GrainOverlay } from './components/GrainOverlay'
import { Loader } from './components/Loader'
import { ScrollHUD } from './components/ScrollHUD'
import { CHAPTERS } from './content/chapters'
import { prefetchWorldFont } from './design/fonts'
import { trackLoad } from './lib/loading'
import { ScrollTrigger } from './motion/gsap'
import { scrollToTarget } from './motion/scroll'
import { SmoothScroll } from './motion/SmoothScroll'
import { useDirector } from './state/director'
import Stage from './three/Stage'

const RocketChapter = lazy(() =>
  trackLoad('chunk:rocket-chapter', 'Module · chapter 01', () => import('./chapters/rocket/RocketChapter')),
)

/** Lazy chapters and late fonts change the page height: keep every ScrollTrigger in sync. */
function useScrollRefresh() {
  useEffect(() => {
    const main = document.getElementById('main')
    if (!main) return
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => ScrollTrigger.refresh())
    })
    ro.observe(main)
    void document.fonts.ready.then(() => ScrollTrigger.refresh())
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])
}

/** Deep links (#rocket) work once the experience is revealed. */
function useHashOnReady() {
  const ready = useDirector((s) => s.ready)
  useEffect(() => {
    if (!ready || !location.hash) return
    const el = document.querySelector<HTMLElement>(location.hash)
    if (el) requestAnimationFrame(() => scrollToTarget(el))
  }, [ready])
}

/** After the reveal, each chapter's display face is fetched while the chapter before it is active. */
function useFontPrefetch() {
  useEffect(() => {
    const built = CHAPTERS.filter((c) => c.built)
    const ahead = (id: string) => {
      const next = built[built.findIndex((c) => c.id === id) + 1]
      if (next) prefetchWorldFont(next.id)
    }
    const { ready, active } = useDirector.getState()
    if (ready) ahead(active)
    return useDirector.subscribe((s, prev) => {
      if (s.ready && (!prev.ready || s.active !== prev.active)) ahead(s.active)
    })
  }, [])
}

export default function App() {
  useScrollRefresh()
  useHashOnReady()
  useFontPrefetch()
  return (
    <>
      <a href="#rocket" className="skip-link interactive">
        Skip to Chapter 01
      </a>
      <Stage />
      <SmoothScroll />
      <ChapterNav />
      <main id="main" className="overlay">
        <IntroSection />
        <Suspense fallback={<div className="chapter-fallback" aria-hidden="true" />}>
          <RocketChapter />
        </Suspense>
        <Closing />
      </main>
      <ScrollHUD />
      <Cursor />
      <GrainOverlay />
      <Loader />
    </>
  )
}
