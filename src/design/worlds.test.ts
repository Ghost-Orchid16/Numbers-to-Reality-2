import { describe, expect, it } from 'vitest'
import { contrast } from '../lib/color'
import { WORLDS } from './worlds'

describe('WCAG AA contrast in every world', () => {
  for (const w of Object.values(WORLDS)) {
    const c = w.colors
    it(`${w.id}: body text ≥ 7:1, secondary ≥ 4.5:1`, () => {
      expect(contrast(c.fg, c.bg)).toBeGreaterThanOrEqual(7)
      expect(contrast(c.fg, c.surface)).toBeGreaterThanOrEqual(7)
      expect(contrast(c.muted, c.bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(c.muted, c.surface)).toBeGreaterThanOrEqual(4.5)
    })
    it(`${w.id}: small accent text ≥ 4.5:1, large accent display ≥ 3:1`, () => {
      expect(contrast(c.accentText, c.bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(c.accentText, c.surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(c.accent, c.bg)).toBeGreaterThanOrEqual(3)
      expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5)
    })
    it(`${w.id}: every maths variable colour is readable as text`, () => {
      for (const v of Object.values(w.vars)) {
        expect(contrast(v.color, c.bg), `${v.label} ${v.color}`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(v.color, c.surface), `${v.label} ${v.color}`).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})
