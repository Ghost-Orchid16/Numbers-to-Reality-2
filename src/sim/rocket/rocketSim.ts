import { G0 } from '../core/constants'
import { RK4 } from '../core/rk4'
import { FixedStepper } from '../core/stepper'
import type { Simulation } from '../core/types'
import {
  DEFAULT_ROCKET,
  S,
  STATE_SIZE,
  densityAt,
  finalMass,
  gravityAt,
  initialMass,
  makeDerivative,
  massFlow,
  orbitFromState,
  referenceArea,
  resolvePlanet,
  type Phase,
  type RocketParams,
} from './model'

export type EndReason = 'apogee' | 'orbit' | 'escape' | 'impact' | 'pad-burnout' | 'timeout'

/** Everything a readout or a scene may need, derived from one state by one function. */
export interface RocketSnapshot {
  t: number
  /** speed v (m/s) */
  v: number
  /** flight-path angle γ (rad) */
  gamma: number
  /** altitude h (m) */
  h: number
  /** downrange ground distance (m) */
  x: number
  /** current mass m (kg) */
  m: number
  onPad: boolean
  pitched: boolean
  engineOn: boolean
  /** current thrust T (N) — 0 after burnout */
  thrust: number
  /** local gravity g(h) (m/s²) */
  g: number
  /** weight m·g(h) (N) */
  weight: number
  /** air density ρ(h) (kg/m³) */
  rho: number
  /** drag D (N) — 0 when drag is switched off */
  drag: number
  /** dynamic pressure q = ½ρv² (Pa) */
  q: number
  /** T − m·g·sin γ − D (N): the unbalanced force along the flight path */
  fFree: number
  /** actual net force (N): 0 while the pad holds the rocket */
  fNet: number
  /** a = F_net/m (m/s²) */
  accel: number
  /** thrust-to-weight ratio T/(m·g(h)) */
  twr: number
  /** propellant mass flow ṁ (kg/s) */
  mdot: number
  /** propellant remaining (kg) */
  propellant: number
  /** ∫ g sin γ dt during the burn (m/s) */
  gravityLoss: number
  /** ∫ D/m dt during the burn (m/s) */
  dragLoss: number
}

export function snapshotFrom(
  params: RocketParams,
  y: Float64Array,
  phase: Phase,
  t: number,
  out?: RocketSnapshot,
): RocketSnapshot {
  const planet = resolvePlanet(params.planet)
  const h = y[S.h]
  const v = y[S.v]
  const gamma = y[S.gamma]
  const m = y[S.m]
  const g = gravityAt(planet, h)
  const rhoAir = densityAt(planet, h)
  const q = 0.5 * rhoAir * v * v
  const drag = params.dragEnabled ? q * params.cd * referenceArea(params.diameter) : 0
  const thrust = phase.engineOn ? params.thrust : 0
  const weight = m * g
  const fFree = thrust - weight * Math.sin(gamma) - drag
  const fNet = phase.onPad ? 0 : fFree
  const o = out ?? ({} as RocketSnapshot)
  o.t = t
  o.v = v
  o.gamma = gamma
  o.h = h
  o.x = y[S.x]
  o.m = m
  o.onPad = phase.onPad
  o.pitched = phase.pitched
  o.engineOn = phase.engineOn
  o.thrust = thrust
  o.g = g
  o.weight = weight
  o.rho = rhoAir
  o.drag = drag
  o.q = q
  o.fFree = fFree
  o.fNet = fNet
  o.accel = fNet / m
  o.twr = weight > 0 ? thrust / weight : Infinity
  o.mdot = phase.engineOn ? massFlow(params) : 0
  o.propellant = Math.max(0, m - finalMass(params))
  o.gravityLoss = y[S.gLoss]
  o.dragLoss = y[S.dLoss]
  return o
}

const RESET_KEYS: (keyof RocketParams)[] = ['dryMass', 'propellantMass', 'payloadMass', 'planet']

/**
 * Live rocket simulation. Fixed 1/240 s substeps (RK4); liftoff and burnout are located
 * exactly inside a substep by splitting it, so mass at burnout is exactly m_f.
 *
 * Live parameter changes: thrust, I_sp, drag, C_d, diameter and the pitch program apply
 * immediately (so a straining rocket can be pushed past TWR 1 and lift off). Mass and
 * planet changes reset the flight to the pad.
 */
export class RocketSim implements Simulation<RocketParams, RocketSnapshot> {
  private _params: RocketParams = DEFAULT_ROCKET
  private readonly y = new Float64Array(STATE_SIZE)
  private readonly rk = new RK4(STATE_SIZE)
  private readonly stepper = new FixedStepper()
  private readonly phase: Phase = { onPad: true, pitched: false, engineOn: true }
  private f = makeDerivative(this._params, this.phase)
  private t = 0
  private orbitChecked = false

  /** simulated-time limit for a live flight (s) */
  maxTime = 3600
  liftoffTime: number | null = null
  liftoffMass: number | null = null
  pitchTime: number | null = null
  burnoutTime: number | null = null
  apogee: { h: number; t: number; x: number } | null = null
  maxQ = { q: 0, t: 0, h: 0, v: 0, passed: false }
  ended: EndReason | null = null
  /** number of fixed substeps since reset — used by determinism tests */
  substeps = 0

  constructor(params: RocketParams = DEFAULT_ROCKET) {
    this.init(params)
  }

  get params(): Readonly<RocketParams> {
    return this._params
  }

  get time(): number {
    return this.t
  }

  /** Raw state vector (read-only by convention). */
  get state(): Float64Array {
    return this.y
  }

  get phaseFlags(): Readonly<Phase> {
    return this.phase
  }

