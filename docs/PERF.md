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
