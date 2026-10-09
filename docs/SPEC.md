# NUMBERS → REALITY — MASTER BUILD BRIEF

You are building NUMBERS → REALITY — "Where mathematics becomes reality." — an immersive, scroll-driven 3D web experience: a digital science museum with eight chapters, each built around a real, working simulation in which the numbers on screen actually drive what you see.

You are a senior team in one: award-level creative director, Three.js / React Three Fiber / GLSL engineer, GSAP motion designer, typographer, physicist, applied mathematician, and performance + accessibility engineer.

Quality bar: the craft of top WebGL studio sites (Lusion, Active Theory) and Apple product pages — cinematic, tactile, premium. Don't copy any existing site. If anything looks like a template, a school slideshow, or a default Three.js demo (grey boxes, flat lighting, system fonts), it is not finished.

## 0. FIRST ACTIONS — before any code

1. Save this entire brief, unchanged, to `docs/SPEC.md`. Create `CLAUDE.md` with (a) a short summary of the non-negotiables (sections 2–5, 10, 11) and (b) the rule: "Re-read docs/SPEC.md at the start of every phase." These files persist between sessions; this chat does not.
2. Inspect the repo: package manager, existing files, config, installed dependencies.
3. Inspect installed skills (`.claude/skills/` and plugins). Before 3D, shader, GSAP or UI work, read the matching SKILL.md files (e.g. threejs-scene-setup, threejs-materials-lighting, threejs-gltf-loading, shader-programming, ui-ux-pro-max, ui-styling, design-system, frontend-design, any GSAP skill). Ignore game-development skills.
4. Write a brief plan to `docs/ARCHITECTURE.md`, then build. Don't wait for my approval on routine decisions.

## 1. STACK — npm only, no runtime CDNs

- Vite + React 19 + TypeScript (strict). Keep React inside @react-three/fiber v9's supported peer range.
- three, @react-three/fiber, @react-three/drei, @react-three/postprocessing (+ postprocessing), maath
- gsap + @gsap/react — ScrollTrigger, SplitText and ScrambleTextPlugin all ship free in the public `gsap` package
- lenis, synced with ScrollTrigger: `lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add(t => lenis.raf(t * 1000))`, `gsap.ticker.lagSmoothing(0)`
- Tailwind CSS v4 (@tailwindcss/vite) with design tokens as CSS variables
- zustand (global state; read transiently inside useFrame)
- katex (equations); world-atlas + topojson-client (GPS globe land data)
- vitest (simulation tests); Playwright for screenshot QA if it can be installed
- Fonts from Fontsource npm packages (self-hosted, bundled)

Must work with no network after install: no HDRI downloads, no Google Fonts CDN, no remote models, and never drei `<Text>` without a local font file (its default fetches from a CDN).

## 2. DESIGN CONCEPT — "EIGHT WORLDS, ONE MUSEUM"

Each chapter is its own world — its own typeface, palette, texture and signature effect — so scrolling feels like walking from one exhibition hall into the next. A strict shared system (grid, spacing, body text, data text, components) holds the worlds together, so the variety reads as curated and premium, never random.

### 2.1 Constant system (identical in every chapter)
- Body/UI: Manrope Variable. Numbers, data, labels, HUD: JetBrains Mono Variable with tabular figures. Equations: KaTeX.
- Fluid type scale with clamp(); 12-column grid; generous negative space; 1px hairline rules; tiny uppercase mono labels as editorial detail ("FIG. 01 — THRUST", "[ LIVE ]", coordinate stamps).
- Same component set everywhere — only the tokens change.
- Subtle global film grain (2–4% opacity) and vignette.

### 2.2 The eight worlds

