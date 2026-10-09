import { useEffect, useMemo, type DependencyList } from 'react'

interface Disposable {
  dispose: () => void
}
type Bag = Disposable | Disposable[] | Record<string, Disposable>

function disposeBag(v: Bag): void {
  if (Array.isArray(v)) v.forEach((d) => d.dispose())
  else if (typeof (v as Disposable).dispose === 'function') (v as Disposable).dispose()
  else Object.values(v).forEach((d) => d.dispose())
}

/**
 * useMemo for GPU resources created imperatively (geometries, materials, textures, render
 * targets) — a single resource, an array, or a record of them. The previous value is
 * disposed when deps change and on unmount, so nothing leaks when a scene unmounts.
 */
export function useDisposable<T extends Bag>(factory: () => T, deps: DependencyList): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(factory, deps)
  useEffect(() => () => disposeBag(value), [value])
  return value
}
