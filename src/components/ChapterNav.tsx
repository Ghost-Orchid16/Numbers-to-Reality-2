import { useEffect, useRef, useState } from 'react'
import { CHAPTER_COUNT, CHAPTERS, chapterById } from '../content/chapters'
import { scrollToTarget } from '../motion/scroll'
import { useDirector } from '../state/director'

/**
 * 00 INTRO · 01 ROCKET · … · 08 ACCELERATOR. Built chapters jump there; chapters still being
 * built are listed (the museum's floor plan) but marked as upcoming and are not links.
 */
export function ChapterNav() {
  const active = useDirector((s) => s.active)
  const ready = useDirector((s) => s.ready)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    menuRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const go = (id: string) => {
    const el = document.getElementById(id)
    if (el) scrollToTarget(el)
    setOpen(false)
  }

  const items = CHAPTERS.map((c) => {
    const isActive = c.id === active
    return (
      <li key={c.id}>
        <button
          type="button"
          disabled={!c.built}
          onClick={() => go(c.id)}
          aria-current={isActive ? 'true' : undefined}
          title={c.built ? `${c.code} — ${c.title}` : `${c.code} — ${c.title} (in the next build)`}
          className="nav-item label"
          data-active={isActive || undefined}
        >
          <span className="nav-code">{c.code}</span> {c.nav}
          {!c.built && <span className="sr-only"> — upcoming</span>}
        </button>
      </li>
    )
  })

  return (
    <header className={`chapter-nav ${ready ? 'is-ready' : ''}`}>
      <a href="#intro" className="nav-mark interactive" onClick={(e) => (e.preventDefault(), go('intro'))}>
        <span className="data font-semibold">N</span>
        <span className="nav-mark-arrow" aria-hidden="true" />
        <span className="data font-semibold">R</span>
        <span className="sr-only">NUMBERS → REALITY — back to the start</span>
      </a>
      <nav aria-label="Chapters" className="nav-desktop interactive">
        <ol>{items}</ol>
      </nav>
      <button
        type="button"
        className="nav-toggle label interactive"
        aria-expanded={open}
        aria-controls="nav-sheet"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="nav-toggle-count data" aria-hidden="true">
          {chapterById(active).code} / {String(CHAPTER_COUNT).padStart(2, '0')}
        </span>
        {open ? 'Close' : 'Chapters'}
      </button>
      <div id="nav-sheet" ref={menuRef} className="nav-sheet interactive" data-open={open || undefined} hidden={!open}>
        <nav aria-label="Chapters">
          <ol>{items}</ol>
        </nav>
      </div>
    </header>
  )
}
