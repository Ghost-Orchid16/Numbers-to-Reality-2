import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  Matrix4,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Path,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  Uniform,
  Vector3,
  type Group,
  type SpotLight,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { rocketScroll } from '../../chapters/rocket/runtime'
import { CoordinateGrid } from '../../three/CoordinateGrid'
import { useDisposable } from '../../three/useDisposable'
import { applyDissolve, createDissolveUniforms } from './dissolve'
import { frame } from './frame'
import { makeSurfaceNoise } from './rocketTextures'
import { GROUND_Y } from './shots'

/**
 * The launch site at dusk — all procedural. Lives inside the floating-origin world group, so
 * every position here is in launch-frame metres (rocket base on the pad at the origin).
 */

const TOWER_X = 3.2
const TOWER_Z = -9.4
const TOWER_HALF = 2.0
const TOWER_TOP = 35

/** Lattice tower as beam segments [start, end, thickness]. */
function towerBeams(): [Vector3, Vector3, number][] {
  const beams: [Vector3, Vector3, number][] = []
  const xs = [TOWER_X - TOWER_HALF, TOWER_X + TOWER_HALF]
  const zs = [TOWER_Z - TOWER_HALF, TOWER_Z + TOWER_HALF]
  const corners = [
    [xs[0], zs[0]],
    [xs[1], zs[0]],
    [xs[1], zs[1]],
    [xs[0], zs[1]],
  ]
  for (const [x, z] of corners) beams.push([new Vector3(x, GROUND_Y, z), new Vector3(x, TOWER_TOP, z), 0.34])
  const step = 3.2
  let level = 0
  for (let y = GROUND_Y + 1.5; y <= TOWER_TOP + 0.01; y += step, level++) {
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = corners[i]
      const [x1, z1] = corners[(i + 1) % 4]
      beams.push([new Vector3(x0, y, z0), new Vector3(x1, y, z1), 0.2])
      if (y + step <= TOWER_TOP + 0.01) {
        const flip = (level + i) % 2 === 0
        beams.push([
          new Vector3(flip ? x0 : x1, y, flip ? z0 : z1),
          new Vector3(flip ? x1 : x0, y + step, flip ? z1 : z0),
          0.12,
        ])
      }
    }
  }
  // service arms, retracted: swung away from the vehicle, parallel to the tower face
  for (const y of [6.5, 18, 25.5]) {
    const z = TOWER_Z + TOWER_HALF
    beams.push([new Vector3(TOWER_X + TOWER_HALF, y, z), new Vector3(TOWER_X + TOWER_HALF + 6, y, z), 0.34])
    beams.push([new Vector3(TOWER_X + TOWER_HALF, y + 1.1, z), new Vector3(TOWER_X + TOWER_HALF + 6, y + 1.1, z), 0.16])
  }
  beams.push([new Vector3(TOWER_X, TOWER_TOP, TOWER_Z), new Vector3(TOWER_X, TOWER_TOP + 7, TOWER_Z), 0.16])
  return beams
}