  init(params: RocketParams): void {
    this._params = { ...params }
    this.f = makeDerivative(this._params, this.phase)
    this.reset()
  }

  setParams(patch: Partial<RocketParams>): void {
    const needsReset = RESET_KEYS.some((k) => k in patch && patch[k] !== this._params[k])
    this._params = { ...this._params, ...patch }
    this.f = makeDerivative(this._params, this.phase)
    if (needsReset) this.reset()
  }

  reset(): void {
    const p = this._params
    this.y.fill(0)
    this.y[S.gamma] = Math.PI / 2
    this.y[S.m] = initialMass(p)
    this.t = 0
    this.substeps = 0
    this.phase.onPad = true
    this.phase.pitched = false
    this.phase.engineOn = p.thrust > 0 && p.propellantMass > 0
    this.liftoffTime = null
    this.liftoffMass = null
    this.pitchTime = null
    this.burnoutTime = null
    this.apogee = null
    this.maxQ = { q: 0, t: 0, h: 0, v: 0, passed: false }
    this.ended = null
    this.orbitChecked = false
    this.stepper.reset()
    this.applyEvents()
  }

  step(dt: number): void {
    if (this.ended) return
    this.stepper.advance(dt, (h) => this.substep(h))
  }

  /** Advance exactly n fixed substeps (deterministic; used by trajectory precompute and tests). */
  stepN(n: number): void {
    for (let i = 0; i < n && !this.ended; i++) this.substep(this.stepper.h)
  }

  /** Current state; fills `out` when given (no allocation per frame). */
  metrics(out?: RocketSnapshot): RocketSnapshot {
    return snapshotFrom(this._params, this.y, this.phase, this.t, out)
  }

  dispose(): void {
    this.ended = this.ended ?? 'timeout'
  }

  private substep(h: number): boolean {
    if (this.ended) return false
    const p = this._params
    const planet = resolvePlanet(p.planet)
    const mf = finalMass(p)
    let remaining = h
    // Split the substep at liftoff / burnout so both happen at their exact instants.
    for (let guard = 0; remaining > 1e-12 && guard < 4; guard++) {
      let dt = remaining
      const mdot = this.phase.engineOn ? massFlow(p) : 0
      if (mdot > 0) {
        const toBurnout = (this.y[S.m] - mf) / mdot
        if (toBurnout < dt) dt = Math.max(0, toBurnout)
        if (this.phase.onPad) {
          const toLiftoff = (this.y[S.m] - p.thrust / planet.g) / mdot
          if (toLiftoff > 0 && toLiftoff < dt) dt = toLiftoff
        }
      }
      if (dt > 0) {
        this.rk.step(this.f, this.t, this.y, dt)
        this.t += dt
        remaining -= dt
      }
      this.applyEvents()
      if (this.ended) break
    }
    this.substeps++
    this.afterSubstep()
    return !this.ended
  }

  /** Phase changes that happen at an instant: burnout, liftoff. */
  private applyEvents(): void {
    const p = this._params
    const planet = resolvePlanet(p.planet)
    const mf = finalMass(p)
    if (this.phase.engineOn && this.y[S.m] <= mf + 1e-9) {
      this.phase.engineOn = false
      this.y[S.m] = mf
      this.burnoutTime = this.t
      if (this.phase.onPad) this.end('pad-burnout')
    }
    if (this.phase.onPad && this.phase.engineOn && p.thrust >= this.y[S.m] * planet.g * (1 - 1e-12)) {
      this.phase.onPad = false
      this.liftoffTime = this.t
      this.liftoffMass = this.y[S.m]
    }
  }

  private afterSubstep(): void {
    const p = this._params
    const planet = resolvePlanet(p.planet)
    const y = this.y

    // Pitch program: vertical rise, then a small kick, then a gravity turn.
    if (!this.phase.onPad && !this.phase.pitched && y[S.v] >= p.pitchKickSpeed) {
      this.phase.pitched = true
      y[S.gamma] = Math.PI / 2 - (p.pitchKickDeg * Math.PI) / 180
      this.pitchTime = this.t
    }

    // Max-Q: the first peak of q = ½ρv² after liftoff.
    if (!this.phase.onPad && !this.maxQ.passed) {
      const q = 0.5 * densityAt(planet, y[S.h]) * y[S.v] * y[S.v]
      if (q >= this.maxQ.q) this.maxQ = { q, t: this.t, h: y[S.h], v: y[S.v], passed: false }
      else if (this.maxQ.q > 0) this.maxQ.passed = true
    }

    if (this.phase.onPad) {
      if (this.t >= this.maxTime) this.end('timeout')
      return
    }

    if (y[S.h] < 0 && this.liftoffTime !== null && this.t > this.liftoffTime + 0.5) {
      y[S.h] = 0
      this.end('impact')
      return
    }

    if (!this.phase.engineOn) {
      if (!this.orbitChecked) {
        this.orbitChecked = true
        const o = orbitFromState(planet, y[S.v], y[S.gamma], y[S.h])
        if (o.escape) return this.end('escape')
        if (o.periapsis > planet.orbitFloor) return this.end('orbit')
      }
      if (y[S.v] * Math.sin(y[S.gamma]) <= 0) {
        this.apogee = { h: y[S.h], t: this.t, x: y[S.x] }
        return this.end('apogee')
      }
    }
    if (this.t >= this.maxTime) this.end('timeout')
  }

  private end(reason: EndReason): void {
    this.ended = reason
  }
}

/** Ideal Δv still available from the current mass (Tsiolkovsky). */
export const remainingDeltaV = (params: RocketParams, m: number): number =>
  params.isp * G0 * Math.log(m / finalMass(params))
