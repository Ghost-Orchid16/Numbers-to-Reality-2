import { DefaultLoadingManager } from 'three'

/**
 * Honest loading progress.
 *
 * Everything in this museum is procedural, so there are almost no files for three.js loaders
 * to report. Instead, the real start-up work — font files, code chunks, the glyph atlas,
 * surface sampling, trajectory precompute, shader compilation — is registered as items on
 * THREE.DefaultLoadingManager, which drei's useProgress observes. The loader's 0 → 100
 * therefore counts work that actually happened.
 */

const labels = new Map<string, string>()
const started = new Set<string>()
const finished = new Set<string>()

/** Register work up front so the total is known before anything completes. */
export function registerLoadItems(items: readonly { id: string; label: string }[]): void {
  for (const { id, label } of items) {
    labels.set(id, label)
    if (started.has(id)) continue
    started.add(id)
    DefaultLoadingManager.itemStart(id)
  }
}

export function completeLoadItem(id: string): void {
  if (!started.has(id) || finished.has(id)) return
  finished.add(id)
  DefaultLoadingManager.itemEnd(id)
}

/** Run `work` as a tracked item. Failures still complete the item (the page must not hang). */
export async function trackLoad<T>(id: string, label: string, work: () => Promise<T> | T): Promise<T> {
  registerLoadItems([{ id, label }])
  try {
    return await work()
  } finally {
    completeLoadItem(id)
  }
}

export const loadLabel = (id: string): string => labels.get(id) ?? id
export const isLoaded = (id: string): boolean => finished.has(id)
