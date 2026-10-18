/**
 * The very first module to run (imported first by main.tsx), so diagnostics are in place before
 * React, GSAP or three.js load. A normal visit does nothing here.
 */
import { FLAGS } from './flags'
import { installProbe } from './probe'
import { seededRandom } from './still'

if (FLAGS.still) {
  // deterministic frames: seeded randomness, no CSS animation or transitions
  Math.random = seededRandom(0x5eed)
  document.documentElement.classList.add('still')
  // frame counter for the screenshot script (waits for N rendered frames before a shot)
  const w = window as unknown as { __nrFrames: number }
  w.__nrFrames = 0
  const count = () => {
    w.__nrFrames++
    requestAnimationFrame(count)
  }
  requestAnimationFrame(count)
}

if (FLAGS.perf) installProbe()
