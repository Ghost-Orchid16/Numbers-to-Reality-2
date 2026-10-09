import { useFrame, useThree } from '@react-three/fiber'
import { easing } from 'maath'
import { useEffect, useMemo, useState } from 'react'
import {
  AdditiveBlending,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  type CanvasTexture,
  type PerspectiveCamera,
} from 'three'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'
import { IRIDESCENT } from '../../design/worlds'
import { trackLoad } from '../../lib/loading'
import { useDirector } from '../../state/director'
import { usePrefs } from '../../state/prefs'
import { scrollState } from '../../state/scroll'
import { useSceneReady } from '../../three/sceneReady'
import { buildRocketSampleGeometry } from '../rocket/rocketGeometry'
import { POSE_HERO, POSE_PAD, ROCKET_YAW } from '../rocket/shots'
import { ATLAS_COLS, buildGlyphAtlas, GLYPHS, glyphCount, pickGlyph } from './glyphAtlas'
import { introPhases, REVEAL_GLSL } from './phases'

/**
 * HERO — thousands of digits and maths symbols drift in 3D. As you scroll they swarm and land
 * on points sampled (MeshSurfaceSampler) from the rocket's actual hull, then dissolve exactly
 * where the real rocket materialises: numbers literally becoming reality.
 */

const vertex = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aTarget;
attribute vec4 aSeed;
attribute float aGlyph;
attribute vec3 aTint;
uniform float uTime;
uniform float uAssemble;
uniform float uReveal;
uniform float uDrift;
varying vec2 vUv;
varying float vGlyph;
varying float vAlpha;
varying float vHeat;
varying vec3 vTint;
${REVEAL_GLSL}
void main() {
  float start = aSeed.x * 0.42;
  float lp = clamp((uAssemble - start) / 0.58, 0.0, 1.0);
  float e = lp * lp * (3.0 - 2.0 * lp);
  float t = uTime * uDrift;
  vec3 drift = aStart + vec3(
    sin(t * (0.10 + 0.08 * aSeed.y) + aSeed.z * 6.2831) * 3.2,
    sin(t * (0.14 + 0.06 * aSeed.z) + aSeed.w * 6.2831) * 2.4,
    cos(t * (0.09 + 0.07 * aSeed.w) + aSeed.y * 6.2831) * 3.2);
  vec3 p = mix(drift, aTarget, e);
  // the swarm spirals around the rocket's axis on its way in
  float ang = (1.0 - e) * e * (5.0 + 7.0 * aSeed.y);
  float c = cos(ang), s = sin(ang);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p.y += sin(e * 3.14159) * (5.0 + 9.0 * aSeed.z);
  float size = mix(0.85 + 1.5 * aSeed.w, 0.3, e);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vGlyph = aGlyph;
  vTint = aTint;
  float arrived = smoothstep(0.82, 1.0, lp);
  // dissolve where the hull has materialised (same threshold as the rocket's shader)
  float gone = smoothstep(-0.02, 0.05, uReveal * 1.12 - 0.06 - revealThreshold(aTarget));
  vHeat = arrived * (1.0 - gone);
  vAlpha = (0.55 + 0.45 * aSeed.z) * (1.0 - gone);
}
`

const fragment = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vGlyph;
varying float vAlpha;
varying float vHeat;
varying vec3 vTint;
void main() {
  float cols = ${ATLAS_COLS.toFixed(1)};
  vec2 cell = vec2(mod(vGlyph, cols), floor(vGlyph / cols));
  vec2 uv = (cell + vec2(vUv.x, 1.0 - vUv.y)) / cols;
  uv.y = 1.0 - uv.y;
  float a = texture2D(uAtlas, uv).r * vAlpha;
  if (a < 0.01) discard;
  vec3 warm = vec3(1.0, 0.86, 0.62);
  vec3 col = mix(vTint, warm, vHeat) * (0.85 + vHeat * 2.6);
  gl_FragColor = vec4(col * a, a);
}
`

