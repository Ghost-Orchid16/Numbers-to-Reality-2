import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { ChapterId } from '../content/chapters'
import { trackLoad } from '../lib/loading'

/**
 * Lazy, code-split 3D worlds. Each import is a separate chunk; the start-up chunks are tracked
 * by the honest loader.
 */
export const SCENES: Partial<Record<ChapterId, LazyExoticComponent<ComponentType>>> = {
  intro: lazy(() => trackLoad('chunk:intro-scene', 'Module · glyph field', () => import('./intro/IntroScene'))),
  rocket: lazy(() => trackLoad('chunk:rocket-scene', 'Module · launch pad', () => import('./rocket/RocketScene'))),
}
