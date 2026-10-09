import type { ReactNode } from 'react'

/**
 * The three layers every chapter offers: 1 Intuition · 2 Mathematics · 3 Engineering reality,
 * plus the model's honest label.
 */
export function RealityCheck({
  intuition,
  mathematics,
  engineering,
  note,
}: {
  intuition: ReactNode
  mathematics: ReactNode
  engineering: ReactNode
  note: ReactNode
}) {
  const layers = [
    { n: '1', name: 'Intuition', body: intuition },
    { n: '2', name: 'Mathematics', body: mathematics },
    { n: '3', name: 'Engineering reality', body: engineering },
  ]
  return (
    <div className="reality">
      <ol className="reality-layers">
        {layers.map((l) => (
          <li key={l.n} className="reality-layer">
            <p className="label">
              <span className="reality-n">{l.n}</span> — {l.name}
            </p>
            <div className="reality-body">{l.body}</div>
          </li>
        ))}
      </ol>
      <aside className="model-note" aria-label="Model note">
        <span className="label model-note-tag">[ MODEL NOTE ]</span>
        <div>{note}</div>
      </aside>
    </div>
  )
}
