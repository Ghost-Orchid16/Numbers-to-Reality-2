import { describe, expect, it } from 'vitest'
import { G0, type Planet } from '../core/constants'
import {
  DEFAULT_ROCKET,
  finalMass,
  idealDeltaV,
  initialMass,
  massFlow,
  orbitFromState,
  type RocketParams,
} from './model'
import { RocketSim } from './rocketSim'
import { computeTrajectory, sampleTrajectory } from './trajectory'

/** A planet so large that g is constant over the flight, with no air. */
const flatAirless: Planet = {
  id: 'earth',
  name: 'Flat test planet',
  g: 9.81,
  radius: 1e15,
  rho0: 0,
  scaleHeight: 1,
  orbitFloor: 0,
}
const SECOND = 240 // substeps per simulated second

const vertical = (patch: Partial<RocketParams>): RocketParams => ({
  ...DEFAULT_ROCKET,
  pitchKickDeg: 0,
  ...patch,
})

describe('rocket — kinematics', () => {
  it('no drag + constant mass matches s = ut + ½at²', () => {
    // I_sp → ∞ gives ṁ → 0: constant mass, constant thrust, constant g.
    const p = vertical({ planet: flatAirless, isp: 1e12, dragEnabled: false })
    const sim = new RocketSim(p)
    const m = initialMass(p)
    const a = p.thrust / m - flatAirless.g
    sim.stepN(10 * SECOND)
    const s = sim.metrics()
    expect(sim.time).toBeCloseTo(10, 9)
    expect(s.h).toBeCloseTo(0.5 * a * 100, 6) // u = 0
    expect(s.v).toBeCloseTo(a * 10, 8)
    expect(s.accel).toBeCloseTo(a, 9)
  })

  it('reaches the Tsiolkovsky Δv with no gravity and no drag', () => {
    const p = vertical({ planet: { ...flatAirless, g: 0 }, dragEnabled: false })
    const sim = new RocketSim(p)
    while (!sim.ended && sim.burnoutTime === null) sim.stepN(SECOND)
    expect(sim.burnoutTime).not.toBeNull()
    const dv = p.isp * G0 * Math.log(initialMass(p) / finalMass(p))
    expect(sim.state[0]).toBeCloseTo(dv, 3)
    expect(idealDeltaV(p)).toBeCloseTo(dv, 9)
  })

  it('burns out at exactly m_f after propellant / ṁ seconds', () => {
    const p = vertical({ planet: flatAirless, dragEnabled: false })
    const sim = new RocketSim(p)
    while (sim.burnoutTime === null && !sim.ended) sim.stepN(SECOND)
    expect(sim.burnoutTime).toBeCloseTo(p.propellantMass / massFlow(p), 9)
    expect(sim.metrics().m).toBe(finalMass(p))
    expect(sim.metrics().thrust).toBe(0)
  })

  it('accounts for every m/s: v_burnout = Δv_ideal − gravity loss − drag loss', () => {
    const tr = computeTrajectory(DEFAULT_ROCKET)
    const b = sampleTrajectory(tr, tr.burnoutTime!)
    expect(tr.burnoutSpeed!).toBeCloseTo(tr.idealDeltaV - b.gravityLoss - b.dragLoss, 0)
  })
})

describe('rocket — thrust-to-weight', () => {
  it('stays on the pad while TWR < 1 and lifts off when burning propellant makes TWR = 1', () => {
    const p: RocketParams = { ...DEFAULT_ROCKET, thrust: 900_000 }
    const sim = new RocketSim(p)
    expect(sim.metrics().twr).toBeLessThan(1)
    sim.stepN(5 * SECOND)
    expect(sim.metrics().h).toBe(0)
    expect(sim.metrics().v).toBe(0)
    expect(sim.metrics().fNet).toBe(0)
    expect(sim.metrics().fFree).toBeLessThan(0)
    sim.stepN(30 * SECOND)
    const expected = (initialMass(p) - p.thrust / 9.81) / massFlow(p)
    expect(sim.liftoffTime).toBeCloseTo(expected, 9)
    expect(sim.liftoffMass! * 9.81).toBeCloseTo(p.thrust, 3)
    expect(sim.metrics().h).toBeGreaterThan(0)
  })

  it('lifts off immediately when thrust is raised live past TWR 1', () => {
    const sim = new RocketSim({ ...DEFAULT_ROCKET, thrust: 800_000 })
    sim.stepN(2 * SECOND)
    expect(sim.liftoffTime).toBeNull()
    sim.setParams({ thrust: 1_400_000 })
    sim.stepN(1)
    expect(sim.liftoffTime).not.toBeNull()
    sim.stepN(2 * SECOND)
    expect(sim.metrics().h).toBeGreaterThan(0)
  })

  it('never leaves the pad when propellant runs out first', () => {
    // T < m_f·g: even with empty tanks the rocket is too heavy to lift.
    const sim = new RocketSim({ ...DEFAULT_ROCKET, thrust: 90_000 })
    sim.stepN(3600 * SECOND)
    expect(sim.ended).toBe('pad-burnout')
    expect(sim.metrics().h).toBe(0)
  })

  it('mass changes reset the flight; thrust changes do not', () => {
    const sim = new RocketSim(DEFAULT_ROCKET)
    sim.stepN(10 * SECOND)
    sim.setParams({ thrust: 1_300_000 })
    expect(sim.time).toBeGreaterThan(9.9)
    sim.setParams({ payloadMass: 5_000 })
    expect(sim.time).toBe(0)
    expect(sim.metrics().m).toBe(initialMass(sim.params))
  })
})

