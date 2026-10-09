import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { useMemo } from 'react'
import { Vector3, type PerspectiveCamera } from 'three'
import { COUNTDOWN, rocket, rocketScroll } from '../../chapters/rocket/runtime'
import { smoothstep } from '../../sim/core/math'
import { useDirector } from '../../state/director'
import { usePrefs } from '../../state/prefs'
import { frame } from './frame'
import { POSE_CLOSE, POSE_LAB, POSE_PAD, TRIPOD } from './shots'

interface Shot {
  pos: Vector3
  target: Vector3
  fov: number
  /** where the subject moves, as a fraction of the viewport (x right, y down) */
  shiftX: number
  shiftY: number
  smooth: number
}

const v3 = () => new Vector3()

/**
 * Camera direction for the rocket chapter. Render space: the rocket sits at the origin and the
 * world moves (floating origin). Shots are keyed to *simulated* time and the flight's real
 * events (liftoff, max-Q, burnout), so a heavier or weaker rocket still gets the right framing.
 */
export function RocketCamera() {
  const reduced = usePrefs((s) => s.reducedMotion)
  const compact = usePrefs((s) => s.compact)
  const s = useMemo(
    () => ({
      shot: { pos: v3(), target: v3(), fov: 35, shiftX: 0, shiftY: 0, smooth: 0.3 } as Shot,
      a: v3(),
      b: v3(),
      c: v3(),
      d: v3(),
      ta: v3(),
      tb: v3(),
      tc: v3(),
      td: v3(),
      look: v3(),
      fwd: v3(),
      shiftX: 0,
      shiftY: 0,
      fov: 35,
      engaged: false,
    }),
    [],
  )

  useFrame((state, dt) => {
    const cam = state.camera as PerspectiveCamera
    if (useDirector.getState().active !== 'rocket') {
      s.engaged = false
      return
    }
    if (!s.engaged) {
      // take over smoothly from wherever the previous chapter left the camera
      s.engaged = true
      cam.getWorldDirection(s.fwd)
      s.look.copy(cam.position).addScaledVector(s.fwd, 60)
      s.fov = cam.fov
    }
    const shot = s.shot
    const t = frame.time
    const section = rocketScroll.section
    const axis = frame.axis
    shot.shiftX = 0
    shot.shiftY = 0

    if (section === 'title') {
      const k = state.clock.elapsedTime
      shot.pos.copy(POSE_PAD.position)
      if (!reduced) shot.pos.x += Math.sin(k * 0.11) * 1.6
      shot.target.copy(POSE_PAD.target)
      shot.fov = POSE_PAD.fov
      shot.smooth = 0.6
      // leave the title its column: rocket to the right on wide screens, lower on phones
      if (compact) shot.shiftY = 0.12
      else shot.shiftX = 0.2
    } else if (section === 'flight') {
      const tr = rocket.trajectory
      const tl = tr.liftoffTime ?? 0
      const tq = tr.maxQ?.t ?? tl + 60
      if (t < 0) {
        const k = smoothstep(-COUNTDOWN - 1, 0, t)
        shot.pos.lerpVectors(POSE_PAD.position, POSE_CLOSE.position, k)
        shot.target.lerpVectors(POSE_PAD.target, POSE_CLOSE.target, k)
        shot.fov = POSE_PAD.fov + (POSE_CLOSE.fov - POSE_PAD.fov) * k
      } else {
        // A — tripod fixed at the pad, tracking the climbing rocket
        s.a.copy(TRIPOD).sub(frame.pos)
        // keep the pad and its steam in frame for the first seconds, then tilt up with the climb
        const climb = smoothstep(tl + 2, tl + 10, t)
        s.ta.set(-frame.pos.x, 6 - frame.pos.y, -frame.pos.z).lerp(s.d.copy(axis).multiplyScalar(10), 0.5 + 0.5 * climb)
        // B — close chase, below and behind
        s.b.set(-31, -15, 50)
        s.tb.copy(axis).multiplyScalar(15)
        // C — wide chase: the plume and the bending path
        s.c.set(-105, -34, 175)
        s.tc.copy(axis).multiplyScalar(12)
        // D — far shot that shows the curvature of the planet below
        const far = smoothstep(tq + 40, tq + 160, t)
        s.d.set(-420 - 420 * far, 10 + 30 * far, 980 + 900 * far)
        s.td.set(0, -0.2 * s.d.length(), 0)
        const wAB = smoothstep(tl + 5, tl + 17, t)
        const wBC = smoothstep(tl + 26, tq + 4, t)
        const wCD = smoothstep(tq + 22, tq + 75, t)
        shot.pos.lerpVectors(s.a, s.b, wAB).lerp(s.c, wBC).lerp(s.d, wCD)
        shot.target.lerpVectors(s.ta, s.tb, wAB).lerp(s.tc, wBC).lerp(s.td, wCD)
        shot.fov = 33 + 6 * (1 - smoothstep(tl + 3, tl + 12, t)) + wBC * 1.5 - wCD * 3
      }
      shot.smooth = 0.16
    } else {
      // LAB: frame the rocket beside the control panel
      const h = frame.altitude
      if (frame.onPad || h < 40) {
        shot.pos.copy(POSE_LAB.position)
        shot.target.copy(POSE_LAB.target)
      } else {
        const dist = 70 + Math.pow(h, 0.78) * 0.9
        shot.pos.set(-0.42, -0.2, 0.88).normalize().multiplyScalar(Math.min(dist, 2600))
        const limb = smoothstep(20000, 90000, h)
        shot.pos.y += limb * 120
        shot.target.copy(axis).multiplyScalar(12).addScaledVector(frame.up, -0.18 * limb * shot.pos.length())
      }
      shot.fov = 35
      shot.smooth = 0.45
      if (compact) shot.shiftY = -0.2
      else shot.shiftX = rocketScroll.side === 'right' ? 0.22 : -0.13
    }

    // damped follow
    easing.damp3(cam.position, shot.pos, shot.smooth, dt)
    easing.damp3(s.look, shot.target, shot.smooth * 0.8, dt)
    s.fov += (shot.fov - s.fov) * (1 - Math.exp(-dt / 0.35))
    s.shiftX += (shot.shiftX - s.shiftX) * (1 - Math.exp(-dt / 0.5))
    s.shiftY += (shot.shiftY - s.shiftY) * (1 - Math.exp(-dt / 0.5))

    // ignition shake: only near the pad, only while the engine roars, never under reduced motion
    let shake = 0
    if (!reduced && frame.firing) {
      shake =
        0.16 *
        frame.thrustFrac *
        smoothstep(0, 0.35, frame.ignitionAge) *
        (1 - smoothstep(150, 1600, frame.altitude)) *
        (section === 'flight' ? 1 : 0.5)
    }
    const k = state.clock.elapsedTime
    cam.lookAt(
      s.look.x + shake * Math.sin(k * 47.3) * Math.sin(k * 3.1),
      s.look.y + shake * Math.sin(k * 59.7 + 1.3) * 0.7,
      s.look.z + shake * Math.sin(k * 41.9 + 2.1) * 0.5,
    )

    const near = frame.altitude > 3000 || section === 'flight' ? Math.min(4, 0.3 + frame.altitude / 2000) : 0.3
    let dirty = false
    if (Math.abs(cam.fov - s.fov) > 1e-3) {
      cam.fov = s.fov
      dirty = true
    }
    if (Math.abs(cam.near - near) > 1e-3) {
      cam.near = near
      dirty = true
    }
    const { width, height } = state.size
    if (Math.abs(s.shiftX) > 1e-3 || Math.abs(s.shiftY) > 1e-3) {
      cam.setViewOffset(width, height, -s.shiftX * width, -s.shiftY * height, width, height)
    } else if (cam.view?.enabled) {
      cam.clearViewOffset()
    } else if (dirty) {
      cam.updateProjectionMatrix()
    }
  })

  return null
}
