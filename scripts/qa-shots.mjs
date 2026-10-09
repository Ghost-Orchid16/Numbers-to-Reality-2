#!/usr/bin/env node
/**
 * Visual QA: serves the production build, drives Chromium (SwiftShader WebGL) through each key
 * scroll position at desktop 1440×900 and mobile 390×844, saves screenshots to qa/ and fails on
 * console errors. Chromium is pre-installed (PLAYWRIGHT_BROWSERS_PATH); never `playwright install`.
 *
 *   npm run build && npm run qa:shots            # all shots
 *   npm run qa:shots -- --only=desktop           # one viewport
 *   npm run qa:shots -- --reduced                # prefers-reduced-motion pass
 */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { preview } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = new Set(process.argv.slice(2))
const only = [...args].find((a) => a.startsWith('--only='))?.split('=')[1]
const reduced = args.has('--reduced')
const outDir = `${root}qa/`
await mkdir(outDir, { recursive: true })

const server = await preview({ root, preview: { port: 4317, strictPort: false, open: false }, logLevel: 'warn' })
const url = server.resolvedUrls.local[0]

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
})

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
].filter((v) => !only || v.name === only)

/** Scroll targets, resolved in the page (pin spacers make offsets dynamic). */
const SHOTS = [
  { name: '01-hero', at: { kind: 'y', value: 0 }, wait: 2500 },
  { name: '02-hero-swarm', at: { kind: 'hero', p: 0.42 }, wait: 3000 },
  { name: '03-hero-assembled', at: { kind: 'hero', p: 0.9 }, wait: 3500 },
  { name: '04-rocket-title', at: { kind: 'el', sel: '#rocket-title', offset: 0.15 }, wait: 3000 },
  { name: '05-marquee', at: { kind: 'el', sel: '.marquee', offset: -0.4 }, wait: 2000 },
  { name: '06-countdown', at: { kind: 'flight', p: 0.035 }, wait: 3000 },
  { name: '07-liftoff', at: { kind: 'flight', p: 0.16 }, wait: 3500 },
  { name: '08-climb', at: { kind: 'flight', p: 0.33 }, wait: 3500 },
  { name: '09-maxq', at: { kind: 'flight', p: 0.5 }, wait: 3500 },
  { name: '10-thin-air', at: { kind: 'flight', p: 0.72 }, wait: 3500 },
  { name: '11-meco', at: { kind: 'flight', p: 0.93 }, wait: 4000 },
  { name: '12-lab', at: { kind: 'el', sel: '#rocket-lab', offset: 0 }, wait: 3500 },
  { name: '13-lab-flying', at: { kind: 'el', sel: '#rocket-lab', offset: 0 }, wait: 1500, launch: 6000 },
  { name: '14-maths', at: { kind: 'el', sel: '#rocket-maths', offset: 0.1 }, wait: 2500 },
  { name: '15-reality', at: { kind: 'el', sel: '#rocket-reality', offset: 0.05 }, wait: 2000 },
  { name: '16-closing', at: { kind: 'y', value: 1e9 }, wait: 2000 },
]

let failures = 0
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

  const t0 = Date.now()
  await page.goto(`${url}?qa`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${outDir}${vp.name}${reduced ? '-reduced' : ''}-00-loader.png` })
  await page.waitForSelector('.loader', { state: 'detached', timeout: 180_000 })
  console.log(`${vp.name}: loader finished in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  await page.waitForTimeout(1500)

  for (const shot of SHOTS) {
    await page.evaluate((at) => {
      const doc = document.documentElement
      const vh = window.innerHeight
      let y = 0
      if (at.kind === 'y') y = Math.min(at.value, doc.scrollHeight - vh)
      else if (at.kind === 'hero') {
        const el = document.querySelector('.hero-scroll')
        y = el.offsetTop + (el.offsetHeight - vh) * at.p
      } else if (at.kind === 'flight') {
        const flight = document.querySelector('#rocket-flight')
        const spacer = flight.closest('.pin-spacer') ?? flight
        const top = spacer.getBoundingClientRect().top + window.scrollY
        y = top + (spacer.offsetHeight - vh) * at.p
      } else {
        const el = document.querySelector(at.sel)
        y = el.getBoundingClientRect().top + window.scrollY + vh * at.offset
      }
      window.scrollTo(0, y)
    }, shot.at)
    await page.waitForTimeout(shot.wait)
    if (shot.launch) {
      const button = page.locator('.lab-panel .btn-primary').first()
      if (await button.isVisible()) await button.click()
      await page.waitForTimeout(shot.launch)
    }
    await page.screenshot({ path: `${outDir}${vp.name}${reduced ? '-reduced' : ''}-${shot.name}.png` })
    process.stdout.write('.')
  }
  process.stdout.write('\n')
  // leak check: GPU resources after two full passes down and up must not grow
  const memory = async () =>
    page.evaluate(() => {
      const gl = window.__nrQA?.gl
      return gl ? { ...gl.info.memory, programs: gl.info.programs?.length ?? 0 } : null
    })
  const sweep = async () => {
    for (const dir of [1, -1]) {
      const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
      for (let k = 0; k <= 12; k++) {
        const f = dir === 1 ? k / 12 : 1 - k / 12
        await page.evaluate((y) => window.scrollTo(0, y), f * max)
        await page.waitForTimeout(350)
      }
    }
  }
  await sweep()
  const m1 = await memory()
  await sweep()
  const m2 = await memory()
  console.log(`${vp.name}: renderer.info after pass 1 ${JSON.stringify(m1)} · after pass 2 ${JSON.stringify(m2)}`)
  if (m1 && m2 && (m2.geometries > m1.geometries || m2.textures > m1.textures)) {
    failures++
    console.log(`${vp.name}: GPU memory grew between passes`)
  }
  const stats = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    fontsLoaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
  }))
  console.log(`${vp.name}: page height ${stats.height}px; fonts loaded: ${[...new Set(stats.fontsLoaded)].join(', ')}`)
  if (errors.length) {
    failures += errors.length
    console.log(`${vp.name}: ${errors.length} console messages:\n  ${[...new Set(errors)].slice(0, 30).join('\n  ')}`)
  } else console.log(`${vp.name}: zero console errors/warnings`)
  await context.close()
}

await browser.close()
await server.close()
process.exit(failures ? 1 : 0)
