import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { setText } from '../lib/dom'
import { renderTex } from '../lib/tex'
import { onReadout } from '../lib/ticker'

/** A term of the live substitution line: fixed text, or a live value in a variable's colour. */
export type SubTerm = string | { varKey?: string; read: () => string }

/**
 * The symbolic equation is typeset once with KaTeX (colour-coded variables); underneath, a live
 * substitution line shows the numbers the model is using right now, refreshed at ~12 Hz.
 */
export function EquationBlock({
  fig,
  title,
  tex,
  substitution,
  result,
  note,
  children,
}: {
  fig: string
  title: string
  tex: string
  substitution?: SubTerm[]
  /** live result, e.g. "= 278,600 N" */
  result?: SubTerm[]
  note?: ReactNode
  children?: ReactNode
}) {
  const html = useMemo(() => renderTex(tex, true), [tex])
  const lineRef = useRef<HTMLDivElement>(null)
  const termsRef = useRef<SubTerm[]>([])
  termsRef.current = [...(substitution ?? []), ...(result ?? [])]

  useEffect(() => {
    const line = lineRef.current
    if (!line) return
    const spans = Array.from(line.querySelectorAll<HTMLSpanElement>('[data-live]'))
    return onReadout(() => {
      let i = 0
      for (const term of termsRef.current) {
        if (typeof term === 'string') continue
        const span = spans[i++]
        if (span) setText(span, term.read())
      }
    }, line)
  }, [])

  const renderTerms = (terms: SubTerm[] | undefined) =>
    terms?.map((t, i) =>
      typeof t === 'string' ? (
        <span key={i} className="eq-op">
          {t}
        </span>
      ) : (
        <span
          key={i}
          data-live=""
          className="eq-val"
          style={t.varKey ? ({ '--c': `var(--v-${t.varKey})` } as CSSProperties) : undefined}
        >
          {t.read()}
        </span>
      ),
    )

  return (
    <figure className="eq-block">
      <figcaption className="eq-caption">
        <span className="label">{fig}</span>
        <span className="label eq-title">{title}</span>
        {substitution && (
          <span className="label eq-live">
            <span className="live-dot" aria-hidden="true" />[ LIVE ]
          </span>
        )}
      </figcaption>
      <div className="eq-tex" dangerouslySetInnerHTML={{ __html: html }} />
      {substitution && (
        <div ref={lineRef} className="eq-sub data" aria-label="Live substitution">
          <span className="eq-op eq-eq">=</span>
          {renderTerms(substitution)}
          {result && (
            <span className="eq-result">
              <span className="eq-op eq-eq">=</span>
              {renderTerms(result)}
            </span>
          )}
        </div>
      )}
      {note && <p className="eq-note">{note}</p>}
      {children}
    </figure>
  )
}