function placeBeams(mesh: InstancedMesh, beams: [Vector3, Vector3, number][]): void {
  const m = new Matrix4()
  const q = new Quaternion()
  const up = new Vector3(0, 1, 0)
  const dir = new Vector3()
  const mid = new Vector3()
  const scale = new Vector3()
  beams.forEach(([a, b, t], i) => {
    dir.subVectors(b, a)
    const len = dir.length()
    q.setFromUnitVectors(up, dir.normalize())
    mid.addVectors(a, b).multiplyScalar(0.5)
    scale.set(t, len, t)
    m.compose(mid, q, scale)
    mesh.setMatrixAt(i, m)
  })
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

/** Concrete launch mount: a deck with a flame hole on four legs. */
function mountGeometry(): BufferGeometry {
  const s = new Shape()
  s.moveTo(-7, -7)
  s.lineTo(7, -7)
  s.lineTo(7, 7)
  s.lineTo(-7, 7)
  s.lineTo(-7, -7)
  const hole = new Path()
  hole.absarc(0, 0, 2.7, 0, Math.PI * 2, true)
  s.holes.push(hole)
  const deck = new ExtrudeGeometry(s, { depth: 1.5, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1 })
  deck.rotateX(-Math.PI / 2)
  deck.translate(0, -1.5, 0)
  const flat = (g: BufferGeometry) => (g.index ? g.toNonIndexed() : g.clone())
  const parts: BufferGeometry[] = [flat(deck)]
  deck.dispose()
  for (const [x, z] of [
    [-5.6, -5.6],
    [5.6, -5.6],
    [5.6, 5.6],
    [-5.6, 5.6],
  ]) {
    const leg = new BoxGeometry(2.2, -1.5 - GROUND_Y, 2.2)
    leg.translate(x, (GROUND_Y - 1.5) / 2, z)
    parts.push(flat(leg))
    leg.dispose()
  }
  // hold-down clamps around the aft skirt
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4
    const c = new BoxGeometry(0.7, 1.1, 0.5)
    c.translate(0, 0.55, 0)
    c.applyMatrix4(new Matrix4().makeRotationY(-a))
    c.applyMatrix4(new Matrix4().makeTranslation(Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75))
    parts.push(flat(c))
    c.dispose()
  }
  const merged = mergeGeometries(parts)!
  parts.forEach((p) => p.dispose())
  return merged
}

/**
 * Ground with a procedural surface: scrub and sand, a concrete apron with expansion joints and
 * scorch marks, a service road, and a coastline to the east beyond which the planet's ocean
 * shows. Uses the geometry's own coordinates = launch-frame metres.
 */
