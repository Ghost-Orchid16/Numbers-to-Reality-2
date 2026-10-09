import { Vector3 } from 'three'

/** Ground level below the launch-mount deck (the rocket's base rests at y = 0). */
export const GROUND_Y = -7

/** Rotation of the rocket about its axis so the stencil lettering faces the hero camera. */
export const ROCKET_YAW = -2.1

export interface Pose {
  position: Vector3
  target: Vector3
  fov: number
}

const pose = (p: [number, number, number], t: [number, number, number], fov: number): Pose => ({
  position: new Vector3(...p),
  target: new Vector3(...t),
  fov,
})

/** The launch-pad hero shot: where the glyph swarm hands over to Chapter 01. */
export const POSE_PAD = pose([-36, 4.2, 60], [0, 14.5, 0], 35)
/** Countdown push-in towards the engine section. */
export const POSE_CLOSE = pose([-23, 1.4, 37], [0, 9.5, 0], 33)
/** Fixed "tracking tripod" at the pad, in launch-frame metres. */
export const TRIPOD = new Vector3(-50, 1.4, 72)
/** Lab framing on the pad. */
export const POSE_LAB = pose([-37, 6, 66], [0, 14, 0], 35)
/** Hero opening shot over the glyph field. */
export const POSE_HERO = pose([7, 26, 136], [0, 21, 0], 36)
