import type { Scene, WebGLRenderer } from 'three'

/**
 * Frame probe for ?perf and ?bench, installed before any other module runs (perf/boot.ts).
 *
 *  • requestAnimationFrame is wrapped to time every rAF callback (JS ms per frame) and to find
 *    frame boundaries. A message posted from a frame's first callback is delivered after that
 *    frame's style, layout and paint, so its arrival time gives the frame's main-thread total.
 *  • React commits are counted per renderer (react-dom, R3F) through the DevTools global hook.
 *  • Long animation frames (LoAF, Chromium) are observed with their script attribution.
 *  • renderer.info is read once per frame (autoReset off, reset at each frame start).
 *
 * Nothing here exists in a normal visit: boot.ts only calls installProbe() under ?perf/?bench.
 */

export interface FrameRow {
  /** frame timestamp (rAF time, ms) */
  t: number
  /** interval since the previous frame (ms) */
  dt: number
  /** time spent inside rAF callbacks (ms) */
  js: number
  /** main-thread time of the whole frame: rAF + style + layout + paint (ms) */
  main: number
  /** window.scrollY at frame start */
  y: number
  calls: number
  tris: number
  programs: number
  geometries: number
  textures: number
  /** React commits so far (all renderers) */
  commits: number
  tag: string
}

export interface LoafRow {
  start: number
  duration: number
  blocking: number
  /** ms of the frame spent before rendering started (scripts, events) */
  scriptMs: number
  /** ms from render start to style/layout start (rAF callbacks) */
  rafMs: number
  /** ms of style + layout */
  layoutMs: number
  y: number
  tag: string
  scripts: { invoker: string; source: string; ms: number; forcedLayoutMs: number }[]
}

export interface EventRow {
  t: number
  y: number
  kind: 'program' | 'commit' | 'refresh' | 'quality' | 'mark'
  detail: string
  ms?: number
}

const RING = 2048

export const probe = {
  installed: false,
  gl: null as WebGLRenderer | null,
  /** the R3F scene (GPU cost breakdowns from the console / scripts) */
  scene: null as Scene | null,
  frames: 0,
  ring: {
    t: new Float64Array(RING),
    dt: new Float32Array(RING),
    js: new Float32Array(RING),
    main: new Float32Array(RING),
  },
  commits: 0,
  commitsByRenderer: new Map<number, { name: string; count: number }>(),
  loaf: [] as LoafRow[],
  events: [] as EventRow[],
  /** set by the bench: every frame is appended here while recording */
  recording: null as FrameRow[] | null,
  /** label for the current phase (bench pass/leg) */
  tag: '',
  lastPrograms: 0,
}

/** Called once by the Stage when the renderer exists (cheap: two assignments otherwise). */
export function registerRenderer(gl: WebGLRenderer, scene: Scene): void {
  probe.gl = gl
  probe.scene = scene
  if (probe.installed) {
    gl.info.autoReset = false
    probe.lastPrograms = gl.info.programs?.length ?? 0
  }
}

export function logEvent(kind: EventRow['kind'], detail: string, ms?: number): void {
  if (!probe.installed) return
  probe.events.push({ t: performance.now(), y: window.scrollY, kind, detail, ms })
  if (probe.events.length > 4000) probe.events.splice(0, 1000)
}

let curTs = -1
let prevTs = -1
let curStart = 0
let curJs = 0
let curY = 0

function endFrame(): void {
  if (curTs < 0) return
  const main = performance.now() - curStart
  const dt = prevTs >= 0 ? curTs - prevTs : 0
  const i = probe.frames % RING
  probe.ring.t[i] = curTs
  probe.ring.dt[i] = dt
  probe.ring.js[i] = curJs
  probe.ring.main[i] = main
  probe.frames++
  const gl = probe.gl
  let programs = 0
  if (gl) {
    programs = gl.info.programs?.length ?? 0
    if (programs > probe.lastPrograms) logEvent('program', `+${programs - probe.lastPrograms} → ${programs}`)
    probe.lastPrograms = programs
  }
  if (probe.recording && prevTs >= 0) {
    probe.recording.push({
      t: curTs,
      dt,
      js: curJs,
      main,
      y: curY,
      calls: gl?.info.render.calls ?? 0,
      tris: gl?.info.render.triangles ?? 0,
      programs,
      geometries: gl?.info.memory.geometries ?? 0,
      textures: gl?.info.memory.textures ?? 0,
      commits: probe.commits,
      tag: probe.tag,
    })
  }
}

function beginFrame(ts: number, channel: MessageChannel): void {
  prevTs = curTs
  curTs = ts
  curStart = performance.now()
  curJs = 0
  curY = window.scrollY
  probe.gl?.info.reset()
  channel.port2.postMessage(0)
}

