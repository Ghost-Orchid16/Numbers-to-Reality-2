import katex from 'katex'
import 'katex/dist/katex-swap.min.css'

/**
 * Render TeX once to an HTML string (with MathML for screen readers). Only \htmlClass is
 * trusted — it carries the colour-coding classes (v-thrust, v-mass, …).
 */
export function renderTex(tex: string, displayMode = false): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    output: 'htmlAndMathml',
    strict: 'ignore',
    trust: (ctx) => ctx.command === '\\htmlClass',
  })
}

/** Colour-coded variable: cv('thrust', 'T') → \htmlClass{v-thrust}{T} */
export const cv = (key: string, tex: string): string => `\\htmlClass{v-${key}}{${tex}}`
