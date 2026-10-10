import { gsap } from './gsap'

/**
 * THE frame loop — one requestAnimationFrame per frame, owned by GSAP's ticker.
 *
 * Order inside every frame, so the DOM and the canvas always show the same instant:
 *   1. Lenis               (prioritised ticker listener: the scroll position for this frame,
 *                           which also runs ScrollTrigger.update)
 *   2. GSAP                (its root timeline: tweens and scrubs read that scroll position)
 *   3. 'sim'               simulation clocks (e.g. the rocket runtime samples its trajectory)
 *   4. 'dom'               DOM that reads the simulation (narrative, HUD, readouts, marquee)
 *   5. 'render'            React Three Fiber renders the canvas (frameloop="never" + advance)
 *   6. 'post'              DOM that follows points projected by this frame's render (labels)
 *
 * The browser pauses requestAnimationFrame in hidden tabs, so everything stops with it.
 */
export type FrameStage = 'sim' | 'dom' | 'render' | 'post'
/** time: GSAP ticker time (s); dt: seconds since the previous frame */
export type FrameFn = (time: number, dt: number) => void

const ORDER: readonly FrameStage[] = ['sim', 'dom', 'render', 'post']
const stages: Record<FrameStage, FrameFn[]> = { sim: [], dom: [], render: [], post: [] }
let installed = false

function tick(time: number, deltaMs: number): void {
  const dt = deltaMs / 1000
  for (let s = 0; s < ORDER.length; s++) {
    const list = stages[ORDER[s]]
    for (let i = 0; i < list.length; i++) list[i](time, dt)
  }
}

/** Run `fn` every frame at `stage`. Returns an unsubscribe function. */
export function onFrame(stage: FrameStage, fn: FrameFn): () => void {
  if (!installed) {
    installed = true
    // after GSAP's own root update (registered when gsap loaded), so tweens are current
    gsap.ticker.add(tick)
  }
  // copy-on-write: a listener removed during a frame never shifts the list being iterated
  stages[stage] = [...stages[stage], fn]
  return () => {
    stages[stage] = stages[stage].filter((f) => f !== fn)
  }
}
