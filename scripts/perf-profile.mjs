#!/usr/bin/env node
/**
 * npm run perf:profile — find out what every hitch is made of.
 *
 * Builds an unminified production bundle (dist-profile/, readable function names), opens
 * `?perf`, then scrolls the page top → bottom → top twice at a fixed step while Chromium traces
 * with the V8 CPU profiler on. Each frame drops a `performance.mark` with the scroll position,
 * so every long main-thread task in the trace can be placed on the page. For each task over
 * --min ms (default 80) it reports the trace events inside it (style, layout, GC, compile…),
 * the functions that used its time (CPU profile samples) and the probe's events in it
 * (new GPU programs, React commits, ScrollTrigger refreshes). Writes perf/profile.json.
 *
 *   npm run perf:profile
 *   npm run perf:profile -- --skip-build --min=50 --step=120 --passes=1
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { build, preview } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const minMs = Number(arg('min', '80'))
const step = Number(arg('step', '140'))
const passes = Number(arg('passes', '2'))
const [vw, vh] = arg('viewport', '1280x720').split('x').map(Number)
const out = arg('out', 'perf/profile.json')
const query = arg('query', 'quality=high&dpr=0.5')

if (!process.argv.includes('--skip-build')) {
  console.log('building unminified bundle → dist-profile/')
  await build({ root, logLevel: 'warn', build: { outDir: 'dist-profile', emptyOutDir: true, minify: false } })
}
const server = await preview({ root, build: { outDir: 'dist-profile' }, preview: { port: 4350, strictPort: false, open: false }, logLevel: 'warn' })
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
})
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 })
const page = await context.newPage()
await page.goto(`${base}?perf&${query}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.loader', { state: 'detached', timeout: 900_000 })
await page.waitForTimeout(3000)
console.log('loaded; tracing the scroll passes…')

await browser.startTracing(page, {
  categories: [
    'devtools.timeline',
    'disabled-by-default-devtools.timeline',
    'disabled-by-default-v8.cpu_profiler',
    'v8.execute',
    'v8',
    'toplevel',
    'blink.user_timing',
    'disabled-by-default-devtools.timeline.invalidationTracking',
    'disabled-by-default-devtools.timeline.stack',
  ],
})
const t0Probe = await page.evaluate(() => performance.now())
await page.evaluate(
  async ({ step, passes }) => {
    const frame = () => new Promise((r) => requestAnimationFrame(r))
    const max = () => document.documentElement.scrollHeight - innerHeight
    const go = async (from, to, tag) => {
      const dir = Math.sign(to - from)
      for (let y = from; dir > 0 ? y <= to : y >= to; y += dir * step) {
        window.scrollTo(0, y)
        await frame()
        performance.mark(`y:${Math.round(scrollY)}:${tag}`)
      }
      for (let k = 0; k < 20; k++) {
        await frame()
        performance.mark(`y:${Math.round(scrollY)}:${tag}`)
      }
    }
    for (let p = 1; p <= passes; p++) {
      await go(0, max(), `pass${p}-down`)
      await go(max(), 0, `pass${p}-up`)
    }
  },
  { step, passes },
)
const buf = await browser.stopTracing()
const probeEvents = await page.evaluate((t0) => (window.__nrPerf?.events ?? []).filter((e) => e.t >= t0), t0Probe)
const sections = await page.evaluate(() => {
  const list = [
    ['hero', '#intro'],
    ['title', '#rocket-title'],
    ['marquee', '#rocket .marquee'],
    ['flight', '#rocket-flight'],
    ['lab', '#rocket-lab'],
    ['maths', '#rocket-maths'],
    ['reality', '#rocket-reality'],
    ['closing', '.closing'],
  ]
  return list
    .map(([name, sel]) => {
      let el = document.querySelector(sel)
      if (!el) return null
      el = el.closest('.pin-spacer') ?? el
      const r = el.getBoundingClientRect()
      return { name, top: r.top + scrollY, bottom: r.top + scrollY + r.height }
    })
    .filter(Boolean)
})
await browser.close()
await server.close()

// ── analysis ────────────────────────────────────────────────────────────────────────────────
const events = JSON.parse(buf.toString()).traceEvents ?? []
const threadName = new Map()
for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') threadName.set(`${e.pid}:${e.tid}`, e.args?.name)
const marks = events.filter((e) => e.cat?.includes('blink.user_timing') && e.name?.startsWith('y:'))
const mainKey = marks.length ? `${marks[0].pid}:${marks[0].tid}` : null
if (!mainKey) throw new Error('no marks in trace')
const markList = marks.map((m) => ({ ts: m.ts, y: Number(m.name.split(':')[1]), tag: m.name.split(':')[2] })).sort((a, b) => a.ts - b.ts)
const sectionAt = (y) => {
  const mid = y + vh / 2
  let name = sections[0]?.name
  for (const s of sections) {
    if (mid >= s.top) name = s.name
    if (mid >= s.top && mid < s.bottom) return s.name
  }
  return name
}
const where = (ts) => {
  let m = markList[0]
  for (const x of markList) {
    if (x.ts > ts) break
    m = x
  }
  return m ? { y: m.y, tag: m.tag, section: sectionAt(m.y) } : { y: -1, tag: '', section: '' }
}

// CPU profile samples (all chunks), main thread only
const nodes = new Map()
const samples = []
const profiles = new Map()
for (const e of events) {
  if (e.name === 'Profile') profiles.set(e.id, { startTime: e.args.data.startTime, last: e.args.data.startTime, pid: e.pid, tid: e.tid })
}
for (const e of events) {
  if (e.name !== 'ProfileChunk') continue
  const prof = profiles.get(e.id)
  if (!prof || `${prof.pid}:${prof.tid}` !== mainKey) continue
  const cp = e.args.data.cpuProfile ?? {}
  for (const n of cp.nodes ?? []) nodes.set(n.id, n)
  const deltas = e.args.data.timeDeltas ?? []
  ;(cp.samples ?? []).forEach((id, i) => {
    prof.last += deltas[i] ?? 0
    samples.push({ ts: prof.last, id })
  })
}
samples.sort((a, b) => a.ts - b.ts)
const fnName = (id) => {
  const n = nodes.get(id)
  if (!n) return '?'
  const cf = n.callFrame ?? {}
  const file = (cf.url ?? '').split('/').pop()
  return `${cf.functionName || '(anonymous)'}${file ? ` ${file}:${(cf.lineNumber ?? 0) + 1}` : ''}`
}

const main = events.filter((e) => `${e.pid}:${e.tid}` === mainKey && e.ph === 'X' && typeof e.dur === 'number')
const tasks = main.filter((e) => e.name === 'RunTask' && e.dur >= minMs * 1000).sort((a, b) => a.ts - b.ts)
const INTERESTING = new Set([
  'UpdateLayoutTree',
  'Layout',
  'Paint',
  'PrePaint',
  'Layerize',
  'FireAnimationFrame',
  'FunctionCall',
  'EventDispatch',
  'TimerFire',
  'MinorGC',
  'MajorGC',
  'V8.GC_SCAVENGER',
  'V8.GC_MARK_COMPACTOR',
  'v8.compile',
  'V8.CompileCode',
  'ParseHTML',
  'EvaluateScript',
  'Decode Image',
  'ResizeObserver',
  'IntersectionObserverController::computeIntersections',
])
const hitches = tasks.map((t) => {
  const inside = main.filter((e) => e.ts >= t.ts && e.ts + e.dur <= t.ts + t.dur && e !== t)
  const byName = {}
  for (const e of inside) if (INTERESTING.has(e.name)) byName[e.name] = (byName[e.name] ?? 0) + e.dur / 1000
  // self time per function from samples inside the task
  const self = new Map()
  const inTask = samples.filter((s) => s.ts >= t.ts && s.ts <= t.ts + t.dur)
  for (let i = 0; i < inTask.length; i++) {
    const dt = ((inTask[i + 1]?.ts ?? t.ts + t.dur) - inTask[i].ts) / 1000
    const name = fnName(inTask[i].id)
    self.set(name, (self.get(name) ?? 0) + dt)
  }
  const top = [...self.entries()]
    .filter(([n]) => n !== '(idle)')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([n, ms]) => `${ms.toFixed(1)} ms  ${n}`)
  const w = where(t.ts)
  return {
    ms: +(t.dur / 1000).toFixed(1),
    y: w.y,
    section: w.section,
    tag: w.tag,
    breakdown: Object.fromEntries(Object.entries(byName).map(([k, v]) => [k, +v.toFixed(1)])),
    topFunctions: top,
  }
})
// ── style: what gets recalculated every frame, and what invalidates it ─────────────────────
const recalcs = main.filter((e) => e.name === 'UpdateLayoutTree')
const elementsPerRecalc = recalcs.map((e) => e.args?.elementCount ?? e.args?.beginData?.elementCount ?? 0)
const frameTasks = main
  .filter((e) => e.name === 'RunTask')
  .filter((t) => main.some((e) => e.name === 'FireAnimationFrame' && e.ts >= t.ts && e.ts <= t.ts + t.dur))
const perFrame = frameTasks.map((t) => {
  const inside = recalcs.filter((e) => e.ts >= t.ts && e.ts <= t.ts + t.dur)
  return {
    recalcs: inside.length,
    elements: inside.reduce((a, e) => a + (e.args?.elementCount ?? 0), 0),
    styleMs: inside.reduce((a, e) => a + e.dur / 1000, 0),
  }
})
const pct = (arr, p) => {
  if (!arr.length) return 0
  const s2 = [...arr].sort((x, y) => x - y)
  return s2[Math.min(s2.length - 1, Math.round((s2.length - 1) * p))]
}
// forced recalcs: UpdateLayoutTree inside a script event, with the JS function that read layout
const jsEvents = main.filter((e) => ['FunctionCall', 'FireAnimationFrame', 'EventDispatch', 'TimerFire'].includes(e.name))
const forcedBy = new Map()
for (const r of recalcs) {
  const host = jsEvents.find((j) => r.ts >= j.ts && r.ts + r.dur <= j.ts + j.dur)
  if (!host) continue
  const st = r.args?.beginData?.stackTrace ?? []
  const top = st[0] ? `${st[0].functionName || '(anonymous)'} ${(st[0].url ?? '').split('/').pop()}:${st[0].lineNumber}` : `(no stack) in ${host.name}`
  const cur = forcedBy.get(top) ?? { count: 0, ms: 0, elements: 0 }
  cur.count++
  cur.ms += r.dur / 1000
  cur.elements += r.args?.elementCount ?? 0
  forcedBy.set(top, cur)
}
// invalidations: which node and why
const inval = new Map()
for (const e of events) {
  if (!e.name?.endsWith('InvalidationTracking')) continue
  const d = e.args?.data ?? {}
  const key = `${e.name.replace('InvalidationTracking', '')} · ${d.reason ?? '?'} · ${d.nodeName ?? '?'}${d.changedClass ? ` .${d.changedClass}` : ''}${d.changedAttribute ? ` [${d.changedAttribute}]` : ''}${d.changedPseudo ? ` :${d.changedPseudo}` : ''}`
  inval.set(key, (inval.get(key) ?? 0) + 1)
}
const style = {
  frames: perFrame.length,
  recalcsPerFrame: { p50: pct(perFrame.map((f) => f.recalcs), 0.5), p95: pct(perFrame.map((f) => f.recalcs), 0.95) },
  elementsPerFrame: { p50: pct(perFrame.map((f) => f.elements), 0.5), p95: pct(perFrame.map((f) => f.elements), 0.95), max: pct(perFrame.map((f) => f.elements), 1) },
  styleMsPerFrame: { p50: +pct(perFrame.map((f) => f.styleMs), 0.5).toFixed(2), p95: +pct(perFrame.map((f) => f.styleMs), 0.95).toFixed(2) },
  elementsPerRecalc: { p50: pct(elementsPerRecalc, 0.5), p95: pct(elementsPerRecalc, 0.95) },
  forcedBy: [...forcedBy.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 15).map(([k, v]) => ({ at: k, ...v, ms: +v.ms.toFixed(1) })),
  invalidations: [...inval.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => `${n}× ${k}`),
}
const report = {
  meta: { date: new Date().toISOString(), viewport: `${vw}×${vh}`, step, passes, minMs, query },
  sections,
  style,
  hitches,
  probeEvents,
}
await mkdir(`${root}perf`, { recursive: true })
await writeFile(`${root}${out}`, JSON.stringify(report, null, 2))
for (const h of hitches) {
  console.log(`\n${h.ms} ms · ${h.section} (y=${h.y}, ${h.tag}) · ${JSON.stringify(h.breakdown)}`)
  for (const f of h.topFunctions.slice(0, 6)) console.log(`    ${f}`)
}
console.log(`\nstyle per frame: ${JSON.stringify({ recalcs: style.recalcsPerFrame, elements: style.elementsPerFrame, ms: style.styleMsPerFrame })}`)
console.log('forced style/layout by:')
for (const f of style.forcedBy.slice(0, 10)) console.log(`    ${f.ms} ms · ${f.count}× · ${f.elements} el · ${f.at}`)
console.log('top invalidations:')
for (const i of style.invalidations.slice(0, 15)) console.log(`    ${i}`)
console.log(`\n${hitches.length} tasks ≥ ${minMs} ms · wrote ${out}`)
