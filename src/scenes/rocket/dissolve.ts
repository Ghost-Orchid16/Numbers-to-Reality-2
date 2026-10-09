import { Color, Uniform, type Material } from 'three'
import { REVEAL_GLSL } from '../intro/phases'

/**
 * "Numbers become reality": patches a standard/physical material so it materialises
 * bottom-up as `reveal` goes 0 → 1, with a glowing seam (emissive > 1, so it blooms).
 * The threshold function is shared with the glyph swarm, so glyphs vanish exactly where
 * the hull appears.
 */
export interface DissolveUniforms {
  uReveal: Uniform<number>
  uSeam: Uniform<Color>
}

export const createDissolveUniforms = (seam = '#FFD9A0'): DissolveUniforms => ({
  uReveal: new Uniform(1),
  uSeam: new Uniform(new Color(seam).multiplyScalar(5)),
})

/**
 * @param space 'object' uses the geometry's local position (rocket parts are modelled in the
 *              rocket frame); 'world' uses world position (launch-site structures).
 */
export function applyDissolve(material: Material, u: DissolveUniforms, space: 'object' | 'world' = 'object'): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = u.uReveal
    shader.uniforms.uSeam = u.uSeam
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRevealPos;')
      .replace(
        '#include <begin_vertex>',
        space === 'object'
          ? '#include <begin_vertex>\nvRevealPos = position;'
          : `#include <begin_vertex>
            vec4 revealP = vec4(position, 1.0);
            #ifdef USE_INSTANCING
              revealP = instanceMatrix * revealP;
            #endif
            vRevealPos = (modelMatrix * revealP).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vRevealPos;\nuniform float uReveal;\nuniform vec3 uSeam;\n${REVEAL_GLSL}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float revealT = revealThreshold(vRevealPos);
        float revealEdge = uReveal * 1.12 - 0.06;
        if (uReveal < 0.999 && revealT > revealEdge) discard;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uReveal < 0.999) totalEmissiveRadiance += uSeam * (1.0 - smoothstep(0.0, 0.035, revealEdge - revealT));`,
      )
  }
  material.customProgramCacheKey = () => `dissolve-${space}`
}
