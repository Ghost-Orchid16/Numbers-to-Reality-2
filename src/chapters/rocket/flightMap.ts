import type { Trajectory } from '../../sim/rocket/trajectory'
import { COUNTDOWN } from './runtime'

/**
 * Scroll progress → simulated time for the pinned flight. Piecewise linear between the flight's
 * real events (liftoff, max-Q, burnout) of the trajectory computed for the current parameters,
 * so the slow, dramatic first seconds get more scroll than the long climb.
 */
export function flightKeys(tr: Trajectory): [number, number][] {
  const end = tr.duration
  const keys: [number, number][] = [
    [0, -COUNTDOWN - 1],
    [0.07, 0],
  ]
  if (tr.liftoffTime === null) {
    keys.push([0.96, end], [1, end])
    return keys
  }
  const tl = tr.liftoffTime
  const t1 = Math.min(tl + 10, end)
  const tb = Math.min(tr.burnoutTime ?? end, end)
  const tq = tr.maxQ ? Math.min(Math.max(tr.maxQ.t + 8, t1 + 4), tb) : t1 + 0.35 * (tb - t1)
  const tEnd = Math.min(tb + 18, end)
  keys.push([0.24, t1], [0.52, Math.max(tq, t1)], [0.82, Math.max(tb, tq)], [0.96, Math.max(tEnd, tb)], [1, Math.max(tEnd, tb)])
  return keys
}

export function flightTimeAt(p: number, tr: Trajectory): number {
  const keys = flightKeys(tr)
  if (p <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [p1, t1] = keys[i]
    const [p0, t0] = keys[i - 1]
    if (p <= p1) return t0 + ((t1 - t0) * (p - p0)) / Math.max(p1 - p0, 1e-9)
  }
  return keys[keys.length - 1][1]
}

/** Reduced motion: the scrub becomes a handful of key moments (crossfaded, not scrubbed). */
export function keyMoments(tr: Trajectory): number[] {
  const tl = tr.liftoffTime ?? 0
  const tb = tr.burnoutTime ?? tr.duration
  const m = [-COUNTDOWN, 0.5, tl + 6, tr.pitchTime !== null ? tr.pitchTime + 8 : tl + 25]
  if (tr.maxQ) m.push(tr.maxQ.t)
  m.push(Math.max(tb - 30, tl + 40), Math.min(tb + 6, tr.duration))
  return m.filter((t, i, a) => i === 0 || t > a[i - 1])
}
