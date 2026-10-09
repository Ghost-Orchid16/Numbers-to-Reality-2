import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, ConeGeometry, CylinderGeometry, MeshBasicMaterial, Quaternion, Vector3, type Group, type Mesh } from 'three'
import { useDisposable } from './useDisposable'

export interface VectorState {
  origin: Vector3
  dir: Vector3
  /** drawn length (m); 0 hides the arrow */
  length: number
  visible: boolean
}

/**
 * A force (or any vector) drawn as an arrow whose length is computed from the model each
 * frame. Colour = the variable's colour (bright enough to bloom slightly).
 */
export function ForceVector({
  color,
  read,
  radius = 0.16,
  onTip,
}: {
  color: string
  read: (out: VectorState) => void
  radius?: number
  /** receives the arrow tip in world space each frame (for labels) */
  onTip?: (tip: Vector3, visible: boolean) => void
}) {
  const group = useRef<Group>(null)
  const shaft = useRef<Mesh>(null)
  const head = useRef<Mesh>(null)
  const geos = useDisposable(
    () => ({
      shaft: new CylinderGeometry(1, 1, 1, 12, 1).translate(0, 0.5, 0),
      head: new ConeGeometry(1, 1, 16, 1).translate(0, 0.5, 0),
    }),
    [],
  )
  const material = useDisposable(
    () => new MeshBasicMaterial({ color: new Color(color).multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.95 }),
    [color],
  )
  const st = useMemo<VectorState & { q: Quaternion; up: Vector3; tip: Vector3; unit: Vector3 }>(
    () => ({
      origin: new Vector3(),
      dir: new Vector3(0, 1, 0),
      length: 0,
      visible: false,
      q: new Quaternion(),
      up: new Vector3(0, 1, 0),
      tip: new Vector3(),
      unit: new Vector3(),
    }),
    [],
  )

  useFrame(() => {
    const g = group.current
    if (!g || !shaft.current || !head.current) return
    read(st)
    const show = st.visible && st.length > 0.05
    g.visible = show
    if (show) {
      const headLen = Math.min(st.length * 0.35, radius * 9)
      const shaftLen = Math.max(st.length - headLen, 0.001)
      g.position.copy(st.origin)
      st.q.setFromUnitVectors(st.up, st.unit.copy(st.dir).normalize())
      g.quaternion.copy(st.q)
      shaft.current.scale.set(radius, shaftLen, radius)
      head.current.position.set(0, shaftLen, 0)
      head.current.scale.set(radius * 3, headLen, radius * 3)
    }
    if (onTip) {
      st.tip.copy(st.unit.copy(st.dir).normalize()).multiplyScalar(st.length).add(st.origin)
      onTip(st.tip, show)
    }
  })

  return (
    <group ref={group} visible={false}>
      <mesh ref={shaft} geometry={geos.shaft} material={material} renderOrder={8} />
      <mesh ref={head} geometry={geos.head} material={material} renderOrder={8} />
    </group>
  )
}
