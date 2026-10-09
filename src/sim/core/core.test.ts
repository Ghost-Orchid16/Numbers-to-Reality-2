import { describe, expect, it } from 'vitest'
import { parabolicPeak, smoothstep } from './math'
import { RK4 } from './rk4'
import { FixedStepper } from './stepper'
import { Track } from './track'

describe('RK4', () => {
  it('integrates a harmonic oscillator to the analytic solution', () => {
    // x'' = -ω²x, x(0)=1, v(0)=0 → x(t) = cos ωt
    const w = 2 * Math.PI
    const f = (_t: number, y: Float64Array, out: Float64Array) => {
      out[0] = y[1]
      out[1] = -w * w * y[0]
    }
    const rk = new RK4(2)
    const y = new Float64Array([1, 0])
    const h = 1 / 240
    for (let i = 0; i < 240 * 3; i++) rk.step(f, i * h, y, h)
    expect(y[0]).toBeCloseTo(Math.cos(w * 3), 6)
    expect(y[1]).toBeCloseTo(-w * Math.sin(w * 3), 5)
  })

  it('has fourth-order global error', () => {
    const f = (_t: number, y: Float64Array, out: Float64Array) => {
      out[0] = y[0]
    }
    const err = (h: number) => {
      const rk = new RK4(1)
      const y = new Float64Array([1])
      const n = Math.round(1 / h)
      for (let i = 0; i < n; i++) rk.step(f, i * h, y, h)
      return Math.abs(y[0] - Math.E)
    }
    const ratio = err(0.1) / err(0.05)
    expect(ratio).toBeGreaterThan(14) // ≈ 2⁴ = 16
    expect(ratio).toBeLessThan(18)
  })
})

describe('FixedStepper', () => {
  it('runs the same number of substeps however frame time is sliced', () => {
    const a = new FixedStepper(1 / 240)
    const b = new FixedStepper(1 / 240)
    let na = 0
    let nb = 0
    for (let i = 0; i < 60; i++) na += a.advance(1 / 60, () => {})
    const slices = [0.003, 0.021, 0.0005, 0.04, 0.0123, 0.2, 0.06, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1632]
    for (const s of slices) nb += b.advance(s, () => {})
    expect(na).toBe(240)
    expect(nb).toBe(240)
  })

  it('caps substeps after a long stall', () => {
    const s = new FixedStepper(1 / 240, 100)
    expect(s.advance(10, () => {})).toBe(100)
    expect(s.alpha).toBe(0)
  })
})

describe('Track', () => {
  it('interpolates linearly and clamps', () => {
    const tr = new Track(['a'] as const, 0.5, 2)
    for (let i = 0; i < 5; i++) tr.push({ a: i * 10 })
    expect(tr.duration).toBe(2)
    expect(tr.sample('a', 0.25)).toBeCloseTo(5)
    expect(tr.sample('a', 1.75)).toBeCloseTo(35)
    expect(tr.sample('a', 99)).toBe(40)
    expect(tr.sampleStep('a', 0.99)).toBe(10)
  })
})

describe('math', () => {
  it('finds a parabola vertex between samples', () => {
    const y = (x: number) => -(x - 0.3) * (x - 0.3) + 2
    const { offset, value } = parabolicPeak(y(-1), y(0), y(1))
    expect(offset).toBeCloseTo(0.3, 10)
    expect(value).toBeCloseTo(2, 10)
  })
  it('smoothstep is clamped and symmetric', () => {
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
    expect(smoothstep(0, 1, 2)).toBe(1)
  })
})
