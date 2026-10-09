# Architecture — NUMBERS → REALITY

A living plan. Re-read `docs/SPEC.md` first; this file explains *how* the brief is implemented.

## Environment findings (Phase 0)

- Repo started empty (README only). Package manager: **npm** (Node 22).
- No Three.js / shader / GSAP / UI skills are installed (only document, browser and research skills), so no SKILL.md applies; the build follows the brief directly.
- Version constraints discovered on npm (Oct 2026):
  - `@react-three/fiber@9.8` peers `react >=19 <19.4` → React pinned to `~19.3.0`.
  - `postprocessing@6.39` peers `three <0.187` → three pinned to `~0.186.1`.
  - `typescript-eslint@8.71` peers `typescript <6.1` → TypeScript pinned to `~6.0.3` (not 7.x).
  - Vite 8 + `@vitejs/plugin-react@6`, Vitest 5, ESLint 10, Tailwind 4.3.
- Chromium for Playwright is pre-installed at `/opt/pw-browsers` (Playwright 1.56 build) → `playwright@1.56.1` dev dependency, never `playwright install`.

## Layering

```
src/
  sim/         pure TypeScript physics & maths (no three, no React). Tested with Vitest.
    core/      Simulation interface, FixedStepper (1/240 s accumulator), RK4, interpolation, constants
    rocket/    gravity-turn point-mass model, live sim, trajectory precompute + sampling
  lib/         framework-free helpers: number/unit formatting, 12 Hz readout ticker, honest loading tracker, colour maths
  design/      world tokens (9 worlds), font registry + lazy loader, CSS-variable morphing
  state/       zustand stores: director (active chapter, mounted scenes, quality), prefs; transient scroll state
  motion/      GSAP plugin registration, Lenis ⇄ ScrollTrigger sync, reduced-motion helpers
  components/  DOM component kit — identical for every chapter, themed only by tokens
  three/       shared 3D kit: Stage (the one Canvas), post-processing, ForceVector, TrajectoryLine,
               CoordinateGrid, disposal hooks, shared GLSL chunks
  scenes/      one folder per chapter's 3D world (code-split, lazy)
  chapters/    one folder per chapter's DOM narrative + its runtime glue (store/runtime shared with its scene)
  workers/     Web Workers for heavy compute (CT, neural net — Phase 4)
```

Rules: `sim/` never imports from anywhere else in `src/`. Scenes only *read* simulation state. DOM readouts and 3D read the **same** runtime object, so every number on screen is the number that moves the object.

## The one canvas