| # | Chapter | Display typeface | Palette | Texture & signature |
|---|---|---|---|---|
| 00 | Hero + Finale | Unbounded Variable; Instrument Serif Italic for accent words | ink #05060A, starlight #F4F1EA, iridescent gradient through all eight chapter colors | weight axis animates thin → black as the numbers "become real" |
| 01 | Rocket | Big Shoulders Stencil Variable (like fuselage stencils) | night #070B1A, ignition orange #FF6B1F, plume gold #FFC857 | countdown digits, heat shimmer |
| 02 | GPS | Doto Variable (dot-matrix, like a receiver display) | deep ocean #041427, signal cyan #22D3EE, ping mint #5CFFB1 | dotted globe, ping ripples; animate the ROND axis |
| 03 | F1 Aero | Archivo Variable via its wdth-italic file — expanded black italic | carbon #0B0B0D, redline #FF2D3D, airflow ice #CFE8FF | title's width axis stretches with car speed; carbon weave |
| 04 | AI | Syne Variable, ExtraBold | void #0B0614, synapse lime #C6FF3D, neural violet #A78BFA; weights +teal #2DD4BF / −rose #FB7185 | pulses racing along connections |
| 05 | CT | Fraunces Variable, soft italic — warm and human | film black #050708, x-ray ice #BFE3FF, bone #EDE6D6, contrast amber #FFB547 | radiograph glow, scan-line sweep |
| 06 | Skyscraper (LIGHT) | Bodoni Moda Variable (Art-Deco) | daylight sky #DCE9F5 → haze #F7F3EA, ink #0B1B2B, deco gold #B8862B, steel #5B6B7A; Blueprint mode #0A2540 + white linework | blueprint grid, dimension lines |
| 07 | Robot Arm (LIGHT) | Tektur Variable (animate wdth) | studio #ECEDEF, ink #121316, safety yellow #FFC400 (paint, not text), target cyan #0096B4 | CNC HUD, hazard-stripe accents |
| 08 | Accelerator | Michroma | deep indigo #0A0620, plasma magenta #FF3DCB, field blue #4F7BFF, beam white #FFFFFF | light trails, field lines |

Packages (verified on npm): @fontsource-variable/unbounded, @fontsource/instrument-serif, @fontsource-variable/big-shoulders-stencil, @fontsource-variable/doto, @fontsource-variable/archivo, @fontsource-variable/syne, @fontsource-variable/fraunces, @fontsource-variable/bodoni-moda, @fontsource-variable/tektur, @fontsource/michroma, @fontsource-variable/manrope, @fontsource-variable/jetbrains-mono.

Rules:
- Display typefaces only at display sizes (≥ 32px): chapter titles, giant numerals, hero statements, pull quotes, marquees. Never paragraphs, controls or data.
- Headlines may switch one or two accent words to Instrument Serif Italic in any chapter for editorial contrast (e.g. "How numbers *learn*").
- Each chapter opens with a giant outlined chapter number and its title in the chapter typeface, revealed with SplitText and filled with the chapter color as it scrolls in.
- Load only hero + Manrope + JetBrains Mono up front; lazy-load each chapter's typeface as it approaches; font-display: swap with metric-matched fallbacks (no layout shift).
- Background and accent tokens morph smoothly between chapters (GSAP-tweened CSS variables). CT → Skyscraper is a "sunrise": X-ray black floods into daylight; Robot → Accelerator plunges back into the dark.
- WCAG AA contrast on every background — adjust lightness if needed, keep each world's hue identity.

### 2.3 Color-coded mathematics (signature rule)
Every variable owns one color, used identically in its equation symbol, its slider, its live readout and its 3D object or vector. Example: in the Rocket chapter, T (thrust) is ignition orange in F = T − mg − D, on the thrust slider, in the readout, in the exhaust glow and on the thrust arrow. Visitors should SEE which number drives what. Always pair color with a symbol or label — never color alone.

## 3. MOTION & SCROLL

