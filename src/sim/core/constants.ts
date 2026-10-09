/**
 * Physical constants and planet models (SI units).
 *
 * Planet models are deliberately simple and are labelled as such wherever they are used:
 * a spherical, non-rotating body with inverse-square gravity and an isothermal
 * exponential atmosphere ρ(h) = ρ₀·e^(−h/H).
 */

/** Standard gravity. Used in the definition of specific impulse on every planet. */
export const G0 = 9.80665

export interface Planet {
  id: 'earth' | 'mars' | 'moon'
  name: string
  /** surface gravity g₀ of this body (m/s²) */
  g: number
  /** mean radius R (m) */
  radius: number
  /** surface air density ρ₀ (kg/m³); 0 = no atmosphere */
  rho0: number
  /** density scale height H (m) */
  scaleHeight: number
  /** lowest periapsis we count as a stable orbit (top of the sensible atmosphere / terrain) */
  orbitFloor: number
}

export const PLANETS: Record<Planet['id'], Planet> = {
  earth: { id: 'earth', name: 'Earth', g: 9.81, radius: 6_371_000, rho0: 1.225, scaleHeight: 8_500, orbitFloor: 100_000 },
  mars: { id: 'mars', name: 'Mars', g: 3.71, radius: 3_389_500, rho0: 0.02, scaleHeight: 11_100, orbitFloor: 80_000 },
  moon: { id: 'moon', name: 'Moon', g: 1.62, radius: 1_737_400, rho0: 0, scaleHeight: 1, orbitFloor: 10_000 },
}
