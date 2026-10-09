import { useEffect, useRef, type ReactNode } from 'react'
import { gsap } from '../motion/gsap'

export interface NarrativeStep {
  id: string
  /** active while this returns true (evaluated every frame) */
  active: () => boolean
  kicker: string
  title: ReactNode
  body: ReactNode
}

/**
 * Text that accompanies a pinned, scrubbed sequence. Steps switch on the state of the
 * simulation (e.g. "after max-Q"), not on arbitrary scroll percentages, so the words always
 * describe what the model is doing on screen.
 */
export function ScrollNarrative({ steps, className = '' }: { steps: NarrativeStep[]; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const stepsRef = useRef(steps)
  stepsRef.current = steps

  useEffect(() => {
    const el = root.current
    if (!el) return
    const nodes = Array.from(el.querySelectorAll<HTMLElement>('[data-step]'))
    let last = -2
    const tick = () => {
      const list = stepsRef.current
      let idx = -1
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].active()) {
          idx = i
          break
        }
      }
      if (idx === last) return
      last = idx
      nodes.forEach((n, i) => {
        n.dataset.state = i === idx ? 'on' : i < idx ? 'past' : 'future'
        n.setAttribute('aria-hidden', i === idx ? 'false' : 'true')
      })
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])

  return (
    <div ref={root} className={`narrative ${className}`}>
      {steps.map((s) => (
        <article key={s.id} data-step={s.id} data-state="future" className="narrative-step" aria-hidden="true">
          <p className="label narrative-kicker">{s.kicker}</p>
          <h3 className="narrative-title">{s.title}</h3>
          <div className="narrative-body">{s.body}</div>
        </article>
      ))}
    </div>
  )
}
