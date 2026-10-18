# NUMBERS → REALITY — working rules

**Re-read docs/SPEC.md at the start of every phase.** It is the full, unchanged brief.
`docs/ARCHITECTURE.md` describes how the code is organised; keep it current when the structure changes.

## Non-negotiables (summary of SPEC §2–5, §10, §11)

### Design (§2)
- Eight worlds, one museum: every chapter has its own display typeface, palette, texture and signature effect; a strict shared system (12-col grid, spacing, Manrope body, JetBrains Mono data with tabular figures, KaTeX equations, hairline rules, tiny uppercase mono labels) holds them together. Same components everywhere — only tokens change.
- Display typefaces only at ≥ 32px (titles, giant numerals, hero statements, pull quotes, marquees). Never paragraphs, controls or data. Instrument Serif Italic allowed for one or two accent words in headlines.
- Chapters open with a giant outlined chapter number + title in the chapter typeface (SplitText reveal, filled with chapter color on scroll).
- Up front: hero (Unbounded + Instrument Serif) + Manrope + JetBrains Mono only. Chapter typefaces lazy-load as the chapter approaches. font-display: swap + metric-matched fallbacks.
- Tokens morph between chapters via GSAP-tweened CSS variables. WCAG AA contrast on every background.
- Colour-coded maths: each variable owns one colour, used identically in equation symbol, slider, readout and 3D object/vector — always paired with a symbol/label, never colour alone.
- Subtle global film grain (2–4%) + vignette.

### Motion & scroll (§3)
- Lenis synced to ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add(t => lenis.raf(t*1000))`, `lagSmoothing(0)`). Pinning only, no scroll-jacking; native scrollbar + keyboard always work.
- Chapter structure: Title card → Phenomenon (scroll-scrubbed, real physics: precompute trajectory for current params, map scroll → sim time) → Lab (NOT scrubbed) → The Maths (live) → Reality Check → Transition.
- Easing expo/power4 outs, reveals 0.8–1.4 s. Nothing bouncy.
- prefers-reduced-motion: no smooth scroll, scrubs become fades, sims start paused, no camera shake.

### 3D (§4)
- ONE persistent fixed `<Canvas>`; ChapterDirector (zustand) mounts only the active + next chapter scene; everything else unmounted and disposed.
- DOM overlays `pointer-events: none` except real controls.
- Procedural lighting (drei Environment + Lightformer, no HDRI files), MeshPhysicalMaterial, emissive + `toneMapped={false}` for bloom. Never default grey materials / default Three.js look.
- Post: selective Bloom (mipmapBlur), SMAA, subtle noise/vignette, AgX/ACES; DOF/CA only in transitions; N8AO desktop only.
- Procedural geometry first. No brand logos or liveries. Never drei `<Text>` without a local font file.
- Adaptive quality: PerformanceMonitor + AdaptiveDpr, DPR [1,2] desktop / [1,1.5] mobile.

### Simulation & honesty (§5)
- All physics/maths in pure TS under `src/sim/*` (no three imports): init, params, step(dt), reset, metrics, dispose. Scenes only read state.
- Fixed timestep accumulator (1/240 s), RK4 where appropriate, SI units. Never frame-rate dependent.
- Heavy compute (CT, NN training) in Web Workers. High-frequency values in refs/stores, DOM readouts ~10–15 Hz.
- Sensible sig figs, auto-scaled SI units, Intl.NumberFormat, tabular figures. No fake precision.
- KaTeX symbolic form rendered once + a live substitution line. Every equation shown must drive the visual. Label every simplification. If a number is on screen, the model computed it.

### Performance (§10)
- 60 fps mid laptop / 30+ mid phone. One WebGL context. Code-split chapters, lazy fonts. Instancing, GPU particles.
- Dispose geometry/material/texture on unmount; renderer.info.memory must not grow over two full scroll passes. Pause when hidden/idle. Zero console errors.

### Never (§11)
Fake live numbers or randomly animated equations · static pages called "interactive" · neon everything / gradient soup / glass cards everywhere · stock photos · system fonts or default Three.js look · brand logos/liveries · teaching models presented as real engineering tools · one giant Three.js component or copy-pasted chapter architectures · login/database/chatbot/ads · broken placeholder sections.

## Performance budget & rules (perf pass — binding for chapters 02–08 from day one)
Budget: 60 fps on a mid laptop, 30+ on a mid phone; main-thread script + style + layout p95 < 8 ms per
frame; 0 React commits during steady scroll; 0 programs / textures / geometries created and 0 long
animation frames > 50 ms at section boundaries on the second scroll pass. Details and tools: docs/PERF.md.
- **One clock.** Everything per-frame subscribes to `onFrame(stage, fn)` (motion/frame.ts): Lenis →
  GSAP → 'sim' → 'dom' → 'render' → 'post'. No other `requestAnimationFrame` loop, no `useFrame` loops that
  run while their scene is hidden (early-return), no animation `setInterval`.
- **Nothing expensive at mount or on first sight.** Every material, light set and texture of a chapter
  is compiled and uploaded under the loader (`Precompile`). Never add/remove lights, flip `castShadow`,
  or change a material's defines/feature flags at runtime — set intensity 0 / uniforms instead.
- **No per-frame React state.** High-frequency values live in refs/stores; DOM readouts go through
  `onReadout` (12 Hz, idle when off-screen) and `setText` (rewrite the text node, never `textContent`).
- **Never mount/unmount or toggle post effects** (or change their constructor props) while scrolling: that
  rebuilds the composer's passes. Adaptive tier changes wait for the scroll to rest.
- **No layout reads in the frame loop.** Cache sizes with ResizeObserver, visibility with
  IntersectionObserver; animate transform/opacity only; write a style only when its value changed.
- **No allocations in hot loops**: reuse vectors, colours, snapshots and objects (`out` parameters).
- **No `ScrollTrigger.refresh()` during scroll**; scrubs use `scrub: true` (Lenis is the one smoothing).
- **Draw nothing that cannot be seen**: hide meshes whose output is fully transparent/occluded; background
  layers sit on the far plane with a depth test.
- **`npm run build && npm run bench` must pass before every phase commit** (exit 0: no GPU resource
  created in pass 2), and the `?still` parity screenshots (`npm run perf:shots` / `perf:diff`) must match
  for any change that claims to be visual-neutral.

## Workflow
- npm only. Offline after install: no runtime CDNs, HDRIs, remote fonts or models.
- After every phase: `npm run typecheck && npm run lint && npm test && npm run build && npm run bench` all green; vitest for every sim against known answers; Playwright screenshots (1440×900, 390×844) reviewed by eye; commit; brief report.
- Playwright: Chromium is pre-installed at /opt/pw-browsers — never run `playwright install`. Screenshot script: `npm run qa:shots` (see scripts/).
