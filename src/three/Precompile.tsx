import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Object3D } from 'three'
import { completeLoadItem } from '../lib/loading'
import { useSceneReady } from './sceneReady'

/**
 * Compiles every shader of the start-up scenes before the loader exits (no first-scroll hitch).
 * three's compile() skips invisible objects, so everything is made visible for the duration.
 */
export function Precompile({ needs }: { needs: string[] }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const ready = useSceneReady((s) => s.ready)
  const done = useRef(false)
  const allReady = needs.every((id) => ready[id as keyof typeof ready])

  useEffect(() => {
    if (!allReady || done.current) return
    done.current = true
    const hidden: Object3D[] = []
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o)
        o.visible = true
      }
    })
    const finish = () => {
      hidden.forEach((o) => (o.visible = false))
      completeLoadItem('gpu:compile')
    }
    gl.compileAsync(scene, camera).then(finish, finish)
  }, [allReady, gl, scene, camera])

  return null
}
