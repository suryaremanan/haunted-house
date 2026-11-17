// The stage's layout (Spec 8, Requirements 5.6, 5.7, 5.8): what the page
// measures for the style sheet, and the facts of the sheet that keep the
// sheets laid over the room clear of the corner the Warden stands in.
import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GUIDE_RESERVE, SCENE_HEIGHT, SCENE_WIDTH, STAGE_GUTTER_PX, STAGE_REM, STAGE_WIDE_PX, STRIP_OF_SCENE, WARDEN_WIDTH } from '../core/guide-layout'
import { HOUSE_STAGE_STYLES, MAP_SHEET_WIDTH, ROOM_SHEET_WIDTH, SHEET_LEFT } from './house-stage-styles'
import { WIDE_BREAKPOINT_PX } from './house-styles'
import { useStageMetrics } from './use-stage-metrics'

const css = HOUSE_STAGE_STYLES

/** The body of the first rule whose whole selector is `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|[\\n}])[ \\t]*${escaped} \\{([^}]*)\\}`).exec(css)
  expect(match, selector).not.toBeNull()
  return match![1]
}

describe('the stage sheet', () => {
  it('sizes the room from what the page measured, with the lengths the layout rule uses', () => {
    expect(WIDE_BREAKPOINT_PX).toBe(STAGE_WIDE_PX)
    const ratio = SCENE_WIDTH / SCENE_HEIGHT
    // The balloon under the room.
    expect(css).toContain(`--hh-scene-w: min(100cqw, max(${STAGE_REM.sceneMinStacked}rem, calc((100vh - var(--hh-scene-top) - ${STAGE_REM.apron}rem) * ${ratio})));`)
    // The balloon beside the room.
    const side = rule(".hh-ui[data-layout='side']")
    expect(side).toContain(`calc((100vh - var(--hh-scene-top) - ${STAGE_REM.strip}rem) * ${ratio})`)
    expect(side).toContain(`calc((100vh - var(--hh-scene-top)) / ${SCENE_HEIGHT / SCENE_WIDTH + STRIP_OF_SCENE})`)
    expect(side).toContain(`--hh-guide-w: clamp(${STAGE_REM.guideMin}rem, calc(100cqw - ${STAGE_GUTTER_PX}px - var(--hh-fit-w)), ${STAGE_REM.guideMax}rem);`)
    expect(side).toContain(`--hh-scene-w: min(calc(100cqw - var(--hh-guide-w) - ${STAGE_GUTTER_PX}px), var(--hh-fit-w));`)
    expect(side).toContain(`max(${STAGE_REM.sceneMinSide}rem,`)
    // Neither layout is chosen by the window's proportions any more: the shell asks.
    expect(css).not.toMatch(/aspect-ratio:\s*\d+\s*\/\s*\d+\s*\)/)
  })

  it('lays the open sheet and the house map over the room, under the toolbar and clear of the Guide Reserve', () => {
    // Both end before the reserve begins, so neither can reach it however tall it is.
    expect((SHEET_LEFT + ROOM_SHEET_WIDTH) * 100).toBeLessThanOrEqual(GUIDE_RESERVE.left)
    expect((SHEET_LEFT + MAP_SHEET_WIDTH) * 100).toBeLessThanOrEqual(GUIDE_RESERVE.left)
    const both = rule(".hh-ui-panel[data-mode='region'], .hh-ui > .hh-ui-behind ~ .hh-ui-behind")
    // They start under the toolbar, however many rows its tags have wrapped onto, and end inside the room.
    expect(both).toContain('margin: calc(var(--hh-toolbar-h) + 4px) 0 0')
    expect(both).toContain('max-height: calc(var(--hh-scene-h) - var(--hh-toolbar-h) - 1rem)')
    expect(both).toContain('overflow-y: auto')
    expect(rule(".hh-ui-panel[data-mode='region']")).toContain(`width: calc(var(--hh-scene-w) * ${ROOM_SHEET_WIDTH})`)
    expect(css).toContain(`.hh-ui > .hh-ui-behind ~ .hh-ui-behind { z-index: 6; width: calc(var(--hh-scene-w) * ${MAP_SHEET_WIDTH});`)
  })

  it('stands the Warden in the corner of the room: his head at the top of the Guide Reserve, nothing of him above it', () => {
    const warden = rule(".hh-ui[data-layout='side'] .hh-stage-warden")
    expect(warden).toContain(`top: calc(var(--hh-scene-h) * ${GUIDE_RESERVE.top / 100} + 2px)`)
    expect(warden).toContain(`width: calc(var(--hh-scene-w) * ${WARDEN_WIDTH / 100})`)
    // He stands inside the reserve's width too.
    const left = 100 - WARDEN_WIDTH - 1.2
    expect(left).toBeGreaterThanOrEqual(GUIDE_RESERVE.left)
    expect(left + WARDEN_WIDTH).toBeLessThanOrEqual(100)
    expect(warden).toContain(`left: calc(var(--hh-scene-w) * ${left / 100})`)
  })

  it('keeps what is true now in view and scrolls the choices only where the balloon has a height', () => {
    expect(rule('.hh-guide-head')).toContain('flex: none')
    expect(rule('.hh-guide-body')).toContain('min-height: 0')
    // In the page of a narrow window the balloon is as tall as its words: nothing scrolls inside it.
    const narrow = css.slice(0, css.indexOf(`@media (min-width: ${WIDE_BREAKPOINT_PX}px)`))
    expect(narrow).not.toMatch(/\.hh-guide-(balloon|body)[^{]*\{[^}]*(overflow|max-height)/)
    expect(css).toMatch(/\.hh-guide-body \{ overflow-y: auto;/)
    expect(rule(".hh-ui[data-layout='side'] .hh-guide-balloon")).toContain('max-height: max(12rem, calc(100vh - var(--hh-scene-top) - 6rem))')
  })
})

// ---------------------------------------------------------------------------
// The hook, with a stand-in for the browser's resize observer and for layout.

class FakeObserver {
  static made: FakeObserver[] = []
  readonly watched: Element[] = []
  stopped = false
  constructor(readonly changed: () => void) {
    FakeObserver.made.push(this)
  }
  observe(element: Element) {
    this.watched.push(element)
  }
  unobserve() {}
  disconnect() {
    this.stopped = true
  }
}

function Probe() {
  const root = useRef<HTMLElement>(null)
  const layout = useStageMetrics(root)
  return (
    <section ref={root} data-layout={layout} data-probe>
      <div className="hh-ui-toolbar" />
      <div data-stage-room="study" />
    </section>
  )
}

/** Gives the page a layout to measure. */
function lay({ house, top, toolbar, width, height }: { house: number; top: number; toolbar: number; width: number; height: number }) {
  const root = document.querySelector<HTMLElement>('[data-probe]')!
  Object.defineProperty(root, 'clientWidth', { value: house, configurable: true })
  Object.defineProperty(root.querySelector('[data-stage-room]')!, 'offsetTop', { value: top, configurable: true })
  Object.defineProperty(root.querySelector('.hh-ui-toolbar')!, 'offsetHeight', { value: toolbar, configurable: true })
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
  return root
}

