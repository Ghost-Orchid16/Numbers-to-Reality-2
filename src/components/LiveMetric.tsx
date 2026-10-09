import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { Formatted } from '../lib/format'
import { renderTex } from '../lib/tex'
import { onReadout } from '../lib/ticker'
import { gsap } from '../motion/gsap'
import { usePrefs } from '../state/prefs'

/**
 * A live readout. Its value is read from the simulation runtime at ~12 Hz (no React state)
 * and written straight into the DOM. The symbol is typeset with KaTeX in the variable's
 * colour, always next to a text label — colour is never the only cue.
 */
export function LiveMetric({
  label,
  tex,
  varKey,
  read,
  size = 'md',
  scramble = true,
  className = '',
}: {
  label: string
  tex?: string
  varKey?: string
  read: () => Formatted
  size?: 'sm' | 'md' | 'lg'
  scramble?: boolean
  className?: string
}) {
  const valueRef = useRef<HTMLSpanElement>(null)
  const unitRef = useRef<HTMLSpanElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const readRef = useRef(read)
  readRef.current = read
  const reduced = usePrefs((s) => s.reducedMotion)
  const symbol = useMemo(() => (tex ? renderTex(tex) : ''), [tex])

  useEffect(() => {
    let scrambling = false
    let revealed = !scramble || reduced
    const update = () => {
      if (scrambling || !revealed) return
      const f = readRef.current()
      const v = valueRef.current
      const u = unitRef.current
      if (v && v.textContent !== f.value) v.textContent = f.value
      if (u && u.textContent !== f.unit) u.textContent = f.unit
    }
    const off = onReadout(update)
    // ScrambleText the first time the number appears on screen.
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting) || revealed) return
      revealed = true
      scrambling = true
      const f = readRef.current()
      if (unitRef.current) unitRef.current.textContent = f.unit
      gsap.to(valueRef.current, {
        duration: 0.9,
        scrambleText: { text: f.value, chars: '0123456789', speed: 0.6 },
        ease: 'none',
        onComplete: () => {
          scrambling = false
          update()
        },
      })
      io.disconnect()
    })
    if (rootRef.current && !revealed) io.observe(rootRef.current)
    return () => {
      off()
      io.disconnect()
    }
  }, [scramble, reduced])

  return (
    <div
      ref={rootRef}
      className={`live-metric live-metric-${size} ${className}`}
      style={varKey ? ({ '--c': `var(--v-${varKey})` } as CSSProperties) : undefined}
    >
      <div className="live-metric-head">
        {symbol && <span className="live-metric-sym" dangerouslySetInnerHTML={{ __html: symbol }} />}
        <span className="label">{label}</span>
      </div>
      <div className="live-metric-value data" aria-live="off">
        <span ref={valueRef} className="live-metric-num">
          —
        </span>
        <span ref={unitRef} className="live-metric-unit" />
      </div>
    </div>
  )
}
