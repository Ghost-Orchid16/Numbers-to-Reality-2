# Architecture — NUMBERS → REALITY

A living document. Re-read `docs/SPEC.md` first; this file explains *how* the brief is implemented and
records the decisions made while building it. Updated at the end of Phase 2.

## Environment findings (Phase 0)

- Repo started empty. Package manager: **npm** (Node 22).
- No Three.js / shader / GSAP / UI skills are installed (only document, browser and research skills), so no
  SKILL.md applied; the build follows the brief directly.
- Version constraints found on npm (Oct 2026):
  - `@react-three/fiber@9.8` peers `react >=19 <19.4` → React pinned `~19.3.0`.
  - `postprocessing@6.39` peers `three <0.187` → three pinned `~0.186.1`.
  - `typescript-eslint@8.71` peers `typescript <6.1` → TypeScript pinned `~6.0.3` (not 7.x).
  - Vite 8 (Rolldown: chunking via `build.rolldownOptions.output.codeSplitting.groups`), `@vitejs/plugin-react@6`,
    Vitest 5, ESLint 10, Tailwind 4.3.
- Chromium for Playwright is pre-installed at `/opt/pw-browsers` → `playwright@1.56.1` (matching build),
  never `playwright install`. WebGL in headless runs on SwiftShader (slow but faithful).

## Source layout

```
src/
  sim/                pure TypeScript physics (no three, no React — enforced by ESLint)
    core/             Simulation interface, FixedStepper (1/240 s), RK4, Track (sampled time series),
                      math helpers, planet constants
    rocket/           model.ts (gravity-turn ODEs), rocketSim.ts (live sim, exact liftoff/burnout events),
                      trajectory.ts (precompute + sampling + max-Q refinement), rocket.test.ts
  lib/                format.ts (SI units, sig figs, Intl), ticker.ts (12 Hz readout bus), loading.ts
                      (honest loader items), tex.ts (KaTeX + colour classes), color.ts, useModelValue.ts
  design/             worlds.ts (9 token sets + maths-variable colours, AA-tested), fonts.ts (lazy faces),
                      tokens.ts (GSAP morph of :root tokens)
  state/              director.ts (active chapter, neighbour, quality), prefs.ts (reduced motion, pointer,
                      compact), scroll.ts (transient scroll state), anchors.ts (3D → screen points)
  motion/             gsap.ts (plugins), SmoothScroll.tsx (Lenis ⇄ ScrollTrigger), scroll.ts (scrollTo)
  components/         the shared DOM kit (ChapterWorld, ChapterTitle, ScrollNarrative, LabPanel, LiveMetric,
                      Live, VariableControl/Toggle/Segmented, EquationBlock, RealityCheck, Annotation,
                      Tooltip, Marquee, MagneticButton, ChapterNav, ScrollHUD, Loader, Cursor,
                      GrainOverlay, Closing)
  three/              Stage (the one Canvas), Effects (post stack), HeatHazeEffect, Precompile,
                      ForceVector, TrajectoryLine, CoordinateGrid, useDisposable, sceneReady
  scenes/             one lazy chunk per 3D world: intro/ (glyph swarm), rocket/ (launch site → space)
  chapters/           one lazy chunk per chapter's DOM: intro/, rocket/ (+ runtime.ts shared with the scene)
  styles/             index.css (tokens, type scale, grid), chrome.css, components.css,
                      font-fallbacks.css (generated)
scripts/              font-fallbacks.mjs (Capsize), qa-shots.mjs (Playwright QA)
```

## The one canvas

- `three/Stage.tsx` renders one fixed full-viewport `<Canvas>` (z-index 0); `<main class="overlay">`
  scrolls above it with `pointer-events: none` except real controls and text.
