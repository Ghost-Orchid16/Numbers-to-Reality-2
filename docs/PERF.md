# Performance — NUMBERS → REALITY

Goal of the performance pass: a steady 60 fps on a mid-range laptop with **zero visual change**
(the look, the numbers and the choreography are frozen; only how the same pixels are produced may
change). This file records how it is measured, what was found, what was changed, and what was
deliberately left alone because it would alter the look.

## How to measure

| tool | what it gives |
| --- | --- |
| `?perf` | live overlay: fps, frame-time p50/p95/p99, worst frame (5 s), JS and main-thread ms per frame, draw calls, `renderer.info` (geometries, textures, programs, new compiles), DPR, render tier, chapter/section, long animation frames, React commits, ScrollTrigger refreshes |
| `?bench` | scrolls top → bottom → top twice through Lenis (1500 px/s; `&speed=`, `&step=`, `&passes=`, `&quality=`), then a results card with **Copy results**: avg fps, frame p50/p95/p99, worst frame + where, JS/main ms, long frames and LoAF > 50 ms per section, programs/textures/geometries created in each pass, React commits, refreshes |
| `npm run bench` | the same benchmark headless (Playwright + CDP) → `perf/*.json`: CDP `Performance.getMetrics` per pass (script, style, layout durations and counts, heap), renderer.info per pass, and a trace of pass 2 with a per-frame script / style / layout breakdown. Exit 1 if pass 2 creates any GPU resource |
| `npm run perf:profile` | trace + V8 CPU profile + style-invalidation tracking of a scripted scroll: every task ≥ 80 ms with the functions and trace events inside it, and every style recalc of ≥ 200 elements with what invalidated it and which JS forced it (`perf/profile*.json`) |
| `npm run perf:gpu` | frame time with each scene component hidden in turn, per scroll position (`perf/gpu*.json`) |
| `npm run perf:css` | compositing cost of the CSS effects (grain blend, vignette, backdrop blur, SVG filter): frame time with the canvas hidden and each effect toggled off in turn |
| `npm run perf:shots` / `perf:diff` | deterministic `?still` screenshots (frozen ambient clock, seeded randomness, no CSS motion, pinned tier; qa builds only) at 22 positions × 1920×1080, 1440×900, 390×844, and their pixelmatch comparison with side-by-side sheets in `perf/diff/` |

Headless Chromium renders WebGL in software (SwiftShader), so its frame rate is GPU-bound and says
nothing about a real GPU. The headless numbers that matter are **main-thread** time (script, style,
layout), **counts** (programs, textures, geometries, React commits, refreshes) and **hitches**
(long tasks and what they contain). The bench renders the canvas at `?dpr=0.5` to keep runs
short: DOM, layout, JavaScript and draw calls are identical at any pixel ratio.

## Baseline (before) — measured

`perf/baseline.json` (commit `6fd8246`, 1280×720, tier pinned high, 140 px/frame, two passes):

| | pass 1 | pass 2 |
| --- | ---: | ---: |
| JS per frame (rAF callbacks), p50 / p95 | 2.3 / 6.2 ms | 2.1 / 5.8 ms |
| main thread per frame (rAF + style + layout + paint), p50 / p95 | 7.0 / 31.5 ms | 6.9 / 22.2 ms |
| script + style + layout per frame (trace), p50 / p95 | — | 8.1 / **43.6** ms |
| of which style, p50 / p95 | — | 0.5 / **33.4** ms |
| style recalcs / layouts (CDP) | 1,100 / 410 | 996 / 369 |
| GPU programs / textures / geometries created while scrolling | **44 / 4 / 32** | 0 / 0 / 0 |
| longest main-thread task (trace) | **7.7 s** (software GL compile) | 0.07 s |
| React commits | 3 | 2 |
| ScrollTrigger.refresh during the scroll | 0 | 0 |
| draw calls p50 / max, triangles p50 | 62 / 84, 335 k | 62 / 84, 335 k |

## Suspects, ranked by measured cost

