import { FIXED_DT } from './types'

/**
 * Fixed-timestep accumulator ("fix your timestep").
 *
 * Frame time is fed in with `advance(dt, substep)`; the callback runs once per whole fixed
 * substep. The physics therefore never depends on the frame rate: however the frame time is
 * sliced, the same sequence of substeps is executed. A cap on substeps per call prevents a
 * spiral of death after a long stall (e.g. a background tab) — the backlog is dropped.
 */
export class FixedStepper {
  readonly h: number
  readonly maxSubsteps: number
  private acc = 0

  constructor(h = FIXED_DT, maxSubsteps = 4800) {
    this.h = h
    this.maxSubsteps = maxSubsteps
  }

  /**
   * @param dt      simulated seconds to add
   * @param substep called with the fixed step; return `false` to stop early (e.g. sim ended)
   * @returns number of substeps executed
   */
  advance(dt: number, substep: (h: number) => boolean | void): number {
    if (!(dt > 0)) return 0
    this.acc += dt
    let n = 0
    // Small epsilon so that dt sums like 0.1 + 0.2 do not lose a step to rounding.
    const eps = this.h * 1e-9
    while (this.acc + eps >= this.h) {
      if (n >= this.maxSubsteps) {
        this.acc = 0
        break
      }
      this.acc -= this.h
      n++
      if (substep(this.h) === false) {
        this.acc = 0
        break
      }
    }
    return n
  }

  /** Fraction of a substep left in the accumulator (0..1), for render interpolation. */
  get alpha(): number {
    return Math.max(0, Math.min(1, this.acc / this.h))
  }

  reset(): void {
    this.acc = 0
  }
}