function GlyphField() {
  const quality = useDirector((s) => s.quality)
  const compact = usePrefs((s) => s.compact)
  const reduced = usePrefs((s) => s.reducedMotion)
  const count = glyphCount(quality, compact)
  const [atlas, setAtlas] = useState<CanvasTexture | null>(null)
  const [targets, setTargets] = useState<Float32Array | null>(null)
  const mark = useSceneReady((s) => s.mark)

  useEffect(() => {
    let alive = true
    let tex: CanvasTexture | null = null
    void trackLoad('atlas:glyphs', `Glyph atlas · ${GLYPHS.length} symbols in JetBrains Mono`, buildGlyphAtlas).then((t) => {
      tex = t
      if (alive) setAtlas(t)
      else t.dispose()
    })
    return () => {
      alive = false
      tex?.dispose()
    }
  }, [])

  useEffect(() => {
    let alive = true
    void trackLoad('sampler:rocket', `Rocket hull · ${count.toLocaleString('en-US')} surface samples`, () => {
      const geo = buildRocketSampleGeometry()
      const sampler = new MeshSurfaceSampler(new Mesh(geo)).build()
      const out = new Float32Array(count * 3)
      const p = new Vector3()
      const c = Math.cos(ROCKET_YAW)
      const s = Math.sin(ROCKET_YAW)
      for (let i = 0; i < count; i++) {
        sampler.sample(p)
        // same yaw as the rendered rocket, so glyphs sit on the stencil side too
        out[i * 3] = p.x * c + p.z * s
        out[i * 3 + 1] = p.y
        out[i * 3 + 2] = -p.x * s + p.z * c
      }
      geo.dispose()
      return out
    }).then((t) => alive && setTargets(t))
    return () => {
      alive = false
    }
  }, [count])

  const geometry = useMemo(() => {
    if (!targets) return null
    const base = new PlaneGeometry(1, 1)
    const g = new InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.getAttribute('position'))
    g.setAttribute('uv', base.getAttribute('uv'))
    const start = new Float32Array(count * 3)
    const seed = new Float32Array(count * 4)
    const glyph = new Float32Array(count)
    const tint = new Float32Array(count * 3)
    let st = 20240917
    const rand = () => ((st = (st * 16807) % 2147483647) - 1) / 2147483646
    const starlight = new Color('#F4F1EA').convertSRGBToLinear()
    const palette = IRIDESCENT.map((h) => new Color(h).convertSRGBToLinear().lerp(starlight, 0.45))
    const tmp = new Color()
    for (let i = 0; i < count; i++) {
      // an ellipsoidal cloud around the title and the future rocket
      const u = rand() * 2 - 1
      const th = rand() * Math.PI * 2
      const r = Math.cbrt(rand())
      const sq = Math.sqrt(1 - u * u)
      start[i * 3] = Math.cos(th) * sq * r * 120
      start[i * 3 + 1] = 22 + u * r * 52
      start[i * 3 + 2] = Math.sin(th) * sq * r * 105 - 10
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = rand()
      glyph[i] = pickGlyph(rand())
      tmp.copy(rand() < 0.28 ? palette[Math.floor(rand() * palette.length)] : starlight)
      tint[i * 3] = tmp.r
      tint[i * 3 + 1] = tmp.g
      tint[i * 3 + 2] = tmp.b
    }
    g.setAttribute('aStart', new InstancedBufferAttribute(start, 3))
    g.setAttribute('aTarget', new InstancedBufferAttribute(targets, 3))
    g.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4))
    g.setAttribute('aGlyph', new InstancedBufferAttribute(glyph, 1))
    g.setAttribute('aTint', new InstancedBufferAttribute(tint, 3))
    g.instanceCount = count
    return g
  }, [targets, count])

  const material = useMemo(() => {
    if (!atlas) return null
    return new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uAtlas: { value: atlas },
        uTime: { value: 0 },
        uAssemble: { value: 0 },
        uReveal: { value: 0 },
        uDrift: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })
  }, [atlas])

  useEffect(() => () => geometry?.dispose(), [geometry])
  useEffect(() => () => material?.dispose(), [material])
  useEffect(() => {
    if (geometry && material) mark('intro', true)
  }, [geometry, material, mark])
  useEffect(() => () => mark('intro', false), [mark])

  useFrame((_s, dt) => {
    if (!material) return
    const ph = introPhases(scrollState.intro.progress)
    material.uniforms.uTime.value += dt
    material.uniforms.uAssemble.value = ph.assemble
    material.uniforms.uReveal.value = ph.reveal
    material.uniforms.uDrift.value = reduced ? 0 : 1
  })

  if (!geometry || !material) return null
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={10} />
}

/** Hero camera: from the glyph field down to the launch-pad shot where Chapter 01 begins. */
function IntroCamera() {
  const reduced = usePrefs((s) => s.reducedMotion)
  const pointer = useThree((s) => s.pointer)
  const st = useMemo(() => ({ pos: new Vector3(), target: new Vector3(), look: POSE_HERO.target.clone(), mid: new Vector3(-58, 34, 118) }), [])

  useFrame((state, dt) => {
    if (useDirector.getState().active !== 'intro') return
    const cam = state.camera as PerspectiveCamera
    const k = introPhases(scrollState.intro.progress).camera
    const e = k * k * (3 - 2 * k)
    // quadratic Bézier sweep around the cloud
    const a = POSE_HERO.position
    const b = POSE_PAD.position
    const m = st.mid
    const u = 1 - e
    st.pos.set(
      u * u * a.x + 2 * u * e * m.x + e * e * b.x,
      u * u * a.y + 2 * u * e * m.y + e * e * b.y,
      u * u * a.z + 2 * u * e * m.z + e * e * b.z,
    )
    st.target.lerpVectors(POSE_HERO.target, POSE_PAD.target, e)
    if (!reduced) {
      st.pos.x += pointer.x * 2.2 * (1 - e)
      st.pos.y += pointer.y * 1.4 * (1 - e)
    }
    easing.damp3(cam.position, st.pos, 0.22, dt)
    easing.damp3(st.look, st.target, 0.2, dt)
    cam.lookAt(st.look)
    const fov = POSE_HERO.fov + (POSE_PAD.fov - POSE_HERO.fov) * e
    if (Math.abs(cam.fov - fov) > 1e-3 || cam.view?.enabled) {
      cam.fov = fov
      cam.clearViewOffset()
      cam.updateProjectionMatrix()
    }
  })
  return null
}

export default function IntroScene() {
  return (
    <>
      <GlyphField />
      <IntroCamera />
    </>
  )
}