- `state/director.ts` holds the active chapter (set by each `ChapterWorld`'s ScrollTrigger) and a
  neighbour: the previous chapter in the first half of a chapter, the next in the second. Only these two
  scenes are mounted (`SceneRouter`); scene modules are `React.lazy` chunks.
- Resources created imperatively go through `useDisposable` (single, array or record) so unmounting
  frees them; the QA script verifies `renderer.info.memory` is identical after two full scroll passes.
- Per-frame values are never React state: scenes read `scrollState`, the rocket `runtime` and a shared
  per-frame `frame` object inside `useFrame`; DOM readouts read the same runtime at 12 Hz.
- Post (`three/Effects.tsx`): mipmap bloom with luminance threshold 1 (only HDR emissives bloom),
  heat haze (rocket only), AgX tone mapping, SMAA, vignette; N8AO only on the desktop high tier.
  `@react-three/postprocessing` disables renderer tone mapping, so AgX is an explicit effect.
- Adaptive quality: `PerformanceMonitor` moves a `high | medium | low` tier (DPR range, glyph and particle
  counts, AO, shadows, haze); `AdaptiveDpr` handles transient drops; rendering stops while the tab is hidden.
- Shaders are precompiled under the loader (`Precompile`): every object made visible, then
  `compileAsync` when `KHR_parallel_shader_compile` exists, else `compile`.

## Hero → Chapter 01 handoff

`scenes/intro/phases.ts` turns the hero's scroll progress into `assemble`, `reveal`, `presence` and
`camera` factors used by *both* scenes. Glyph targets are MeshSurfaceSampler points on the rocket's real
hull (`buildRocketSampleGeometry`), and the glyph shader and the rocket's dissolve shader share one
`revealThreshold` GLSL function — so each glyph vanishes exactly where the hull materialises. The hero
camera ends on `POSE_PAD`, the rocket chapter's opening shot.

## Rocket world (scenes/rocket)

- **Floating origin over a curved planet.** The rocket stays at the render origin; the launch site moves
  by `−position`, where position = ((R+h)·sin(x/R), (R+h)·cos(x/R) − R). Float32 holds at 600 km.
- **Planet as a background layer** drawn first without depth, scaled down about the camera (same angular
  size and horizon) because a 6,371 km sphere next to a 32 m rocket defeats any depth buffer.
- **One sky model** (`skyChunk.ts`): `skyColorLocal(dir, up, altitude, dip)` gives dusk → indigo → black
  with a thin limb; the sea reflects the sky *at the reflection point* (its own vertical and sun elevation).
- Plume: fake-volumetric GLSL with Mach diamonds that fade and a plume that balloons as ρ(h) falls.
- Steam: GPU particles with analytic motion — a function of time since ignition, so scrubbing is exact.
- Camera shots are keyed to simulated time and the flight's real events (liftoff, max-Q, burnout).

## Chapter structure (chapters/rocket)

`runtime.ts` owns the simulation state: a live `RocketSim`, the precomputed `trajectory` (recomputed on
any parameter change), and `view` — the snapshot both the scene and the DOM display. Sections:
Title card → Marquee → pinned **Flight** (scroll → simulated time via `flightMap.ts`; reduced motion
quantises to key moments with a crossfade) → **Lab** (live sim, real-time ×warp) → **The Maths**
(8 KaTeX equations with live substitution lines) → **Reality check** (three layers + model note + sources).

## Design system

- Tokens are CSS custom properties; `@theme inline` makes Tailwind utilities read them live. Each
  `ChapterWorld` sets its world's tokens locally; `morphToWorld` tweens `:root` with GSAP.
- Fonts: four faces up front; chapter faces are dynamic Fontsource imports fetched as the chapter
  approaches. `scripts/font-fallbacks.mjs` reads the shipped woff2 files with Capsize and writes
  metric-matched fallbacks (`size-adjust`, ascent/descent/line-gap overrides).
- Colour-coded maths: `--v-*` per variable; KaTeX symbols use `\htmlClass{v-thrust}{T}`; sliders, readouts,
  annotations and 3D arrows read the same colours. `worlds.test.ts` enforces WCAG AA for every world.

## Honest loader

drei `useProgress` observes `THREE.DefaultLoadingManager`. The real start-up work is registered there
before first render (`main.tsx`): four font files, three code chunks, the glyph atlas, hull sampling and
shader compilation. The counter eases towards — never past — the true progress.

## QA

- `npm run check` = typecheck + lint + tests + build.
- `npm run build && npm run qa:shots [--only=desktop|mobile] [--reduced]`: screenshots of 17 key moments
  per viewport, console errors/warnings, and a GPU-memory leak check across two scroll passes.
- Known console message: `THREE.Clock … deprecated` is emitted by `@react-three/fiber`'s own clock (a
  dependency, not this code); there are no console errors.

## Status

| # | Chapter | Status |
|---|---|---|
| 00 | Loader + Hero | Phase 2 ✓ |
| 01 | Rocket | Phase 2 ✓ |
| 02–08, Finale | — | Phases 3–6 (the nav lists them as upcoming; the colophon names the next hall) |
