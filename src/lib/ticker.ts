import { gsap } from '../motion/gsap'

/**
 * Readout bus: DOM readouts refresh at ~12 Hz from one shared ticker (not React state),
 * reading the same runtime objects the 3D scenes read every frame.
 */
export const READOUT_HZ = 12
const subscribers = new Set<() => void>()
let acc = 0
let started = false

function start() {
  if (started) return
  started = true
  gsap.ticker.add((_t, deltaMs) => {
    acc += deltaMs
    if (acc < 1000 / READOUT_HZ) return
    acc = 0
    for (const fn of subscribers) fn()
  })
}

/** Subscribe a readout updater; returns an unsubscribe function. */
export function onReadout(fn: () => void): () => void {
  start()
  subscribers.add(fn)
  fn()
  return () => {
    subscribers.delete(fn)
  }
}
