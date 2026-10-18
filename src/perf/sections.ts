/** Page sections for per-section performance numbers (document coordinates, after pinning). */
export interface SectionSpan {
  name: string
  top: number
  bottom: number
}

const SECTIONS: [string, string][] = [
  ['hero', '#intro'],
  ['title', '#rocket-title'],
  ['marquee', '#rocket .marquee'],
  ['flight', '#rocket-flight'],
  ['lab', '#rocket-lab'],
  ['maths', '#rocket-maths'],
  ['reality', '#rocket-reality'],
  ['closing', '.closing'],
]

export function measureSections(): SectionSpan[] {
  const out: SectionSpan[] = []
  for (const [name, sel] of SECTIONS) {
    let el = document.querySelector<HTMLElement>(sel)
    if (!el) continue
    // a pinned section occupies its pin spacer's whole scroll distance
    el = el.closest<HTMLElement>('.pin-spacer') ?? el
    const r = el.getBoundingClientRect()
    const top = r.top + window.scrollY
    out.push({ name, top, bottom: top + r.height })
  }
  return out
}

/** The section under the middle of the viewport at scroll position y. */
export function sectionAt(spans: SectionSpan[], y: number, vh = window.innerHeight): string {
  const mid = y + vh / 2
  let name = spans[0]?.name ?? '—'
  for (const s of spans) {
    if (mid >= s.top) name = s.name
    if (mid < s.bottom && mid >= s.top) return s.name
  }
  return name
}