1. **Shader compiles mid-scroll (Hitch 1 and the first-pass freezes).** 44 programs were compiled
   while scrolling, in bursts tied to the flight: +7 when the launch site appears, +5 at the
   rocket reveal, +14 at ignition, +6 at 400 m, +5 at 60 km and **+5 at MECO — "Promised versus
   delivered", just before the lab**: five MeshPhysicalMaterial programs (clearcoat, sheen,
   iridescence), the ~0.5 s freeze seen on the laptop (1.5–7.7 s each in software GL here).
   Two causes:
   - the start-up precompile built the wrong variants: it ran with no render target bound
     (sRGB output) while every frame is drawn into the post-processing buffer (linear output),
     and the output colour space is part of three.js's program cache key — none of the 47
     precompiled programs was ever used;
   - the light set changed with visibility: the three floodlights left the scene with the
     hidden launch site (above 60 km and in the hero), the plume light left whenever the engine
     was off, and the sun's `castShadow` flipped at 400 m — although no shadow map is ever
     rendered (the canvas has no `shadows`). Each change alters every lit material's program
     key. Also 4 textures and 32 vertex buffers were first uploaded on first sight.
2. **Lenis rewriting the classes of `<html>` → whole-document style recalcs.** Whenever its
   scrolling state flips (start and end of every gesture, and the velocity reset 400 ms after a
   native scroll) Lenis removes every `lenis*` class from `<html>` and adds them back. The next
   scroll read (ScrollTrigger, Lenis) then forces a style recalc of ~2,100 elements, ~30 ms
   each here — **77 % of all elements recalculated** in the profile, and the whole of the style
   p95. Nothing on the page styles those state classes.
3. **The hero ↔ Chapter 01 boundary (Hitch 2).** A 73 ms forced style recalc in the scroll
   handler at the chapter switch: the active-chapter change (React commits in the nav and HUD)
   and the GSAP tween of the world's colour tokens on `:root`, which re-styles the whole
   document on every frame of its 1.2 s.
4. **Live readouts replace text nodes.** `textContent = …` swaps the text node: 3,350 node
   insertions per pass, each a style recalc of its parent plus layout — and off-screen readouts
   (the lab and the maths during the flight) are written too.
5. **Forced layouts inside the frame loop** (500 per pass, ~1 ms/frame): the marquee reads
   `scrollWidth` every frame, the scroll HUD reads `scrollHeight` and `scrollY` every frame; the
   custom cursor calls `elementFromPoint` on every scroll event (desktop with a mouse only).
6. **Two clocks.** R3F renders in its own requestAnimationFrame loop next to GSAP's; the rocket
   runtime ticks before GSAP updates the scrub, so the 3D flight trails the scroll by up to two
   frames, and DOM labels follow the previous frame's 3D projection.
7. **GPU work that cannot be seen** (ranked by `npm run perf:gpu`, see below): the sky dome and the
   planet are drawn first without a depth test, so they are shaded under the ground and the
   rocket; the 13,000-glyph field is drawn through the whole rocket chapter although fully
   dissolved; at the hero's top the sky, planet and steam are drawn although they output
   exactly the clear colour; the canvas renders behind the opaque loader.
8. **Adaptive quality sampling during start-up.** PerformanceMonitor measures from the first
   frame — while shaders compile — so it can step the tier down before the visitor sees
   anything; each tier change rebuilds glyph samples, steam and post passes and recompiles.
9. Smaller: the countdown writes three SVG filter attributes every frame even off-screen;
   per-frame allocations (hero phases, trajectory snapshots, projected points); `nf()` builds a
   JSON key for every number formatted; CSS animations that tick on the main thread.

## Results — each fix measured on its own

Every fix was benchmarked on its own build, in order, by the same bench script (`perf/steps/*.json`;
1280×720, tier pinned high, 140 px per frame, two passes; `base` is the instrumented baseline
`6fd8246` re-measured with the corrected frame probe). Times are milliseconds per frame on this
container's CPU; "elements restyled" and "recalcs ≥ 500 elements" are counts from the trace of pass 2.