function makeGroundMaterial(presence: Uniform<number>): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.96, metalness: 0 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPresence = presence
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGround;
        uniform float uPresence;
        float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(gh(i), gh(i + vec2(1, 0)), u.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), u.x), u.y); }
        float gf(vec2 p) { return 0.5 * gn(p) + 0.25 * gn(p * 2.1) + 0.125 * gn(p * 4.3) + 0.0625 * gn(p * 8.7); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 gp = vGround.xz;
        float coastX = 760.0 + (gf(vec2(gp.y * 0.0035, 3.7)) - 0.5) * 300.0;
        if (gp.x > coastX) discard;
        float n1 = gf(gp * 0.0045);
        float n2 = gf(gp * 0.06);
        vec3 col = mix(vec3(0.05, 0.055, 0.035), vec3(0.20, 0.17, 0.12), smoothstep(0.35, 0.68, n1));
        col *= 0.7 + 0.6 * n2;
        float beach = smoothstep(coastX - 45.0, coastX - 3.0, gp.x);
        col = mix(col, vec3(0.32, 0.29, 0.23), beach * 0.85);
        float road = (1.0 - smoothstep(3.2, 4.0, abs(gp.y - 34.0))) * (1.0 - step(-50.0, gp.x));
        road = max(road, (1.0 - smoothstep(3.2, 4.0, abs(gp.x + 50.0))) * step(34.0, gp.y));
        col = mix(col, vec3(0.085, 0.085, 0.09), road);
        float apron = 1.0 - smoothstep(54.0, 56.0, max(abs(gp.x + 4.0), abs(gp.y)));
        vec2 j = abs(fract(gp / 6.0) - 0.5);
        float joint = smoothstep(0.485, 0.5, max(j.x, j.y));
        vec3 concrete = vec3(0.30, 0.295, 0.28) * (0.82 + 0.36 * gn(gp * 0.7)) * (1.0 - 0.45 * joint);
        float d = length(gp);
        float scorch = exp(-d / 16.0) * 0.75 + (1.0 - smoothstep(3.0, 7.0, abs(gp.y))) * (1.0 - smoothstep(24.0, 46.0, abs(gp.x))) * 0.55;
        concrete *= 1.0 - min(scorch, 0.85);
        col = mix(col, concrete, apron);
        diffuseColor.rgb = col * uPresence;`,
      )
  }
  return mat
}

export function LaunchSite() {
  const site = useMemo(() => createDissolveUniforms('#FFD7A8'), [])
  const presence = useMemo(() => new Uniform(1), [])
  const group = useRef<Group>(null)
  const tower = useRef<InstancedMesh>(null)
  const beams = useMemo(towerBeams, [])
  const noise = useDisposable(() => {
    const t = makeSurfaceNoise(256, 23)
    t.repeat.set(6, 6)
    return t
  }, [])

  const geos = useDisposable(
    () => ({
      beam: new BoxGeometry(1, 1, 1),
      mount: mountGeometry(),
      ground: new PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2).translate(0, GROUND_Y, 0),
      trench: new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      mast: new CylinderGeometry(0.16, 0.42, 1, 10, 1),
      lampHead: new BoxGeometry(1.6, 0.9, 0.35),
      pole: new CylinderGeometry(0.16, 0.22, 1, 8, 1),
      beacon: new SphereGeometry(0.32, 12, 8),
      tank: new SphereGeometry(7.5, 32, 20),
      hangar: new BoxGeometry(150, 72, 95),
      windows: new PlaneGeometry(120, 2.2),
    }),
    [],
  )

  const mats = useDisposable(() => {
    const concrete = new MeshPhysicalMaterial({ color: '#8C877D', roughness: 0.88, roughnessMap: noise, bumpMap: noise, bumpScale: 0.6 })
    const steel = new MeshPhysicalMaterial({ color: '#30333A', metalness: 0.75, roughness: 0.42, clearcoat: 0.3 })
    const paintedSteel = new MeshPhysicalMaterial({ color: '#5E6168', metalness: 0.4, roughness: 0.5 })
    const dark = new MeshStandardMaterial({ color: '#07070A', roughness: 1 })
    const silhouette = new MeshStandardMaterial({ color: '#16171D', roughness: 0.9 })
    const ground = makeGroundMaterial(presence)
    ground.envMapIntensity = 0.3
    concrete.envMapIntensity = 0.45
    for (const m of [concrete, steel, paintedSteel]) applyDissolve(m, site, 'world')
    return {
      concrete,
      steel,
      paintedSteel,
      dark,
      silhouette,
      ground,
      lamp: new MeshBasicMaterial({ color: new Color(2.4, 2.6, 2.9), toneMapped: false }),
      beacon: new MeshBasicMaterial({ color: new Color(9, 0.5, 0.3), toneMapped: false }),
      window: new MeshBasicMaterial({ color: new Color(2.4, 1.6, 0.8), toneMapped: false }),
      wire: new LineBasicMaterial({ color: '#2B2E36', transparent: true, opacity: 0.8 }),
    }
  }, [noise, site, presence])

  useLayoutEffect(() => {
    if (tower.current) placeBeams(tower.current, beams)
  }, [beams])

  // lightning-protection masts and the catenary wires between their tops
  const masts = useMemo(
    () =>
      [
        [-54, -36],
        [40, -44],
        [47, 33],
      ].map(([x, z]) => new Vector3(x, GROUND_Y, z)),
    [],
  )
  const wires = useDisposable(() => {
    const pts: number[] = []
    const H = 74
    for (let i = 0; i < masts.length; i++) {
      const a = masts[i].clone().setY(GROUND_Y + H)
      const b = masts[(i + 1) % masts.length].clone().setY(GROUND_Y + H)
      const n = 32
      for (let k = 0; k < n; k++) {
        for (const kk of [k, k + 1]) {
          const t = kk / n
          const p = a.clone().lerp(b, t)
          p.y -= Math.sin(Math.PI * t) * 9 // sag
          pts.push(p.x, p.y, p.z)
        }
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [masts])

  const floods = useMemo(
    () =>
      [
        [-30, -20],
        [31, 24],
        [26, -30],
      ].map(([x, z]) => new Vector3(x, GROUND_Y, z)),
    [],
  )
  const spotTargets = useMemo(() => floods.map(() => new Object3D()), [floods])
  const spots = useRef<(SpotLight | null)[]>([])
  const grid = useRef<Group>(null)
  const beaconsRef = useRef<Group>(null)

  useFrame((state) => {
    site.uReveal.value = frame.handoff.presence
    presence.value = frame.handoff.presence
    const g = group.current
    if (g) g.visible = frame.handoff.presence > 0.001 && frame.altitude < 60000
    // aviation beacons blink at 1 Hz
    if (beaconsRef.current) beaconsRef.current.visible = Math.sin(state.clock.elapsedTime * Math.PI * 2) > -0.2
    for (const s of spots.current) if (s) s.intensity = 2200 * frame.handoff.presence
    // the lab's "to scale" layer: a 10 m grid on the apron while the rocket stands there
    if (grid.current) grid.current.visible = rocketScroll.section === 'lab' && frame.altitude < 400
  })

  return (
    <group ref={group} name="launch-site">
      <mesh geometry={geos.ground} material={mats.ground} receiveShadow />
      {/* flame trench running out both sides of the mount */}
      <mesh geometry={geos.trench} material={mats.dark} position={[0, GROUND_Y + 0.03, 0]} scale={[72, 1, 8]} />
      <mesh geometry={geos.mount} material={mats.concrete} castShadow receiveShadow />
      <group ref={grid} position={[0, GROUND_Y + 0.06, 0]} visible={false}>
        <CoordinateGrid size={100} spacing={10} major={5} color="#FFC857" opacity={0.08} />
      </group>
      <instancedMesh ref={tower} args={[geos.beam, mats.steel, beams.length]} castShadow receiveShadow />
      {masts.map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={geos.mast} material={mats.paintedSteel} position={[0, 37, 0]} scale={[1, 74, 1]} castShadow />
        </group>
      ))}
      <lineSegments geometry={wires} material={mats.wire} />
      {floods.map((p, i) => (
        <group key={i} position={p}>
          <mesh geometry={geos.pole} material={mats.paintedSteel} position={[0, 9, 0]} scale={[1, 18, 1]} />
          <mesh geometry={geos.lampHead} material={mats.lamp} position={[0, 18.4, 0]} lookAt={new Vector3(-p.x, 12, -p.z)} />
          <primitive object={spotTargets[i]} position={[-p.x, 12 - GROUND_Y, -p.z]} />
          <spotLight
            ref={(el) => {
              spots.current[i] = el
            }}
            position={[0, 18.2, 0]}
            target={spotTargets[i]}
            color="#E8F0FF"
            angle={0.32}
            penumbra={0.7}
            decay={2}
            distance={0}
            intensity={0}
          />
        </group>
      ))}
      <group ref={beaconsRef}>
        <mesh geometry={geos.beacon} material={mats.beacon} position={[TOWER_X, TOWER_TOP + 7.3, TOWER_Z]} />
        {masts.map((p, i) => (
          <mesh key={i} geometry={geos.beacon} material={mats.beacon} position={[p.x, GROUND_Y + 74.4, p.z]} />
        ))}
      </group>
      {/* distant water tower and assembly hangar, silhouetted against the dusk */}
      <group position={[-230, GROUND_Y, -170]}>
        {[
          [-5, -5],
          [5, -5],
          [5, 5],
          [-5, 5],
        ].map(([x, z], i) => (
          <mesh key={i} geometry={geos.pole} material={mats.silhouette} position={[x, 18, z]} scale={[2.2, 36, 2.2]} />
        ))}
        <mesh geometry={geos.tank} material={mats.silhouette} position={[0, 41, 0]} />
      </group>
      <group position={[-760, GROUND_Y + 36, -620]}>
        <mesh geometry={geos.hangar} material={mats.silhouette} />
        <mesh geometry={geos.windows} material={mats.window} position={[0, -24, 47.6]} />
      </group>
    </group>
  )
}
