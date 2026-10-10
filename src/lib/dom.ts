/**
 * Set an element's text by rewriting its existing text node. Same pixels as `textContent = …`,
 * but no node is replaced: assigning textContent swaps the text node, which re-styles its
 * parent on top of the layout; rewriting the node's data only needs layout.
 */
export function setText(el: Element | null, text: string): void {
  if (!el) return
  const node = el.firstChild
  if (node !== null && node === el.lastChild && node.nodeType === Node.TEXT_NODE) {
    if ((node as Text).data !== text) (node as Text).data = text
  } else if (el.textContent !== text) el.textContent = text
}
