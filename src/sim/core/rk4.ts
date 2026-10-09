/** dy/dt = f(t, y), written into `out` (no allocation). */
export type Derivative = (t: number, y: Float64Array, out: Float64Array) => void

/**
 * Classic fourth-order Runge–Kutta on a Float64Array state, allocation-free.
 * Local error O(h⁵), global error O(h⁴).
 */
export class RK4 {
  readonly n: number
  private readonly k1: Float64Array
  private readonly k2: Float64Array
  private readonly k3: Float64Array
  private readonly k4: Float64Array
  private readonly tmp: Float64Array

  constructor(n: number) {
    this.n = n
    this.k1 = new Float64Array(n)
    this.k2 = new Float64Array(n)
    this.k3 = new Float64Array(n)
    this.k4 = new Float64Array(n)
    this.tmp = new Float64Array(n)
  }

  /** Advance `y` in place from t to t + h. */
  step(f: Derivative, t: number, y: Float64Array, h: number): void {
    const { n, k1, k2, k3, k4, tmp } = this
    f(t, y, k1)
    for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * h * k1[i]
    f(t + 0.5 * h, tmp, k2)
    for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * h * k2[i]
    f(t + 0.5 * h, tmp, k3)
    for (let i = 0; i < n; i++) tmp[i] = y[i] + h * k3[i]
    f(t + h, tmp, k4)
    const h6 = h / 6
    for (let i = 0; i < n; i++) y[i] += h6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
  }
}
