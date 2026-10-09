import { G0, PLANETS, type Planet } from '../core/constants'

/**
 * ROCKET — single-stage point-mass ascent over a spherical, non-rotating planet.
 *
 * Educational model (labelled on screen): constant thrust and specific impulse, constant drag
 * coefficient, exponential isothermal atmosphere, inverse-square gravity, and a simple pitch
 * program — vertical rise, a small pitch-over "kick", then a gravity turn in which thrust stays
 * aligned with the velocity. Not an orbital launch planner.
 *
 * State (planar, flight-path form — the textbook gravity-turn equations):
 *   v  speed (m/s)                 v̇ = (T − D)/m − g(h)·sin γ
 *   γ  flight-path angle (rad)     γ̇ = −(g(h)/v − v/(R + h))·cos γ      (0 before the kick)
 *   h  altitude (m)                ḣ = v·sin γ
 *   x  downrange distance (m)      ẋ = R·v·cos γ / (R + h)
 *   m  mass (kg)                   ṁ = −T / (I_sp·g₀)
 * with D = ½·ρ(h)·v²·C_d·A,  ρ(h) = ρ₀·e^(−h/H),  g(h) = g₀(R/(R + h))².
 *
 * Multiplying the first line by m gives the force balance shown on screen:
 *   F_net = T − m·g·sin γ − D        (vertical flight: sin γ = 1 → F_net = T − mg − D)
 *
 * Two loss integrals ride along so the Δv budget can be shown honestly:
 *   gravity loss = ∫ g·sin γ dt,  drag loss = ∫ D/m dt   (while the engine burns, after liftoff)
 */

export type PlanetId = Planet['id']

export interface RocketParams {
  /** engine thrust T (N), constant while propellant remains */
  thrust: number
  /** specific impulse I_sp (s) */
  isp: number
  /** structure + engines (kg) */
  dryMass: number
  /** propellant at ignition (kg) */
  propellantMass: number
  /** payload (kg) */
  payloadMass: number
  /** body diameter (m); reference area A = πd²/4 */
  diameter: number
  /** drag coefficient C_d (constant — real C_d varies with Mach number) */
  cd: number
  /** include aerodynamic drag */
  dragEnabled: boolean
  /** gravity/atmosphere preset */
  planet: PlanetId | Planet
  /** pitch-over angle θ (deg) applied at the end of the vertical rise */
  pitchKickDeg: number
  /** speed at which the pitch-over happens (m/s) */
  pitchKickSpeed: number
}

export const DEFAULT_ROCKET: RocketParams = {
  thrust: 1_240_000,
  isp: 300,
  dryMass: 8_000,
  propellantMass: 88_000,
  payloadMass: 2_000,
  diameter: 2.4,
  cd: 0.35,
  dragEnabled: true,
  planet: 'earth',
  pitchKickDeg: 0.7,
  pitchKickSpeed: 60,
}

/** Indices into the state vector. */
export const S = { v: 0, gamma: 1, h: 2, x: 3, m: 4, gLoss: 5, dLoss: 6 } as const
export const STATE_SIZE = 7

export function resolvePlanet(p: PlanetId | Planet): Planet {
  return typeof p === 'string' ? PLANETS[p] : p
}

/** Reference area A = πd²/4 (m²). */
export const referenceArea = (d: number): number => (Math.PI * d * d) / 4
/** Initial mass m₀ (kg). */
export const initialMass = (p: RocketParams): number => p.dryMass + p.propellantMass + p.payloadMass
/** Mass at burnout m_f (kg). */
export const finalMass = (p: RocketParams): number => p.dryMass + p.payloadMass
/** Propellant mass flow ṁ = T/(I_sp·g₀) (kg/s). */
export const massFlow = (p: RocketParams): number => p.thrust / (p.isp * G0)
/** Ideal burn time (s), if the engine fires continuously. */
export const burnTime = (p: RocketParams): number => {
  const mdot = massFlow(p)
  return mdot > 0 ? p.propellantMass / mdot : Infinity
}
/** Tsiolkovsky Δv = I_sp·g₀·ln(m₀/m_f) (m/s). */
export const idealDeltaV = (p: RocketParams): number => p.isp * G0 * Math.log(initialMass(p) / finalMass(p))
/** Thrust-to-weight ratio at ignition on the surface. */
export const liftoffTWR = (p: RocketParams): number => p.thrust / (initialMass(p) * resolvePlanet(p.planet).g)

/** Local gravity g(h) = g₀(R/(R+h))² (m/s²). */
export const gravityAt = (planet: Planet, h: number): number => {
  const k = planet.radius / (planet.radius + h)
  return planet.g * k * k
}
/** Air density ρ(h) = ρ₀·e^(−h/H) (kg/m³). */
export const densityAt = (planet: Planet, h: number): number =>
  planet.rho0 > 0 ? planet.rho0 * Math.exp(-Math.max(h, 0) / planet.scaleHeight) : 0

/** Flags that select the branch of the equations; constant within an integration interval. */
export interface Phase {
  onPad: boolean
  pitched: boolean
  engineOn: boolean
}

/**
 * Builds the right-hand side f(t, y) for the current parameters and phase.
 * Allocation-free: the returned closure reads `phase` by reference.
 */
export function makeDerivative(params: RocketParams, phase: Phase) {
  const planet = resolvePlanet(params.planet)
  const R = planet.radius
  const area = referenceArea(params.diameter)
  const cdA = params.cd * area
  const exhaust = params.isp * G0

  return (_t: number, y: Float64Array, out: Float64Array): void => {
    const m = y[S.m]
    const T = phase.engineOn ? params.thrust : 0
    const mdot = phase.engineOn && exhaust > 0 ? T / exhaust : 0

    if (phase.onPad) {
      // Held by the pad: the pad's reaction balances weight minus thrust. Only mass changes.
      out.fill(0)
      out[S.m] = -mdot
      return
    }

    const v = y[S.v]
    const gamma = y[S.gamma]
    const h = y[S.h]
    const r = R + h
    const g = gravityAt(planet, h)
    const rho = params.dragEnabled ? densityAt(planet, h) : 0
    const D = 0.5 * rho * v * Math.abs(v) * cdA
    const sinG = Math.sin(gamma)
    const cosG = Math.cos(gamma)

    out[S.v] = (T - D) / m - g * sinG
    // Before the kick the flight is exactly vertical (γ = 90°, cos γ = 0) — keep it so.
    // Guard v away from 0 so the expression stays finite in degenerate near-vertical coasts.
    const vSafe = Math.max(Math.abs(v), 0.5)
    out[S.gamma] = phase.pitched ? -(g / vSafe - vSafe / r) * cosG : 0
    out[S.h] = v * sinG
    out[S.x] = (R * v * cosG) / r
    out[S.m] = -mdot
    out[S.gLoss] = phase.engineOn ? g * sinG : 0
    out[S.dLoss] = phase.engineOn ? D / m : 0
  }
}

/** Two-body orbital elements from the flight-path state (μ = g₀R²). */
export function orbitFromState(planet: Planet, v: number, gamma: number, h: number) {
  const mu = planet.g * planet.radius * planet.radius
  const r = planet.radius + h
  const energy = 0.5 * v * v - mu / r
  const angMom = r * v * Math.cos(gamma)
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * angMom * angMom) / (mu * mu)))
  if (energy >= 0) return { energy, e, periapsis: NaN, apoapsis: Infinity, escape: true }
  const a = -mu / (2 * energy)
  return { energy, e, periapsis: a * (1 - e) - planet.radius, apoapsis: a * (1 + e) - planet.radius, escape: false }
}