- `three/Stage.tsx` renders a single fixed, full-viewport `<Canvas>` behind the DOM (`z-index: 0`). DOM content scrolls above it with `pointer-events: none` except on real controls.
- `state/director.ts` (zustand) holds the active chapter index (set by ScrollTrigger in `ChapterWorld`), and derives `mounted = [active, neighbour]` — the neighbour is the chapter you are travelling towards (next in the second half of a chapter, previous in the first half; the hero always pairs with the rocket). Only those two scenes are mounted; scene modules are `React.lazy` chunks, unmounting disposes everything (R3F auto-dispose for JSX objects, `useDisposable` for imperatively created geometry/materials/textures).
- Scenes read per-frame values (scroll progress, handoff factors) from a mutable `scrollState` object — never React state — inside `useFrame`.
- Transitions happen inside the canvas: the outgoing scene's final camera pose equals the incoming scene's first pose, and a shared motif carries across (hero glyphs assemble into the rocket mesh that the rocket scene then materialises).
- Post-processing (`three/Effects.tsx`): selective bloom (mipmap blur, luminance threshold ≈ 1, so only `toneMapped={false}` emissives bloom), SMAA, AgX tone mapping, vignette; a chapter can add effects (the rocket's heat haze). DOF / chromatic aberration only during transitions; N8AO only on the desktop high tier.
- Adaptive quality: `PerformanceMonitor` lowers/raises a `quality` tier (`high | medium | low`) that sets DPR (desktop [1, 2], mobile [1, 1.5]), particle counts and optional effects; `AdaptiveDpr` handles transient drops. Rendering pauses (`frameloop="never"`) when the tab is hidden.

## Scroll & motion

- `motion/SmoothScroll.tsx`: Lenis with `lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add(t => lenis.raf(t * 1000))`, `gsap.ticker.lagSmoothing(0)`. Disabled under `prefers-reduced-motion` (native scroll; ScrollTrigger still works).
- Every chapter section follows Title card → Phenomenon (pinned, scrubbed `scrub: 1`) → Lab (not scrubbed) → The Maths → Reality Check → Transition.
- Scrubbed sequences map scroll progress → simulation time on a trajectory precomputed by the real model for the current lab parameters; it is recomputed when a parameter changes.
- Reduced motion: no Lenis, scrubs are quantised to key moments with crossfades, simulations start paused, no camera shake.

## Design system

- `design/worlds.ts` defines the nine worlds (00 hero/finale … 08 accelerator): background/foreground/muted/rule colours, accents, display font stack, light/dark flag, and the per-variable colours for colour-coded maths.
- Tokens are CSS custom properties on `:root`; `design/tokens.ts` tweens them with GSAP when the active world changes (special long tweens for the CT→Skyscraper sunrise and Robot→Accelerator plunge in Phase 6). Tailwind v4 `@theme` maps utilities onto the variables, so components never hard-code colours.
- Fonts: Manrope Variable, JetBrains Mono Variable, Unbounded Variable and Instrument Serif Italic are imported up front. Chapter display faces are dynamic `import()`s of their Fontsource CSS plus `document.fonts.load`, triggered by an IntersectionObserver well before the chapter enters. `scripts/font-fallbacks.mjs` reads the shipped font files with Capsize and generates metric-matched fallback `@font-face` rules (`size-adjust`, ascent/descent/line-gap overrides) → `src/styles/font-fallbacks.css`.
- Colour-coded maths: each variable has a token (`--v-thrust`, `--v-mass` …) used by the KaTeX symbol (`\htmlClass`), slider accent, readout and the 3D object (read from the same world definition in JS).

## Simulation engine (`src/sim`)

- `core/types.ts`: `Simulation<P, M>` — `init(params)`, `params`, `setParams`, `step(dt)`, `reset()`, `metrics()`, `dispose()`.
- `core/stepper.ts`: fixed 1/240 s substeps with an accumulator and a max-substep clamp (no spiral of death); results are identical however the frame time is sliced.
- `core/rk4.ts`: allocation-free RK4 on `Float64Array` state.
- `rocket/`: planar gravity-turn point-mass model over a spherical, non-rotating planet: `v̇ = (T − D)/m − g(h) sin γ`, `γ̇ = −(g/v − v/(R+h)) cos γ`, `ḣ = v sin γ`, `ẋ = R v cos γ/(R+h)`, `ṁ = −T/(I_sp g₀)`, with `D = ½ρ(h)v²C_dA`, `ρ = ρ₀e^{−h/H}`, `g = g₀(R/(R+h))²`. Vertical rise → pitch kick at a set speed → gravity turn. On the pad the clamps/pad reaction hold the rocket until `T > m g`. Presets swap g₀, R, ρ₀, H together (Earth / Mars / Moon — the Moon has no atmosphere).
- `rocket/trajectory.ts` runs the same model to burnout + coast and stores samples for scroll scrubbing (linear interpolation); max-Q is found from the stored samples.

## Honest loader

drei `useProgress` listens to `THREE.DefaultLoadingManager`. Because every asset here is procedural, `lib/loading.ts` registers the real start-up work as loading-manager items (`itemStart` / `itemEnd`): each up-front font file, the hero and rocket scene chunks, the glyph atlas, rocket geometry + surface sampling, and shader compilation (`gl.compileAsync`). The loader's counter therefore reports actual progress.

## Chapters built so far

| # | Chapter | Status |
|---|---|---|
| 00 | Loader + Hero | Phase 2 |
| 01 | Rocket | Phase 2 |
| 02–08, Finale | — | Phases 3–6 (nav shows them as upcoming, no placeholder sections) |

## QA

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `npm run qa:shots` → builds, serves with `vite preview`, drives Chromium (SwiftShader WebGL) through key scroll positions at 1440×900 and 390×844 and writes PNGs to `qa/` (git-ignored) for visual review.
