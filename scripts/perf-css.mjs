#!/usr/bin/env node
/**
 * npm run perf:css — what the page's CSS effects cost to composite (report only: each of them is
 * part of the look). Serves dist/, hides the WebGL canvas so only the DOM is rasterised and
 * composited, and measures frame time at rest and while scrolling at three positions with each
 * effect toggled off in turn: the grain's mix-blend-mode, the grain, the vignette, the lab panel's
 * backdrop-filter, the countdown's SVG filter.
 *
 * Software compositing (SwiftShader) here: compare the variants with each other, not with a GPU.
 *   npm run build && npm run perf:css
 */
import { chromium } from 'playwright'
import { preview } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const server = await preview({ root, build: { outDir: 'dist' }, preview: { port: 4350, strictPort: false }, logLevel: 'warn' })
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage()
await page.goto(`${base}?quality=high&dpr=0.5`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.loader', { state: 'detached', timeout: 600_000 })
await page.waitForTimeout(3000)
await page.addStyleTag({ content: '.stage{visibility:hidden!important}' })

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

const out = {}
for (const [pos, fn] of Object.entries(POS)) {
  const y = await page.evaluate(`(${fn.toString()})()`)
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(y))
  await page.waitForTimeout(1500)
  for (const [name, css] of Object.entries(VARIANTS)) {
    const h = css ? await page.addStyleTag({ content: css }) : null
    await page.waitForTimeout(400)
    const rest = await measure('rest')
    const scroll = await measure('scroll')
    out[`${pos} · ${name}`] = { restMean: +rest.mean.toFixed(2), scrollMean: +scroll.mean.toFixed(2) }
    if (h) await h.evaluate((el) => el.remove())
  }
}
console.table(out)
await browser.close()
await server.close()
