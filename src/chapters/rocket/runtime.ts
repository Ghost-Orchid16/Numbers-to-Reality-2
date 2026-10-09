import { create } from 'zustand'
import { DEFAULT_ROCKET, type RocketParams } from '../../sim/rocket/model'
import { RocketSim, type EndReason, type RocketSnapshot } from '../../sim/rocket/rocketSim'
import { computeTrajectory, sampleTrajectory, type Trajectory } from '../../sim/rocket/trajectory'

/**
 * ROCKET RUNTIME — the single source of every rocket number on screen.
 *
 * Two clocks feed one `view` snapshot:
 *  • scrub: the pinned flight sequence maps scroll → simulated time on a trajectory
 *    precomputed by the model for the current lab parameters;
 *  • live:  the lab runs the same model in real time (× time warp) with fixed substeps.
 * The 3D scene reads `rocket.view` every frame; DOM readouts read it at ~12 Hz.
 */

export type RocketMode = 'scrub' | 'live'

/** Countdown shown before ignition in the scrubbed sequence (not simulated: engines are off). */
export const COUNTDOWN = 3

export const rocket = {
  params: { ...DEFAULT_ROCKET } as RocketParams,
  trajectory: computeTrajectory(DEFAULT_ROCKET),
  /** trajectory of the untouched defaults (for comparisons) */
  defaultTrajectory: null as Trajectory | null,
  sim: new RocketSim(DEFAULT_ROCKET),
  mode: 'scrub' as RocketMode,
  /** scrubbed time, may be negative during the countdown (s) */
  scrubTime: -COUNTDOWN - 1,
  /** time of the displayed state; negative = countdown, engines off */
  viewTime: -COUNTDOWN - 1,
  view: null as unknown as RocketSnapshot,
  /** MAX-Q has occurred in the displayed flight */
  maxQPassed: false,
  maxQ: { q: 0, t: 0, h: 0 },
  /** incremented whenever the trajectory is recomputed */
  version: 0,
}
rocket.defaultTrajectory = rocket.trajectory
rocket.view = sampleTrajectory(rocket.trajectory, 0)

/** UI state that React renders (buttons, sliders) — low frequency only. */
interface RocketUI {
  params: RocketParams
  playing: boolean
  timeScale: number
  mode: RocketMode
  ended: EndReason | null
  launched: boolean
  setParams: (patch: Partial<RocketParams>) => void
  play: () => void
  pause: () => void
  reset: () => void
  setTimeScale: (k: number) => void
  setMode: (m: RocketMode) => void
}

let pendingTrajectory = false
function scheduleTrajectory() {
  if (pendingTrajectory) return
  pendingTrajectory = true
  requestAnimationFrame(() => {
    pendingTrajectory = false
    rocket.trajectory = computeTrajectory(rocket.params)
    rocket.version++
  })
}

export const useRocketUI = create<RocketUI>((set, get) => ({
  params: rocket.params,
  playing: false,
  timeScale: 4,
  mode: 'scrub',
  ended: null,
  launched: false,
  setParams: (patch) => {
    rocket.params = { ...rocket.params, ...patch }
    const before = rocket.sim.time
    rocket.sim.setParams(patch)
    const wasReset = rocket.sim.time === 0 && before > 0
    scheduleTrajectory()
    set({
      params: rocket.params,
      ended: rocket.sim.ended,
      ...(wasReset ? { playing: false, launched: false } : null),
    })
    if (wasReset) rocket.maxQPassed = false
  },
  play: () => {
    if (rocket.sim.ended) get().reset()
    set({ playing: true, launched: true })
  },
  pause: () => set({ playing: false }),
  reset: () => {
    rocket.sim.reset()
    rocket.maxQPassed = false
    set({ playing: false, launched: false, ended: null })
  },
  setTimeScale: (timeScale) => set({ timeScale }),
  setMode: (mode) => {
    rocket.mode = mode
    set({ mode })
  },
}))

/**
 * Advance the displayed state. Called once per animation frame from the GSAP ticker by the
 * rocket chapter (so the sim also runs when the canvas is throttled).
 */
export function tickRocket(dt: number): void {
  const ui = useRocketUI.getState()
  if (rocket.mode === 'live') {
    if (ui.playing && !rocket.sim.ended) {
      rocket.sim.step(Math.min(dt, 0.1) * ui.timeScale)
      if (rocket.sim.ended) useRocketUI.setState({ playing: false, ended: rocket.sim.ended })
    }
    rocket.view = rocket.sim.metrics()
    // Before LAUNCH the rocket waits on the pad with its engine cold.
    rocket.viewTime = ui.launched ? rocket.sim.time : -1
    rocket.maxQPassed = rocket.sim.maxQ.passed
    rocket.maxQ = rocket.sim.maxQ
  } else {
    const t = rocket.scrubTime
    rocket.viewTime = t
    rocket.view = sampleTrajectory(rocket.trajectory, Math.max(0, t))
    const mq = rocket.trajectory.maxQ
    rocket.maxQPassed = !!mq && t >= mq.t
    if (mq) rocket.maxQ = mq
  }
}

/** Engine running in the displayed state (false during the countdown). */
export const engineFiring = (): boolean => rocket.viewTime >= 0 && rocket.view.engineOn && rocket.view.thrust > 0
