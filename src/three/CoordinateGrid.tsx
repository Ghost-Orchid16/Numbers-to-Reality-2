import { useMemo } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, LineBasicMaterial } from 'three'
import { useDisposable } from './useDisposable'

/**
 * A measured grid (spacing in metres) with a heavier line every `major` cells — the museum's
 * "this is to scale" layer. Lies in the XZ plane at its group's origin.
 */
export function CoordinateGrid({
  size = 120,
  spacing = 10,
  major = 5,
  color = '#FFFFFF',
  opacity = 0.12,
}: {
  size?: number
  spacing?: number
  major?: number
  color?: string
  opacity?: number
}) {
  const geometries = useDisposable(() => {
    const minor: number[] = []
    const majors: number[] = []
    const n = Math.floor(size / spacing / 2)
    for (let i = -n; i <= n; i++) {
      const v = i * spacing
      const list = i % major === 0 ? majors : minor
      list.push(-n * spacing, 0, v, n * spacing, 0, v, v, 0, -n * spacing, v, 0, n * spacing)
    }
    const a = new BufferGeometry()
    a.setAttribute('position', new Float32BufferAttribute(minor, 3))
    const b = new BufferGeometry()
    b.setAttribute('position', new Float32BufferAttribute(majors, 3))
    return [a, b]
  }, [size, spacing, major])
  const c = useMemo(() => new Color(color), [color])
  const materials = useDisposable(
    () => [
      new LineBasicMaterial({ color: c, transparent: true, opacity, depthWrite: false }),
      new LineBasicMaterial({ color: c, transparent: true, opacity: Math.min(1, opacity * 2.2), depthWrite: false }),
    ],
    [c, opacity],
  )
  return (
    <group>
      <lineSegments geometry={geometries[0]} material={materials[0]} />
      <lineSegments geometry={geometries[1]} material={materials[1]} />
    </group>
  )
}
