import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  CanvasTexture,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'
import { smoothstep } from '../../sim/core/math'
import { useDirector } from '../../state/director'
import { usePrefs } from '../../state/prefs'
import { useDisposable } from '../../three/useDisposable'
import { frame } from './frame'
import { GROUND_Y } from './shots'

/**
 * Ground steam: deluge water flashing to steam where the exhaust hits the pad.
 * GPU particles with *analytic* motion — every puff's position is a function of the time since
 * ignition, so scrubbing backwards through the launch is exact and costs nothing.
 * Emission stops once the rocket is high enough that its exhaust no longer reaches the pad.
 */
const WINDOW = 9 // s — particle slots are reused every WINDOW seconds

const vertex = /* glsl */ `
attribute float aBirth;
attribute vec4 aSeed;
attribute float aSource;
uniform float uAge;      // seconds since ignition
uniform float uEmitEnd;  // emission stops at this age
uniform float uRate;     // 0..1 emission strength (thrust)
uniform float uLoop;     // 1 = looping vent vapour (no ignition clock)
uniform float uTime;
uniform vec3 uNozzle;    // nozzle position (launch frame)
varying vec2 vUv;
varying float vAlpha;
varying float vGlow;
varying float vRot;

void main() {
  float life = 4.5 + 4.0 * aSeed.y;
  float age;
  if (uLoop > 0.5) {
    age = mod(uTime + aBirth * 3.7, life);
  } else {
    float cycle = floor(max(uAge - aBirth, 0.0) / ${WINDOW.toFixed(1)});
    float b = aBirth + cycle * ${WINDOW.toFixed(1)};
    if (b > uEmitEnd) b -= ${WINDOW.toFixed(1)};
    age = uAge - b;
    if (b < 0.0 || age < 0.0) age = -1.0;
  }
  vec3 src; vec3 dir;
  if (uLoop > 0.5) {
    // LOX boil-off from vents high on the tank: cold vapour sinks and drifts
    src = vec3(-1.1 + aSeed.z * 0.4, 17.5 + aSeed.w * 4.0, 0.3 - aSeed.x * 0.6);
    dir = normalize(vec3(-1.0, -0.15, 0.25 * (aSeed.x - 0.5)));
  } else if (aSource < 0.5) {
    src = vec3(-33.0, ${(GROUND_Y + 1).toFixed(1)}, (aSeed.x - 0.5) * 6.0);
    dir = normalize(vec3(-1.0, 0.16 + 0.12 * aSeed.z, (aSeed.w - 0.5) * 0.7));
  } else if (aSource < 1.5) {
    src = vec3(31.0, ${(GROUND_Y + 1).toFixed(1)}, (aSeed.x - 0.5) * 6.0);
    dir = normalize(vec3(1.0, 0.14 + 0.12 * aSeed.z, (aSeed.w - 0.5) * 0.7));
  } else {
    float a = aSeed.x * 6.2831853;
    src = vec3(cos(a) * 6.5, ${(GROUND_Y + 1.5).toFixed(1)}, sin(a) * 6.5);
    dir = normalize(vec3(cos(a), 0.22 + 0.2 * aSeed.z, sin(a)));
  }
  float v0 = uLoop > 0.5 ? 1.2 + aSeed.w : (aSource > 1.5 ? 5.0 + 6.0 * aSeed.w : 16.0 + 16.0 * aSeed.w);
  float tau = uLoop > 0.5 ? 2.5 : 1.7;
  float a0 = max(age, 0.0);
  vec3 wind = vec3(-0.7, 0.0, 0.45);
  vec3 c = src + dir * v0 * tau * (1.0 - exp(-a0 / tau)) + wind * a0;
  c.y += (uLoop > 0.5 ? -0.12 : 0.32) * a0 * a0;
  c.y = max(c.y, ${(GROUND_Y + 0.5).toFixed(1)});
  float size = uLoop > 0.5 ? 0.8 + 0.9 * a0 : 2.6 + 2.2 * aSeed.z + 2.6 * a0;
  float fadeIn = smoothstep(0.0, 0.35, a0);
  float fadeOut = 1.0 - smoothstep(life * 0.45, life, a0);
  vAlpha = (age < 0.0 || age > life) ? 0.0 : fadeIn * fadeOut * (uLoop > 0.5 ? 0.22 : 0.5 * uRate);
  vGlow = exp(-length(c - uNozzle) / 26.0);
  vRot = aSeed.y * 6.2831853 + a0 * (aSeed.x - 0.5) * 0.5;
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
  if (vAlpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`

