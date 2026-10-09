import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three'
import { RK } from './rocketGeometry'

/**
 * Body decal (albedo): stencil lettering in the chapter's own face (Big Shoulders Stencil),
 * a roll-pattern band, weld seams and an ignition-orange pinstripe. No real livery or logo.
 * u wraps the circumference, v runs up the tank (bottom → top).
 */
const STENCIL = "'Big Shoulders Stencil Variable', 'Big Shoulders Stencil Variable Fallback', sans-serif"

export function drawBodyDecal(canvas: HTMLCanvasElement, withLettering: boolean): void {
  const W = 1024
  const bodyH = RK.tankTop - RK.skirtTop
  const circ = 2 * Math.PI * RK.radius
  const H = Math.round((W * bodyH) / circ) // keep texels square on the cylinder
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const pxPerM = W / circ

  ctx.fillStyle = '#F1EEE7'
  ctx.fillRect(0, 0, W, H)

  // weld seams between tank barrel sections
  ctx.fillStyle = 'rgba(40, 38, 34, 0.12)'
  for (const m of [4.2, 9.4, 14.6]) ctx.fillRect(0, H - m * pxPerM, W, 2)

  // roll-pattern band near the top of the tank (camera crews use it to read roll)
  const bandH = 1.1 * pxPerM
  const bandY = H - 1.6 * pxPerM - bandH
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#121316' : '#F1EEE7'
    ctx.fillRect((i * W) / 4, bandY, W / 4, bandH)
  }
  ctx.fillStyle = '#121316'
  ctx.fillRect(0, bandY - 3, W, 3)
  ctx.fillRect(0, bandY + bandH, W, 3)

  // ignition-orange pinstripe down the far side
  ctx.fillStyle = '#FF6B1F'
  ctx.fillRect(W * 0.75 - 5, H * 0.08, 10, H * 0.72)

  if (!withLettering) return

  const letters = (text: string, sizeM: number, u: number, vCenter: number, weight = 800, color = '#121316') => {
    ctx.save()
    ctx.translate(u * W, H - vCenter * H)
    ctx.rotate(-Math.PI / 2)
    ctx.font = `${weight} ${Math.round(sizeM * pxPerM)}px ${STENCIL}`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }

  // NUMBERS → REALITY, read bottom-to-top like fuselage lettering; the arrow is drawn, not typed
  const size = 1.05
  const fontPx = Math.round(size * pxPerM)
  ctx.font = `800 ${fontPx}px ${STENCIL}`
  const left = ctx.measureText('NUMBERS').width
  const right = ctx.measureText('REALITY').width
  const arrow = fontPx * 1.1
  const gap = fontPx * 0.32
  const total = left + right + arrow + gap * 2
  const start = H * 0.47 + total / 2 // in canvas px from top, text runs upwards
  ctx.save()
  ctx.translate(W * 0.25, start)
  ctx.rotate(-Math.PI / 2)
  ctx.fillStyle = '#121316'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText('NUMBERS', 0, 0)
  const ax = left + gap
  ctx.strokeStyle = '#121316'
  ctx.lineWidth = fontPx * 0.11
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.moveTo(ax, 0)
  ctx.lineTo(ax + arrow, 0)
  ctx.moveTo(ax + arrow * 0.62, -arrow * 0.34)
  ctx.lineTo(ax + arrow, 0)
  ctx.lineTo(ax + arrow * 0.62, arrow * 0.34)
  ctx.stroke()
  ctx.fillText('REALITY', ax + arrow + gap, 0)
  ctx.restore()

  letters('N→R-1'.replace('→', '/'), 0.62, 0.75 + 0.07, 0.62)
  letters('LOX', 0.42, 0.5, 0.8, 700, '#2A2B30')
  letters('RP-1', 0.42, 0.5, 0.3, 700, '#2A2B30')
  letters('01', 0.9, 0.0, 0.86)
}

export function makeBodyDecal(): { texture: CanvasTexture; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas')
  drawBodyDecal(canvas, false)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  texture.minFilter = LinearMipmapLinearFilter
  return { texture, canvas }
}

/** Fine procedural noise used as roughness/bump detail (no image files). */
export function makeSurfaceNoise(size = 256, seed = 7): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  // value noise at two octaves, tileable
  const grid = (n: number) => Array.from({ length: n * n }, rand)
  const g1 = grid(16)
  const g2 = grid(64)
  const sample = (g: number[], n: number, x: number, y: number) => {
    const fx = (x / size) * n
    const fy = (y / size) * n
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const v = (i: number, j: number) => g[((j + n) % n) * n + ((i + n) % n)]
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx
    const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx
    return a + (b - a) * ty
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = 0.62 * sample(g1, 16, x, y) + 0.38 * sample(g2, 64, x, y)
      const i = (y * size + x) * 4
      const b = Math.round(150 + v * 70)
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b
      img.data[i + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}
