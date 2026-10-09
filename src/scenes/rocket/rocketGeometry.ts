import {
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  Shape,
  Vector2,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * N→R-1 — the museum's procedural teaching rocket (no real vehicle, no livery).
 * Local frame: y up, aft skirt bottom at y = 0, nozzle hanging below into the launch mount.
 * Diameter matches the simulation default (2.4 m), so drag area A = πd²/4 is the one drawn.
 */
export const RK = {
  radius: 1.2,
  skirtTop: 2.4,
  tankTop: 21.6,
  interstageTop: 23.0,
  upperTop: 26.2,
  tip: 32,
  nozzleThroatY: -0.15,
  nozzleExitY: -1.75,
  nozzleExitR: 0.8,
} as const

export type RocketPart = 'skirt' | 'body' | 'interstage' | 'upper' | 'fairing' | 'tip' | 'fins' | 'nozzle' | 'raceway' | 'heatshield'

const SEG = 96

/** Tangent ogive nose profile from radius R at its base to a point over length L. */
function ogive(R: number, L: number, y0: number, n = 40): Vector2[] {
  const rho = (R * R + L * L) / (2 * R)
  const pts: Vector2[] = []
  for (let i = 0; i <= n; i++) {
    const s = i / n
    const y = s * L
    const r = Math.sqrt(Math.max(0, rho * rho - y * y)) + R - rho
    pts.push(new Vector2(Math.max(r, 0.0001), y0 + y))
  }
  return pts
}

function at(geo: BufferGeometry, y: number): BufferGeometry {
  geo.applyMatrix4(new Matrix4().makeTranslation(0, y, 0))
  return geo
}

export function buildRocketParts(): Record<RocketPart, BufferGeometry> {
  const R = RK.radius

  // aft skirt: a gentle flare over the engine section
  const skirt = new LatheGeometry(
    [
      new Vector2(1.0, 0.0),
      new Vector2(1.34, 0.02),
      new Vector2(1.33, 0.32),
      new Vector2(1.24, 1.5),
      new Vector2(R + 0.004, RK.skirtTop),
    ],
    SEG,
  )

  const bodyH = RK.tankTop - RK.skirtTop
  const body = at(new CylinderGeometry(R, R, bodyH, SEG, 1, true), RK.skirtTop + bodyH / 2)
  const isH = RK.interstageTop - RK.tankTop
  const interstage = at(new CylinderGeometry(R + 0.006, R + 0.006, isH, SEG, 1, true), RK.tankTop + isH / 2)
  const upH = RK.upperTop - RK.interstageTop
  const upper = at(new CylinderGeometry(R, R, upH, SEG, 1, true), RK.interstageTop + upH / 2)

  const noseL = RK.tip - RK.upperTop
  const nosePts = ogive(R, noseL, RK.upperTop)
  const cut = nosePts.length - 5
  const fairing = new LatheGeometry(nosePts.slice(0, cut + 1), SEG)
  const tip = new LatheGeometry(nosePts.slice(cut), SEG)

  // four swept fins at the base
  const fin = new Shape()
  fin.moveTo(0, 0.25)
  fin.lineTo(0, 3.1)
  fin.lineTo(1.05, 1.15)
  fin.lineTo(1.05, 0.05)
  fin.lineTo(0, 0.25)
  const finGeo = new ExtrudeGeometry(fin, { depth: 0.07, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 })
  finGeo.translate(0, 0, -0.035)
  const fins: BufferGeometry[] = []
  for (let i = 0; i < 4; i++) {
    const g = finGeo.clone()
    g.applyMatrix4(new Matrix4().makeTranslation(R - 0.04, 0, 0))
    g.applyMatrix4(new Matrix4().makeRotationY((i * Math.PI) / 2 + Math.PI / 4))
    fins.push(g)
  }
  finGeo.dispose()

  // engine bell: throat → exit (a bell contour), open, double-sided material
  const bellPts: Vector2[] = []
  const n = 24
  for (let i = 0; i <= n; i++) {
    const s = i / n
    const r = 0.3 + (RK.nozzleExitR - 0.3) * (1 - Math.pow(1 - s, 1.8))
    bellPts.push(new Vector2(r, RK.nozzleThroatY - s * (RK.nozzleThroatY - RK.nozzleExitY)))
  }
  bellPts.unshift(new Vector2(0.42, 0.05), new Vector2(0.32, -0.05))
  const nozzle = new LatheGeometry(bellPts.reverse(), 48)

  const heatshield = new CylinderGeometry(1.0, 1.0, 0.06, SEG, 1, false)
  heatshield.translate(0, 0.03, 0)

  const raceway = new CylinderGeometry(0.07, 0.07, bodyH - 0.6, 8, 1, false)
  raceway.applyMatrix4(new Matrix4().makeTranslation(R + 0.035, RK.skirtTop + bodyH / 2, 0))
  raceway.applyMatrix4(new Matrix4().makeRotationY(Math.PI * 0.62))

  return {
    skirt,
    body,
    interstage,
    upper,
    fairing,
    tip,
    fins: mergeGeometries(fins)!,
    nozzle,
    raceway,
    heatshield,
  }
}

/**
 * One merged, non-indexed geometry of the visible hull (position + normal only) for
 * MeshSurfaceSampler — the glyph swarm assembles onto exactly these surfaces.
 */
export function buildRocketSampleGeometry(): BufferGeometry {
  const parts = buildRocketParts()
  const keep: RocketPart[] = ['skirt', 'body', 'interstage', 'upper', 'fairing', 'tip', 'fins', 'nozzle']
  const geos = keep.map((k) => {
    const g = parts[k].index ? parts[k].toNonIndexed() : parts[k].clone()
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name)
    return g
  })
  Object.values(parts).forEach((g) => g.dispose())
  const merged = mergeGeometries(geos)!
  geos.forEach((g) => g.dispose())
  return merged
}
