export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const invLerp = (a: number, b: number, x: number): number => (b === a ? 0 : (x - a) / (b - a))
/** Remap x from [a,b] to [0,1], clamped. */
export const progress01 = (a: number, b: number, x: number): number => clamp(invLerp(a, b, x), 0, 1)
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = progress01(a, b, x)
  return t * t * (3 - 2 * t)
}
export const DEG = Math.PI / 180
export const RAD = 180 / Math.PI

/**
 * Vertex of the parabola through three equally spaced samples (y0, y1, y2) at x = -1, 0, 1.
 * Returns the offset of the extremum in [-1, 1] and its value. Used to locate peaks
 * (e.g. max-Q) between stored samples.
 */
export function parabolicPeak(y0: number, y1: number, y2: number): { offset: number; value: number } {
  const denom = y0 - 2 * y1 + y2
  if (denom === 0) return { offset: 0, value: y1 }
  const offset = clamp((0.5 * (y0 - y2)) / denom, -1, 1)
  const value = y1 - 0.25 * (y0 - y2) * offset
  return { offset, value }
}
