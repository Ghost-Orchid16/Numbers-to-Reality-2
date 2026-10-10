#!/usr/bin/env node
/**
 * npm run bench — the in-page ?bench scroll benchmark, driven headless (Playwright + CDP).
 *
 * Serves the production build (run `npm run build` first), opens `?bench&harness`, and at each
 * pass boundary records Performance.getMetrics (ScriptDuration, LayoutDuration,
 * RecalcStyleDuration, LayoutCount, RecalcStyleCount, JSHeapUsedSize…) and renderer.info. The
 * second pass is traced (devtools.timeline) for a per-frame main-thread breakdown
 * (script / style / layout). Writes perf/baseline.json, or --out=<file>.
 *
 * Headless WebGL is software (SwiftShader): its frame rate says nothing about a real GPU. Compare
 * main-thread time, counts (programs, textures, geometries, React commits, refreshes) and
 * hitches. The canvas renders at ?dpr=0.5 by default to keep runs short — DOM, layout, JS and
 * draw calls are identical at any pixel ratio.
 *
 *   npm run build && npm run bench
 *   npm run bench -- --out=perf/after.json --viewport=1920x1080 --step=160 --dpr=1
 *
 * Exit code 1 when pass 2 creates GPU programs/textures/geometries (a hitch at a boundary).
 * Chromium is pre-installed (PLAYWRIGHT_BROWSERS_PATH); never `playwright install`.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { parseTrace } from './lib/trace.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const out = arg('out', 'perf/baseline.json')
const [vw, vh] = arg('viewport', '1280x720').split('x').map(Number)
const step = Number(arg('step', '140'))
const quality = arg('quality', 'high')
const dpr = Number(arg('dpr', '0.5'))
const outDir = arg('dist', 'dist')

const server = await preview({ root, build: { outDir }, preview: { port: 4330, strictPort: false, open: false }, logLevel: 'warn' })
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
})
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 })
const page = await context.newPage()
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`))
const cdp = await context.newCDPSession(page)
await cdp.send('Performance.enable', { timeDomain: 'threadTicks' })

const metrics = async () => {
  const { metrics: list } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(list.map((m) => [m.name, m.value]))
}
const info = () =>
  page.evaluate(() => {
    const gl = window.__nrPerf?.gl
    return gl ? { programs: gl.info.programs?.length ?? 0, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures } : null
  })
const phase = () => page.evaluate(() => window.__nrBench?.phase ?? 'loading')
const waitPhase = async (p, timeout = 3_600_000) => {
  const t0 = Date.now()
  for (;;) {
    if ((await phase()) === p) return
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${p}`)
    await page.waitForTimeout(500)
  }
}
const ack = (p) => page.evaluate((x) => (window.__nrBench.ack = x), p)

const KEYS = ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration', 'LayoutCount', 'RecalcStyleCount']
const delta = (a, b) => Object.fromEntries(KEYS.map((k) => [k, +(b[k] - a[k]).toFixed(4)]))

const url = `${base}?bench&harness&step=${step}&quality=${quality}&dpr=${dpr}`
console.log(`bench: ${url} @ ${vw}×${vh}`)
const t0 = Date.now()
await page.goto(url, { waitUntil: 'domcontentloaded' })
await waitPhase('settle')
console.log(`bench: loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
const m0 = await metrics()
const i0 = await info()
await ack('settle')

await waitPhase('gap1')
const m1 = await metrics()
const i1 = await info()
console.log(`bench: pass 1 done (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
const categories = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel', 'v8.execute', 'blink.user_timing']
await browser.startTracing(page, { categories })
await ack('gap1')

await waitPhase('gap2')
const traceBuf = await browser.stopTracing()
const m2 = await metrics()
const i2 = await info()
console.log(`bench: pass 2 done (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
await ack('gap2')
await waitPhase('done')
const results = await page.evaluate(() => window.__nrBench.results)

// ── per-frame main-thread breakdown of pass 2 from the trace ───────────────────────────────
function frameBreakdown(buf) {
  const events = parseTrace(buf)
  const threads = new Map()
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args?.name)
  // the renderer main thread with the most animation frames is the page's
  const counts = new Map()
  for (const e of events) {
    if (e.name !== 'FireAnimationFrame') continue
    const key = `${e.pid}:${e.tid}`
    if (threads.get(key) === 'CrRendererMain') counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const mainKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!mainKey) return null
  const main = events.filter((e) => `${e.pid}:${e.tid}` === mainKey && e.ph === 'X' && typeof e.dur === 'number')
  main.sort((a, b) => a.ts - b.ts)
  const tasks = main.filter((e) => e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask')
  const JS = new Set(['FunctionCall', 'FireAnimationFrame', 'EvaluateScript', 'TimerFire', 'EventDispatch', 'v8.callFunction', 'v8.evaluateModule', 'RunMicrotasks', 'FireIdleCallback', 'XHRReadyStateChange'])
  const merge = (list) => {
    const iv = list.map((e) => [e.ts, e.ts + e.dur]).sort((a, b) => a[0] - b[0])
    const outIv = []
    for (const [s, f] of iv) {
      const last = outIv[outIv.length - 1]
      if (last && s <= last[1]) last[1] = Math.max(last[1], f)
      else outIv.push([s, f])
    }
    return outIv
  }
  const length = (iv) => iv.reduce((a, [s, f]) => a + (f - s), 0)
  const overlap = (a, b) => {
    let i = 0
    let j = 0
    let sum = 0
    while (i < a.length && j < b.length) {
      const s = Math.max(a[i][0], b[j][0])
      const f = Math.min(a[i][1], b[j][1])
      if (f > s) sum += f - s
      if (a[i][1] < b[j][1]) i++
      else j++
    }
    return sum
  }
  // frame starts: tasks that ran animation-frame callbacks
  const rafs = main.filter((e) => e.name === 'FireAnimationFrame')
  const frameStarts = []
  let ti = 0
  for (const r of rafs) {
    while (ti < tasks.length && tasks[ti].ts + tasks[ti].dur < r.ts) ti++
    const task = tasks[ti]
    const start = task && task.ts <= r.ts ? task.ts : r.ts
    if (frameStarts[frameStarts.length - 1] !== start) frameStarts.push(start)
  }
  const frames = []
  for (let k = 0; k + 1 < frameStarts.length; k++) {
    const a = frameStarts[k]
    const b = frameStarts[k + 1]
    const inside = main.filter((e) => e.ts >= a && e.ts < b)
    const js = merge(inside.filter((e) => JS.has(e.name)))
    const style = merge(inside.filter((e) => e.name === 'UpdateLayoutTree'))
    const layout = merge(inside.filter((e) => e.name === 'Layout'))
    const paint = merge(inside.filter((e) => ['Paint', 'PrePaint', 'Layerize', 'UpdateLayer', 'Commit', 'PaintImage', 'RasterTask'].includes(e.name)))
    const styleLen = length(style)
    const layoutLen = length(layout)
    const script = length(js) - overlap(js, merge([...style, ...layout].map(([s, f]) => ({ ts: s, dur: f - s }))))
    frames.push({ script: script / 1000, style: styleLen / 1000, layout: layoutLen / 1000, paint: length(paint) / 1000 })
  }
  const pct = (arr, p) => {
    if (!arr.length) return 0
    const s = [...arr].sort((x, y) => x - y)
    const kk = (s.length - 1) * p
    const lo = Math.floor(kk)
    const hi = Math.min(s.length - 1, lo + 1)
    return +(s[lo] + (s[hi] - s[lo]) * (kk - lo)).toFixed(3)
  }
  const col = (key) => frames.map((f) => f[key])
  const total = frames.map((f) => f.script + f.style + f.layout)
  return {
    frames: frames.length,
    scriptMs: { p50: pct(col('script'), 0.5), p95: pct(col('script'), 0.95), max: pct(col('script'), 1) },
    styleMs: { p50: pct(col('style'), 0.5), p95: pct(col('style'), 0.95), max: pct(col('style'), 1) },
    layoutMs: { p50: pct(col('layout'), 0.5), p95: pct(col('layout'), 0.95), max: pct(col('layout'), 1) },
    paintMs: { p50: pct(col('paint'), 0.5), p95: pct(col('paint'), 0.95), max: pct(col('paint'), 1) },
    scriptStyleLayoutMs: { p50: pct(total, 0.5), p95: pct(total, 0.95), max: pct(total, 1) },
  }
}

const trace = frameBreakdown(traceBuf)
let git = ''
try {
  git = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim()
} catch {
  git = 'unknown'
}
const report = {
  meta: {
    date: new Date().toISOString(),
    git,
    chromium: browser.version(),
    renderer: 'SwiftShader (software) — compare main-thread time, counts and hitches, not fps',
    viewport: `${vw}×${vh}`,
    canvasDpr: dpr,
    step: `${step} px/frame`,
    quality,
  },
  cdp: { pass1: delta(m0, m1), pass2: delta(m1, m2), heapUsedMB: +(m2.JSHeapUsedSize / 1e6).toFixed(1), nodes: m2.Nodes },
  rendererInfo: { start: i0, afterPass1: i1, afterPass2: i2 },
  traceDuringPass2: trace,
  page: results,
  consoleErrors,
}
await mkdir(dirname(`${root}${out}`), { recursive: true })
await writeFile(`${root}${out}`, JSON.stringify(report, null, 2))

const p2 = results.passes[1] ?? results.passes[0]
const line = (p) =>
  `pass ${p.pass}: ${p.frames} frames · JS/frame p95 ${p.jsMs.p95.toFixed(2)} ms · main/frame p95 ${p.mainMs.p95.toFixed(2)} ms · LoAF>50 ${p.loaf.count} · created programs ${p.created.programs} textures ${p.created.textures} geometries ${p.created.geometries} · React commits ${p.reactCommits} · refreshes ${p.scrollTriggerRefreshes}`
for (const p of results.passes) console.log(line(p))
if (trace) console.log(`pass 2 trace: script+style+layout per frame p50 ${trace.scriptStyleLayoutMs.p50} ms · p95 ${trace.scriptStyleLayoutMs.p95} ms (style p95 ${trace.styleMs.p95}, layout p95 ${trace.layoutMs.p95})`)
console.log(`CDP pass 2: script ${report.cdp.pass2.ScriptDuration.toFixed(2)} s · style ${report.cdp.pass2.RecalcStyleDuration.toFixed(2)} s (${report.cdp.pass2.RecalcStyleCount}×) · layout ${report.cdp.pass2.LayoutDuration.toFixed(2)} s (${report.cdp.pass2.LayoutCount}×)`)
console.log(`wrote ${out}${consoleErrors.length ? ` · ${consoleErrors.length} console errors` : ''}`)

await browser.close()
await server.close()
const leaked = p2.created.programs + p2.created.textures + p2.created.geometries
process.exit(leaked > 0 ? 1 : 0)