interface DevtoolsHook {
  supportsFiber?: boolean
  renderers?: Map<number, { rendererPackageName?: string }>
  inject?: (internals: { rendererPackageName?: string }) => number
  onCommitFiberRoot?: (id: number, ...rest: unknown[]) => void
  [key: string]: unknown
}

function countCommit(id: number, name: string): void {
  probe.commits++
  const r = probe.commitsByRenderer.get(id)
  if (r) r.count++
  else probe.commitsByRenderer.set(id, { name, count: 1 })
  logEvent('commit', name)
}

/** React DevTools global hook: count commits per renderer (works in production builds too). */
function installCommitCounter(): void {
  const w = window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook }
  const names = new Map<number, string>()
  const existing = w.__REACT_DEVTOOLS_GLOBAL_HOOK__
  if (existing) {
    // the real DevTools extension is installed: wrap it
    const orig = existing.onCommitFiberRoot
    existing.onCommitFiberRoot = function (this: unknown, id: number, ...rest: unknown[]) {
      countCommit(id, existing.renderers?.get(id)?.rendererPackageName ?? `renderer ${id}`)
      return orig?.call(this, id, ...rest)
    }
    return
  }
  let next = 1
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(internals) {
      const id = next++
      names.set(id, internals.rendererPackageName ?? `renderer ${id}`)
      return id
    },
    onCommitFiberRoot(id: number) {
      countCommit(id, names.get(id) ?? `renderer ${id}`)
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  }
}

interface LoafEntry extends PerformanceEntry {
  renderStart: number
  styleAndLayoutStart: number
  blockingDuration: number
  scripts: {
    invoker: string
    sourceURL: string
    sourceFunctionName: string
    sourceCharPosition: number
    duration: number
    forcedStyleAndLayoutDuration: number
  }[]
}

function installLoafObserver(): void {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as LoafEntry[]) {
        const end = e.startTime + e.duration
        const renderStart = e.renderStart || end
        const styleStart = e.styleAndLayoutStart || end
        probe.loaf.push({
          start: e.startTime,
          duration: e.duration,
          blocking: e.blockingDuration,
          scriptMs: renderStart - e.startTime,
          rafMs: Math.max(0, styleStart - renderStart),
          layoutMs: Math.max(0, end - styleStart),
          y: window.scrollY,
          tag: probe.tag,
          scripts: [...e.scripts]
            .sort((a, b) => b.duration - a.duration)
            .slice(0, 4)
            .map((s) => ({
              invoker: s.invoker,
              source: `${s.sourceFunctionName || '(anonymous)'} ${s.sourceURL.split('/').pop() ?? ''}:${s.sourceCharPosition}`,
              ms: Math.round(s.duration),
              forcedLayoutMs: Math.round(s.forcedStyleAndLayoutDuration),
            })),
        })
        if (probe.loaf.length > 2000) probe.loaf.splice(0, 500)
      }
    }).observe({ type: 'long-animation-frame', buffered: true })
  } catch {
    // not Chromium: no LoAF
  }
}

/** Wrap requestAnimationFrame so every frame's callbacks are timed. */
function installFrameTimer(): void {
  const channel = new MessageChannel()
  channel.port1.onmessage = endFrame
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    raf((ts) => {
      if (ts !== curTs) beginFrame(ts, channel)
      const s = performance.now()
      try {
        cb(ts)
      } finally {
        curJs += performance.now() - s
      }
    })
}

export function installProbe(): void {
  if (probe.installed || typeof window === 'undefined') return
  probe.installed = true
  installCommitCounter()
  installLoafObserver()
  installFrameTimer()
  ;(window as unknown as { __nrPerf: typeof probe }).__nrPerf = probe
}

/** Percentile of a numeric list (linear interpolation); 0 for an empty list. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const n = values.length
  if (!n) return 0
  const s = Array.from(values).sort((a, b) => a - b)
  const k = (n - 1) * p
  const lo = Math.floor(k)
  const hi = Math.min(n - 1, lo + 1)
  return s[lo] + (s[hi] - s[lo]) * (k - lo)
}

/** The frames of the last `ms` milliseconds from the ring buffer. */
export function recentFrames(ms: number): { t: number[]; dt: number[]; js: number[]; main: number[] } {
  const out = { t: [] as number[], dt: [] as number[], js: [] as number[], main: [] as number[] }
  const n = Math.min(probe.frames, RING)
  if (!n) return out
  const last = probe.ring.t[(probe.frames - 1) % RING]
  for (let k = 0; k < n; k++) {
    const i = (probe.frames - 1 - k + RING) % RING
    const t = probe.ring.t[i]
    if (last - t > ms) break
    out.t.push(t)
    out.dt.push(probe.ring.dt[i])
    out.js.push(probe.ring.js[i])
    out.main.push(probe.ring.main[i])
  }
  return out
}
