import { useEffect, useState } from 'react'
import { usePrefs } from '../state/prefs'

/** Builds a tileable monochrome noise texture once (no image files). */
function makeGrain(size = 160): string {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(size, size)
  let seed = 1337
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 255)
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

/**
 * Global film grain (≈3% opacity) and vignette over everything, DOM and canvas alike.
 * The grain shifts in steps (film flicker); it is still under reduced motion.
 */
export function GrainOverlay() {
  const [url, setUrl] = useState('')
  const reduced = usePrefs((s) => s.reducedMotion)
  useEffect(() => setUrl(makeGrain()), [])
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60]">
      <div
        className={reduced ? 'grain grain-still' : 'grain'}
        style={{ backgroundImage: url ? `url(${url})` : undefined }}
      />
      <div className="vignette" />
    </div>
  )
}
