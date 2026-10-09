import { useId, type ReactNode } from 'react'

/** Accessible term definition: hover or keyboard focus reveals it; it is the element's description. */
export function Tooltip({ term, children }: { term: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <span className="tooltip interactive">
      <button type="button" className="tooltip-term" aria-describedby={id}>
        {term}
      </button>
      <span role="tooltip" id={id} className="tooltip-bubble">
        {children}
      </span>
    </span>
  )
}
