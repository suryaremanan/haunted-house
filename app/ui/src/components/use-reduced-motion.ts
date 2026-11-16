// Watches the browser's reduced-motion preference (Spec 6 task 5.2;
// Requirements 7.3, 7.4). Read fail-closed: where the media query cannot be
// read or watched, motion is treated as unwanted. A change while the house is
// mounted arrives as state, so nothing is remounted.
import { useEffect, useState } from 'react'
import { reducedMotionFrom } from '../core/motion-policy'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function queryList(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY) : null
  } catch {
    return null
  }
}

/** True when the browser asks for reduced motion, or when that cannot be known. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => reducedMotionFrom(queryList()?.matches))

  useEffect(() => {
    const list = queryList()
    if (list === null) {
      setReduced(true)
      return undefined
    }
    const onChange = (event: { matches: boolean }) => setReduced(reducedMotionFrom(event.matches))
    setReduced(reducedMotionFrom(list.matches))
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    }
    // Older engines only have the listener pair.
    if (typeof list.addListener === 'function') {
      list.addListener(onChange)
      return () => list.removeListener(onChange)
    }
    // The value cannot be watched, so a later change would be missed: stay still.
    setReduced(true)
    return undefined
  }, [])

  return reduced
}
