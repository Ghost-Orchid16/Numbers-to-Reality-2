import { useState, type ReactNode } from 'react'
import { usePrefs } from '../state/prefs'

/**
 * The lab's control surface. Desktop: a panel beside the simulation. Compact screens: a
 * bottom sheet over the lower part of the screen with the 3D above; it can be collapsed.
 */
export function LabPanel({
  fig,
  title,
  description,
  children,
  footer,
}: {
  fig: string
  title: string
  /** one-sentence text description of what the simulation shows (for everyone, incl. AT) */
  description: string
  children: ReactNode
  footer?: ReactNode
}) {
  const compact = usePrefs((s) => s.compact)
  const [collapsed, setCollapsed] = useState(false)
  return (
    <aside className="lab-panel interactive" aria-label={title} data-collapsed={(compact && collapsed) || undefined}>
      <header className="lab-panel-head">
        <div>
          <p className="label">{fig}</p>
          <h3 className="lab-panel-title">{title}</h3>
        </div>
        <span className="label lab-live">
          <span className="live-dot" aria-hidden="true" />[ LIVE ]
        </span>
        {compact && (
          <button
            type="button"
            className="lab-collapse label"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? 'Controls ▴' : 'Hide ▾'}
          </button>
        )}
      </header>
      <p className="lab-desc">{description}</p>
      <div className="lab-panel-body" data-lenis-prevent>
        {children}
      </div>
      {footer && <footer className="lab-panel-foot">{footer}</footer>}
    </aside>
  )
}

export function LabGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="lab-group">
      <h4 className="label lab-group-title">{title}</h4>
      <div className="lab-group-body">{children}</div>
    </section>
  )
}