describe('what the stage measures', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    FakeObserver.made = []
  })

  it('hands the sheet the page above the room and the toolbar height, and asks for the layout with the larger room', () => {
    vi.stubGlobal('ResizeObserver', FakeObserver)
    render(<Probe />)
    const [observer] = FakeObserver.made
    // It watches the house and the toolbar, and nothing else.
    expect(observer.watched.map((element) => (element as HTMLElement).className || 'house')).toEqual(['house', 'hh-ui-toolbar'])

    // A short, wide window: the balloon stands beside the room.
    const root = lay({ house: 1192, top: 159, toolbar: 85, width: 1280, height: 720 })
    act(() => observer.changed())
    expect(root.style.getPropertyValue('--hh-scene-top')).toBe('159px')
    expect(root.style.getPropertyValue('--hh-toolbar-h')).toBe('85px')
    expect(root).toHaveAttribute('data-layout', 'side')

    // The window grows tall: the balloon lies under a larger room. A window resize is measured too.
    lay({ house: 1192, top: 159, toolbar: 51, width: 1920, height: 1080 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(root.style.getPropertyValue('--hh-toolbar-h')).toBe('51px')
    expect(root).toHaveAttribute('data-layout', 'stacked')

    // A phone.
    lay({ house: 366, top: 438, toolbar: 154, width: 390, height: 844 })
    act(() => observer.changed())
    expect(root).toHaveAttribute('data-layout', 'narrow')
  })

  it('stops watching when the house goes away', () => {
    vi.stubGlobal('ResizeObserver', FakeObserver)
    const removed = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<Probe />)
    unmount()
    expect(FakeObserver.made[0].stopped).toBe(true)
    expect(removed).toHaveBeenCalledWith('resize', expect.any(Function))
    removed.mockRestore()
  })

  it('leaves the sheet to its own lengths where the page cannot measure', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    render(<Probe />)
    const root = document.querySelector<HTMLElement>('[data-probe]')!
    expect(root).toHaveAttribute('data-layout', 'stacked')
    expect(root.getAttribute('style')).toBeNull()
  })

  it('starts no timer and follows no scroll', () => {
    vi.stubGlobal('ResizeObserver', FakeObserver)
    const timeout = vi.spyOn(window, 'setTimeout')
    const interval = vi.spyOn(window, 'setInterval')
    const frame = vi.spyOn(window, 'requestAnimationFrame')
    const listened = vi.spyOn(window, 'addEventListener')
    render(<Probe />)
    act(() => FakeObserver.made[0].changed())
    expect(timeout).not.toHaveBeenCalled()
    expect(interval).not.toHaveBeenCalled()
    expect(frame).not.toHaveBeenCalled()
    expect(listened.mock.calls.map(([type]) => type)).toEqual(['resize'])
    for (const spy of [timeout, interval, frame, listened]) spy.mockRestore()
  })
})
