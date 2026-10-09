#!/usr/bin/env node
/**
 * npm run perf:gpu — where the GPU time goes, component by component.
 *
 * Opens the production build with ?perf, parks the page at fixed scroll positions and measures
 * the mean frame interval with each scene component hidden in turn (sky, planet, glyphs,
 * ground, launch site, rocket, steam, everything). With software WebGL (SwiftShader) the frame
 * interval is GPU-bound, so the differences rank the fragment/vertex cost of each component;
 * absolute numbers are not those of a real GPU. Writes perf/gpu.json.
 *
 *   npm run build && npm run perf:gpu
 *   npm run perf:gpu -- --viewport=1920x1080 --frames=8
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { preview } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const [vw, vh] = arg('viewport', '1280x720').split('x').map(Number)
const frames = Number(arg('frames', '6'))
const out = arg('out', 'perf/gpu.json')
const dist = arg('dist', 'dist')
const query = arg('query', 'quality=high')

const server = await preview({ root, build: { outDir: dist }, preview: { port: 4360, strictPort: false, open: false }, logLevel: 'warn' })
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
})
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 })
await page.goto(`${base}?perf&${query}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.loader', { state: 'detached', timeout: 900_000 })

const POSITIONS = [
  { name: 'hero-top', at: { kind: 'y', value: 0 } },
  { name: 'hero-swarm', at: { kind: 'hero', p: 0.42 } },
  { name: 'pad-title', at: { kind: 'el', sel: '#rocket-title', offset: 0.15 } },
  { name: 'flight-climb', at: { kind: 'flight', p: 0.33 } },
  { name: 'flight-space', at: { kind: 'flight', p: 0.93 } },
  { name: 'lab', at: { kind: 'el', sel: '#rocket-lab', offset: 0 } },
  { name: 'closing', at: { kind: 'y', value: 1e9 } },
]

/** Which scene objects each variant hides (resolved in the page). */
const VARIANTS = ['all', 'sky', 'planet', 'glyphs', 'ground', 'site', 'rocket', 'steam', 'post-only']

await page.evaluate(() => {
  const s = window.__nrPerf.scene
  const pick = {
    sky: (o) => o.renderOrder === -100,
    planet: (o) => o.renderOrder === -90 || o.renderOrder === -89,
    glyphs: (o) => o.renderOrder === 10 && o.isMesh,
    ground: (o) => o.isMesh && o.geometry?.parameters?.width === 9000,
    site: (o) => o.name === 'launch-site',
    rocket: (o) => o.name === 'rocket',
    steam: (o) => o.renderOrder === 4,
    'post-only': (o) => o.parent === s,
  }
  window.__gpuHide = (variant) => {
    const hidden = []
    if (variant !== 'all')
      s.traverse((o) => {
        if (pick[variant](o) && o.visible) {
          hidden.push(o)
        }
      })
    // keep them hidden every frame (scenes set .visible themselves)
    const keep = () => hidden.forEach((o) => (o.visible = false))
    keep()
    return { count: hidden.length, keep, restore: () => hidden.forEach((o) => (o.visible = true)) }
  }
})

async function measure(variant) {
  return page.evaluate(
    async ({ variant, frames }) => {
      const frame = () => new Promise((r) => requestAnimationFrame(r))
      const h = window.__gpuHide(variant)
      let raf = 0
      const loop = () => {
        h.keep()
        raf = requestAnimationFrame(loop)
      }
      loop()
      for (let k = 0; k < 2; k++) await frame()
      const t0 = performance.now()
      for (let k = 0; k < frames; k++) await frame()
      const ms = (performance.now() - t0) / frames
      cancelAnimationFrame(raf)
      if (variant !== 'all') h.restore()
      await frame()
      return { ms, hidden: h.count }
    },
    { variant, frames },
  )
}

const results = []
for (const pos of POSITIONS) {
  await page.evaluate((at) => {
    const vh = innerHeight
    let y = 0
    if (at.kind === 'y') y = Math.min(at.value, document.documentElement.scrollHeight - vh)
    else if (at.kind === 'hero') {
      const el = document.querySelector('.hero-scroll')
      y = el.offsetTop + (el.offsetHeight - vh) * at.p
    } else if (at.kind === 'flight') {
      const spacer = document.querySelector('#rocket-flight').closest('.pin-spacer')
      y = spacer.getBoundingClientRect().top + scrollY + (spacer.offsetHeight - vh) * at.p
    } else y = document.querySelector(at.sel).getBoundingClientRect().top + scrollY + vh * at.offset
    window.scrollTo(0, y)
  }, pos.at)
  await page.waitForTimeout(4000)
  const row = { position: pos.name }
  const full = await measure('all')
  row.full = +full.ms.toFixed(1)
  for (const v of VARIANTS.slice(1)) {
    const r = await measure(v)
    row[v] = r.hidden ? +(full.ms - r.ms).toFixed(1) : null
  }
  results.push(row)
  console.log(JSON.stringify(row))
}
await browser.close()
await server.close()
await mkdir(`${root}perf`, { recursive: true })
await writeFile(
  `${root}${out}`,
  JSON.stringify(
    {
      meta: { date: new Date().toISOString(), viewport: `${vw}×${vh}`, frames, query, note: 'ms saved per frame when the component is hidden (SwiftShader)' },
      results,
    },
    null,
    2,
  ),
)
console.log(`wrote ${out}`)
