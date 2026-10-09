import { parabolicPeak } from '../core/math'
import { Track } from '../core/track'
import { FIXED_DT } from '../core/types'
import { idealDeltaV, resolvePlanet, type RocketParams } from './model'
import { RocketSim, snapshotFrom, type EndReason, type RocketSnapshot } from './rocketSim'

/**
 * A flight precomputed with the live model, for scroll scrubbing: scroll progress maps to
 * simulated time and every frame samples this track. It is recomputed whenever the lab
 * parameters change, so the scrubbed sequence always shows the current rocket.
 */

export const TRACK_KEYS = [
  'v',
  'gamma',
  'h',
  'x',
  'm',
  'onPad',
  'engineOn',
  'pitched',
  'thrust',
  'g',
  'weight',
  'rho',
  'drag',
  'q',
  'fFree',
  'fNet',
  'accel',
  'twr',
  'mdot',
  'propellant',
  'gravityLoss',
  'dragLoss',
] as const
export type TrackKey = (typeof TRACK_KEYS)[number]

/** Samples are stored every 12 substeps = 0.05 s. */
export const SAMPLE_EVERY = 12
export const SAMPLE_DT = SAMPLE_EVERY * FIXED_DT

export interface Trajectory {
  params: RocketParams
  track: Track<TrackKey>
  /** total recorded duration (s) */
  duration: number
  liftoffTime: number | null
  pitchTime: number | null
  burnoutTime: number | null
  /** peak dynamic pressure, located between samples by parabolic refinement */
  maxQ: { q: number; t: number; h: number; v: number } | null
  apogee: { h: number; t: number } | null
  /** why recording stopped */
  end: EndReason | 'recorded'
  /** ideal Δv from Tsiolkovsky (m/s) */
  idealDeltaV: number
  /** speed at burnout (m/s) — compare with ideal Δv to see the losses */
  burnoutSpeed: number | null
  maxAltitude: number
}

export interface TrajectoryOptions {
  /** keep recording this long after burnout (s) */
  coastAfterBurnout?: number
  /** hard cap on recorded time (s) */
  maxTime?: number
}

export function computeTrajectory(params: RocketParams, opts: TrajectoryOptions = {}): Trajectory {
  const coast = opts.coastAfterBurnout ?? 20
  const maxTime = opts.maxTime ?? 900
  const sim = new RocketSim(params)
  sim.maxTime = maxTime
  const track = new Track<TrackKey>(TRACK_KEYS, SAMPLE_DT, 4096)
  let burnoutSpeed: number | null = null
  let maxAltitude = 0

  const record = (s: RocketSnapshot) => {
    track.push({
      ...s,
      onPad: s.onPad ? 1 : 0,
      engineOn: s.engineOn ? 1 : 0,
      pitched: s.pitched ? 1 : 0,
    })
    if (s.h > maxAltitude) maxAltitude = s.h
  }

  record(sim.metrics())
  let end: Trajectory['end'] = 'recorded'
  for (;;) {
    sim.stepN(SAMPLE_EVERY)
    if (burnoutSpeed === null && sim.burnoutTime !== null && !sim.phaseFlags.onPad) burnoutSpeed = sim.state[0]
    record(snapshotFrom(sim.params, sim.state, sim.phaseFlags, sim.time))
    if (sim.ended) {
      end = sim.ended
      break
    }
    if (sim.burnoutTime !== null && sim.time >= sim.burnoutTime + coast) break
    if (sim.time >= maxTime) break
  }

  return {
    params: { ...params },
    track,
    duration: track.duration,
    liftoffTime: sim.liftoffTime,
    pitchTime: sim.pitchTime,
    burnoutTime: sim.burnoutTime,
    maxQ: findMaxQ(track),
    apogee: sim.apogee ? { h: sim.apogee.h, t: sim.apogee.t } : null,
    end,
    idealDeltaV: idealDeltaV(params),
    burnoutSpeed,
    maxAltitude,
  }
}

/** Locate the peak of q between samples (parabolic refinement of the largest sample). */
export function findMaxQ(track: Track<TrackKey>): Trajectory['maxQ'] {
  const q = track.channel('q')
  if (q.length < 3) return null
  let best = 1
  for (let i = 1; i < q.length - 1; i++) if (q[i] > q[best]) best = i
  if (!(q[best] > 0) || q[best] < q[best - 1] || q[best] < q[best + 1]) return null
  const { offset, value } = parabolicPeak(q[best - 1], q[best], q[best + 1])
  const t = (best + offset) * track.dt
  return { q: value, t, h: track.sample('h', t), v: track.sample('v', t) }
}

/** Interpolated snapshot at time t (flags taken from the last sample at or before t). */
export function sampleTrajectory(traj: Trajectory, t: number): RocketSnapshot {
  const tr = traj.track
  const tc = Math.max(0, Math.min(t, traj.duration))
  const val = (k: TrackKey) => tr.sample(k, tc)
  return {
    t: tc,
    v: val('v'),
    gamma: val('gamma'),
    h: val('h'),
    x: val('x'),
    m: val('m'),
    onPad: tr.sampleStep('onPad', tc) > 0.5,
    pitched: tr.sampleStep('pitched', tc) > 0.5,
    engineOn: tr.sampleStep('engineOn', tc) > 0.5,
    thrust: val('thrust'),
    g: val('g'),
    weight: val('weight'),
    rho: val('rho'),
    drag: val('drag'),
    q: val('q'),
    fFree: val('fFree'),
    fNet: val('fNet'),
    accel: val('accel'),
    twr: val('twr'),
    mdot: val('mdot'),
    propellant: val('propellant'),
    gravityLoss: val('gravityLoss'),
    dragLoss: val('dragLoss'),
  }
}

/** Planet radius for a trajectory (m) — convenience for rendering curvature. */
export const trajectoryRadius = (traj: Trajectory): number => resolvePlanet(traj.params.planet).radius
