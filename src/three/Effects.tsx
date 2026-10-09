import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { HalfFloatType } from 'three'
import { useDirector } from '../state/director'
import { usePrefs } from '../state/prefs'
import { useHeatHaze } from './HeatHazeEffect'

/**
 * Post stack: selective bloom (only emissive, toneMapped={false} values above 1 bloom),
 * heat haze (rocket plume; strength 0 elsewhere), AgX tone mapping, SMAA, vignette.
 * N8AO only on the desktop high tier.
 */
export function Effects() {
  const quality = useDirector((s) => s.quality)
  const compact = usePrefs((s) => s.compact)
  const haze = useHeatHaze()
  const ao = quality === 'high' && !compact
  return (
    <EffectComposer multisampling={0} frameBufferType={HalfFloatType} enableNormalPass={false}>
      {ao ? <N8AO aoRadius={2.2} intensity={1.6} distanceFalloff={0.6} quality="performance" halfRes /> : <></>}
      <Bloom
        mipmapBlur
        luminanceThreshold={1}
        luminanceSmoothing={0.15}
        intensity={quality === 'low' ? 0.7 : 0.95}
        radius={0.72}
        levels={quality === 'low' ? 5 : 8}
      />
      <primitive object={haze} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <SMAA />
      <Vignette offset={0.32} darkness={0.5} />
    </EffectComposer>
  )
}