| step | pass 1: programs / textures / geometries created | pass 1 main p95 | pass 2 script+style+layout p50 / p95 / mean | style p95 | elements restyled | recalcs ≥ 500 el | style recalcs | layouts | s per pass (software GL) |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| base | 44 / 4 / 31 | 54.8 | 7.8 / 29.0 / 10.4 | 19.7 | 67,849 | 30 | 989 | 360 | 216 |
| B | **0 / 0 / 0** | 39.9 | 7.8 / 33.7 / 10.6 | 26.1 | 69,992 | 31 | 1,004 | 379 | 216 |
| C1 | 0 / 0 / 0 | 15.8 | 7.5 / 14.7 / 8.6 | **1.5** | **12,763** | **4** | 976 | 364 | 221 |
| C2 | 0 / 0 / 0 | 16.5 | 6.8 / 12.2 / 7.6 | 1.1 | 12,792 | 4 | 977 | 364 | 214 |
| C3 | 0 / 0 / 0 | 13.6 | 7.2 / 12.3 / 7.9 | 1.7 | 12,613 | 4 | **730** | 357 | 215 |
| A | 0 / 0 / 0 | 14.4 | 6.8 / 12.7 / 7.8 | 1.0 | 12,575 | 4 | 688 | 351 | 216 |
| E | 0 / 0 / 0 | 14.7 | 6.0 / 11.1 / 6.8 | 1.1 | 16,928¹ | 6¹ | 696 | 357 | **111** |
| C4 | 0 / 0 / 0 | 14.5 | 6.0 / 10.7 / 6.7 | 1.1 | 16,960 | 6 | 678 | 337 | 112 |
| G | 0 / 0 / 0 | 12.9 | 5.4 / 12.2 / 6.5 | 0.9 | 16,886 | 6 | 689 | 349 | 110 |
| B2 | 0 / 0 / 0 | 13.9 | 5.7 / 11.4 / 6.6 | 1.3 | 16,862 | 6 | 694 | 356 | 114 |
| HEAD² | 0 / 0 / 0 | 13.3 | 6.0 / 12.6 / 6.9 | 1.1 | 16,871 | 6 | 686 | 346 | 111 |

¹ From E on, software GL draws a frame in half the time, so time-based effects (the 1.2 s colour
morph, 12 Hz readouts) span twice as many frames of the pass — the restyle counts rise with the frame
rate, not with the work per frame. ² HEAD adds C5 (cursor) and B3 (re-warm after a tier change),
whose paths the pinned, pointer-less bench does not exercise (see the smoke test below).
Pass 2 creates 0 programs, 0 textures and 0 geometries at every step, and React commits 2 times per
pass (both chapter switches) at every step.

Before → after, pass 2 unless noted:

| | before | after |
| --- | ---: | ---: |
| GPU programs / textures / vertex buffers created while scrolling (pass 1) | 44 / 4 / 31 | **0 / 0 / 0** |
| longest frame of pass 1 (software GL; shader compiles) | 20.2 s | 3.4 s |
| main thread (rAF + style + layout + paint) per frame, p95 — pass 1 / pass 2 | 54.8 / 28.5 ms | **13.3 / 13.5 ms** |
| script + style + layout per frame, p50 / p95 / mean | 7.8 / 29.0 / 10.4 ms | **6.0 / 12.6 / 6.9 ms** |
| style per frame, p95 | 19.7 ms | **1.1 ms** |
| elements restyled per pass | 67,849 | **16,871** (12,575 at the old frame rate) |
| whole-document style recalcs per pass | 30 | **6** (4 at the old frame rate) |
| style recalcs per pass (forced and scheduled) | 989 | **686** |
| software-GL time per pass (GPU-bound frames) | 216 s | **111 s** |
| main-thread tasks ≥ 80 ms in a profiled pass, down + up (`npm run perf:profile`) | 14 | **0** (the longest left: 70 ms, the colour morph at the hero → chapter boundary; the `?perf` overlay's own first update aside) |
| React commits during steady scroll | 0 | 0 |
| ScrollTrigger refreshes during scroll | 0 | 0 |
| draw calls p50 / max · triangles p50 | 62 / 106 · 335 k | **60 / 84 · 283 k** |

**Not reached here:** the p95 of script + style + layout is 12.6 ms on this container, above the 8 ms
budget. The profile puts most of it in WebGL call submission ("(program)" native time inside
`WebGLRenderer.render`, ~2.2 ms of JavaScript per frame plus the software driver behind it), which is
far cheaper with a hardware driver; the DOM side (style p95 1.1 ms, layout p95 2.1 ms) is within
budget. Confirm on the laptop with `?bench` (instructions at the end).

## What changed, and why (in the order applied)

Every fix keeps the pixels: the same objects, materials, lights, effects, counts, camera paths and
numbers (verified below). Measured effect of each: the table above.

**B — nothing compiles or uploads mid-scroll (Hitch 1).** `Precompile` now builds the programs
against a half-float target (the colour space every frame is drawn in — part of three.js's program
cache key), with every object visible and unculled, then uploads every texture and every vertex buffer
with one off-screen draw. The light set never changes: the floodlights and the plume light stay in the
scene with intensity 0 when off (exactly no contribution), the launch site's lights moved out of the
group that is hidden above 60 km, and the sun's `castShadow` (no shadow map is ever rendered — the
canvas has no `shadows`) is gone, so no lit material changes its program key mid-flight.
Measured: programs compiled while scrolling 44 → **0**, textures 4 → 0, vertex buffers 31 → 0;
the longest first-pass frame 20.2 s → 3.4 s (software GL).

