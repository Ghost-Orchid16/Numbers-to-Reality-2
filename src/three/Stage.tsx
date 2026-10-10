import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { WORLDS } from '../design/worlds'
import { isLoaded } from '../lib/loading'
import { onFrame } from '../motion/frame'
import { gsap } from '../motion/gsap'
import { getLenis } from '../motion/scroll'
import { SCENES } from '../scenes/registry'
import { ADAPTIVE_QUALITY, FLAGS } from '../perf/flags'
import { registerRenderer } from '../perf/probe'
import { mountedChapters, useDirector, type Quality } from '../state/director'
import { usePrefs } from '../state/prefs'
import { scrollState } from '../state/scroll'
import { Effects } from './Effects'
import { Precompile } from './Precompile'

// ?quality=… pins the tier before anything renders (diagnostics; the monitor is then off)
if (FLAGS.quality) useDirector.setState({ quality: FLAGS.quality })

const DOWN: Record<Quality, Quality> = { high: 'medium', medium: 'low', low: 'low' }
const UP: Record<Quality, Quality> = { high: 'high', medium: 'high', low: 'medium' }

/** Only the active chapter and its neighbour are mounted; unmounting disposes their resources. */
function SceneRouter() {
  const mounted = useDirector(useShallow(mountedChapters))
  return (
    <>
      {mounted.map((id) => {
        const Scene = SCENES[id]
        return Scene ? (
          <Suspense key={id} fallback={null}>
            <Scene />
          </Suspense>
        ) : null
      })}
    </>
  )
}

/**
 * Adaptive quality, judged only on frames the visitor sees: the monitor starts 1.5 s after the
 * loader's reveal (start-up frames compile shaders and would read as a slow machine), and a tier
 * change waits until scrolling stops — a change rebuilds glyphs, particles and passes, which is a
 * hitch mid-scroll but invisible at rest.
 */
function AdaptiveQuality() {
  const ready = useDirector((s) => s.ready)
  const setQuality = useDirector((s) => s.setQuality)
  const [live, setLive] = useState(false)
  const pending = useRef<Quality | null>(null)
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => setLive(true), 1500)
    return () => clearTimeout(t)
  }, [ready])
  useEffect(() => {
    const id = setInterval(() => {
      if (pending.current && !getLenis()?.isScrolling && Math.abs(scrollState.velocity) < 1) {
        setQuality(pending.current)
        pending.current = null
      }
    }, 250)
    return () => clearInterval(id)
  }, [setQuality])
  if (!live) return null
  const request = (q: Quality) => {
    pending.current = q
  }
  const current = () => pending.current ?? useDirector.getState().quality
  return (
    <PerformanceMonitor
      flipflops={4}
      onDecline={() => request(DOWN[current()])}
      onIncline={() => request(UP[current()])}
      onFallback={() => request('low')}
    />
  )
}

/** Canvas clear colour follows the active world. */
function ClearColor() {
  const gl = useThree((s) => s.gl)
  const active = useDirector((s) => s.active)
  useEffect(() => {
    gl.setClearColor(WORLDS[active].colors.bg, 1)
  }, [gl, active])
  return null
}

/**
 * One clock: the canvas has no render loop of its own (frameloop="never"). It is advanced from
 * the shared frame loop's 'render' stage — after Lenis, ScrollTrigger, GSAP and the simulation
 * have produced this frame's state, before the DOM labels that follow it (motion/frame.ts).
 * requestAnimationFrame stops in hidden tabs, so rendering pauses with it.
 */
function FrameDriver() {
  const advance = useThree((s) => s.advance)
  const clock = useThree((s) => s.clock)
  useEffect(() => {
    // R3F derives delta from the previous timestamp: start from the ticker's current time
    clock.elapsedTime = gsap.ticker.time
    let warm = 0
    return onFrame('render', (time) => {
      // Behind the opaque loader nothing can be seen once the shaders are built: a few more
      // frames build the post-processing passes, then the canvas waits for the reveal (the
      // loader's own animation gets the main thread and the GPU).
      if (!useDirector.getState().ready && isLoaded('gpu:compile') && warm++ >= 3) return
      advance(time)
    })
  }, [advance, clock])
  return null
}

/**
 * THE STAGE — one persistent full-viewport WebGL canvas fixed behind the DOM.
 * Adaptive quality: PerformanceMonitor moves a tier (DPR range, particle counts, AO);
 * AdaptiveDpr handles transient regressions. DPR ∈ [1, 2] desktop, [1, 1.5] compact.
 */
export default function Stage() {
  const quality = useDirector((s) => s.quality)
  const compact = usePrefs((s) => s.compact)
  const dprMax = compact ? 1.5 : 2
  const dpr: [number, number] = FLAGS.dpr
    ? [FLAGS.dpr, FLAGS.dpr]
    : quality === 'low'
      ? [1, 1]
      : quality === 'medium'
        ? [1, Math.min(1.5, dprMax)]
        : [1, dprMax]

  return (
    <div className="stage" aria-hidden="true">
      <Canvas
        dpr={dpr}
        frameloop="never"
        flat={false}
        gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true }}
        camera={{ fov: 35, near: 0.3, far: 120000, position: [0, 18, 140] }}
        style={{ touchAction: 'pan-y' }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(WORLDS.intro.colors.bg, 1)
          registerRenderer(gl, scene)
          // QA hook (screenshot script): read renderer.info to verify nothing leaks
          if (FLAGS.qa) (window as unknown as { __nrQA: unknown }).__nrQA = { gl }
        }}
      >
        {ADAPTIVE_QUALITY && <AdaptiveQuality />}
        <AdaptiveDpr />
        <FrameDriver />
        <ClearColor />
        <SceneRouter />
        <Precompile needs={['intro', 'rocket']} />
        <Effects />
      </Canvas>
    </div>
  )
}
