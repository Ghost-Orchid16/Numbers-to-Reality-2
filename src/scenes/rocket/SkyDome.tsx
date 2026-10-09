import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { BackSide, Color, ShaderMaterial, SphereGeometry, type Mesh } from 'three'
import { smoothstep } from '../../sim/core/math'
import { useDisposable } from '../../three/useDisposable'
import { frame } from './frame'
import { SKY_GLSL, SUN_DIR } from './skyChunk'

const INK = new Color('#05060A').convertSRGBToLinear()

/** Sky dome that follows the camera; drawn first, without depth, behind everything. */
export function SkyDome() {
  const mesh = useRef<Mesh>(null)
  const geometry = useDisposable(() => new SphereGeometry(1, 64, 40), [])
  const material = useDisposable(
    () =>
      new ShaderMaterial({
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = (modelMatrix * vec4(position, 0.0)).xyz;
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          ${SKY_GLSL}
          uniform float uStars;
          uniform float uPresence;
          uniform float uTime;
          uniform vec3 uInk;
          varying vec3 vDir;
          float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
          void main() {
            vec3 d = normalize(vDir);
            vec3 c = skyColor(d);
            if (uStars > 0.001) {
              vec3 p = d * 280.0;
              vec3 cell = floor(p);
              float h = hash13(cell);
              if (h > 0.9962) {
                vec3 center = cell + vec3(hash13(cell + 1.3), hash13(cell + 2.7), hash13(cell + 4.1));
                float dist = length(p - center);
                float tw = 0.7 + 0.3 * sin(uTime * (0.8 + h * 4.0) + h * 91.0);
                float mag = (h - 0.9962) / 0.0038;
                float star = (1.0 - smoothstep(0.0, 0.42, dist)) * tw * (0.25 + mag * mag * 2.5);
                float above = smoothstep(-0.01, 0.06, asin(clamp(d.y, -1.0, 1.0)) + uDip);
                c += vec3(0.85, 0.92, 1.1) * star * uStars * above;
              }
            }
            gl_FragColor = vec4(mix(uInk, c, uPresence), 1.0);
          }`,
        uniforms: {
          uSunDir: { value: SUN_DIR },
          uAltitude: { value: 0 },
          uDip: { value: 0 },
          uStars: { value: 0.1 },
          uPresence: { value: 1 },
          uTime: { value: 0 },
          uInk: { value: INK },
        },
        side: BackSide,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  )

  useFrame((state, dt) => {
    const m = mesh.current
    if (!m) return
    const cam = state.camera
    m.position.copy(cam.position)
    m.scale.setScalar(Math.min(60000, cam.far * 0.6))
    // camera altitude above the planet surface (launch frame = render + rocket position)
    const camAlt = Math.max(0, frame.altitude + cam.position.y)
    const R = frame.planetRadius
    const u = material.uniforms
    u.uAltitude.value = camAlt
    u.uDip.value = Math.acos(R / (R + camAlt))
    u.uStars.value = 0.09 + 0.91 * smoothstep(8000, 70000, camAlt)
    u.uPresence.value = frame.handoff.presence
    u.uTime.value += dt
  })

  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={-100} frustumCulled={false} />
}
