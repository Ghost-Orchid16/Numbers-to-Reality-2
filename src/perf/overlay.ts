import { gsap, ScrollTrigger } from '../motion/gsap'
import { useDirector } from '../state/director'
import { logEvent, percentile, probe, recentFrames } from './probe'
import { measureSections, sectionAt, type SectionSpan } from './sections'

/**
 * ?perf — a small live HUD (top right). Plain DOM updated 4× a second, so it never causes a
 * React commit or a per-frame layout of its own.
 */

let spans: SectionSpan[] = []
let refreshStart = 0
let hooked = false

/** Hooks shared by the overlay and the bench: refresh timing, tier changes, section spans. */
export function installPerfHooks(): void {
  if (hooked) return
  hooked = true
  // GSAP keeps the requestAnimationFrame it found when its ticker first woke, which can be
  // before the probe wrapped it: re-wake so GSAP's frames (and everything they drive) are timed
  gsap.ticker.sleep()
  gsap.ticker.wake()
  ScrollTrigger.addEventListener('refreshInit', () => {
    refreshStart = performance.now()
  })
  ScrollTrigger.addEventListener('refresh', () => {
    logEvent('refresh', 'ScrollTrigger.refresh', performance.now() - refreshStart)
    spans = measureSections()
  })
  useDirector.subscribe((s, prev) => {
    if (s.quality !== prev.quality) logEvent('quality', `${prev.quality} → ${s.quality}`)
  })
  spans = measureSections()
}

export const currentSpans = (): SectionSpan[] => spans

const fmt = (x: number, d = 1) => x.toFixed(d).padStart(5)

export function mountOverlay(): void {
  installPerfHooks()
  const el = document.createElement('pre')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = [
    'position:fixed',
    'right:8px',
    'top:64px',
    'z-index:2147483000',
    'margin:0',
    'padding:8px 10px',
    'font:11px/1.45 ui-monospace,Menlo,Consolas,monospace',
    'color:#e9f1ff',
    'background:rgba(4,6,12,.78)',
    'border:1px solid rgba(255,255,255,.18)',
    'pointer-events:none',
    'white-space:pre',
    'font-variant-numeric:tabular-nums',
  ].join(';')
  document.body.appendChild(el)

  let lastCommits = 0
  let commitWindow: number[] = []
  const update = () => {
    const w = recentFrames(5000)
    const dts = w.dt.filter((d) => d > 0)
    const sum = dts.reduce((a, b) => a + b, 0)
    const fps = sum > 0 ? (dts.length * 1000) / sum : 0
    let worst = 0
    let worstAt = -1
    w.dt.forEach((d, i) => {
      if (d > worst) {
        worst = d
        worstAt = i
      }
    })
    const now = performance.now()
    commitWindow.push(probe.commits - lastCommits)
    lastCommits = probe.commits
    if (commitWindow.length > 20) commitWindow = commitWindow.slice(-20)
    const commits5s = commitWindow.reduce((a, b) => a + b, 0)
    const loaf = probe.loaf.filter((l) => now - l.start < 5000 && l.duration > 50)
    const lastLoaf = probe.loaf[probe.loaf.length - 1]
    const gl = probe.gl
    const info = gl?.info
    const progEvents = probe.events.filter((e) => e.kind === 'program' && now - e.t < 5000).length
    const refreshes = probe.events.filter((e) => e.kind === 'refresh')
    const lastRefresh = refreshes[refreshes.length - 1]
    const d = useDirector.getState()
    // the probe's last frame position: reading window.scrollY here could force a layout
    const section = sectionAt(spans, probe.lastY)
    el.textContent = [
      `FPS ${fmt(fps)}   frame p50 ${fmt(percentile(dts, 0.5))}  p95 ${fmt(percentile(dts, 0.95))}  p99 ${fmt(percentile(dts, 0.99))} ms`,
      `worst 5 s ${fmt(worst)} ms${worstAt >= 0 ? ` (${((now - w.t[worstAt]) / 1000).toFixed(1)} s ago)` : ''}`,
      `JS/frame p50 ${fmt(percentile(w.js, 0.5), 2)}  p95 ${fmt(percentile(w.js, 0.95), 2)} ms`,
      `main/frame p50 ${fmt(percentile(w.main, 0.5), 2)}  p95 ${fmt(percentile(w.main, 0.95), 2)} ms`,
      `draw calls ${info?.render.calls ?? '—'}  tris ${info ? (info.render.triangles / 1000).toFixed(0) + 'k' : '—'}`,
      `geometries ${info?.memory.geometries ?? '—'}  textures ${info?.memory.textures ?? '—'}  programs ${info?.programs?.length ?? '—'}${progEvents ? `  (+new ${progEvents} in 5 s)` : ''}`,
      `DPR ${gl ? gl.getPixelRatio().toFixed(2) : '—'}  tier ${d.quality}  chapter ${d.active} · ${section}`,
      `LoAF>50ms ${loaf.length} in 5 s${lastLoaf ? `  last ${lastLoaf.duration.toFixed(0)} ms ${((now - lastLoaf.start) / 1000).toFixed(0)} s ago` : ''}`,
      `React commits ${commits5s} in 5 s (${probe.commits} total)`,
      `ScrollTrigger.refresh ${refreshes.length}${lastRefresh ? `  last ${lastRefresh.ms?.toFixed(1)} ms` : ''}`,
    ].join('\n')
  }
  window.setInterval(update, 250)
}
