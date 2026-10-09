import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, Color, FrontSide, ShaderMaterial, SphereGeometry, Vector3, type Mesh } from 'three'
import { smoothstep } from '../../sim/core/math'
import { useDisposable } from '../../three/useDisposable'
import { frame } from './frame'
import { GROUND_Y } from './shots'
import { SKY_GLSL, SUN_DIR } from './skyChunk'

const INK = new Color('#05060A').convertSRGBToLinear()

/**
 * The planet as a background layer. A planet is too big for a float32 depth range next to a
 * 32 m rocket, so it is drawn scaled down about the camera (same angular size, same horizon),
 * first and without depth. Ocean reflects the shared sky and glints at the low sun; land west
 * of the coast; city lights on the night side; an atmosphere rim seen from altitude.
 */
const vertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const surface = /* glsl */ `
${SKY_GLSL}
uniform vec3 uInk;
uniform float uPresence;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vN;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 sun = normalize(uSunDir);
  float ndl = dot(n, sun);
  // continents from noise; near the launch site, land lies west of the coast (x < 0)
  float site = smoothstep(0.0035, 0.03, length(n.xz));
  float coast = 1.0 - smoothstep(-0.00005, 0.00005, n.x - 0.00012);
  float land = mix(coast, smoothstep(0.53, 0.57, fbm(n * 7.0 + 3.0)), site);
  // ocean: dark water + sky reflection (Fresnel) + sun glint
  vec3 r = reflect(-v, n);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  // wind-roughened water: grazing reflectance is capped well below a mirror
  // the sea reflects *its own* sky: sea-level sky about the local vertical n, dark on the night side
  vec3 water = vec3(0.002, 0.006, 0.013) * (0.25 + max(ndl, 0.0) * 3.0) + skyColorLocal(r, n, 0.0, 0.0) * min(fres, 0.5) * 0.85;
  float glint = pow(max(dot(r, sun), 0.0), 900.0) * 14.0 + pow(max(dot(r, sun), 0.0), 90.0) * 0.35;
  water += vec3(1.3, 0.62, 0.3) * glint * smoothstep(-0.03, 0.06, ndl);
  // land: twilight-lit ground, cities on the night side
  float twilight = smoothstep(-0.12, 0.25, ndl);
  vec3 ground = mix(vec3(0.006, 0.006, 0.009), vec3(0.06, 0.05, 0.035), twilight) * (0.7 + 0.6 * fbm(n * 60.0));
  float city = smoothstep(0.72, 0.8, fbm(n * 160.0)) * (1.0 - twilight) * site;
  ground += vec3(1.2, 0.7, 0.32) * city * 0.6;
  vec3 c = mix(water, ground, land);
  // aerial perspective towards the limb
  float graze = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 tangent = normalize(r - n * dot(r, n) + n * 1e-4);
  c = mix(c, skyColorLocal(tangent, n, 0.0, 0.0) * 0.7, graze * 0.85);
  gl_FragColor = vec4(mix(uInk, c, uPresence), 1.0);
}
`

const atmosphere = /* glsl */ `
uniform vec3 uSunDir;
uniform float uFade;
uniform vec3 uCenter;
uniform float uPlanetR;
varying vec3 vWorld;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vWorld);
  // the glow belongs to the thin shell beyond the limb, not to the surface seen through it
  vec3 ro = cameraPosition - uCenter;
  vec3 rd = -v;
  float b = dot(ro, rd);
  float disc = b * b - (dot(ro, ro) - uPlanetR * uPlanetR);
  float hitsPlanet = (disc > 0.0 && -b - sqrt(max(disc, 0.0)) > 0.0) ? 1.0 : 0.0;
  float rim = pow(1.0 - abs(dot(n, v)), 3.0) * mix(1.0, 0.08, hitsPlanet);
  float sunSide = smoothstep(-0.35, 0.35, dot(n, normalize(uSunDir)));
  vec3 col = mix(vec3(0.03, 0.10, 0.35), vec3(0.25, 0.45, 1.0), sunSide) + vec3(1.0, 0.45, 0.2) * pow(max(dot(n, normalize(uSunDir)), 0.0), 8.0) * 0.4;
  gl_FragColor = vec4(col * rim * 0.9 * uFade, 1.0);
}
`

export function Planet() {
  const surfaceMesh = useRef<Mesh>(null)
  const atmoMesh = useRef<Mesh>(null)
  const geometry = useDisposable(() => new SphereGeometry(1, 512, 256), [])
  const material = useDisposable(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: surface,
        uniforms: {
          uSunDir: { value: SUN_DIR },
          uAltitude: { value: 0 },
          uDip: { value: 0 },
          uInk: { value: INK },
          uPresence: { value: 1 },
          uTime: { value: 0 },
        },
        depthWrite: false,
        depthTest: false,
      }),
    [],
  )
  const atmoMaterial = useDisposable(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: atmosphere,
        uniforms: { uSunDir: { value: SUN_DIR }, uFade: { value: 0 }, uCenter: { value: new Vector3() }, uPlanetR: { value: 1 } },
        side: FrontSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  )
  const tmp = useMemo(() => ({ center: new Vector3(), toCenter: new Vector3() }), [])

  useFrame((state) => {
    const s = surfaceMesh.current
    const a = atmoMesh.current
    if (!s || !a) return
    const cam = state.camera
    const R = frame.planetRadius
    // planet centre in render space: launch-frame centre minus the floating origin
    tmp.center.set(-frame.pos.x, GROUND_Y - R - frame.pos.y, -frame.pos.z)
    tmp.toCenter.subVectors(tmp.center, cam.position)
    const dist = tmp.toCenter.length()
    const k = (dist + R) / (cam.far * 0.85)
    s.position.copy(cam.position).addScaledVector(tmp.toCenter, 1 / k)
    s.scale.setScalar(R / k)
    a.position.copy(s.position)
    a.scale.setScalar((R * 1.013) / k)
    ;(atmoMaterial.uniforms.uCenter.value as Vector3).copy(s.position)
    atmoMaterial.uniforms.uPlanetR.value = R / k
    const camAlt = Math.max(0, frame.altitude + cam.position.y)
    const u = material.uniforms
    u.uAltitude.value = camAlt
    u.uDip.value = Math.acos(R / (R + camAlt))
    u.uPresence.value = frame.handoff.presence
    atmoMaterial.uniforms.uFade.value = smoothstep(45000, 140000, camAlt)
    a.visible = atmoMaterial.uniforms.uFade.value > 0.001
  })

  return (
    <>
      <mesh ref={surfaceMesh} geometry={geometry} material={material} renderOrder={-90} frustumCulled={false} />
      <mesh ref={atmoMesh} geometry={geometry} material={atmoMaterial} renderOrder={-89} frustumCulled={false} />
    </>
  )
}
