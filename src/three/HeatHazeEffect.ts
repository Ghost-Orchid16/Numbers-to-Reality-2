import { Effect, EffectAttribute } from 'postprocessing'
import { useEffect, useMemo } from 'react'
import { Uniform, Vector2 } from 'three'

/**
 * Heat shimmer: a screen-space refraction of the image behind a rocket plume. The scene
 * writes the plume's projected origin, direction and strength each frame; strength 0
 * elsewhere (one cheap early-out).
 */
const fragment = /* glsl */ `
uniform vec2 uOrigin;     // plume start in uv
uniform vec2 uDir;        // plume direction in uv (normalised in aspect-corrected space)
uniform float uLength;    // plume length in uv
uniform float uWidth;     // half-width in uv
uniform float uStrength;  // 0..1
uniform float uTime;
uniform float uAspect;

float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1, 0)), u.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), u.x), u.y);
}

void mainUv(inout vec2 uv) {
  if (uStrength <= 0.001) return;
  vec2 p = uv - uOrigin;
  p.x *= uAspect;
  vec2 d = normalize(vec2(uDir.x * uAspect, uDir.y));
  float along = dot(p, d);
  float across = dot(p, vec2(-d.y, d.x));
  float t = along / max(uLength, 1e-4);
  if (t < -0.05 || t > 1.6) return;
  float w = uWidth * (1.0 + 1.6 * max(t, 0.0));
  float mask = (1.0 - smoothstep(0.25, 1.0, abs(across) / w)) * smoothstep(-0.05, 0.12, t) * (1.0 - smoothstep(0.7, 1.6, t));
  if (mask <= 0.0) return;
  vec2 q = vec2(across * 90.0, along * 55.0 - uTime * 7.0);
  vec2 offs = vec2(noise(q) - 0.5, noise(q + 17.3) - 0.5);
  uv += offs * 0.012 * uStrength * mask;
}
`

export class HeatHazeEffect extends Effect {
  constructor() {
    super('HeatHazeEffect', fragment, {
      attributes: EffectAttribute.NONE,
      uniforms: new Map<string, Uniform>([
        ['uOrigin', new Uniform(new Vector2(0.5, 0.5))],
        ['uDir', new Uniform(new Vector2(0, -1))],
        ['uLength', new Uniform(0.2)],
        ['uWidth', new Uniform(0.03)],
        ['uStrength', new Uniform(0)],
        ['uTime', new Uniform(0)],
        ['uAspect', new Uniform(1)],
      ]),
    })
  }

  override update(_r: unknown, inputBuffer: { width: number; height: number }, deltaTime?: number): void {
    this.uniforms.get('uTime')!.value += deltaTime ?? 0.016
    this.uniforms.get('uAspect')!.value = inputBuffer.width / Math.max(1, inputBuffer.height)
  }

  set(origin: { x: number; y: number }, dir: { x: number; y: number }, length: number, width: number, strength: number): void {
    ;(this.uniforms.get('uOrigin')!.value as Vector2).set(origin.x, origin.y)
    ;(this.uniforms.get('uDir')!.value as Vector2).set(dir.x, dir.y)
    this.uniforms.get('uLength')!.value = length
    this.uniforms.get('uWidth')!.value = width
    this.uniforms.get('uStrength')!.value = strength
  }

  off(): void {
    this.uniforms.get('uStrength')!.value = 0
  }
}

let shared: HeatHazeEffect | null = null
/** The one heat-haze effect instance (scenes drive it through `heatHaze()`). */
export const heatHaze = (): HeatHazeEffect => (shared ??= new HeatHazeEffect())

export function useHeatHaze(): HeatHazeEffect {
  const effect = useMemo(heatHaze, [])
  useEffect(
    () => () => {
      effect.dispose()
      shared = null
    },
    [effect],
  )
  return effect
}
