// What the stage has to measure. The style sheet sizes the room so that it and
// the guide fit one window, and for that it needs three facts it cannot know:
// how much the page has above the room (the host's own chrome, the page title,
// a recording's bar), how tall the toolbar over the room has wrapped, and
// which of the two wide layouts gives the larger room. The first two are
// handed to the sheet as lengths; the third is worked out by `stageFit`
// (core/guide-layout.ts) and returned for the shell's `data-layout`.
//
// It measures when the house or the window changes size, never on a timer and
// never on scroll. Where the page cannot measure (no ResizeObserver), the
// sheet's own defaults stand and the balloon lies under the room.
import { useLayoutEffect, useState, type RefObject } from 'react'
import { stageFit, type StageLayout } from '../core/guide-layout'

/** How far down the page an element starts, whatever has been scrolled. */
function pageTop(element: HTMLElement): number {
  let top = 0
  for (let node: HTMLElement | null = element; node !== null; node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null) top += node.offsetTop
  return top
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function useStageMetrics(root: RefObject<HTMLElement>): StageLayout {
  const [layout, setLayout] = useState<StageLayout>('stacked')
  useLayoutEffect(() => {
    const house = root.current
    if (house === null || typeof ResizeObserver === 'undefined' || typeof window === 'undefined') return
    const measure = () => {
      const room = house.querySelector<HTMLElement>('[data-stage-room]')
      if (room === null) return
      const toolbar = house.querySelector<HTMLElement>('.hh-ui-toolbar')
      const style = window.getComputedStyle(house)
      const sceneTop = pageTop(room)
      house.style.setProperty('--hh-scene-top', `${sceneTop}px`)
      if (toolbar !== null && toolbar.offsetHeight > 0) house.style.setProperty('--hh-toolbar-h', `${toolbar.offsetHeight}px`)
      const fit = stageFit({
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        houseWidth: house.clientWidth - pixels(style.paddingLeft) - pixels(style.paddingRight),
        sceneTop,
        rem: pixels(window.getComputedStyle(document.documentElement).fontSize) || 16,
      })
      setLayout(fit.layout)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(house)
    const toolbar = house.querySelector<HTMLElement>('.hh-ui-toolbar')
    if (toolbar !== null) observer.observe(toolbar)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [root])
  return layout
}
