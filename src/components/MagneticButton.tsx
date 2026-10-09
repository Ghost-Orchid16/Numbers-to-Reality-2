import { useRef, type ButtonHTMLAttributes } from 'react'
import { gsap } from '../motion/gsap'
import { usePrefs } from '../state/prefs'

/** A button that leans toward the pointer (fine pointers only, not under reduced motion). */
export function MagneticButton({ className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null)
  const reduced = usePrefs((s) => s.reducedMotion)
  const coarse = usePrefs((s) => s.coarsePointer)
  const active = !reduced && !coarse

  return (
    <button
      ref={ref}
      type="button"
      className={`mag-btn interactive ${className}`}
      onPointerMove={(e) => {
        if (!active || e.pointerType !== 'mouse') return
        const r = e.currentTarget.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2)
        const dy = e.clientY - (r.top + r.height / 2)
        gsap.to(e.currentTarget, { x: dx * 0.25, y: dy * 0.3, duration: 0.6, ease: 'power3.out' })
      }}
      onPointerLeave={(e) => {
        if (!active) return
        gsap.to(e.currentTarget, { x: 0, y: 0, duration: 1.1, ease: 'expo.out' })
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
