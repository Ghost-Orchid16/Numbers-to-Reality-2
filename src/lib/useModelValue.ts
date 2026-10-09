import { useEffect, useRef, useState } from 'react'
import { onReadout } from './ticker'

/**
 * A slowly changing model-derived value in React state (e.g. the marquee's ΔV after a
 * parameter change). Polled on the readout ticker; re-renders only when the value changes.
 */
export function useModelValue<T>(read: () => T, equal: (a: T, b: T) => boolean = Object.is): T {
  const [value, setValue] = useState(read)
  const readRef = useRef(read)
  readRef.current = read
  const last = useRef(value)
  useEffect(
    () =>
      onReadout(() => {
        const next = readRef.current()
        if (!equal(last.current, next)) {
          last.current = next
          setValue(next)
        }
      }),
    [equal],
  )
  return value
}
