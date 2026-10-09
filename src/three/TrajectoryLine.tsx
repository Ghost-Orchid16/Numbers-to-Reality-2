import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Color } from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

/**
 * A path computed by a model (e.g. a precomputed trajectory), drawn as a screen-space-width
 * line. `points()` is called when `version()` changes; `count()` each frame sets how many
 * points are drawn, so the line can grow with simulated time.
 */
export function TrajectoryLine({
  points,
  version,
  count,
  color,
  width = 2,
  opacity = 1,
  dashed = false,
  intensity = 1.4,
}: {
  points: () => Float32Array
  version: () => number
  count: () => number
  color: string
  width?: number
  opacity?: number
  dashed?: boolean
  intensity?: number
}) {
  const size = useThree((s) => s.size)
  const line = useMemo(() => {
    const geometry = new LineGeometry()
    const material = new LineMaterial({
      color: new Color(color).multiplyScalar(intensity).getHex(),
      linewidth: width,
      transparent: opacity < 1,
      opacity,
      dashed,
      dashSize: 40,
      gapSize: 30,
      depthWrite: false,
      toneMapped: false,
    })
    material.color = new Color(color).multiplyScalar(intensity)
    const l = new Line2(geometry, material)
    l.frustumCulled = false
    l.renderOrder = 3
    return l
  }, [color, width, opacity, dashed, intensity])

  useEffect(() => () => {
    line.geometry.dispose()
    line.material.dispose()
  }, [line])

  useEffect(() => {
    line.material.resolution.set(size.width, size.height)
  }, [line, size])

  const state = useMemo(() => ({ version: -1, total: 0 }), [])
  useFrame(() => {
    const v = version()
    if (v !== state.version) {
      state.version = v
      const p = points()
      state.total = Math.floor(p.length / 3)
      if (state.total >= 2) {
        line.geometry.setPositions(p)
        if (dashed) line.computeLineDistances()
      }
    }
    const n = Math.min(count(), state.total)
    line.visible = n >= 2
    line.geometry.instanceCount = Math.max(0, n - 1)
  })

  return <primitive object={line} />
}
