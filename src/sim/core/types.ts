/**
 * Contract shared by every simulation in the museum.
 *
 * Simulations are pure TypeScript: no three.js, no React, no DOM. Scenes and readouts only
 * *read* their state, so every number on screen is the number the model computed.
 */
export interface Simulation<P extends object, M extends object> {
  /** Current parameters (read-only view; change them through `setParams`). */
  readonly params: Readonly<P>
  /** Simulated time in seconds since the last reset. */
  readonly time: number
  /** (Re)initialise with a full parameter set and reset the state. */
  init(params: P): void
  /** Merge a parameter patch. Each simulation documents which keys apply live. */
  setParams(patch: Partial<P>): void
  /** Advance by `dt` seconds of simulated time using fixed internal substeps. */
  step(dt: number): void
  /** Return to the initial state for the current parameters. */
  reset(): void
  /** Snapshot of derived quantities for readouts. */
  metrics(): M
  /** Release any resources (buffers, workers). */
  dispose(): void
}

/** Integration step used across the museum: 240 substeps per simulated second. */
export const FIXED_DT = 1 / 240
