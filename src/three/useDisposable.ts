import { useEffect, useMemo, type DependencyList } from 'react'

interface Disposable {
  dispose: () => void
}

/**
 * useMemo for GPU resources created imperatively (geometries, materials, textures, render
 * targets): the previous value is disposed when deps change and on unmount, so nothing leaks
 * when a chapter's scene is unmounted.
 */
export function useDisposable<T extends Disposable | Disposable[]>(factory: () => T, deps: DependencyList): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(factory, deps)
  useEffect(
    () => () => {
      if (Array.isArray(value)) value.forEach((v) => v.dispose())
      else value.dispose()
    },
    [value],
  )
  return value
}
