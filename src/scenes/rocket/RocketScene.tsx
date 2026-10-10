import { Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, FogExp2, Vector3, type Camera, type DirectionalLight, type Group, type HemisphereLight } from 'three'
import { smoothstep } from '../../sim/core/math'
import { setAnchor } from '../../state/anchors'
import { useDirector } from '../../state/director'
import { usePrefs } from '../../state/prefs'
import { scrollState } from '../../state/scroll'
import { heatHaze } from '../../three/HeatHazeEffect'
import { useSceneReady } from '../../three/sceneReady'
import { FULLY_REAL, introPhases } from '../intro/phases'
import { frame, updateFrame } from './frame'
import { LaunchSite } from './LaunchSite'
import { Planet } from './Planet'
import { RocketCamera } from './RocketCamera'
import { RocketForces } from './RocketForces'
import { RocketModel } from './RocketModel'
import { RocketTrail } from './RocketTrail'
import { RK } from './rocketGeometry'
import { SkyDome } from './SkyDome'
import { SUN_DIR } from './skyChunk'
import { Steam } from './Steam'

const FOG = new Color(0.085, 0.07, 0.11)
const SUN_DUSK = new Color('#FFAA70')
const SUN_SPACE = new Color('#FFF6EA')

interface ScreenPoint {
  x: number
  y: number
  front: boolean
}

/** World point → CSS pixels, written into `out` (`p` is projected in place). */
function project(p: Vector3, camera: Camera, size: { width: number; height: number }, out: ScreenPoint): ScreenPoint {
  p.project(camera)
  out.x = (p.x * 0.5 + 0.5) * size.width
  out.y = (-p.y * 0.5 + 0.5) * size.height
  out.front = p.z < 1
  return out
}

/** Projects scene points for DOM annotations and drives the heat-haze effect. */
function ScreenLinks() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const reduced = usePrefs((s) => s.reducedMotion)
  const quality = useDirector((s) => s.quality)
  // scratch objects: the projections below run every frame and allocate nothing
  const v = useMemo(
    () => ({
      a: new Vector3(),
      b: new Vector3(),
      nose: { x: 0, y: 0, front: false },
      base: { x: 0, y: 0, front: false },
      tail: { x: 0, y: 0, front: false },
      origin: { x: 0, y: 0 },
      dir: { x: 0, y: 0 },
    }),
    [],
  )

  useFrame(() => {
    const nose = project(v.a.copy(frame.axis).multiplyScalar(RK.tip + 1), camera, size, v.nose)
    setAnchor('rocket-nose', nose.x, nose.y, nose.front)
    const base = project(v.a.copy(frame.axis).multiplyScalar(RK.nozzleExitY), camera, size, v.base)
    setAnchor('rocket-base', base.x, base.y, base.front)

    const haze = heatHaze()
    const strength =
      reduced || quality === 'low' || !frame.firing
        ? 0
        : 0.85 * smoothstep(0, 0.4, frame.ignitionAge) * (1 - smoothstep(600, 2500, frame.altitude))
    if (strength <= 0.001 || !base.front) {
      haze.off()
      return
    }
    const tail = project(v.b.copy(frame.axis).multiplyScalar(RK.nozzleExitY - 22), camera, size, v.tail)
    const ox = base.x / size.width
    const oy = 1 - base.y / size.height
    const dx = tail.x / size.width - ox
    const dy = 1 - tail.y / size.height - oy
    const len = Math.hypot(dx * (size.width / size.height), dy)
    v.origin.x = ox
    v.origin.y = oy
    v.dir.x = dx
    v.dir.y = dy
    haze.set(v.origin, v.dir, Math.max(len, 0.02), Math.max(len * 0.16, 0.01), strength)
  })

  useEffect(() => () => heatHaze().off(), [])
  return null
}

/** Dusk lighting that follows the flight: the sun "rises" again as the horizon dips below. */
function Lighting() {
  const sun = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  useFrame(() => {
    const s = sun.current
    if (!s || !hemi.current) return
    const R = frame.planetRadius
    const dip = Math.acos(R / (R + Math.max(frame.altitude, 0)))
    const space = smoothstep(0, 0.12, dip)
    s.color.copy(SUN_DUSK).lerp(SUN_SPACE, space)
    s.intensity = 1.5 + 2.2 * space
    hemi.current.intensity = (0.42 + 0.18 * frame.ambient) * frame.handoff.presence + 0.12
  })
  return (
    <>
      {/* No shadow maps are rendered (the canvas has no `shadows`), so the sun never casts:
          toggling castShadow only changed every lit material's shader key and recompiled it. */}
      <directionalLight
        ref={sun}
        position={[SUN_DIR.x * 200, SUN_DIR.y * 200 + 30, SUN_DIR.z * 200]}
        intensity={1.5}
        color={SUN_DUSK}
      />
      <hemisphereLight ref={hemi} args={['#2E4584', '#140F0B', 0.6]} />
    </>
  )
}

/**
 * CHAPTER 01 — the launch pad at dusk and the flight to space.
 * Composition only: every component reads the shared per-frame `frame` state, which is derived
 * from the rocket runtime (the simulation) — nothing here invents motion.
 */
export default function RocketScene() {
  const world = useRef<Group>(null)
  const scene = useThree((s) => s.scene)
  const mark = useSceneReady((s) => s.mark)
  const fog = useMemo(() => new FogExp2(FOG.getHex(), 0.00022), [])

  useEffect(() => {
    mark('rocket', true)
    return () => mark('rocket', false)
  }, [mark])

  useEffect(() => {
    scene.fog = fog
    return () => {
      if (scene.fog === fog) scene.fog = null
    }
  }, [scene, fog])

  // first in the frame: derive this frame's state from the simulation
  useFrame((state) => {
    const active = useDirector.getState().active
    updateFrame(active === 'intro' ? introPhases(scrollState.intro.progress) : FULLY_REAL)
    const w = world.current
    if (w) w.position.set(-frame.pos.x, -frame.pos.y, -frame.pos.z)
    const camAlt = frame.altitude + state.camera.position.y
    fog.density = 0.00022 * Math.exp(-Math.max(camAlt, 0) / 2500) * frame.handoff.presence
    fog.color.copy(FOG)
  }, -10)

  return (
    <>
      <SkyDome />
      <Planet />
      <group ref={world} name="launch-frame">
        <LaunchSite />
        <Steam />
        <RocketTrail />
      </group>
      <RocketModel />
      <RocketForces />
      <Lighting />
      <Environment resolution={256} frames={1} background={false}>
        <Lightformer form="rect" intensity={2.2} color="#FF8E4F" position={[-72, 4, -66]} scale={[150, 14, 1]} target={[0, 6, 0]} />
        <Lightformer form="rect" intensity={0.55} color="#2B4580" position={[0, 90, 0]} rotation-x={Math.PI / 2} scale={[260, 260, 1]} />
        <Lightformer form="rect" intensity={0.3} color="#5B4C80" position={[80, 8, 70]} scale={[160, 30, 1]} target={[0, 6, 0]} />
        <Lightformer form="rect" intensity={0.7} color="#EAF2FF" position={[31, 14, 24]} scale={[12, 5, 1]} target={[0, 12, 0]} />
        <Lightformer form="rect" intensity={0.5} color="#EAF2FF" position={[-30, 14, -20]} scale={[12, 5, 1]} target={[0, 12, 0]} />
        <Lightformer form="ring" intensity={1.2} color="#FF7A33" position={[0, -6, 0]} scale={8} target={[0, 10, 0]} />
      </Environment>
      <RocketCamera />
      <ScreenLinks />
    </>
  )
}
