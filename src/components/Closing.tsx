import { CHAPTERS } from '../content/chapters'

/** The museum's last word for this build: what is open, what comes next, and the colophon. */
export function Closing() {
  const next = CHAPTERS.find((c) => !c.built)
  return (
    <footer className="closing grid-12" aria-label="Colophon">
      <div className="closing-next">
        {next && (
          <>
            <p className="label">Next hall · {next.code}</p>
            <p className="closing-title">
              {next.title} — <span className="accent-serif">{next.subtitle.toLowerCase()}</span>
            </p>
            <p className="closing-text">Chapters 02–08 open in the next builds of the museum.</p>
          </>
        )}
      </div>
      <div className="closing-colophon">
        <p className="label">Numbers → Reality</p>
        <p className="closing-text">
          Every number on screen is computed by the model that moves what you see. Teaching models, labelled as such —
          sources are listed with each chapter.
        </p>
        <p className="label closing-fine">
          Type: Unbounded, Instrument Serif, Big Shoulders Stencil, Manrope, JetBrains Mono (SIL OFL) · Equations: KaTeX
        </p>
      </div>
    </footer>
  )
}
