import { getLenis } from '../motion/scroll'
import { useDirector } from '../state/director'
import { FLAGS } from './flags'
import { currentSpans, installPerfHooks } from './overlay'
import { percentile, probe, type EventRow, type FrameRow, type LoafRow } from './probe'
import { measureSections, sectionAt, type SectionSpan } from './sections'

/**
 * ?bench — scripted scroll benchmark. After the loader, the page scrolls top → bottom → top
 * twice through Lenis (time-based at &speed px/s, or &step px per frame), records every frame,
 * then shows a results card with a "Copy results" button. `npm run bench` drives the same code
 * headless and reads `window.__nrBench`.
 */

type Phase = 'loading' | 'settle' | `pass${number}` | `gap${number}` | 'done'

interface BenchState {
  phase: Phase
  /** set by an external harness to acknowledge a gap (only waited for under &harness) */
  ack: string
  results: BenchResults | null
}

interface Snapshot {
  programs: number
  geometries: number
  textures: number
  commits: number
  t: number
}

export interface PassResult {
  pass: number
  frames: number
  seconds: number
  fps: number
  frameMs: { p50: number; p95: number; p99: number; max: number }
  worst: { ms: number; y: number; section: string; tag: string }
  jsMs: { p50: number; p95: number; max: number }
  mainMs: { p50: number; p95: number; max: number }
  drawCalls: { p50: number; max: number }
  triangles: { p50: number; max: number }
  longFrames: { over50: number; over100: number; bySection: Record<string, number> }
  loaf: { count: number; bySection: Record<string, number>; worst: (LoafRow & { section: string })[] }
  created: { programs: number; geometries: number; textures: number }
  reactCommits: number
  scrollTriggerRefreshes: number
  sections: Record<string, { frames: number; fps: number; p95: number; jsP95: number; mainP95: number }>
}

export interface BenchResults {
  meta: Record<string, string | number | boolean>
  passes: PassResult[]
  events: (EventRow & { section: string })[]
  sectionsPx: SectionSpan[]
}

const state: BenchState = { phase: 'loading', ack: '', results: null }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r))

async function waitFor(cond: () => boolean, ms = 120_000): Promise<void> {
  const t0 = performance.now()
  while (!cond()) {
    if (performance.now() - t0 > ms) throw new Error('bench: timed out waiting')
    await sleep(100)
  }
}

/** Under &harness, wait at pass boundaries until the external harness acknowledges. */
async function gate(phase: Phase, pauseMs: number): Promise<void> {
  state.phase = phase
  await sleep(pauseMs)
  if (FLAGS.harness) await waitFor(() => state.ack === phase, 600_000)
}

function snapshot(): Snapshot {
  const info = probe.gl?.info
  return {
    programs: info?.programs?.length ?? 0,
    geometries: info?.memory.geometries ?? 0,
    textures: info?.memory.textures ?? 0,
    commits: probe.commits,
    t: performance.now(),
  }
}

/** Move the scroll target exactly as a wheel does: Lenis eases the page towards it. */
function scrollTo(y: number): void {
  const lenis = getLenis()
  if (lenis) lenis.scrollTo(y, { programmatic: false, lerp: lenis.options.lerp })
  else window.scrollTo(0, y)
}

/** One leg: scroll from a to b at constant speed (time-based) or constant step (frame-based). */
async function leg(from: number, to: number, tag: string): Promise<void> {
  probe.tag = tag
  const dir = Math.sign(to - from)
  const dist = Math.abs(to - from)
  let t0 = -1
  let travelled = 0
  for (;;) {
    const ts = await nextFrame()
    if (t0 < 0) t0 = ts
    travelled = FLAGS.benchStep ? travelled + FLAGS.benchStep : ((ts - t0) / 1000) * FLAGS.benchSpeed
    const y = from + dir * Math.min(travelled, dist)
    scrollTo(y)
    if (travelled >= dist) break
  }
  // let the smoothing land on the end point
  for (let k = 0; k < 30; k++) await nextFrame()
}

