import { fmtFixed, fmtSig, joinQty, missionClock, qty, type Formatted } from '../../lib/format'
import { G0 } from '../../sim/core/constants'
import { finalMass, initialMass, liftoffTWR, massFlow, referenceArea, resolvePlanet } from '../../sim/rocket/model'
import { rocket } from './runtime'

/** Read functions for every rocket readout: one place, one model, one set of units. */
const v = () => rocket.view

export const read = {
  clock: (): Formatted => ({ value: missionClock(rocket.viewTime), unit: '' }),
  altitude: () => qty.length(v().h),
  velocity: () => qty.speed(v().v),
  accel: () => qty.accelG(v().accel),
  mass: () => qty.mass(v().m),
  twr: () => qty.ratio(v().twr),
  q: () => qty.pressure(v().q),
  thrust: () => qty.force(v().thrust),
  weight: () => qty.force(v().weight),
  drag: () => qty.force(v().drag),
  gamma: () => qty.angle(v().gamma),
  mdot: (): Formatted => ({ value: fmtSig(v().mdot, 3), unit: 'kg/s' }),
  propellant: () => qty.mass(v().propellant),
}

/** Compact strings for inline prose and the equation substitution lines. */
export const txt = {
  N: (x: number) => joinQty(qty.force(x)),
  NFull: (x: number) => `${fmtSig(x, 4)} N`,
  kg: (x: number) => `${fmtSig(x, 4)} kg`,
  t: (x: number) => joinQty(qty.mass(x)),
  m: (x: number) => joinQty(qty.length(x)),
  mps: (x: number) => joinQty(qty.speed(x)),
  g: (a: number) => joinQty(qty.accelG(a)),
  ms2: (a: number) => `${fmtFixed(a, 2)} m/s²`,
  pa: (x: number) => joinQty(qty.pressure(x)),
  deg: (rad: number) => `${fmtFixed((rad * 180) / Math.PI, 1)}°`,
  rho: (x: number) => `${fmtSig(x, 3)} kg/m³`,
  ratio: (x: number) => fmtFixed(x, 2),
  s: (x: number) => `${fmtFixed(x, 1)} s`,
}

/** Parameter-derived numbers (the model's formulas applied to the current lab settings). */
export const derived = {
  m0: () => initialMass(rocket.params),
  mf: () => finalMass(rocket.params),
  mdot: () => massFlow(rocket.params),
  twr0: () => liftoffTWR(rocket.params),
  area: () => referenceArea(rocket.params.diameter),
  planet: () => resolvePlanet(rocket.params.planet),
  idealDv: () => rocket.params.isp * G0 * Math.log(initialMass(rocket.params) / finalMass(rocket.params)),
}
