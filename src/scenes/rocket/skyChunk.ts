import { Vector3 } from 'three'

/**
 * Direction to the sun in the launch frame. Downrange (+x) is east, so a dusk sun sets in the
 * west (−x): the rocket climbs out of the afterglow into the darker eastern sky.
 */
export const SUN_DIR = new Vector3(-0.72, 0.05, -0.69).normalize()

/**
 * Shared sky model (linear HDR). Dusk at sea level; as the camera climbs, optical depth falls
 * and the sky goes blue → indigo → black, leaving a thin limb band just above the true horizon,
 * which dips below the horizontal by uDip = acos(R / (R + h)).
 */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform float uAltitude;
uniform float uDip;

/** Sky radiance in direction d, seen from altitude h with local vertical up (dip = horizon dip). */
vec3 skyColorLocal(vec3 d, vec3 up, float h, float dip) {
  float e = asin(clamp(dot(d, up), -1.0, 1.0));
  float x = e + dip;
  float xs = max(x, 0.0);
  float air = exp(-max(h, 0.0) / 7500.0);
  vec3 sun = normalize(uSunDir);
  vec3 dh = d - up * dot(d, up);
  vec3 sh = sun - up * dot(sun, up);
  float az = dot(normalize(dh + up * 1e-5), normalize(sh + up * 1e-5)) * 0.5 + 0.5;
  // how far the sun is below this place's horizon: dusk → night
  float night = 1.0 - smoothstep(-0.14, 0.02, dot(up, sun));
  vec3 zenith = vec3(0.005, 0.011, 0.042);
  vec3 high = vec3(0.020, 0.038, 0.118);
  vec3 low = mix(vec3(0.085, 0.060, 0.135), vec3(0.78, 0.25, 0.07), pow(az, 4.0));
  vec3 band = mix(vec3(0.26, 0.13, 0.19), vec3(1.05, 0.46, 0.14), pow(az, 3.0));
  vec3 c = mix(high, zenith, smoothstep(0.12, 1.25, xs));
  c = mix(c, low, exp(-xs * 8.0));
  c = mix(c, band, exp(-xs * 38.0) * 0.85);
  float sd = max(dot(d, sun), 0.0);
  c += vec3(1.2, 0.48, 0.14) * pow(sd, 26.0) * 0.9 + vec3(0.9, 0.34, 0.1) * pow(sd, 5.0) * 0.14 * exp(-xs * 3.5);
  c *= mix(1.0, 0.06, night);
  // thinning air: black sky, thin glowing limb
  vec3 space = vec3(0.0012, 0.0016, 0.0045);
  float limbW = mix(10.0, 150.0, 1.0 - air);
  vec3 limb = mix(vec3(0.05, 0.17, 0.5), vec3(1.0, 0.45, 0.2), pow(az, 5.0) * 0.8) * (0.85 + 0.7 * pow(az, 6.0));
  vec3 cSpace = space + limb * exp(-xs * limbW) * 0.9;
  c = mix(cSpace, c, air);
  if (x < 0.0) c = mix(c, low * 0.3 * air + space, 1.0 - smoothstep(-0.06, 0.0, x));
  return c;
}

/** The sky as seen from the camera (launch-frame vertical). */
vec3 skyColor(vec3 d) {
  return skyColorLocal(d, vec3(0.0, 1.0, 0.0), uAltitude, uDip);
}
`
