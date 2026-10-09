import { useEffect, useRef, type CSSProperties } from 'react'
import { onReadout } from '../lib/ticker'

/**
 * An inline live number inside prose ("a = 0.29 g"), refreshed at ~12 Hz from the model.
 * Optional variable colour — always next to its symbol or unit in the sentence.
 */
export function Live({ read, varKey, className = '' }: { read: () => string; varKey?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const readRef = useRef(read)
  readRef.current = read
  useEffect(
    () =>
      onReadout(() => {
        const el = ref.current
        if (!el) return
        const next = readRef.current()
        if (el.textContent !== next) el.textContent = next
      }),
    [],
  )
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
