// The Gate's knocker watches the pointer (dread-and-night 5.5): its two lit
// eyes move a little toward wherever the pointer is. Nothing depends on it.
// It runs only while the browser allows motion, and it sets two CSS values
// on the door; no state, no timer.
import { useEffect, type RefObject } from 'react'

/** How far, in the painting's units, the eyes may travel from rest. */
export const EYE_REACH = 4

/** The eye offset for a pointer at (x, y) on a door whose box is `box`: a unit step toward it, scaled to the reach. */
export function eyeOffset(x: number, y: number, box: { left: number; top: number; width: number; height: number }): { dx: number; dy: number } {
  const cx = box.left + box.width / 2
  const cy = box.top + box.height * 0.35
  const ddx = x - cx
  const ddy = y - cy
  const length = Math.hypot(ddx, ddy)
  if (!Number.isFinite(length) || length === 0) return { dx: 0, dy: 0 }
  const pull = Math.min(1, length / 200)
  return { dx: (ddx / length) * EYE_REACH * pull, dy: (ddy / length) * EYE_REACH * pull }
}

export function useKnockerEyes(door: RefObject<HTMLElement>, active: boolean): void {
  useEffect(() => {
    const element = door.current
    if (!active || element === null || typeof window.matchMedia !== 'function') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) return
    const move = (event: PointerEvent) => {
      const { dx, dy } = eyeOffset(event.clientX, event.clientY, element.getBoundingClientRect())
      element.style.setProperty('--hh-eye-x', dx.toFixed(2))
      element.style.setProperty('--hh-eye-y', dy.toFixed(2))
    }
    window.addEventListener('pointermove', move)
    return () => {
      window.removeEventListener('pointermove', move)
      element.style.removeProperty('--hh-eye-x')
      element.style.removeProperty('--hh-eye-y')
    }
  }, [door, active])
}