const fragment = /* glsl */ `
uniform sampler2D uPuff;
uniform vec3 uAmbient;
uniform vec3 uGlowColor;
uniform float uGlow;
uniform float uPresence;
varying vec2 vUv;
varying float vAlpha;
varying float vGlow;
varying float vRot;
void main() {
  vec2 p = vUv - 0.5;
  float c = cos(vRot), s = sin(vRot);
  p = mat2(c, -s, s, c) * p + 0.5;
  float d = texture2D(uPuff, p).r;
  float a = d * vAlpha * uPresence;
  if (a < 0.003) discard;
  vec3 col = uAmbient * (0.75 + 0.5 * d) + uGlowColor * vGlow * uGlow;
  gl_FragColor = vec4(col, a);
}
`

function makePuffTexture(): CanvasTexture {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  let seed = 3
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const g = Array.from({ length: 12 * 12 }, rand)
  const vn = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const tx = x - xi
    const ty = y - yi
    const v = (i: number, j: number) => g[(j % 12) * 12 + (i % 12)]
    const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * tx
    const b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * tx
    return a + (b - a) * ty
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5
      const dy = y / size - 0.5
      const r = Math.sqrt(dx * dx + dy * dy) * 2
      const n = 0.6 * vn((x / size) * 5 + 1, (y / size) * 5 + 1) + 0.4 * vn((x / size) * 10 + 3, (y / size) * 10 + 3)
      const fall = Math.max(0, 1 - r)
      const v = Math.pow(fall, 1.6) * (0.55 + 0.6 * n)
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v * 255)
      img.data[i + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
  return new CanvasTexture(c)
}

function makeGeometry(count: number, loop: boolean): InstancedBufferGeometry {
  const base = new PlaneGeometry(1, 1)
  const g = new InstancedBufferGeometry()
  g.index = base.index
  g.setAttribute('position', base.getAttribute('position'))
  g.setAttribute('uv', base.getAttribute('uv'))
  const birth = new Float32Array(count)
  const seed = new Float32Array(count * 4)
  const source = new Float32Array(count)
  let s = loop ? 97 : 41
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < count; i++) {
    birth[i] = loop ? rand() * 10 : (i / count) * WINDOW
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = rand()
    const r = rand()
    source[i] = r < 0.36 ? 0 : r < 0.72 ? 1 : 2
  }
  g.setAttribute('aBirth', new InstancedBufferAttribute(birth, 1))
  g.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4))
  g.setAttribute('aSource', new InstancedBufferAttribute(source, 1))
  g.instanceCount = count
  return g
}

export function Steam() {
  const quality = useDirector((s) => s.quality)
  const compact = usePrefs((s) => s.compact)
  const count = quality === 'high' && !compact ? 720 : quality === 'low' ? 260 : 460
  const puff = useDisposable(makePuffTexture, [])
  const steamGeo = useDisposable(() => makeGeometry(count, false), [count])
  const ventGeo = useDisposable(() => makeGeometry(70, true), [])
  const nozzle = useMemo(() => new Vector3(), [])

  const makeMat = (loop: boolean) =>
    new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uAge: { value: -1 },
        uEmitEnd: { value: 1e9 },
        uRate: { value: 0 },
        uLoop: { value: loop ? 1 : 0 },
        uTime: { value: 0 },
        uNozzle: { value: nozzle },
        uPuff: { value: puff },
        uAmbient: { value: new Color(0.2, 0.22, 0.3) },
        uGlowColor: { value: new Color(2.4, 1.05, 0.38) },
        uGlow: { value: 0 },
        uPresence: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
    })
  const steamMat = useDisposable(() => makeMat(false), [puff, nozzle])
  const ventMat = useDisposable(() => makeMat(true), [puff, nozzle])

  useFrame((_s, dt) => {
    const firing = frame.firing
    nozzle.copy(frame.axis).multiplyScalar(-1.75).add(frame.pos)
    const u = steamMat.uniforms
    u.uAge.value = frame.ignitionAge
    u.uEmitEnd.value = frame.steamEnd
    u.uRate.value = Math.min(1, 0.35 + 0.65 * (firing ? frame.thrustFrac : 1))
    u.uGlow.value = firing ? frame.thrustFrac * smoothstep(0, 0.3, frame.ignitionAge) : 0
    u.uPresence.value = frame.handoff.presence
    const v = ventMat.uniforms
    v.uTime.value += dt
    // vent vapour only while the cold rocket waits on the pad
    v.uPresence.value = frame.onPad && !firing ? frame.handoff.presence : Math.max(0, v.uPresence.value - dt * 1.5)
    v.uGlow.value = 0
  })

  return (
    <>
      <mesh geometry={steamGeo} material={steamMat} frustumCulled={false} renderOrder={4} />
      <mesh geometry={ventGeo} material={ventMat} frustumCulled={false} renderOrder={4} />
    </>
  )
}
