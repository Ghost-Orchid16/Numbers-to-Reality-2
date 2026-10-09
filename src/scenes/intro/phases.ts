import { smoothstep } from '../../sim/core/math'

/**
 * The hero → rocket handoff, as functions of the hero's scroll progress p ∈ [0, 1].
 * Both scenes use these, so the glyphs dissolve exactly where the real rocket materialises.
 */
export interface IntroPhases {
  /** glyphs travel from the drifting cloud onto the rocket surface */
  assemble: number
  /** the rocket materialises bottom-up while the glyphs on it dissolve */
  reveal: number
  /** dusk sky, ground and launch pad fade in around it */
  presence: number
  /** camera travel from the glyph field to the launch-pad shot */
  camera: number
}

export function introPhases(p: number): IntroPhases {
  return {
    assemble: smoothstep(0.06, 0.74, p),
    reveal: smoothstep(0.7, 0.97, p),
    presence: smoothstep(0.42, 0.9, p),
    camera: smoothstep(0.0, 1.0, p),
  }
}

export const FULLY_REAL: IntroPhases = { assemble: 1, reveal: 1, presence: 1, camera: 1 }

/**
 * Reveal threshold of a point on the rocket (0 at the base → ~1 at the tip, plus noise),
 * shared by the rocket's dissolve shader and the glyphs that dissolve into it.
 */
export const REVEAL_GLSL = /* glsl */ `
float revealHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float revealNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n000 = revealHash(i), n100 = revealHash(i + vec3(1,0,0)), n010 = revealHash(i + vec3(0,1,0)), n110 = revealHash(i + vec3(1,1,0));
  float n001 = revealHash(i + vec3(0,0,1)), n101 = revealHash(i + vec3(1,0,1)), n011 = revealHash(i + vec3(0,1,1)), n111 = revealHash(i + vec3(1,1,1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float revealThreshold(vec3 p) {
  return clamp((p.y + 2.0) / 34.0, 0.0, 1.0) * 0.82 + revealNoise(p * 0.9) * 0.18;
}
`
