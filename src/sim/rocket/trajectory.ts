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
  /** first time the rocket is more than 250 m up (its exhaust no longer reaches the pad) */
  steamEnd: number | null
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
  let steamEnd: number | null = null

  const record = (s: RocketSnapshot) => {
    track.push({
      ...s,
      onPad: s.onPad ? 1 : 0,
      engineOn: s.engineOn ? 1 : 0,
      pitched: s.pitched ? 1 : 0,
    })
    if (s.h > maxAltitude) maxAltitude = s.h
    if (steamEnd === null && s.h > 250) steamEnd = s.t
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
    steamEnd,
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

/**
 * Interpolated snapshot at time t (flags taken from the last sample at or before t).
 * Pass `out` to fill an existing snapshot instead of allocating one (the per-frame path).
 */
export function sampleTrajectory(traj: Trajectory, t: number, out?: RocketSnapshot): RocketSnapshot {
  const tr = traj.track
  const tc = Math.max(0, Math.min(t, traj.duration))
  const o = out ?? ({} as RocketSnapshot)
  o.t = tc
  o.v = tr.sample('v', tc)
  o.gamma = tr.sample('gamma', tc)
  o.h = tr.sample('h', tc)
  o.x = tr.sample('x', tc)
  o.m = tr.sample('m', tc)
  o.onPad = tr.sampleStep('onPad', tc) > 0.5
  o.pitched = tr.sampleStep('pitched', tc) > 0.5
  o.engineOn = tr.sampleStep('engineOn', tc) > 0.5
  o.thrust = tr.sample('thrust', tc)
  o.g = tr.sample('g', tc)
  o.weight = tr.sample('weight', tc)
  o.rho = tr.sample('rho', tc)
  o.drag = tr.sample('drag', tc)
  o.q = tr.sample('q', tc)
  o.fFree = tr.sample('fFree', tc)
  o.fNet = tr.sample('fNet', tc)
  o.accel = tr.sample('accel', tc)
  o.twr = tr.sample('twr', tc)
  o.mdot = tr.sample('mdot', tc)
  o.propellant = tr.sample('propellant', tc)
  o.gravityLoss = tr.sample('gravityLoss', tc)
  o.dragLoss = tr.sample('dragLoss', tc)
  return o
}

/** Planet radius for a trajectory (m) — convenience for rendering curvature. */
export const trajectoryRadius = (traj: Trajectory): number => resolvePlanet(traj.params.planet).radius
