#!/usr/bin/env node
/**
 * npm run perf:diff — pixel comparison of two ?still screenshot sets (pixelmatch).
 *
 *   npm run perf:diff -- --a=before --b=after
 *
 * For every shot present in both perf/<a>/ and perf/<b>/: the number of differing pixels at
 * pixelmatch's perceptual threshold (0.1) and exactly (threshold 0). Writes perf/diff/report.md,
 * a full-resolution diff mask for every shot that differs, and one contact sheet per viewport
 * (perf/diff/sheet-<viewport>.jpg: before | after | diff, side by side) for review by eye.
 * Exit code 1 when any shot differs at the perceptual threshold.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const a = arg('a', 'before')
const b = arg('b', 'after')
const outName = arg('out', 'diff')
const dirA = `${root}perf/${a}/`
const dirB = `${root}perf/${b}/`
const dirD = `${root}perf/${outName}/`
await mkdir(dirD, { recursive: true })

const filesA = new Set((await readdir(dirA)).filter((f) => f.endsWith('.png')))
const files = (await readdir(dirB)).filter((f) => f.endsWith('.png') && filesA.has(f)).sort()
if (!files.length) {
  console.log(`no common shots in perf/${a}/ and perf/${b}/`)
  process.exit(1)
}

const rows = []
for (const f of files) {
  const pa = PNG.sync.read(await readFile(dirA + f))
  const pb = PNG.sync.read(await readFile(dirB + f))
  if (pa.width !== pb.width || pa.height !== pb.height) {
    rows.push({ f, size: 'mismatch', perceptual: -1, exact: -1 })
    continue
  }
  const { width, height } = pa
  const diff = new PNG({ width, height })
  const perceptual = pixelmatch(pa.data, pb.data, diff.data, width, height, { threshold: 0.1, diffMask: false, alpha: 0.25 })
  const exact = pixelmatch(pa.data, pb.data, null, width, height, { threshold: 0 })
  // diff image for the sheet (and kept at full resolution when anything differs)
  const diffPath = `${dirD}${f.replace('.png', '')}-diff.png`
  await writeFile(diffPath, PNG.sync.write(diff))
  rows.push({ f, width, height, perceptual, exact, pct: (100 * perceptual) / (width * height), diffPath })
}

// report
const md = [
  `# Visual parity — perf/${a} vs perf/${b}`,
  '',
  `pixelmatch, ${files.length} shots. "perceptual" = threshold 0.1 (anti-aliasing tolerant), "exact" = threshold 0.`,
  '',
  '| shot | size | differing px (perceptual) | % | differing px (exact) |',
  '| --- | --- | ---: | ---: | ---: |',
  ...rows.map((r) =>
    r.size === 'mismatch'
      ? `| ${r.f} | size mismatch | — | — | — |`
      : `| ${r.f.replace('.png', '')} | ${r.width}×${r.height} | ${r.perceptual} | ${r.pct.toFixed(4)} | ${r.exact} |`,
  ),
  '',
]
await writeFile(`${dirD}report.md`, md.join('\n'))

// contact sheets: one per viewport, rendered by Chromium into a JPEG
const browser = await chromium.launch()
const viewports = [...new Set(files.map((f) => f.split('-').slice(0, 2).join('-')))]
for (const vp of viewports) {
  const list = rows.filter((r) => r.f.startsWith(`${vp}-`) && r.size !== 'mismatch')
  if (!list.length) continue
  const mobile = vp.startsWith('mobile')
  const w = mobile ? 230 : 520
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#0b0d12;color:#dfe6f3;font:13px ui-monospace,monospace}
    h1{font-size:15px;margin:14px 16px}
    .row{display:flex;gap:10px;padding:8px 16px;border-top:1px solid #222a36;align-items:flex-start}
    .cap{width:220px;flex:none;line-height:1.5}.ok{color:#5cffb1}.bad{color:#ff5c7a}
    img{width:${w}px;height:auto;display:block;background:#000}
    figure{margin:0}figcaption{opacity:.6;margin:2px 0 0}
  </style><h1>${vp} — perf/${a} | perf/${b} | diff</h1>
  ${list
    .map(
      (r) => `<div class="row"><div class="cap">${r.f.replace(`${vp}-`, '').replace('.png', '')}<br>
      <span class="${r.perceptual ? 'bad' : 'ok'}">${r.perceptual} px differ (0.1)</span><br>${r.exact} px differ (exact)</div>
      <figure><img src="${pathToFileURL(dirA + r.f)}"><figcaption>${a}</figcaption></figure>
      <figure><img src="${pathToFileURL(dirB + r.f)}"><figcaption>${b}</figcaption></figure>
      <figure><img src="${pathToFileURL(r.diffPath)}"><figcaption>diff</figcaption></figure></div>`,
    )
    .join('')}`
  const page = await browser.newPage({ viewport: { width: 220 + 3 * w + 80, height: 800 } })
  const htmlPath = `${dirD}sheet-${vp}.html`
  await writeFile(htmlPath, html)
  await page.goto(pathToFileURL(htmlPath).href)
  await page.waitForLoadState('load')
  await page.screenshot({ path: `${dirD}sheet-${vp}.jpg`, fullPage: true, type: 'jpeg', quality: 72 })
  await page.close()
}
await browser.close()

// keep full-resolution diffs only where something differs; the sheets embed the rest
const { unlink, rm } = await import('node:fs/promises')
for (const r of rows) if (r.diffPath && r.perceptual === 0 && r.exact === 0) await unlink(r.diffPath).catch(() => {})
for (const vp of viewports) await rm(`${dirD}sheet-${vp}.html`, { force: true })

const bad = rows.filter((r) => r.perceptual !== 0)
for (const r of rows) console.log(`${r.f.padEnd(40)} ${String(r.perceptual).padStart(8)} px (0.1)  ${String(r.exact).padStart(8)} px (exact)`)
console.log(bad.length ? `${bad.length} of ${rows.length} shots differ` : `all ${rows.length} shots identical at threshold 0.1`)
process.exit(bad.length ? 1 : 0)
