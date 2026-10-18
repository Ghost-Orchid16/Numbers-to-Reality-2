#!/usr/bin/env node
/**
 * npm run perf:css — what the page's CSS effects cost to composite (report only: each of them is
 * part of the look). Serves dist/, hides the WebGL canvas so only the DOM is rasterised and
 * composited, and measures frame time at rest and while scrolling at three positions with each
 * effect toggled off in turn: the grain's mix-blend-mode, the grain, the vignette, the lab panel's
 * backdrop-filter, the countdown's SVG filter.
 *
 * The WebGL renderer's draw calls are stubbed out (the canvas is hidden anyway) and Chromium runs
 * without vsync or a frame-rate cap, so the frame interval is the real cost of style, layout,
 * raster and compositing rather than 16.7 ms. Software compositing (SwiftShader) here: compare
 * the variants with each other, not with a GPU.
 *   npm run build && npm run perf:css
 */
import { chromium } from 'playwright'
import { preview } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const server = await preview({ root, build: { outDir: 'dist' }, preview: { port: 4350, strictPort: false }, logLevel: 'warn' })
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
})
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage()
await page.goto(`${base}?quality=high&dpr=0.5&qa`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.loader', { state: 'detached', timeout: 600_000 })
await page.waitForTimeout(3000)
await page.addStyleTag({ content: '.stage{visibility:hidden!important}' })
// no WebGL work at all: only the DOM is rasterised and composited
await page.evaluate(() => {
  const gl = window.__nrQA?.gl
  if (gl) gl.render = () => {}
})

const VARIANTS = {
  baseline: '',
  'grain blend normal': '.grain{mix-blend-mode:normal!important}',
  'grain hidden': '.grain{display:none!important}',
  'vignette hidden': '.vignette{display:none!important}',
  'backdrop-filter none': '.lab-panel{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
  'countdown filter none': '.countdown-text{filter:none!important}',
}
const POS = {
  hero: () => 0,
  flight: () => { const s = document.querySelector('#rocket-flight').closest('.pin-spacer'); return s.getBoundingClientRect().top + scrollY + 0.05 * s.offsetHeight },
  lab: () => document.querySelector('#rocket-lab').getBoundingClientRect().top + scrollY,
}
const measure = (mode) => page.evaluate(async (mode) => {
  const N = 90, dts = []
  let last = performance.now()
  const y0 = scrollY
  for (let i = 0; i < N; i++) {
    if (mode === 'scroll') window.scrollTo(0, y0 + ((i % 30) - 15) * 12)
    await new Promise((r) => requestAnimationFrame(r))
    const now = performance.now(); dts.push(now - last); last = now
  }
  window.scrollTo(0, y0)
  dts.sort((a, b) => a - b)
  return { p50: dts[N >> 1], mean: dts.reduce((a, b) => a + b, 0) / N }
}, mode)

// A warm-up measurement first (it absorbs one-off work after the scroll), then three rounds with
// the variants in rotating order; each cell is the median of its three rounds (frame p50, ms).
const ROUNDS = 3
const names = Object.keys(VARIANTS)
const out = {}
const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1]
for (const [pos, fn] of Object.entries(POS)) {
  const y = await page.evaluate(`(${fn.toString()})()`)
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(y))
  await page.waitForTimeout(1500)
  await measure('rest')
  await measure('scroll')
  const samples = Object.fromEntries(names.map((n) => [n, { rest: [], scroll: [] }]))
  for (let r = 0; r < ROUNDS; r++) {
    for (let k = 0; k < names.length; k++) {
      const name = names[(k + r * 2) % names.length]
      const css = VARIANTS[name]
      const h = css ? await page.addStyleTag({ content: css }) : null
      await page.waitForTimeout(300)
      samples[name].rest.push((await measure('rest')).p50)
      samples[name].scroll.push((await measure('scroll')).p50)
      if (h) await h.evaluate((el) => el.remove())
    }
  }
  for (const n of names)
    out[`${pos} · ${n}`] = { restP50: +median(samples[n].rest).toFixed(2), scrollP50: +median(samples[n].scroll).toFixed(2) }
}
console.table(out)
await browser.close()
await server.close()
