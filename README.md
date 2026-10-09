# NUMBERS → REALITY

*Where mathematics becomes reality.* A scroll-driven 3D museum of working simulations — every number on
screen is computed by the model that moves what you see.

**Status:** Phase 2 of 8 — entrance (loader + hero) and **Chapter 01 · Rocket launch** are built.
Chapters 02–08 and the finale follow in later phases (see `docs/SPEC.md` §12).

## Run

```bash
npm install          # Node 22+, npm
npm run dev          # http://localhost:5173
```

Everything is bundled: fonts (Fontsource), KaTeX, three.js. No CDNs, HDRIs or remote assets — it works
offline after install.

## Scripts

| command | what it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | type-check (`tsc -b`) + production build to `dist/` |
| `npm run preview` | serve the production build |
| `npm run typecheck` / `npm run lint` | TypeScript (strict) / ESLint |
| `npm test` | Vitest — physics tests against known answers, WCAG contrast of every world, formatting |
| `npm run check` | all of the above in one go |
| `npm run qa:shots` | (after `npm run build`) Playwright screenshots of every key scroll position (1440×900 and 390×844) into `qa/`, console-error and GPU-memory-leak checks. Flags: `--only=desktop`, `--reduced` |
| `npm run fonts:fallbacks` | regenerate metric-matched fallback `@font-face` rules from the shipped font files |

## Deploy (static)

`npm run build` produces a static site in `dist/` (asset URLs are absolute from `/` — Vite's default `base`).

- **Vercel / Netlify:** build command `npm run build`, output directory `dist`.
- **GitHub Pages:** build with `npx vite build --base=/<repo-name>/` and publish `dist/`
  (e.g. with `actions/upload-pages-artifact` + `actions/deploy-pages`).

## How it is built

- **One canvas.** A single fixed WebGL canvas sits behind the page; a ChapterDirector mounts only the
  active chapter's scene and its neighbour.
- **Pure simulations.** `src/sim/*` is framework-free TypeScript (fixed 1/240 s steps, RK4, SI units) and
  fully unit-tested. Scenes and readouts only read its state.
- **Scroll as storyteller.** Lenis + GSAP ScrollTrigger; the pinned launch maps scroll to simulated time on
  a trajectory precomputed by the model for the current lab settings. The lab runs the same model live.
- **Eight worlds, one museum.** Shared components themed by per-chapter tokens (typeface, palette,
  colour-coded variables), with WCAG AA contrast enforced by tests.

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). The full brief: [`docs/SPEC.md`](docs/SPEC.md).

## Models & sources (Chapter 01)

Educational, labelled models — not engineering tools. Gravity turn after H. D. Curtis, *Orbital Mechanics
for Engineering Students* (ch. 11); Tsiolkovsky rocket equation; U.S. Standard Atmosphere 1976 sea-level
density; NASA planetary fact sheets. Fonts are SIL Open Font License; equations typeset with KaTeX.
