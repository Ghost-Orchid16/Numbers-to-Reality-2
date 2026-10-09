import { create } from 'zustand'
import { CHAPTERS, type ChapterId } from '../content/chapters'

export type Quality = 'high' | 'medium' | 'low'

/**
 * ChapterDirector — which chapter is active, which neighbour is pre-mounted, and global
 * render quality. Only the active chapter and its neighbour (the one you are travelling
 * towards) have scenes mounted; everything else is unmounted and disposed.
 */
export interface DirectorState {
  active: ChapterId
  neighbour: ChapterId | null
  /** loader finished and the experience is revealed */
  ready: boolean
  quality: Quality
  setActive: (id: ChapterId) => void
  setNeighbour: (id: ChapterId | null) => void
  setReady: () => void
  setQuality: (q: Quality) => void
}

export const useDirector = create<DirectorState>((set) => ({
  active: 'intro',
  neighbour: 'rocket',
  ready: false,
  quality: 'high',
  setActive: (id) => set((s) => (s.active === id ? s : { active: id })),
  setNeighbour: (id) => set((s) => (s.neighbour === id ? s : { neighbour: id })),
  setReady: () => set({ ready: true }),
  setQuality: (quality) => set((s) => (s.quality === quality ? s : { quality })),
}))

const built = CHAPTERS.filter((c) => c.built)

/** Neighbour to pre-mount: the previous chapter in the first half, the next in the second. */
export function neighbourFor(id: ChapterId, progress: number): ChapterId | null {
  const i = built.findIndex((c) => c.id === id)
  if (i < 0) return null
  const prev = built[i - 1]?.id ?? null
  const next = built[i + 1]?.id ?? null
  if (!prev) return next
  if (!next) return prev
  return progress < 0.5 ? prev : next
}

/** Scenes that should be mounted right now. */
export const mountedChapters = (s: Pick<DirectorState, 'active' | 'neighbour'>): ChapterId[] =>
  s.neighbour && s.neighbour !== s.active ? [s.active, s.neighbour] : [s.active]