**C1 — Lenis no longer rewrites `<html>`'s classes.** Lenis removed and re-added every `lenis*` class
on the root whenever its scrolling state flipped; each rewrite re-styled the whole document (~2,100
elements). The root keeps its static `lenis` class and only the two behavioural classes are toggled,
only when they change (nothing styles the state markers). Measured: elements restyled per pass
70.0 k → 12.8 k, whole-document recalcs 31 → 4, style p95 26.1 → 1.5 ms.

**C2 — readouts.** Live numbers rewrite their existing text node (`setText`) instead of replacing it
(`textContent` inserted a new node: style + layout of the parent each time), and a readout tied to an
element refreshes only while that element is within half a viewport of the screen — the lab and the
maths no longer re-typeset 12× a second during the flight. Measured: script + style + layout
mean 8.6 → 7.6 ms, layout p95 3.8 → 2.4 ms (and much more at 60 fps: the bench's software frames
come ~1 s apart, so it sees at most one readout refresh per frame).

**C3 — no forced layout in the frame loop.** The marquee caches its width (ResizeObserver) and rests
off-screen (IntersectionObserver); the scroll HUD reads progress from Lenis (its page size is cached)
and writes its bar only when the value changes; the countdown writes its SVG filter attributes only
while it shows a label. Measured: style recalcs per pass 977 → 730, JS p95 7.9 → 6.7 ms.

