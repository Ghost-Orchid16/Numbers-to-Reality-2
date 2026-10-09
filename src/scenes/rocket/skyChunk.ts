import { Vector3 } from 'three'

/** Direction to the sun in the launch frame: a low dusk sun, behind and right of the hero shot. */
export const SUN_DIR = new Vector3(0.74, 0.055, -0.67).normalize()

/**
 * Shared sky model (linear HDR). Dusk at sea level; as the camera climbs, optical depth falls
 * and the sky goes blue → indigo → black, leaving a thin limb band just above the true horizon,
 * which dips below the horizontal by uDip = acos(R / (R + h)).
 */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform float uAltitude;
uniform float uDip;

vec3 skyColor(vec3 d) {
  float e = asin(clamp(d.y, -1.0, 1.0));
  float x = e + uDip;
  float xs = max(x, 0.0);
  float air = exp(-max(uAltitude, 0.0) / 7500.0);
  vec2 dz = d.xz + vec2(1e-5);
  float az = dot(normalize(dz), normalize(uSunDir.xz + vec2(1e-5))) * 0.5 + 0.5;
  vec3 zenith = vec3(0.010, 0.020, 0.065);
  vec3 high = vec3(0.035, 0.062, 0.175);
  vec3 low = mix(vec3(0.15, 0.11, 0.21), vec3(1.05, 0.38, 0.12), pow(az, 4.0));
  vec3 band = mix(vec3(0.40, 0.22, 0.28), vec3(1.35, 0.66, 0.22), pow(az, 3.0));
  vec3 c = mix(high, zenith, smoothstep(0.12, 1.25, xs));
  c = mix(c, low, exp(-xs * 8.0));
  c = mix(c, band, exp(-xs * 38.0) * 0.85);
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  c += vec3(1.4, 0.6, 0.2) * pow(sd, 22.0) * 1.3 + vec3(1.0, 0.42, 0.15) * pow(sd, 5.0) * 0.22 * exp(-xs * 3.5);
  // thinning air: black sky, thin glowing limb
  vec3 space = vec3(0.0012, 0.0016, 0.0045);
  float limbW = mix(10.0, 150.0, 1.0 - air);
  vec3 limb = mix(vec3(0.05, 0.17, 0.5), vec3(1.0, 0.45, 0.2), pow(az, 5.0) * 0.8) * (0.85 + 0.7 * pow(az, 6.0));
  vec3 cSpace = space + limb * exp(-xs * limbW) * 0.9;
  c = mix(cSpace, c, air);
  if (x < 0.0) c = mix(c, low * 0.3 * air + space, 1.0 - smoothstep(-0.06, 0.0, x));
  return c;
}
`
