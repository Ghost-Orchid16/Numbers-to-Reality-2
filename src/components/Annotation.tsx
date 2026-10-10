import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { onFrame } from '../motion/frame'
import { anchors } from '../state/anchors'

/**
 * A DOM label pinned to a point in the 3D scene. The scene projects the point to screen space
 * every frame (state/anchors); this follows it on the GSAP ticker. `show` gates visibility.
 */
export function Annotation({
  anchor,
  show,
  children,
  varKey,
  side = 'right',
}: {
  anchor: string
  show: () => boolean
  children: ReactNode
  varKey?: string
  side?: 'right' | 'left'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const showRef = useRef(show)
  showRef.current = show

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let on = false
    const tick = () => {
      const a = anchors.get(anchor)
      const want = !!a && a.visible && showRef.current()
      if (want !== on) {
        on = want
        el.dataset.on = on ? 'true' : 'false'
      }
      if (a && on) el.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0)`
    }
    // after the canvas rendered this frame: the label sits on this frame's projection
    return onFrame('post', tick)
  }, [anchor])

  return (
    <div
      ref={ref}
      className={`annotation annotation-${side}`}
      data-on="false"
      style={varKey ? ({ '--c': `var(--v-${varKey})` } as CSSProperties) : undefined}
    >
      <span className="annotation-dot" aria-hidden="true" />
      <span className="annotation-line" aria-hidden="true" />
      <div className="annotation-body">{children}</div>
    </div>
  )
}
