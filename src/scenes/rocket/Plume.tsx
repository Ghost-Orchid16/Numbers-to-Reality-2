import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Color, CylinderGeometry, ShaderMaterial, type Group, type PointLight } from 'three'
import { ambientDt, ambientTime } from '../../perf/still'
import { smoothstep } from '../../sim/core/math'
import { useDisposable } from '../../three/useDisposable'
import { frame } from './frame'
import { RK } from './rocketGeometry'

/**
 * Rocket exhaust. Length scales with √(thrust), shape with ambient pressure: at sea level a
 * tight jet with Mach diamonds (shock nodes); as ρ(h) → 0 the under-expanded plume balloons
 * and the diamonds vanish. Fake-volumetric: brightness from how directly we look through the
 * jet (facing ratio), turbulence from scrolling noise. Additive, HDR (blooms).
 */
const vertex = /* glsl */ `
uniform float uLength;
uniform float uExitR;
uniform float uVac;
varying float vS;
varying float vAngle;
varying vec3 vNormalW;
varying vec3 vView;
void main() {
  float s = clamp(-position.y, 0.0, 1.0);
  float rSea = 0.92 + 0.42 * s + 0.12 * sin(s * 40.0) * (1.0 - s);
  float rVac = 1.0 + 6.0 * (1.0 - exp(-3.2 * s));
  float r = uExitR * mix(rSea, rVac, uVac);
  vec3 p = vec3(position.x * r, -s * uLength, position.z * r);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * vec3(position.x, 0.0, position.z));
  vView = normalize(cameraPosition - world.xyz);
  vS = s;
  vAngle = atan(position.z, position.x);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragment = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uDiamonds;
uniform float uVac;
uniform float uCoreOnly;
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uOuter;
varying float vS;
varying float vAngle;
varying vec3 vNormalW;
varying vec3 vView;

float h2(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { return 0.55 * n2(p) + 0.3 * n2(p * 2.1 + 3.1) + 0.15 * n2(p * 4.3 + 7.7); }

void main() {
  float s = vS;
  float facing = abs(dot(normalize(vNormalW), normalize(vView)));
  float core = pow(facing, mix(2.6, 1.15, uVac));
  float flow = fbm(vec2(vAngle * 1.6, s * 10.0 - uTime * 9.0));
  float axial = exp(-s * mix(3.0, 1.6, uVac));
  // Mach diamonds: compression nodes near the nozzle, only in thick air
  float node = pow(0.5 + 0.5 * cos(s * 6.2831853 * 7.5), 8.0) * (1.0 - smoothstep(0.02, 0.5, s)) * uDiamonds;
  float heat = core * axial * (0.7 + 0.6 * flow) + node * pow(facing, 3.0) * 1.6;
  heat *= mix(1.0, 1.0 - smoothstep(0.0, 0.75, s), uCoreOnly);
  vec3 col = mix(uOuter, uMid, smoothstep(0.08, 0.45, heat));
  col = mix(col, uCore, smoothstep(0.5, 1.05, heat));
  float edge = smoothstep(0.0, 0.4, facing);
  float tail = 1.0 - smoothstep(0.55, 1.0, s);
  float a = edge * tail * heat * mix(1.0, 0.55, uVac);
  gl_FragColor = vec4(col * a * uIntensity, 1.0);
}
`

const linear = (hex: string, k: number) => new Color(hex).multiplyScalar(k)

function makePlumeMaterial(coreOnly: boolean): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uTime: { value: 0 },
      uLength: { value: 30 },
      uExitR: { value: RK.nozzleExitR },
      uVac: { value: 0 },
      uIntensity: { value: 1 },
      uDiamonds: { value: 1 },
      uCoreOnly: { value: coreOnly ? 1 : 0 },
      uCore: { value: new Color(5.5, 4.6, 3.4) },
      uMid: { value: linear('#FFC857', 2.6) },
      uOuter: { value: linear('#FF6B1F', 1.5) },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  })
}

export function Plume() {
  const group = useRef<Group>(null)
  const light = useRef<PointLight>(null)
  const geometry = useDisposable(() => {
    const g = new CylinderGeometry(1, 1, 1, 48, 64, true)
    g.translate(0, -0.5, 0)
    return g
  }, [])
  const outer = useDisposable(() => makePlumeMaterial(false), [])
  const inner = useDisposable(() => makePlumeMaterial(true), [])
  const mats = useMemo(() => [outer, inner], [outer, inner])

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const on = frame.firing
    g.visible = on
    // the light stays in the scene at zero intensity when the engine is off: a constant light
    // count keeps every lit material on one shader program (no recompiles at ignition/MECO)
    if (!on) {
      if (light.current) light.current.intensity = 0
      return
    }
    const startup = smoothstep(0, 0.25, frame.ignitionAge)
    const vac = 1 - Math.pow(frame.ambient, 0.35)
    const k = ambientTime(state.clock.elapsedTime)
    const flicker = 0.95 + 0.05 * Math.sin(k * 71) * Math.sin(k * 13)
    const length = 26 * Math.sqrt(Math.max(frame.thrustFrac, 0.05)) * (1 + 1.5 * vac) * (0.55 + 0.45 * startup)
    for (const m of mats) {
      m.uniforms.uTime.value += ambientDt(dt)
      m.uniforms.uVac.value = vac
      m.uniforms.uDiamonds.value = Math.pow(frame.ambient, 0.7)
    }
    outer.uniforms.uLength.value = length
    outer.uniforms.uIntensity.value = startup * flicker * (0.8 + 0.2 * frame.thrustFrac)
    inner.uniforms.uLength.value = length * 0.42
    inner.uniforms.uIntensity.value = startup * flicker * 1.6
    if (light.current) light.current.intensity = 2600 * frame.thrustFrac * startup * flicker * (0.4 + 0.6 * frame.ambient)
  })

  return (
    <>
      <group ref={group} position={[0, RK.nozzleExitY, 0]} visible={false}>
        <mesh geometry={geometry} material={outer} frustumCulled={false} renderOrder={5} />
        <mesh geometry={geometry} material={inner} frustumCulled={false} renderOrder={6} scale={[0.62, 1, 0.62]} />
      </group>
      <pointLight ref={light} position={[0, RK.nozzleExitY - 3, 0]} color="#FF8B42" distance={0} decay={2} intensity={0} />
    </>
  )
}