function summarise(pass: number, rows: FrameRow[], before: Snapshot, after: Snapshot, spans: SectionSpan[]): PassResult {
  const dts = rows.map((r) => r.dt)
  const seconds = dts.reduce((a, b) => a + b, 0) / 1000
  let worst = rows[0]
  for (const r of rows) if (r.dt > (worst?.dt ?? 0)) worst = r
  const t0 = rows[0]?.t ?? 0
  const t1 = rows[rows.length - 1]?.t ?? 0
  // place each long animation frame at the scroll position of the frame it belongs to
  const yAt = (t: number): number => {
    let lo = 0
    let hi = rows.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (rows[mid].t <= t) lo = mid
      else hi = mid - 1
    }
    return rows[lo]?.y ?? 0
  }
  const loaf = probe.loaf.filter((l) => l.start >= t0 && l.start <= t1).map((l) => ({ ...l, y: yAt(l.start) }))
  const bySection = (list: { y: number }[]) => {
    const out: Record<string, number> = {}
    for (const x of list) {
      const s = sectionAt(spans, x.y)
      out[s] = (out[s] ?? 0) + 1
    }
    return out
  }
  const sections: PassResult['sections'] = {}
  const groups = new Map<string, FrameRow[]>()
  for (const r of rows) {
    const s = sectionAt(spans, r.y)
    if (!groups.has(s)) groups.set(s, [])
    groups.get(s)!.push(r)
  }
  for (const [name, list] of groups) {
    const d = list.map((r) => r.dt)
    const sum = d.reduce((a, b) => a + b, 0)
    sections[name] = {
      frames: list.length,
      fps: sum > 0 ? (list.length * 1000) / sum : 0,
      p95: percentile(d, 0.95),
      jsP95: percentile(
        list.map((r) => r.js),
        0.95,
      ),
      mainP95: percentile(
        list.map((r) => r.main),
        0.95,
      ),
    }
  }
  const long50 = rows.filter((r) => r.dt > 50)
  const refreshes = probe.events.filter((e) => e.kind === 'refresh' && e.t >= before.t && e.t <= after.t).length
  return {
    pass,
    frames: rows.length,
    seconds,
    fps: seconds > 0 ? rows.length / seconds : 0,
    frameMs: { p50: percentile(dts, 0.5), p95: percentile(dts, 0.95), p99: percentile(dts, 0.99), max: Math.max(0, ...dts) },
    worst: { ms: worst?.dt ?? 0, y: Math.round(worst?.y ?? 0), section: sectionAt(spans, worst?.y ?? 0), tag: worst?.tag ?? '' },
    jsMs: {
      p50: percentile(
        rows.map((r) => r.js),
        0.5,
      ),
      p95: percentile(
        rows.map((r) => r.js),
        0.95,
      ),
      max: Math.max(0, ...rows.map((r) => r.js)),
    },
    mainMs: {
      p50: percentile(
        rows.map((r) => r.main),
        0.5,
      ),
      p95: percentile(
        rows.map((r) => r.main),
        0.95,
      ),
      max: Math.max(0, ...rows.map((r) => r.main)),
    },
    drawCalls: { p50: percentile(rows.map((r) => r.calls), 0.5), max: Math.max(0, ...rows.map((r) => r.calls)) },
    triangles: { p50: percentile(rows.map((r) => r.tris), 0.5), max: Math.max(0, ...rows.map((r) => r.tris)) },
    longFrames: { over50: long50.length, over100: rows.filter((r) => r.dt > 100).length, bySection: bySection(long50) },
    loaf: {
      count: loaf.filter((l) => l.duration > 50).length,
      bySection: bySection(loaf.filter((l) => l.duration > 50)),
      worst: [...loaf]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 8)
        .map((l) => ({ ...l, section: sectionAt(spans, l.y) })),
    },
    created: {
      programs: after.programs - before.programs,
      geometries: after.geometries - before.geometries,
      textures: after.textures - before.textures,
    },
    reactCommits: after.commits - before.commits,
    scrollTriggerRefreshes: refreshes,
    sections,
  }
}

function gpuName(): string {
  const gl = probe.gl?.getContext()
  if (!gl) return '—'
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
}

const r1 = (x: number) => Math.round(x * 10) / 10