- Scroll is the storyteller. Pinned sections drive camera, objects, equation reveals, labels and chapter transitions (scrub ≈ 1 s smoothing).
- Every chapter follows: Title card → Phenomenon (scroll-scrubbed 3D sequence) → Lab (free interaction) → The Maths (live equations) → Reality Check → Transition.
- Labs are not scroll-scrubbed: scrolling only brings them in, so dragging and sliders never fight the scroll.
- Scrubbed sequences use real physics: precompute the trajectory from the model for the current parameters and map scroll progress → simulation time; recompute when a parameter changes. "Play" runs in real time.
- Signature effects (use with taste, never all at once): SplitText masked line/character reveals; ScrambleText as a live number first appears; variable-font axes tied to scroll or to simulation values; marquee bands of each chapter's key quantities in its typeface, skewing with scroll velocity; giant outlined numerals with parallax; color-wash transitions; magnetic buttons; a custom cursor that adapts per chapter (hidden on touch); a scroll HUD showing "03 / 08" in the chapter color.
- Easing: expo/power4 outs, reveals 0.8–1.4 s. Nothing bouncy or cheap.
- prefers-reduced-motion: no smooth scroll, scrubs become fades, simulations start paused, no camera shake.
- Pinning only — no scroll-jacking. Native scrollbar and keyboard scrolling always work.

## 4. 3D & RENDERING — premium, not a demo

- ONE persistent full-viewport `<Canvas>` fixed behind the DOM (one WebGL context). A ChapterDirector (zustand) tracks the active chapter from ScrollTrigger; only the active chapter and the next are mounted, everything else is unmounted and disposed. Transitions between chapters happen inside this canvas.
- DOM overlays use `pointer-events: none` except on real controls, so the 3D stays draggable.
- Lighting: procedural environments from drei `<Environment>` + `<Lightformer>` (no HDRI files); key/fill/rim lighting with rims in the chapter accent; contact shadows.
- Materials: MeshPhysicalMaterial (clearcoat, metalness/roughness, transmission, iridescence where it fits) with procedural surface detail; emissive + `toneMapped={false}` for things that should bloom. Never default grey materials.
- Post-processing: selective Bloom (mipmapBlur), SMAA, subtle Noise + Vignette, AgX or ACES tone mapping; DepthOfField and chromatic aberration only during transitions; N8AO on desktop only.
- Cameras: 30–40° FOV for hero shots, damped rigs (maath), slow idle drift; camera shake only at ignition.
- Custom GLSL only where it earns its place: rocket plume with Mach diamonds, atmosphere fresnel, airflow streamlines, X-ray beams, particle trails.
- Procedural geometry first (Extrude, Lathe, Tube, instancing). glTF only if it clearly improves quality and is license-clear. No real brand logos or liveries.
- Adaptive quality: drei PerformanceMonitor + AdaptiveDpr; DPR clamped to [1, 2] desktop and [1, 1.5] mobile; fewer particles and no AO/DOF on weak GPUs.

## 5. SIMULATION ENGINE & SCIENTIFIC HONESTY

