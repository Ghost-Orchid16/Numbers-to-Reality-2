import { gsap } from '../motion/gsap'

/**
 * Readout bus: DOM readouts refresh at ~12 Hz from one shared ticker (not React state),
 * reading the same runtime objects the 3D scenes read every frame.
 *
 * A readout tied to an element refreshes only while that element is on or near the screen
 * (within half a viewport), and refreshes the moment it comes back: numbers nobody can see
 * cost no text, style or layout work — the maths section no longer re-typesets 12× a second
 * while the visitor watches the launch.
 */
export const READOUT_HZ = 12

interface Entry {
  fn: () => void
  el: Element | null
}
const entries = new Set<Entry>()
/** last known "near the viewport" state per observed element (unknown = near) */
const near = new Map<Element, boolean>()
let io: IntersectionObserver | null = null
let acc = 0
let started = false

function observer(): IntersectionObserver {
  io ??= new IntersectionObserver(
    (list) => {
      for (const e of list) {
        near.set(e.target, e.isIntersecting)
        if (e.isIntersecting) for (const entry of entries) if (entry.el === e.target) entry.fn()
      }
    },
    { rootMargin: '50% 0px 50% 0px' },
  )
  return io
}

function start() {
  if (started) return
  started = true
  gsap.ticker.add((_t, deltaMs) => {
    acc += deltaMs
    if (acc < 1000 / READOUT_HZ) return
    acc = 0
    for (const entry of entries) if (!entry.el || near.get(entry.el) !== false) entry.fn()
  })
}

/**
 * Subscribe a readout updater; returns an unsubscribe function. With `el`, the updater only
 * runs while `el` is near the viewport.
 */
export function onReadout(fn: () => void, el: Element | null = null): () => void {
  start()
  const entry: Entry = { fn, el }
  entries.add(entry)
  if (el) {
    if (!near.has(el)) near.set(el, true)
    observer().observe(el)
  }
  fn()
  return () => {
    entries.delete(entry)
    if (el && ![...entries].some((e) => e.el === el)) {
      observer().unobserve(el)
      near.delete(el)
    }
  }
}
