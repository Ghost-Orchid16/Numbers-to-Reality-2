import { useMemo } from 'react'
import { rocket } from '../../chapters/rocket/runtime'
import { WORLDS } from '../../design/worlds'
import { resolvePlanet } from '../../sim/rocket/model'
import { TrajectoryLine } from '../../three/TrajectoryLine'
import { frame } from './frame'

const STRIDE = 4 // every 4th sample = 0.2 s

/** Launch-frame positions of a precomputed flight, over the curved planet. */
function trajectoryPoints(): Float32Array {
  const tr = rocket.trajectory
  const R = resolvePlanet(tr.params.planet).radius
  const x = tr.track.channel('x')
  const h = tr.track.channel('h')
  const n = Math.ceil(x.length / STRIDE)
  const out = new Float32Array(n * 3)
  for (let i = 0, j = 0; i < x.length; i += STRIDE, j++) {
    const phi = x[i] / R
    const r = R + h[i]
    out[j * 3] = r * Math.sin(phi)
    out[j * 3 + 1] = r * Math.cos(phi) - R
    out[j * 3 + 2] = 0
  }
  return out
}

/**
 * The flight path: the full predicted trajectory as a faint dashed line, and the part already
 * flown in plume gold (v's colour), growing with simulated time. Live flights draw their own
 * recorded path.
 */
export function RocketTrail() {
  const color = WORLDS.rocket.vars.velocity.color
  const live = useMemo(() => ({ pts: new Float32Array(3 * 20000), n: 0, lastT: -1, version: 0 }), [])

  const flownCount = () => {
    if (rocket.mode === 'live') return 0
    if (frame.time <= 0) return 0
    return Math.floor(frame.time / (rocket.trajectory.track.dt * STRIDE)) + 1
  }
  const aheadCount = () => (rocket.mode === 'live' || frame.time < 0 ? 0 : 1e9)

  const liveCount = () => {
    if (rocket.mode !== 'live' || frame.time < 0) {
      if (live.n) {
        live.n = 0
        live.lastT = -1
        live.version++
      }
      return 0
    }
    if (frame.time < live.lastT) {
      live.n = 0
      live.version++
    }
    const i = (live.n - 1) * 3
    const moved = live.n === 0 ? Infinity : Math.hypot(frame.pos.x - live.pts[i], frame.pos.y - live.pts[i + 1])
    if (moved > Math.max(12, frame.altitude * 0.01) && live.n < 20000) {
      live.pts[live.n * 3] = frame.pos.x
      live.pts[live.n * 3 + 1] = frame.pos.y
      live.pts[live.n * 3 + 2] = 0
      live.n++
      live.lastT = frame.time
      live.version++
    }
    return live.n
  }

  return (
    <group name="trail">
      <TrajectoryLine
        points={trajectoryPoints}
        version={() => rocket.version}
        count={aheadCount}
        color={color}
        width={1.2}
        opacity={0.35}
        dashed
        intensity={0.9}
      />
      <TrajectoryLine points={trajectoryPoints} version={() => rocket.version} count={flownCount} color={color} width={2.4} intensity={2.2} />
      <TrajectoryLine points={() => live.pts.subarray(0, Math.max(live.n, 2) * 3)} version={() => live.version} count={liveCount} color={color} width={2.4} intensity={2.2} />
    </group>
  )
}