function showCard(res: BenchResults): void {
  const card = document.createElement('div')
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-label', 'Benchmark results')
  card.style.cssText = [
    'position:fixed',
    'left:50%',
    'top:50%',
    'transform:translate(-50%,-50%)',
    'z-index:2147483001',
    'width:min(760px,calc(100vw - 32px))',
    'max-height:calc(100vh - 96px)',
    'overflow:auto',
    'padding:18px 20px',
    'font:12px/1.5 ui-monospace,Menlo,Consolas,monospace',
    'color:#e9f1ff',
    'background:#070a12',
    'border:1px solid rgba(255,255,255,.25)',
    'pointer-events:auto',
    'font-variant-numeric:tabular-nums',
  ].join(';')
  const lines: string[] = [
    `NUMBERS → REALITY · scroll benchmark`,
    `${res.meta.gpu} · ${res.meta.viewport} @${res.meta.dpr}x · tier ${res.meta.quality} · ${res.meta.mode}`,
    '',
  ]
  for (const p of res.passes) {
    lines.push(
      `PASS ${p.pass}  ${p.frames} frames in ${r1(p.seconds)} s  ·  avg ${r1(p.fps)} fps`,
      `  frame ms  p50 ${r1(p.frameMs.p50)}  p95 ${r1(p.frameMs.p95)}  p99 ${r1(p.frameMs.p99)}  worst ${r1(p.worst.ms)} @ y=${p.worst.y} (${p.worst.section})`,
      `  JS/frame p50 ${r1(p.jsMs.p50)}  p95 ${r1(p.jsMs.p95)} ms  ·  main/frame p50 ${r1(p.mainMs.p50)}  p95 ${r1(p.mainMs.p95)} ms`,
      `  frames >50 ms: ${p.longFrames.over50}  ${JSON.stringify(p.longFrames.bySection)}`,
      `  LoAF >50 ms: ${p.loaf.count}  ${JSON.stringify(p.loaf.bySection)}`,
      `  created: programs ${p.created.programs}, textures ${p.created.textures}, geometries ${p.created.geometries}`,
      `  React commits ${p.reactCommits} · ScrollTrigger.refresh ${p.scrollTriggerRefreshes} · draw calls p50 ${p.drawCalls.p50}`,
      '',
    )
  }
  const pre = document.createElement('pre')
  pre.style.cssText = 'margin:0 0 12px;white-space:pre-wrap'
  pre.textContent = lines.join('\n')
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Copy results'
  button.style.cssText =
    'font:600 12px ui-monospace,monospace;padding:8px 14px;margin-right:8px;border-radius:999px;border:0;background:#ff6b1f;color:#070a12;cursor:pointer'
  const json = JSON.stringify(res, null, 2)
  button.onclick = () => {
    const done = () => (button.textContent = 'Copied ✓')
    navigator.clipboard?.writeText(json).then(done, () => {
      const ta = document.createElement('textarea')
      ta.value = json
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      done()
    })
  }
  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = 'Close'
  close.style.cssText =
    'font:600 12px ui-monospace,monospace;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:none;color:#e9f1ff;cursor:pointer'
  close.onclick = () => card.remove()
  card.append(pre, button, close)
  document.body.appendChild(card)
}

export async function runBench(): Promise<void> {
  ;(window as unknown as { __nrBench: BenchState }).__nrBench = state
  installPerfHooks()
  await waitFor(() => useDirector.getState().ready, 600_000)
  await gate('settle', 2500)
  const spans = currentSpans().length ? currentSpans() : measureSections()
  const rows: FrameRow[] = []
  probe.recording = rows
  const passes: PassResult[] = []
  for (let pass = 1; pass <= FLAGS.benchPasses; pass++) {
    const max = document.documentElement.scrollHeight - window.innerHeight
    const start = rows.length
    const before = snapshot()
    state.phase = `pass${pass}`
    await leg(0, max, `pass${pass}-down`)
    await leg(max, 0, `pass${pass}-up`)
    const after = snapshot()
    passes.push(summarise(pass, rows.slice(start), before, after, spans))
    probe.tag = `gap${pass}`
    await gate(`gap${pass}`, 1500)
  }
  probe.recording = null
  const t0 = rows[0]?.t ?? 0
  const results: BenchResults = {
    meta: {
      date: new Date().toISOString(),
      url: location.href,
      ua: navigator.userAgent,
      gpu: gpuName(),
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      dpr: probe.gl?.getPixelRatio() ?? window.devicePixelRatio,
      quality: useDirector.getState().quality,
      pinned: !!FLAGS.quality,
      mode: FLAGS.benchStep ? `${FLAGS.benchStep} px/frame` : `${FLAGS.benchSpeed} px/s`,
      pageHeight: document.documentElement.scrollHeight,
    },
    passes,
    events: probe.events.filter((e) => e.t >= t0).map((e) => ({ ...e, section: sectionAt(spans, e.y) })),
    sectionsPx: spans,
  }
  state.results = results
  state.phase = 'done'
  console.info('[bench]', results)
  showCard(results)
}
