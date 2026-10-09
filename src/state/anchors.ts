/**
 * Screen positions of 3D points that DOM annotations follow (written by scenes each frame,
 * read by <Annotation> on the GSAP ticker). Transient, not React state.
 */
export interface Anchor {
  x: number
  y: number
  /** in front of the camera and inside the viewport */
  visible: boolean
}

export const anchors = new Map<string, Anchor>()

export function setAnchor(id: string, x: number, y: number, visible: boolean): void {
  const a = anchors.get(id)
  if (a) {
    a.x = x
    a.y = y
    a.visible = visible
  } else anchors.set(id, { x, y, visible })
}
