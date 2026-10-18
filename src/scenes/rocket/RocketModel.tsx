import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, MeshPhysicalMaterial, type Group, type Mesh } from 'three'
import { ensureWorldFont } from '../../design/fonts'
import { useDisposable } from '../../three/useDisposable'
import { applyDissolve, createDissolveUniforms } from './dissolve'
import { frame } from './frame'
import { Plume } from './Plume'
import { buildRocketParts, RK, type RocketPart } from './rocketGeometry'
import { drawBodyDecal, makeBodyDecal, makeSurfaceNoise } from './rocketTextures'
import { ROCKET_YAW } from './shots'

type MatKey = 'paint' | 'decal' | 'carbon' | 'metal' | 'trim'

const PART_MATERIAL: Record<RocketPart, MatKey> = {
  skirt: 'carbon',
  body: 'decal',
  interstage: 'carbon',
  upper: 'paint',
  fairing: 'paint',
  tip: 'carbon',
  fins: 'carbon',
  nozzle: 'metal',
  raceway: 'trim',
  heatshield: 'carbon',
}

/**
 * The N→R-1 rocket. Sits at the render origin; RocketScene moves the world around it.
 * It materialises from the hero's glyphs through the shared dissolve threshold.
 */
export function RocketModel() {
  const group = useRef<Group>(null)
  const body = useRef<Group>(null)
  const nozzleGlow = useRef<Mesh>(null)

  const geos = useDisposable(buildRocketParts, [])
  const decal = useMemo(makeBodyDecal, [])
  const noise = useDisposable(() => makeSurfaceNoise(256, 11), [])
  const dissolve = useMemo(() => createDissolveUniforms('#FFE2B8'), [])

  const textures = useDisposable(() => {
    const paintNoise = noise.clone()
    paintNoise.repeat.set(3, 8)
    const carbonNoise = noise.clone()
    carbonNoise.repeat.set(10, 10)
    return { paintNoise, carbonNoise, decal: decal.texture }
  }, [noise, decal])

  const mats = useDisposable(() => {
    const { paintNoise, carbonNoise } = textures
    const paint = new MeshPhysicalMaterial({
      color: '#F3F0EA',
      roughness: 0.46,
      roughnessMap: paintNoise,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      sheen: 0.15,
      sheenColor: new Color('#FFE7CF'),
    })
    const decalMat = paint.clone()
    decalMat.map = decal.texture
    decalMat.color.set('#FFFFFF')
    const carbon = new MeshPhysicalMaterial({
      color: '#15161A',
      roughness: 0.58,
      roughnessMap: carbonNoise,
      clearcoat: 0.85,
      clearcoatRoughness: 0.22,
      metalness: 0.1,
    })
    const metal = new MeshPhysicalMaterial({
      color: '#5A4A42',
      metalness: 1,
      roughness: 0.3,
      side: DoubleSide,
      emissive: new Color('#FF6B1F'),
      emissiveIntensity: 0,
      iridescence: 0.35,
      iridescenceIOR: 1.6,
    })
    const trim = new MeshPhysicalMaterial({ color: '#BDB8AE', roughness: 0.5, clearcoat: 0.5 })
    const all: Record<MatKey, MeshPhysicalMaterial> = { paint, decal: decalMat, carbon, metal, trim }
    for (const m of Object.values(all)) applyDissolve(m, dissolve, 'object')
    return all
  }, [textures, decal, dissolve])

  // stencil lettering appears once the chapter's typeface has loaded
  useEffect(() => {
    let alive = true
    void ensureWorldFont('rocket').then(() => {
      if (!alive) return
      drawBodyDecal(decal.canvas, true)
      decal.texture.needsUpdate = true
    })
    return () => {
      alive = false
    }
  }, [decal])

  useFrame(() => {
    const g = group.current
    if (!g) return
    g.rotation.set(0, 0, -frame.pitch)
    dissolve.uReveal.value = frame.handoff.reveal
    // only the hull hides before the reveal; the group (and the plume's light) stays in the scene
    // so the light count never changes. The plume and the throat glow only show while the engine
    // fires, which never happens before the reveal.
    if (body.current) body.current.visible = frame.handoff.reveal > 0.001
    const metal = mats.metal
    // nozzle interior lit by its own exhaust
    metal.emissiveIntensity = frame.firing ? 0.35 + 0.25 * frame.thrustFrac : 0
    if (nozzleGlow.current) nozzleGlow.current.visible = frame.firing
  })

  return (
    <group ref={group} name="rocket">
      <group ref={body} rotation-y={ROCKET_YAW}>
        {(Object.keys(PART_MATERIAL) as RocketPart[]).map((k) => (
          <mesh key={k} geometry={geos[k]} material={mats[PART_MATERIAL[k]]} castShadow receiveShadow />
        ))}
      </group>
      {/* white-hot throat seen inside the bell */}
      <mesh ref={nozzleGlow} position={[0, RK.nozzleThroatY - 0.35, 0]} visible={false}>
        <cylinderGeometry args={[0.28, 0.5, 0.7, 24, 1, true]} />
        <meshBasicMaterial color={[6, 4.2, 2.6]} toneMapped={false} side={DoubleSide} />
      </mesh>
      <Plume />
    </group>
  )
}