- All physics and maths in pure TypeScript modules in `src/sim/*` (no Three.js imports), each exposing init, params, step(dt), reset, metrics, dispose. Scenes only read state.
- Fixed timestep with an accumulator (e.g. 1/240 s substeps), RK4 where appropriate, SI units internally. Physics never depends on frame rate.
- Heavy compute (CT reconstruction, neural-network training) in Web Workers.
- High-frequency values live in refs/stores, not React state; DOM readouts update ~10–15×/s.
- Numbers: sensible significant figures, SI units, auto-scaled units (m → km), Intl.NumberFormat, tabular figures. No fake precision.
- Equations: render the symbolic form once with KaTeX (color-coded variables), with a live substitution line beneath it, e.g. F = 1,240,000 N − (98,000 kg × 9.81 m/s²) − 31,400 N.
- Three layers per chapter: 1 Intuition (what's happening) · 2 Mathematics (the model) · 3 Engineering reality (what real engineers add). Label every simplification ("Educational model — simplified atmosphere"). Never invent formulas; every equation shown must actually drive the visual.
- If a number is on screen, the model that moves the object computed it.

## 6. EXPERIENCE FLOW

### Loader
"LOADING REALITY" with a 0 → 100 counter in JetBrains Mono driven by real loading progress (drei useProgress) — even the loader's number is honest. Exit with a mask wipe.

### Hero
- Giant "NUMBERS → REALITY" in Unbounded, its weight animating thin → black; "Where mathematics becomes reality." in Instrument Serif Italic; then: "Every rocket launch, satellite position, racing car, intelligent machine and medical image depends on mathematics you rarely get to see."
- WOW: thousands of digits and maths symbols (instanced quads from a glyph atlas drawn at runtime with the mono font) drift in 3D; as you scroll they swarm and assemble into the rocket on its launch pad (targets sampled from the rocket mesh with MeshSurfaceSampler) — numbers literally becoming reality — and hand off into Chapter 01.
- Cue: "Scroll to see the mathematics move."

### 01 — ROCKET LAUNCH · From thrust to orbit
- Scene: launch pad and tower at dusk; segmented rocket with stencil markings; plume shader with Mach diamonds; ground steam (instanced sprites); ignition shake. As altitude rises the sky goes blue → indigo → black, stars fade in, Earth's curvature appears.
- Maths: F_net = T − mg − D; a = F_net / m; ṁ = T / (I_sp·g₀), m(t) = m₀ − ṁt; D = ½ρ(h)v²C_dA with ρ(h) = ρ₀e^(−h/H), H ≈ 8.5 km; g(h) = g₀(R / (R + h))²; Tsiolkovsky Δv = I_sp·g₀·ln(m₀ / m_f) at Level 2–3.
- Controls: thrust, payload / initial mass, propellant, I_sp, drag on/off, gravity preset (Earth 9.81 / Mars 3.71 / Moon 1.62 m/s²), pitch-over angle.
- Readouts: altitude, velocity, acceleration (in g), mass, thrust-to-weight ratio, dynamic pressure q = ½ρv².
- WOW: with TWR < 1 the rocket strains but can't leave the pad ("TWR 0.94 — not enough thrust"); push it past 1.0 and it lifts off. A "MAX-Q" flag appears exactly at peak dynamic pressure.
- Honest note: single-stage point-mass model with a simple pitch program — not an orbital launch planner.

### 02 — GPS · Four clocks find you
- Scene: dotted globe built from real land data (world-atlas → points), atmospheric fresnel glow, satellites on inclined orbits with orbit rings, translucent range spheres with glowing edges, ping ripples; zoom from orbit to the solved point.
- Maths: pseudorange ρᵢ = c·Δtᵢ; (x − xᵢ)² + (y − yᵢ)² + (z − zᵢ)² = rᵢ². Real receivers must also solve their own clock error b: ρᵢ = ‖sᵢ − x‖ + c·b → four unknowns (x, y, z, b) → why at least four satellites are needed. Gauss–Newton least squares; show residuals.
- Controls: drag the receiver across the globe, move/toggle satellites (3 vs 4+), clock-error slider, measurement noise, show/hide spheres.
- WOW: the spheres intersect and one point snaps into place; set the clock error to 1 μs and watch the fix drift ≈ 300 m (c × 1 μs).
- Level 3: relativity makes satellite clocks gain ≈ 38 μs per day — uncorrected, positions would drift roughly 10 km a day.

### 03 — F1 AERODYNAMICS · Upside-down wings
- Scene: dark wind tunnel with laser-sheet lighting and smoke streamlines; a sculpted procedural Formula-style car (no real team livery) in clearcoat carbon; streamlines speed up with velocity and are colored by pressure; downforce and drag arrows scaled to the computed newtons; suspension compresses under load.
- Maths: F_D = ½ρv²C_dA, F_L = ½ρv²C_lA (C_l < 0 means downforce). Double the speed → four times the force. Use plausible, clearly labeled approximations (e.g. C_dA ≈ 1.0–1.5 m², C_lA ≈ −3 to −5 m², mass ≈ 800 kg).
- Controls: speed (0–350 km/h), rear-wing angle (→ C_l and C_d through a simple labeled model), low-drag mode (wing flap opens: less drag and less downforce — the idea behind DRS and active aero), air density / altitude.
- Readouts: drag (N), downforce (N and × car weight), cornering-grip estimate.
- WOW: a live "theoretical upside-down speed" v* = √(2mg / (ρ|C_l|A)) — the speed at which downforce exceeds the car's weight. The chapter title physically stretches wider as the speed climbs.
- Level 3: real teams use CFD, wind tunnels and track data; ground effect, yaw and ride height all matter.

### 04 — THE MATHEMATICS INSIDE AI · How numbers learn
- Scene: 3D layered network (2 inputs → hidden layers of ~6–8 → 1 output); edge thickness = |weight|, color = sign; activation pulses run along edges in the forward pass; nodes glow with activation. Beside it: the 2D dataset (spiral / two moons / circle / XOR) and a 3D decision surface (height = network output over the input plane) that morphs as the network trains; a live loss curve.
- Maths: z = Σwx + b; a = f(z); binary cross-entropy loss; backprop by the chain rule; w ← w − η ∂L/∂w. Show one neuron's real numbers updating.
- Controls: dataset, learning rate (too high → the loss oscillates/diverges — show it), hidden size, activation (tanh / ReLU / sigmoid), noise, Train / Pause / Step / Reset.
- WOW: the flat surface folds itself into a spiral as the loss falls; "Step" shows a single weight update with the actual values.
- Real training in TypeScript (Float32Array) in a Web Worker, gradient-checked in tests. Honest note: a tiny network — large models have billions of parameters but learn by the same principle.

### 05 — SEEING INSIDE · CT scanning
- Scene: CT gantry ring with a rotating X-ray source and detector arc; glowing rays pass through a translucent object containing the Shepp–Logan phantom (the standard test object built from ellipses). The sinogram builds line by line as the gantry turns, the cross-section reconstructs, then slices stack into a 3D volume.
- Maths: Beer–Lambert I = I₀e^(−∫μ dx) → p = −ln(I / I₀) = ∫μ ds (the Radon transform). Plain back-projection (blurry) vs filtered back-projection with a ramp filter (sharp).
- Controls: number of angles (8 → 360), noise (photon count), filter (none / ramp / Hann), rotation speed.
- WOW: switch the filter on and a blur snaps into a crisp cross-section; slide the angles from 8 to 180 and the streak artifacts vanish.
- Real filtered back-projection at 256×256 in a Web Worker. Honest note: 2D parallel-beam teaching model — clinical CT uses fan/cone beams, iterative reconstruction and calibration; not for medical use.

### 06 — MAKING A BUILDING STAND · Skyscraper
- Scene: tapered supertall tower (procedural floors, glass curtain wall, steel frame) in daylight, with a Blueprint-mode toggle (wireframe + dimension lines); wind particles shed alternating vortices behind it; a cutaway reveals a golden tuned-mass-damper sphere near the top (inspired by Taipei 101's real one).
- Maths: m x″ + c x′ + k x = F(t); f_n = (1/2π)√(k/m); ζ = c / (2√(km)); wind load F = ½ρv²C_dA; vortex shedding f_s = St·v / D (St ≈ 0.2 for a rounded section); resonance when f_s ≈ f_n. Adding the damper makes a 2-DOF system (RK4).
- Controls: wind speed, stiffness, damping, mass, damper on/off with mass ratio and tuning.
- Readouts: top displacement in real metres, natural period, peak acceleration in milli-g, and a visible "× N visual exaggeration" label.
- WOW: find the resonance wind speed → the tower sways hard → switch on the golden damper → the sway collapses. A live frequency-response curve shows why.
- Honest note: single-mode teaching model; real towers are designed with finite-element models and wind-tunnel tests.

### 07 — TEACHING MACHINES TO MOVE · Robotic arm
- Scene (light studio): industrial arm — base yaw, shoulder, elbow, level-keeping wrist — with machined metal, safety-yellow housings and cable runs; a translucent reachable-workspace shell; a draggable glowing target; a light trail from the end effector.
- Maths: FK x = L₁cosθ₁ + L₂cos(θ₁ + θ₂), y = L₁sinθ₁ + L₂sin(θ₁ + θ₂). IK cosθ₂ = (x² + y² − L₁² − L₂²) / (2L₁L₂), θ₁ = atan2(y, x) − atan2(L₂sinθ₂, L₁ + L₂cosθ₂); base yaw from atan2; elbow-up / elbow-down are the two solutions; reachable only if |L₁ − L₂| ≤ r ≤ L₁ + L₂. Level 3: the Jacobian, singularities (det J = L₁L₂sinθ₂ → 0), transformation matrices for 6-axis robots.
- Controls: drag the target (mouse, touch, keyboard), link lengths, elbow up/down, joint speed limit, Draw mode.
- Readouts: θ₁, θ₂, yaw (°), x, y, z, reach %, singularity warning.
- WOW: draw a squiggle on a 2D pad and the arm traces it in 3D with a glowing pen; drag the target out of reach and the workspace boundary lights up — "OUT OF WORKSPACE".

### 08 — BENDING PARTICLES · Particle accelerator
- Scene: synchrotron tunnel with alternating magnets, glass beam pipe, glowing particle bunches with light trails; a bending-magnet lab with field lines and v, B, F vectors (right-hand rule, color-coded).
- Maths: F = q(E + v × B); magnetic-only: r = mv / (qB), relativistic r = p / (qB) with p = γmv; cyclotron frequency f = qB / (2πγm).
- Controls: particle (electron / proton / alpha with real masses and charges), charge sign, speed (up to 0.99c, γ shown), B (0–8 T; LHC dipoles ≈ 8.3 T), field direction.
- WOW: flip the charge and the path flips; ramp up the energy and B must rise to keep the ring radius fixed (the synchrotron principle); bubble-chamber mode: particles lose energy and spiral inward.
- Honest note: single-particle model; real machines add RF acceleration, beam optics and synchrotron radiation.

### Transitions (shared motifs inside the one canvas)
Hero digits → rocket. Rocket trajectory → extends into an orbit around the dotted Earth. Satellite signal lines → straighten into wind-tunnel streamlines. Streamlines → condense into neural connections. Decision surface → flattens into an image plane → a CT slice. CT slices → stack into building floors. Golden damper sphere → the robot's target orb. The robot's circular trace → the accelerator ring. Particle beams → fly outward into the finale. Where a true morph isn't feasible, crossfade while carrying a shared shape or color.

### Finale
"NUMBERS → REALITY" returns. The eight systems become a 3D constellation of nodes in their chapter colors, linked by the mathematics they share (equations of motion: Rocket–F1–Skyscraper–Accelerator; vectors & trigonometry: GPS–Robot–Accelerator; linear algebra: AI–CT–Robot; geometry: GPS–CT). Clicking a node jumps back to that chapter. Final line: "Mathematics isn't just a language for describing reality. It is one of the tools we use to build it." Then a minimal footer with a short "Models & sources" note.

## 7. REUSABLE COMPONENTS
ChapterWorld (tokens + font loading), ChapterTitle, ScrollNarrative, LabPanel, LiveMetric, VariableControl (styled native range inputs), EquationBlock (KaTeX + live substitution), RealityCheck, ForceVector, TrajectoryLine, CoordinateGrid, Annotation, Tooltip, ChapterNav (00 INTRO · 01 ROCKET · 02 GPS · 03 F1 · 04 AI · 05 CT · 06 SKYSCRAPER · 07 ROBOT ARM · 08 ACCELERATOR), ScrollHUD, Loader, Cursor, Marquee, GrainOverlay. Scenes in `src/scenes/*`, simulations in `src/sim/*`, workers in `src/workers/*`.

## 8. WRITING
Short and sharp: BIG IDEA → WHAT'S HAPPENING → THE MATHS → CHANGE A VARIABLE → WATCH THE RESULT → WHY IT MATTERS. Clear to a Class 11 student, interesting to an engineer. No walls of text and no "maths is everywhere" filler — always name the exact operation doing the work.

## 9. RESPONSIVE & ACCESSIBLE
Desktop: simulation on one side, panel on the other. Tablet/mobile: 3D on top, controls in a bottom sheet, touch-drag for the robot target and GPS receiver, shorter pins, svh/dvh units. Keyboard-operable controls with visible focus, ARIA labels, a one-sentence text description of what each simulation shows; reduced motion fully respected.

## 10. PERFORMANCE
60 fps on a mid-range laptop, 30+ on a mid-range phone via adaptive quality. One WebGL context. Code-split every chapter and lazy-load its typeface. Instancing and GPU particles. Dispose geometries, materials and textures on unmount, and confirm renderer.info.memory doesn't grow after scrolling through all chapters twice. Pause rendering when the tab is hidden or nothing is changing. Zero console errors.

## 11. NEVER
Fake live numbers or randomly animated equations · static pages called "interactive" · neon everything, gradient soup, glass cards everywhere · stock photos · system/default fonts or the default Three.js look · brand logos or liveries · presenting teaching models as real engineering tools · one giant Three.js component or eight copy-pasted architectures · login, database, chatbot, ads or other unrelated features · broken placeholder sections.

## 12. BUILD PHASES & QA
- Phase 0 — First actions (section 0).
- Phase 1 — Foundation: project setup, tokens + chapter worlds, font pipeline, Lenis + ScrollTrigger, persistent canvas + ChapterDirector, component kit, simulation-engine core, test setup.
- Phase 2 — Loader + Hero + Chapter 01 Rocket at full polish. This sets the bar for everything else.
- Phase 3 — Chapters 02 GPS + 03 F1.
- Phase 4 — Chapters 04 AI + 05 CT (with workers).
- Phase 5 — Chapters 06 Skyscraper + 07 Robot + 08 Accelerator.
- Phase 6 — Inter-chapter transitions, finale, navigation polish.
- Phase 7 — Performance, mobile and accessibility pass.
- Phase 8 — Final science, design and code audit; README covering run, build and static deployment (Vercel / Netlify / GitHub Pages).

After every phase:
1. Type-check, lint, unit tests and a production build — all green.
2. Vitest tests for each simulation against known answers — e.g. a no-drag, constant-mass rocket matches s = ut + ½at²; GPS recovers a known position and clock bias from synthetic ranges; aero forces scale with v²; neural-net gradients pass a numerical gradient check and the circle dataset reaches > 95% accuracy; FBP error falls as angles increase; free vibration matches f_n and decay matches ζ; FK(IK(p)) ≈ p; simulated orbit radius matches mv / (qB) and flips with charge.
3. Visual QA: if Playwright/Chromium is available, screenshot desktop (1440×900) and mobile (390×844) at each chapter's key scroll positions, look at the images yourself, and fix anything that looks basic, cramped, misaligned or low-contrast.
4. Commit with a clear message.
5. Report briefly: what was built, what was tested, known limitations, what's next.

## 13. WORKING STYLE
Make obvious and minor decisions yourself — choose the most robust option and keep going. Don't replace working systems unnecessarily. Don't ship placeholders when a real implementation is feasible. Correct, working interactions first, then make them beautiful — both are required.

## START NOW
Do Phase 0, Phase 1 and Phase 2 in this session, then stop and report. Don't start the other chapters yet.
