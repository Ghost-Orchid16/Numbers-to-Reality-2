import { useEffect, useRef, type CSSProperties } from 'react'
import { setText } from '../lib/dom'
import { onReadout } from '../lib/ticker'

/**
 * An inline live number inside prose ("a = 0.29 g"), refreshed at ~12 Hz from the model.
 * Optional variable colour — always next to its symbol or unit in the sentence.
 */
export function Live({ read, varKey, className = '' }: { read: () => string; varKey?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const readRef = useRef(read)
  readRef.current = read
  useEffect(() => onReadout(() => setText(ref.current, readRef.current()), ref.current), [])
  return (
    <span
      ref={ref}
      className={`live data ${varKey ? 'live-var' : ''} ${className}`}
      style={varKey ? ({ '--c': `var(--v-${varKey})` } as CSSProperties) : undefined}
    >
      {read()}
    </span>
  )
}
