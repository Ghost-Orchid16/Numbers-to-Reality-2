import { create } from 'zustand'
import type { ChapterId } from '../content/chapters'

/** Scenes announce when their GPU resources exist, so shaders can be precompiled under the loader. */
export const useSceneReady = create<{ ready: Partial<Record<ChapterId, boolean>>; mark: (id: ChapterId, v: boolean) => void }>(
  (set) => ({
    ready: {},
    mark: (id, v) => set((s) => (s.ready[id] === v ? s : { ready: { ...s.ready, [id]: v } })),
  }),
)
