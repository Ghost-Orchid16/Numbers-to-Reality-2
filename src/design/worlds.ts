/**
 * EIGHT WORLDS, ONE MUSEUM — the token sets.
 *
 * Every chapter is its own world (display face, palette, texture), but all worlds expose the
 * same token names, so every component is shared and only the tokens change.
 *
 *   bg / surface   page background and raised surfaces
 *   fg / muted     body text (≥ 7:1) and secondary text (≥ 4.5:1) on bg — tested in worlds.test.ts
 *   rule           1px hairlines
 *   accent         the world's signature colour (graphics, large display text ≥ 3:1)
 *   accentText     accent adjusted in lightness for small text (≥ 4.5:1), same hue family
 *   accent2        secondary colour
 *   vars           colour-coded mathematics: one colour per variable, used identically in the
 *                  equation symbol, its slider, its readout and its 3D object
 */

export type WorldId =
  | 'intro'
  | 'rocket'
  | 'gps'
  | 'f1'
  | 'ai'
  | 'ct'
  | 'skyscraper'
  | 'robot'
  | 'accelerator'

export interface DisplayFace {
  /** CSS font-family stack: web font → metric-matched fallback → generic */
  stack: string
  weight: number
  style: 'normal' | 'italic'
  /** extra font-variation-settings for display use (axes beyond wght) */
  variation?: string
  /** CSS font-stretch (for faces with a wdth axis) */
  stretch?: string
  tracking: string
  /** uppercase titles */
  upper: boolean
}

export interface MathVar {
  /** symbol as typeset (KaTeX) */
  tex: string
  /** short human label, always shown next to the colour (never colour alone) */
  label: string
  color: string
}

export interface World {
  id: WorldId
  theme: 'dark' | 'light'
  colors: {
    bg: string
    surface: string
    fg: string
    muted: string
    rule: string
    accent: string
    accentText: string
    accent2: string
    /** text colour on an accent-filled button */
    onAccent: string
  }
  display: DisplayFace
  vars: Record<string, MathVar>
}

const stack = (family: string, generic: string) => `'${family}', '${family} Fallback', ${generic}`

export const FONT_STACKS = {
  body: stack('Manrope Variable', 'ui-sans-serif, system-ui, sans-serif'),
  mono: stack('JetBrains Mono Variable', 'ui-monospace, monospace'),
  accentSerif: stack('Instrument Serif', 'ui-serif, Georgia, serif'),
} as const

