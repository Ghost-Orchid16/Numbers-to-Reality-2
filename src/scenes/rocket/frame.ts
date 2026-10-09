import { Vector3 } from 'three'
import { engineFiring, rocket } from '../../chapters/rocket/runtime'
import { DEFAULT_ROCKET, resolvePlanet } from '../../sim/rocket/model'
import { FULLY_REAL, type IntroPhases } from '../intro/phases'

/**
 * Per-frame state of the rocket world, derived once per frame from the runtime snapshot and
 * read by every component of the scene. Positions are in the launch frame (metres): origin at
 * the rocket's base on the pad, y up, downrange +x, over a curved planet. The scene renders
 * with a floating origin at the rocket, so float32 precision holds at 600 km altitude.
 */
export const frame = {
  time: -4,
  firing: false,
  /** thrust relative to the default engine (1.24 MN) */
  thrustFrac: 0,
  /** rocket base position in the launch frame (m) */
  pos: new Vector3(),
  /** local vertical at the rocket */
  up: new Vector3(0, 1, 0),
  /** body axis (thrust direction) */
  axis: new Vector3(0, 1, 0),
  /** body axis angle from the launch vertical, towards +x (rad) */
  pitch: 0,
  altitude: 0,
  /** ρ(h)/ρ₀ — 1 at sea level, 0 in vacuum */
  ambient: 1,
  onPad: true,
  planetRadius: 6_371_000,
  /** hero → rocket handoff factors */
  handoff: FULLY_REAL as IntroPhases,
  /** seconds since ignition (negative before) */
  ignitionAge: -4,
  /** time at which the exhaust stopped hitting the pad (rocket above 250 m) */
  steamEnd: 1e9,
}

export function updateFrame(handoff: IntroPhases): void {
  const v = rocket.view
  const planet = resolvePlanet(rocket.params.planet)
  const R = planet.radius
  const phi = v.x / R
  const r = R + v.h
  frame.pos.set(r * Math.sin(phi), r * Math.cos(phi) - R, 0)
  frame.up.set(Math.sin(phi), Math.cos(phi), 0)
  frame.pitch = Math.PI / 2 - v.gamma + phi
  frame.axis.set(Math.sin(frame.pitch), Math.cos(frame.pitch), 0)
  frame.altitude = v.h
  frame.ambient = planet.rho0 > 0 ? Math.exp(-Math.max(v.h, 0) / planet.scaleHeight) : 0
  frame.onPad = v.onPad
  frame.planetRadius = R
  frame.time = rocket.viewTime
  frame.firing = engineFiring()
  frame.thrustFrac = frame.firing ? v.thrust / DEFAULT_ROCKET.thrust : 0
  frame.ignitionAge = rocket.viewTime
  frame.handoff = handoff
  frame.steamEnd = steamEndTime()
}

/** When the climbing rocket's exhaust stops reaching the pad (h > 250 m). */
function steamEndTime(): number {
  if (rocket.mode === 'live') return rocket.liveSteamEnd ?? 1e9
  return rocket.trajectory.steamEnd ?? 1e9
}
