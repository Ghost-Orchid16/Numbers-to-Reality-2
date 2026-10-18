#!/usr/bin/env node
/**
 * npm run perf:shots — deterministic screenshots for visual-parity checks.
 *
 * Builds the app in `qa` mode (the ?still diagnostics are compiled out of production builds)
 * into dist-qa/, then opens `?still&quality=high` — frozen ambient clock, seeded randomness,
 * no CSS motion, pinned render tier — and shoots fixed scroll positions at 1920×1080,
 * 1440×900 and 390×844 into perf/<set>/. Compare two sets with `npm run perf:diff`.
 *
 *   npm run perf:shots -- --set=before
 *   npm run perf:shots -- --set=after --only=desktop-1920 --skip-build
 *
 * Every shot waits for the scroll smoothing, the scrub and the camera damping to settle
 * (a minimum of rendered frames and of wall time), so two runs of the same build match pixel
 * for pixel. Chromium is pre-installed (PLAYWRIGHT_BROWSERS_PATH); never `playwright install`.
 */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { build, preview } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const set = arg('set', 'before')
const only = arg('only', '')
const shotFilter = arg('shots', '')
const minFrames = Number(arg('frames', '8'))
const minWait = Number(arg('wait', '6000'))
const outDir = `${root}perf/${set}/`
await mkdir(outDir, { recursive: true })

if (!process.argv.includes('--skip-build')) {
  console.log('building qa bundle → dist-qa/')
  await build({ root, mode: 'qa', logLevel: 'warn', build: { outDir: 'dist-qa', emptyOutDir: true } })
}
const server = await preview({ root, build: { outDir: 'dist-qa' }, preview: { port: 4340, strictPort: false, open: false }, logLevel: 'warn' })
const base = server.resolvedUrls.local[0]
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
})

const VIEWPORTS = [
  { name: 'desktop-1920', width: 1920, height: 1080, isMobile: false, hasTouch: false },
  { name: 'desktop-1440', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'mobile-390', width: 390, height: 844, isMobile: true, hasTouch: true },
].filter((v) => !only || only.split(',').includes(v.name))

/** Scroll targets, resolved in the page (pin spacers make offsets dynamic). */
const SHOTS = [
  { name: '01-hero-top', at: { kind: 'y', value: 0 } },
  { name: '02-hero-20', at: { kind: 'hero', p: 0.2 } },
  { name: '03-hero-swarm', at: { kind: 'hero', p: 0.42 } },
  { name: '04-hero-60', at: { kind: 'hero', p: 0.6 } },
  { name: '05-hero-80', at: { kind: 'hero', p: 0.8 } },
  { name: '06-hero-assembled', at: { kind: 'hero', p: 0.96 } },
  { name: '07-rocket-title', at: { kind: 'el', sel: '#rocket-title', offset: 0.15 } },
  { name: '08-marquee', at: { kind: 'el', sel: '#rocket .marquee', offset: -0.4 } },
  { name: '09-countdown', at: { kind: 'flight', p: 0.035 } },
  { name: '10-ignition', at: { kind: 'flight', p: 0.085 } },
  { name: '11-liftoff', at: { kind: 'flight', p: 0.16 } },
  { name: '12-climb', at: { kind: 'flight', p: 0.33 } },
  { name: '13-maxq', at: { kind: 'flight', p: 0.5 } },
  { name: '14-thin-air', at: { kind: 'flight', p: 0.72 } },
  { name: '15-meco', at: { kind: 'flight', p: 0.93 } },
  { name: '16-flight-end', at: { kind: 'flight', p: 0.995 } },
  { name: '17-lab', at: { kind: 'el', sel: '#rocket-lab', offset: 0 } },
  { name: '18-lab-flying', at: { kind: 'el', sel: '#rocket-lab', offset: 0 }, flyTo: 40 },
  { name: '19-maths', at: { kind: 'el', sel: '#rocket-maths', offset: 0.1 } },
  { name: '20-maths-deep', at: { kind: 'el', sel: '#rocket-maths', offset: 1.6 } },
  { name: '21-reality', at: { kind: 'el', sel: '#rocket-reality', offset: 0.05 } },
  { name: '22-closing', at: { kind: 'y', value: 1e9 } },
].filter((s) => !shotFilter || shotFilter.split(',').some((f) => s.name.startsWith(f)))

async function settle(page) {
  const f0 = await page.evaluate(() => window.__nrFrames)
  const t0 = Date.now()
  for (;;) {
    await page.waitForTimeout(250)
    const f = await page.evaluate(() => window.__nrFrames)
    if (f - f0 >= minFrames && Date.now() - t0 >= minWait) return
    if (Date.now() - t0 > 600_000) throw new Error('settle timeout')
  }
}

let failures = 0
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    reducedMotion: 'no-preference',
  })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  const t0 = Date.now()
  await page.goto(`${base}?still&quality=high&qa`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.loader', { state: 'detached', timeout: 900_000 })
  console.log(`${vp.name}: loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  await settle(page)

  for (const shot of SHOTS) {
    await page.evaluate((at) => {
      const vh = window.innerHeight
      const doc = document.documentElement
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
      window.scrollTo(0, Math.round(y))
    }, shot.at)
    await settle(page)
    if (shot.flyTo) {
      await page.evaluate((t) => window.__nrStill.flyTo(t), shot.flyTo)
      await settle(page)
    }
    // software GL can take many seconds per frame at 1920×1080: allow for it
    await page.screenshot({ path: `${outDir}${vp.name}-${shot.name}.png`, timeout: 900_000 })
    process.stdout.write('.')
  }
  process.stdout.write('\n')
  if (errors.length) {
    failures += errors.length
    console.log(`${vp.name}: ${errors.length} console errors:\n  ${[...new Set(errors)].slice(0, 20).join('\n  ')}`)
  }
  await context.close()
}

await browser.close()
await server.close()
console.log(`wrote ${VIEWPORTS.length * SHOTS.length} shots to perf/${set}/`)
process.exit(failures ? 1 : 0)