describe('rocket — atmosphere and max-Q', () => {
  it('finds max-Q at a plausible altitude and it is a true peak', () => {
    const tr = computeTrajectory(DEFAULT_ROCKET)
    const mq = tr.maxQ!
    expect(mq).not.toBeNull()
    expect(mq.h).toBeGreaterThan(5_000)
    expect(mq.h).toBeLessThan(20_000)
    const before = sampleTrajectory(tr, mq.t - 3).q
    const after = sampleTrajectory(tr, mq.t + 3).q
    expect(mq.q).toBeGreaterThan(before)
    expect(mq.q).toBeGreaterThan(after)
    // q = ½ρv² at the peak
    const s = sampleTrajectory(tr, mq.t)
    expect(Math.abs(s.q - 0.5 * s.rho * s.v * s.v) / s.q).toBeLessThan(1e-4)
  })

  it('live max-Q detection agrees with the precomputed trajectory', () => {
    const tr = computeTrajectory(DEFAULT_ROCKET)
    const sim = new RocketSim(DEFAULT_ROCKET)
    while (!sim.maxQ.passed) sim.stepN(1)
    expect(Math.abs(sim.maxQ.t - tr.maxQ!.t)).toBeLessThan(1 / 240)
    expect(sim.maxQ.q).toBeCloseTo(tr.maxQ!.q, -1)
  })

  it('drag off removes drag but not dynamic pressure', () => {
    const sim = new RocketSim({ ...DEFAULT_ROCKET, dragEnabled: false })
    sim.stepN(40 * SECOND)
    const s = sim.metrics()
    expect(s.drag).toBe(0)
    expect(s.q).toBeGreaterThan(0)
  })

  it('the Moon has no atmosphere: no drag, no max-Q', () => {
    const sim = new RocketSim({ ...DEFAULT_ROCKET, planet: 'moon' })
    sim.stepN(60 * SECOND)
    expect(sim.metrics().q).toBe(0)
    expect(sim.maxQ.q).toBe(0)
  })
})

describe('rocket — gravity turn and orbits', () => {
  it('pitches over at the programmed speed by the programmed angle', () => {
    const sim = new RocketSim(DEFAULT_ROCKET)
    while (sim.pitchTime === null) sim.stepN(1)
    expect(sim.metrics().v).toBeGreaterThanOrEqual(DEFAULT_ROCKET.pitchKickSpeed)
    expect(sim.metrics().v).toBeLessThan(DEFAULT_ROCKET.pitchKickSpeed + 0.1)
    expect((sim.metrics().gamma * 180) / Math.PI).toBeCloseTo(90 - DEFAULT_ROCKET.pitchKickDeg, 6)
  })

  it('conserves orbital energy while coasting without drag', () => {
    const sim = new RocketSim({ ...DEFAULT_ROCKET, dragEnabled: false })
    while (sim.burnoutTime === null) sim.stepN(SECOND)
    sim.stepN(1)
    const planet = { id: 'earth', name: 'Earth', g: 9.81, radius: 6_371_000, rho0: 1.225, scaleHeight: 8_500, orbitFloor: 100_000 } as Planet
    const e0 = orbitFromState(planet, sim.state[0], sim.state[1], sim.state[2]).energy
    sim.stepN(120 * SECOND)
    const e1 = orbitFromState(planet, sim.state[0], sim.state[1], sim.state[2]).energy
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(1e-9)
  })

  it('ends at apogee for a suborbital flight, and the coast apogee matches the two-body prediction', () => {
    const p = { ...DEFAULT_ROCKET, dragEnabled: false }
    const sim = new RocketSim(p)
    while (sim.burnoutTime === null) sim.stepN(SECOND)
    sim.stepN(1)
    const s = sim.metrics()
    const planet = { id: 'earth', name: 'Earth', g: 9.81, radius: 6_371_000, rho0: 1.225, scaleHeight: 8_500, orbitFloor: 100_000 } as Planet
    const predicted = orbitFromState(planet, s.v, s.gamma, s.h).apoapsis
    while (!sim.ended) sim.stepN(SECOND)
    expect(sim.ended).toBe('apogee')
    expect(Math.abs(sim.apogee!.h - predicted)).toBeLessThan(50) // within one substep of travel
  })

  it('the same rocket escapes the Moon (v > √(2gR))', () => {
    const sim = new RocketSim({ ...DEFAULT_ROCKET, planet: 'moon' })
    while (!sim.ended) sim.stepN(SECOND)
    expect(sim.ended).toBe('escape')
  })

  it('a pitch-over that is too aggressive bends the flight into the ground', () => {
    const sim = new RocketSim({ ...DEFAULT_ROCKET, pitchKickDeg: 4 })
    while (!sim.ended) sim.stepN(SECOND)
    expect(sim.ended).toBe('impact')
  })
})

describe('rocket — determinism', () => {
  it('gives identical states regardless of frame slicing', () => {
    const a = new RocketSim(DEFAULT_ROCKET)
    const b = new RocketSim(DEFAULT_ROCKET)
    for (let i = 0; i < 60 * 30; i++) a.step(1 / 60)
    const frames = [0.033, 0.0071, 0.016, 0.05, 0.0005, 0.1]
    let i = 0
    while (b.substeps < a.substeps) b.step(frames[i++ % frames.length])
    // b may overshoot by a few substeps; replay a to match exactly
    a.stepN(b.substeps - a.substeps)
    expect(b.substeps).toBe(a.substeps)
    expect(Array.from(b.state)).toEqual(Array.from(a.state))
  })
})
