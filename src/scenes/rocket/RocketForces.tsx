import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { Vector3 } from 'three'
import { forcesShown, rocket } from '../../chapters/rocket/runtime'
import { WORLDS } from '../../design/worlds'
import { setAnchor } from '../../state/anchors'
import { ForceVector, type VectorState } from '../../three/ForceVector'
import { frame } from './frame'

/** metres of arrow per newton: the default thrust (1.24 MN) draws 15.5 m long */
export const ARROW_SCALE = 15.5 / 1_240_000
const CG = 12.5 // m along the body: roughly the centre of mass at liftoff

/**
 * The force balance drawn to scale on the rocket: thrust T along the body, weight mg straight
 * down the local vertical, drag D against the motion. Same colours as the equation symbols.
 */
export function RocketForces() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const tmp = useMemo(() => new Vector3(), [])
  const vars = WORLDS.rocket.vars

  const visible = () => frame.handoff.reveal > 0.99 && forcesShown()

  const tip = (id: string) => (p: Vector3, show: boolean) => {
    tmp.copy(p).project(camera)
    const x = (tmp.x * 0.5 + 0.5) * size.width
    const y = (-tmp.y * 0.5 + 0.5) * size.height
    setAnchor(id, x, y, show && tmp.z < 1 && x > -40 && x < size.width + 40 && y > -40 && y < size.height + 40)
  }

  const thrust = (o: VectorState) => {
    o.origin.copy(frame.axis).multiplyScalar(CG)
    o.dir.copy(frame.axis)
    o.length = rocket.view.thrust * ARROW_SCALE * (frame.time >= 0 ? 1 : 0)
    o.visible = visible()
  }
  const weight = (o: VectorState) => {
    o.origin.copy(frame.axis).multiplyScalar(CG)
    o.dir.copy(frame.up).negate()
    o.length = rocket.view.weight * ARROW_SCALE
    o.visible = visible()
  }
  const drag = (o: VectorState) => {
    o.origin.copy(frame.axis).multiplyScalar(CG + 9)
    o.dir.copy(frame.axis).negate()
    o.length = rocket.view.drag * ARROW_SCALE * 4 // drawn ×4 so it is visible; labelled as such
    o.visible = visible() && rocket.view.drag > 50
  }

  return (
    <group name="forces">
      <ForceVector color={vars.thrust.color} read={thrust} onTip={tip('force-T')} />
      <ForceVector color={vars.weight.color} read={weight} onTip={tip('force-W')} />
      <ForceVector color={vars.drag.color} read={drag} radius={0.12} onTip={tip('force-D')} />
    </group>
  )
}
