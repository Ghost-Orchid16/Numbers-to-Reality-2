import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { HalfFloatType, WebGLRenderTarget, type Material, type Object3D, type Texture } from 'three'
import { completeLoadItem } from '../lib/loading'
import { useSceneReady } from './sceneReady'

/** Every texture a material uses: its maps and any texture-valued shader uniforms. */
function texturesOf(material: Material, out: Set<Texture>): void {
  for (const value of Object.values(material)) if ((value as Texture | null)?.isTexture) out.add(value as Texture)
  const uniforms = (material as Material & { uniforms?: Record<string, { value: unknown }> }).uniforms
  if (uniforms) for (const u of Object.values(uniforms)) if ((u.value as Texture | null)?.isTexture) out.add(u.value as Texture)
}

/**
 * Builds everything the GPU needs for the start-up scenes before the loader exits, so no shader
 * compile, texture upload or buffer upload happens mid-scroll.
 *
 *  • Shaders are compiled against a linear HalfFloat target: the scene is always drawn into the
 *    post-processing buffer, and a program's cache key includes the output colour space —
 *    compiling for the canvas (sRGB) built variants that were never used.
 *  • Every object is made visible for the duration (three skips invisible objects), and the
 *    light set is constant (scenes zero a light's intensity rather than hide it), so the
 *    programs compiled here are exactly the ones every later frame uses.
 *  • Every texture is uploaded, and one draw into a 1×1 target with culling off uploads every
 *    vertex buffer.
 * compileAsync is used when KHR_parallel_shader_compile exists (no main-thread block).
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
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType })

    // everything visible and unculled; restored afterwards (scenes also reset visibility per frame)
    const reveal = () => {
      const changed: { o: Object3D; visible: boolean; culled: boolean }[] = []
      scene.traverse((o) => {
        if (!o.visible || o.frustumCulled) {
          changed.push({ o, visible: o.visible, culled: o.frustumCulled })
          o.visible = true
          o.frustumCulled = false
        }
      })
      return () => changed.forEach(({ o, visible, culled }) => ((o.visible = visible), (o.frustumCulled = culled)))
    }

    const compileInto = () => {
      const previous = gl.getRenderTarget()
      const restore = reveal()
      gl.setRenderTarget(target)
      try {
        return gl.extensions.has('KHR_parallel_shader_compile') ? gl.compileAsync(scene, camera) : (gl.compile(scene, camera), null)
      } finally {
        gl.setRenderTarget(previous)
        restore()
      }
    }

    const upload = () => {
      const previous = gl.getRenderTarget()
      const restore = reveal()
      try {
        const textures = new Set<Texture>()
        scene.traverse((o) => {
          const m = (o as Object3D & { material?: Material | Material[] }).material
          if (m) for (const mm of Array.isArray(m) ? m : [m]) texturesOf(mm, textures)
        })
        textures.forEach((t) => gl.initTexture(t))
        gl.setRenderTarget(target)
        gl.render(scene, camera)
      } finally {
        gl.setRenderTarget(previous)
        restore()
        target.dispose()
        completeLoadItem('gpu:compile')
      }
    }

    const pending = compileInto()
    if (pending) pending.then(upload, upload)
    else upload()
  }, [allReady, gl, scene, camera])

  return null
}
