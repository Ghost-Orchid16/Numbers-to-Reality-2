import { clamp } from './math'

/**
 * Uniformly sampled multi-channel time series (e.g. a precomputed trajectory).
 * Channels are stored as Float64Arrays; `sample(t)` linearly interpolates.
 */
export class Track<K extends string> {
  readonly dt: number
  readonly keys: readonly K[]
  private data: Record<K, Float64Array>
  private capacity: number
  length = 0

  constructor(keys: readonly K[], dt: number, capacity = 1024) {
    this.keys = keys
    this.dt = dt
    this.capacity = capacity
    this.data = {} as Record<K, Float64Array>
    for (const k of keys) this.data[k] = new Float64Array(capacity)
  }

  push(values: Record<K, number>): void {
    if (this.length === this.capacity) this.grow()
    for (const k of this.keys) this.data[k][this.length] = values[k]
    this.length++
  }

  private grow(): void {
    this.capacity *= 2
    for (const k of this.keys) {
      const next = new Float64Array(this.capacity)
      next.set(this.data[k])
      this.data[k] = next
    }
  }

  /** Duration covered by the samples (s). */
  get duration(): number {
    return Math.max(0, (this.length - 1) * this.dt)
  }

  channel(k: K): Float64Array {
    return this.data[k].subarray(0, this.length)
  }

  at(k: K, i: number): number {
    return this.data[k][clamp(i, 0, this.length - 1)]
  }

  /** Linear interpolation of channel k at time t (clamped to the covered range). */
  sample(k: K, t: number): number {
    if (this.length === 0) return 0
    const x = clamp(t / this.dt, 0, this.length - 1)
    const i = Math.floor(x)
    const f = x - i
    const a = this.data[k][i]
    if (f === 0 || i + 1 >= this.length) return a
    return a + (this.data[k][i + 1] - a) * f
  }

  /** Value of channel k at the last sample at or before t (for flags / step functions). */
  sampleStep(k: K, t: number): number {
    if (this.length === 0) return 0
    return this.data[k][clamp(Math.floor(t / this.dt + 1e-9), 0, this.length - 1)]
  }
}