**A — one clock.** One `requestAnimationFrame` (GSAP's ticker) runs Lenis → GSAP → simulation → DOM →
canvas → labels, in that order (`motion/frame.ts`). R3F has no loop of its own (`frameloop="never"` +
`advance`), so the flight shown is the one the scroll position asks for in the same frame, and labels
follow this frame's projection instead of the previous one. Measured: style recalcs 730 → 688,
flat otherwise — its value is that the canvas and the DOM can no longer drift apart by a frame.

**E — draw nothing that cannot be seen.** The sky dome and the planet sit on the far plane and are
drawn after the opaque scene with a depth test (same image; hidden pixels are no longer shaded); at
zero presence the sky is replaced by clearing to the exact colour it would output; steam meshes are
skipped while every fragment would be discarded; the 13,000-glyph field is skipped once fully
dissolved; the canvas stops rendering behind the opaque loader once the shaders are built. Measured:
software-GL time per pass 216 → 111 s, script per pass 0.84 → 0.72 s, triangles p50 335 k → 283 k.

**PM — adaptive quality judged on frames the visitor sees.** The PerformanceMonitor starts 1.5 s after
the reveal (start-up frames compile shaders) and a tier change is applied only when the scroll is at
rest (a change rebuilds glyphs, particles and passes).

**C4 — no allocations in the per-frame paths.** Trajectory and live snapshots fill one object in place,
screen projections write into scratch objects, number formatters are cached per precision (no
`JSON.stringify` key per number). Measured: script per pass 0.72 → 0.69 s (≈ 60 objects a
second fewer for the garbage collector).

**G — one smoothing between wheel and page.** Scrubbed tweens use `scrub: true`: Lenis already smooths
the scroll position, and a numeric scrub (1 s on the flight and the chapter numeral, 0.6 s on the
lab wash) stacked a second catch-up lag on top of it. Every scroll position maps to exactly the same
state at rest; the wash now peaks exactly at the camera cut it hides. `syncTouch` stays off (stated). Main-thread neutral (as expected); what it changes is latency:
after the wheel stops, scrubbed state settles with Lenis (time constant ≈ 0.2 s) instead of Lenis
plus up to 1 s of catch-up.

**F — safety net for slow machines.** Only where the measured frame time at full resolution is above
1/55 s: during fast scrolls (> 900 px/s) the canvas renders at 70 % of its pixel ratio, and the full
ratio returns 250 ms after the scroll settles. Nothing is removed; machines that keep up never enter it.

**B2 — chapter faces one chapter ahead.** After the reveal, the display face of the chapter after the
active one is fetched when the main thread is idle, so registering and swapping it happens far
off-screen (and any resulting ScrollTrigger refresh happens at rest). Neutral in the bench (fonts are local
there); it matters on a real network.

**C5 — the custom cursor.** It re-checked what is under a still pointer with `elementFromPoint` in
every scroll event — a forced style + layout before each frame's own — and rewrote both transforms
every frame. The re-check now runs at the end of the same frame (same result, same frame), and the
transforms are written only when they change. Desktop with a mouse only (the bench has no pointer).

**B3 — re-warm after a tier change.** A tier change (at rest) rebuilds the glyph field, steam and
post passes — also those hidden at that moment, which were then uploaded the first time they came
into view (scrolling back up into the hero: a candidate for Hitch 2 on a machine that had stepped
down to 5,200 glyphs). The precompile pass runs again at rest after every tier change. Smoke test:
after high → medium → low and a fast scroll back into the hero, 0 programs, textures or geometries
were created.

**F — safety net, how it behaved.** Smoke test without pins (software GL, so the machine counts as
slow): the tier stepped high → medium → low only while the page was at rest; during fast wheel
scrolls the canvas went to 0.7× its pixel ratio and back to 1× each time the scroll settled; no
console errors.

## Not changed — would alter the look (or risk it)

| candidate | why not | measured / estimated gain |
| --- | --- | --- |
| Hero scroll cue: `transform-origin` in its keyframes keeps the animation on the main thread | A transform-only rewrite (scale about the centre + a translate of ∓50 % × (1 − scale)) has the same geometry but is composited: the moving edge is anti-aliased differently (one row of edge pixels, Δ up to 204/255 at some instants) | one pseudo-element restyle + a 1 × 42 px repaint per frame (213 restyles per pass) |
| Colour morph: `morphToWorld` tweens 9 custom properties on `<html>` for 1.2 s at each chapter switch | Every element inherits them, so every element is restyled each frame of the tween. Narrowing it means either `content-visibility` on far sections during the morph (size containment, ScrollTrigger measurements, accessibility tree) or tweening only on-screen "islands" (inherited `color` would jump): both risk visible differences that still screenshots cannot catch | the one long task left: 2,118 elements per frame, 22–37 ms per recalc here (70 ms worst task) for the length of the morph |
| Revert one-shot SplitText after the hero and chapter-title reveals | Split characters lose their kerning pairs; reverting restores kerning, so the glyphs shift | fewer elements to restyle (≈ 100) |
| Hero title weight axis: write only integer `--wght` values | Fractional weights render differently (sub-pixel); not pixel-identical at intermediate scroll positions | skips writes only when the scrub moves < 1 weight unit per frame |
| `anticipatePin` on the flight pin | Lenis scrolls in JavaScript and runs `ScrollTrigger.update` in the same frame, so the pin never jumps on wheel; anticipatePin would pin a few pixels early — a visible jump | none on desktop |
| `matrixAutoUpdate = false` on static meshes | not worth the code | `updateMatrixWorld` self time 18 ms per profiled pass (≈ 0.08 ms per frame) |
| Grain `mix-blend-mode`, vignette, the lab panel's `backdrop-filter`, the countdown's SVG filter | part of the look | `npm run perf:css` (below) |
| Shadow maps | none are rendered (the canvas has no `shadows`); left as they were | — |
| Lower MSAA | the canvas already has `antialias: false` (SMAA in post) | — |

## Measuring on the laptop

The headless numbers above are main-thread and count measurements; frame rate needs the real GPU.

1. Build the branch (`npm run build && npm run preview`, or a Netlify deploy of `perf-pass`) and,
   to compare, the instrumented baseline `6fd8246` (the original code plus `?perf` / `?bench`):
   `git checkout 6fd8246 && npm run build && npm run preview`.
2. Open `/?bench&quality=high` on each (the tier pinned so both draw the same thing; `?bench` alone
   includes adaptive quality). Keep the tab in front and the mouse still: it scrolls top → bottom →
   top twice at 1500 px/s, then shows a results card — **Copy results** puts the JSON on the
   clipboard (avg fps, frame p50/p95/p99, worst frame and where, long animation frames per section,
   programs/textures/geometries created in each pass, React commits).
3. `/?perf` shows the same live: scroll from "Promised versus delivered" into the lab (Hitch 1:
   `programs … (+new …)` must stay silent) and back up into the glyph field (Hitch 2: watch "worst
   5 s" and "LoAF>50ms"); park at "Next hall" and read FPS / frame p95 at idle.

The rules that keep it this way (one clock, nothing compiled on first sight, no per-frame React
state, post effects never toggled while scrolling, no allocations in hot loops, `npm run bench`
before every phase commit) are in `CLAUDE.md` → "Performance budget & rules".
