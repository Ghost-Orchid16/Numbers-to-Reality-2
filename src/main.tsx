// Diagnostics first (?perf, ?bench, ?still) — a no-op on a normal visit.
import './perf/boot'
// Up-front faces only: hero (Unbounded + Instrument Serif Italic), body (Manrope), data (JetBrains Mono).
// Every chapter's display face is lazy-loaded as it approaches (design/fonts.ts).
import '@fontsource-variable/manrope/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import '@fontsource-variable/unbounded/wght.css'
import '@fontsource/instrument-serif/400-italic.css'
import './styles/index.css'
import './styles/chrome.css'
import './styles/components.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { UPFRONT_FACES } from './design/fonts'
import { completeLoadItem, registerLoadItems } from './lib/loading'
import { FLAGS } from './perf/flags'

// The loader's denominator is known before anything completes: this is the real start-up work.
registerLoadItems([
  ...UPFRONT_FACES.map((f) => ({ id: f.id, label: `Font · ${f.label}` })),
  { id: 'chunk:intro-scene', label: 'Module · glyph field' },
  { id: 'chunk:rocket-scene', label: 'Module · launch pad' },
  { id: 'chunk:rocket-chapter', label: 'Module · chapter 01' },
  { id: 'atlas:glyphs', label: 'Glyph atlas' },
  { id: 'sampler:rocket', label: 'Rocket hull · surface samples' },
  { id: 'gpu:compile', label: 'Compiling shaders' },
])
for (const f of UPFRONT_FACES) {
  void document.fonts
    .load(f.probe)
    .catch(() => undefined)
    .finally(() => completeLoadItem(f.id))
}

if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
window.scrollTo(0, 0)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ?perf / ?bench: lazy chunks, never downloaded on a normal visit
if (FLAGS.perf) void import('./perf/overlay').then((m) => m.mountOverlay())
if (FLAGS.bench) void import('./perf/bench').then((m) => m.runBench())
