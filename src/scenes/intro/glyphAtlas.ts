import { CanvasTexture, LinearMipmapLinearFilter, NoColorSpace } from 'three'

/**
 * Glyph atlas drawn at runtime with the museum's mono face (JetBrains Mono). Only characters
 * the shipped subsets contain (Latin + Greek) are used, so nothing falls back to a system font.
 */
export const DIGITS = '0123456789'
export const GREEK = 'πθλμρσφωΔΣΠΩγαβεδτηξψ'
export const OPERATORS = '+−×÷=±²³°½<>^%~·∕'
export const LETTERS = 'xyzeindfgvt'
export const GLYPHS = (DIGITS + GREEK + OPERATORS + LETTERS).split('').slice(0, 64)
export const ATLAS_COLS = 8

/** Number of glyph instances for a quality tier — shared by the scene and the caption. */
export function glyphCount(quality: 'high' | 'medium' | 'low', compact: boolean): number {
  if (compact) return 5200
  return quality === 'high' ? 13000 : quality === 'medium' ? 9000 : 5200
}
const CELL = 128

export async function buildGlyphAtlas(): Promise<CanvasTexture> {
  const face = "'JetBrains Mono Variable', 'JetBrains Mono Variable Fallback', monospace"
  // make sure the Latin *and* Greek subset files are loaded before drawing
  await document.fonts.load(`500 96px 'JetBrains Mono Variable'`, GLYPHS.join(''))
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = CELL * ATLAS_COLS
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `500 92px ${face}`
  GLYPHS.forEach((g, i) => {
    const cx = (i % ATLAS_COLS) * CELL + CELL / 2
    const cy = Math.floor(i / ATLAS_COLS) * CELL + CELL / 2 + 4
    ctx.fillText(g, cx, cy)
  })
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = NoColorSpace
  tex.minFilter = LinearMipmapLinearFilter
  tex.anisotropy = 4
  return tex
}

/** Pick a glyph index with a bias towards digits (numbers are the protagonists). */
export function pickGlyph(r: number): number {
  const d = DIGITS.length
  const g = GREEK.length
  const o = OPERATORS.length
  const l = Math.min(LETTERS.length, 64 - d - g - o)
  if (r < 0.5) return Math.floor((r / 0.5) * d)
  if (r < 0.75) return d + Math.floor(((r - 0.5) / 0.25) * g)
  if (r < 0.92) return d + g + Math.floor(((r - 0.75) / 0.17) * o)
  return d + g + o + Math.floor(((r - 0.92) / 0.08) * l)
}