export const WORLDS: Record<WorldId, World> = {
  intro: {
    id: 'intro',
    theme: 'dark',
    colors: {
      bg: '#05060A',
      surface: '#0D0F16',
      fg: '#F4F1EA',
      muted: '#A19D94',
      rule: 'rgba(244, 241, 234, 0.14)',
      accent: '#F4F1EA',
      accentText: '#F4F1EA',
      accent2: '#9C8CFF',
      onAccent: '#05060A',
    },
    display: { stack: stack('Unbounded Variable', 'sans-serif'), weight: 900, style: 'normal', tracking: '-0.035em', upper: true },
    vars: {},
  },
  rocket: {
    id: 'rocket',
    theme: 'dark',
    colors: {
      bg: '#070B1A',
      surface: '#0E1428',
      fg: '#F5F0E8',
      muted: '#9AA3BF',
      rule: 'rgba(245, 240, 232, 0.14)',
      accent: '#FF6B1F',
      accentText: '#FF7A33',
      accent2: '#FFC857',
      onAccent: '#140700',
    },
    display: {
      stack: stack('Big Shoulders Stencil Variable', 'sans-serif'),
      weight: 800,
      style: 'normal',
      variation: "'opsz' 72",
      tracking: '-0.005em',
      upper: true,
    },
    vars: {
      thrust: { tex: 'T', label: 'thrust', color: '#FF6B1F' },
      mass: { tex: 'm', label: 'mass', color: '#F5F0E8' },
      gravity: { tex: 'g', label: 'gravity', color: '#7FA8FF' },
      weight: { tex: 'mg', label: 'weight', color: '#7FA8FF' },
      drag: { tex: 'D', label: 'drag', color: '#5EE6D0' },
      velocity: { tex: 'v', label: 'velocity', color: '#FFC857' },
      altitude: { tex: 'h', label: 'altitude', color: '#C7B8FF' },
      density: { tex: '\\rho', label: 'air density', color: '#5EE6D0' },
      q: { tex: 'q', label: 'dynamic pressure', color: '#FF9DB5' },
      accel: { tex: 'a', label: 'acceleration', color: '#FFFFFF' },
      fnet: { tex: 'F_{\\text{net}}', label: 'net force', color: '#FFFFFF' },
      isp: { tex: 'I_{sp}', label: 'specific impulse', color: '#FFA36B' },
      mdot: { tex: '\\dot m', label: 'mass flow', color: '#FFA36B' },
      gamma: { tex: '\\gamma', label: 'flight-path angle', color: '#B7F171' },
    },
  },
  gps: {
    id: 'gps',
    theme: 'dark',
    colors: {
      bg: '#041427',
      surface: '#0A2038',
      fg: '#EAF6FF',
      muted: '#8FB0C9',
      rule: 'rgba(234, 246, 255, 0.14)',
      accent: '#22D3EE',
      accentText: '#22D3EE',
      accent2: '#5CFFB1',
      onAccent: '#021018',
    },
    display: {
      stack: stack('Doto Variable', 'monospace'),
      weight: 800,
      style: 'normal',
      variation: "'ROND' 100",
      tracking: '0',
      upper: true,
    },
    vars: {},
  },
  f1: {
    id: 'f1',
    theme: 'dark',
    colors: {
      bg: '#0B0B0D',
      surface: '#151519',
      fg: '#F2F4F7',
      muted: '#A0A4AD',
      rule: 'rgba(242, 244, 247, 0.14)',
      accent: '#FF2D3D',
      accentText: '#FF4D5B',
      accent2: '#CFE8FF',
      onAccent: '#140003',
    },
    display: {
      stack: stack('Archivo Variable', 'sans-serif'),
      weight: 900,
      style: 'italic',
      stretch: '125%',
      tracking: '-0.02em',
      upper: true,
    },
    vars: {},
  },
  ai: {
    id: 'ai',
    theme: 'dark',
    colors: {
      bg: '#0B0614',
      surface: '#140D22',
      fg: '#F3F0FA',
      muted: '#A79FBF',
      rule: 'rgba(243, 240, 250, 0.14)',
      accent: '#C6FF3D',
      accentText: '#C6FF3D',
      accent2: '#A78BFA',
      onAccent: '#0E1400',
    },
    display: { stack: stack('Syne Variable', 'sans-serif'), weight: 800, style: 'normal', tracking: '-0.02em', upper: false },
    vars: {
      positive: { tex: 'w_{+}', label: 'positive weight', color: '#2DD4BF' },
      negative: { tex: 'w_{-}', label: 'negative weight', color: '#FB7185' },
    },
  },
  ct: {
    id: 'ct',
    theme: 'dark',
    colors: {
      bg: '#050708',
      surface: '#0D1214',
      fg: '#EDE6D6',
      muted: '#9AA7AE',
      rule: 'rgba(237, 230, 214, 0.14)',
      accent: '#BFE3FF',
      accentText: '#BFE3FF',
      accent2: '#FFB547',
      onAccent: '#050708',
    },
    display: {
      stack: stack('Fraunces Variable', 'serif'),
      weight: 600,
      style: 'italic',
      variation: "'SOFT' 100, 'opsz' 144",
      tracking: '-0.02em',
      upper: false,
    },
    vars: {},
  },
  skyscraper: {
    id: 'skyscraper',
    theme: 'light',
    colors: {
      bg: '#F7F3EA',
      surface: '#ECE6D8',
      fg: '#0B1B2B',
      muted: '#4A5868',
      rule: 'rgba(11, 27, 43, 0.16)',
      accent: '#A97B28', // spec deco gold #B8862B darkened 8% for ≥ 3:1 on haze (3D keeps #B8862B)
      accentText: '#7D5410',
      accent2: '#5B6B7A',
      onAccent: '#0B1B2B',
    },
    display: {
      stack: stack('Bodoni Moda Variable', 'serif'),
      weight: 700,
      style: 'normal',
      variation: "'opsz' 96",
      tracking: '-0.01em',
      upper: true,
    },
    vars: {},
  },
  robot: {
    id: 'robot',
    theme: 'light',
    colors: {
      bg: '#ECEDEF',
      surface: '#DFE1E5',
      fg: '#121316',
      muted: '#4E535C',
      rule: 'rgba(18, 19, 22, 0.16)',
      accent: '#008CA7', // spec target cyan #0096B4 darkened 7% for ≥ 3:1 on studio (3D keeps #0096B4)
      accentText: '#006A80',
      accent2: '#FFC400',
      onAccent: '#121316',
    },
    display: {
      stack: stack('Tektur Variable', 'sans-serif'),
      weight: 800,
      style: 'normal',
      stretch: '100%',
      tracking: '-0.01em',
      upper: true,
    },
    vars: {},
  },
  accelerator: {
    id: 'accelerator',
    theme: 'dark',
    colors: {
      bg: '#0A0620',
      surface: '#140E33',
      fg: '#F5F3FF',
      muted: '#A39CC4',
      rule: 'rgba(245, 243, 255, 0.14)',
      accent: '#FF3DCB',
      accentText: '#FF5AD3',
      accent2: '#4F7BFF',
      onAccent: '#1A0014',
    },
    display: { stack: stack('Michroma', 'sans-serif'), weight: 400, style: 'normal', tracking: '0.02em', upper: true },
    vars: {},
  },
}

/** The iridescent hero gradient runs through every chapter colour in order. */
export const IRIDESCENT = [
  WORLDS.rocket.colors.accent,
  WORLDS.gps.colors.accent,
  WORLDS.f1.colors.accent,
  WORLDS.ai.colors.accent,
  WORLDS.ct.colors.accent,
  WORLDS.skyscraper.colors.accent,
  WORLDS.robot.colors.accent,
  WORLDS.accelerator.colors.accent,
] as const

/** CSS custom properties for a world (applied on :root by the director, or locally). */
export function worldVars(w: World): Record<string, string> {
  const c = w.colors
  const vars: Record<string, string> = {
    '--bg': c.bg,
    '--surface': c.surface,
    '--fg': c.fg,
    '--muted': c.muted,
    '--rule': c.rule,
    '--accent': c.accent,
    '--accent-text': c.accentText,
    '--accent-2': c.accent2,
    '--on-accent': c.onAccent,
  }
  return vars
}

/** Display-face CSS custom properties (set on a chapter section). */
export function displayVars(w: World): Record<string, string> {
  const d = w.display
  return {
    '--display-family': d.stack,
    '--display-weight': String(d.weight),
    '--display-style': d.style,
    '--display-variation': d.variation ?? 'normal',
    '--display-stretch': d.stretch ?? '100%',
    '--display-tracking': d.tracking,
    '--display-case': d.upper ? 'uppercase' : 'none',
  }
}

/** Per-variable colour custom properties: --v-thrust, --v-mass … */
export function mathVars(w: World): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(w.vars)) out[`--v-${k}`] = v.color
  return out
}
