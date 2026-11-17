// Property 12 of the Warden guide (Spec 8, warden-guide-and-first-visit).
//
// For all windows, house widths, amounts of page above the room and rem sizes:
// the stage is narrow exactly below 900 pixels of window width; the balloon
// stands beside the room only in a house of at least 56 rem, and exactly when
// that gives a room at least as large as the balloon under it would; the room
// and its balloon column never exceed the house; unless the room is at its
// smallest, the room and what stands under it end inside the window; and a
// taller window never gives a smaller room.
//
// **Validates: Requirements 5.6, 5.8**
//
// The reference below is written out here and not read from the module: what
// fits under a room, what fits beside it, and which of the two is larger.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { STAGE_GUTTER_PX, STAGE_REM, STAGE_WIDE_PX, STRIP_OF_SCENE, WARDEN_BELOW, stageFit, type StageWindow } from './guide-layout'

const RUNS = 500
const EPSILON = 1e-6

// The room is 1200 by 750.
const WIDTH_OF_HEIGHT = 1200 / 750
const HEIGHT_OF_WIDTH = 750 / 1200

const stageArb: fc.Arbitrary<StageWindow> = fc
  .record({
    windowWidth: fc.integer({ min: 320, max: 3200 }),
    windowHeight: fc.integer({ min: 300, max: 2400 }),
    // The house never has more than the window, and may have much less (a host page with a sidebar).
    houseShare: fc.double({ min: 0.3, max: 1, noNaN: true }),
    sceneTop: fc.integer({ min: 0, max: 600 }),
    rem: fc.constantFrom(12, 14, 16, 18, 20, 24),
  })
  .map(({ houseShare, ...rest }) => ({ ...rest, houseWidth: Math.floor(rest.windowWidth * houseShare) }))

/** The widest room that leaves `below` free under it. */
function widestRoom(stage: StageWindow, below: number): number {
  return (stage.windowHeight - stage.sceneTop - below) * WIDTH_OF_HEIGHT
}

/** What fits with the balloon under the room, and with the balloon beside it. Either may be negative: nothing fits. */
function fits(stage: StageWindow): { readonly under: number; readonly beside: number } {
  const free = stage.windowHeight - stage.sceneTop
  const under = Math.min(stage.houseWidth, widestRoom(stage, 22 * stage.rem))
  // Beside the room: eight rem under it, and never less than 8.5 percent of the room's width, where the Warden stands.
  const tallest = Math.min(widestRoom(stage, 8 * stage.rem), free / (HEIGHT_OF_WIDTH + 0.085))
  const beside = Math.min(stage.houseWidth - 20 * stage.rem - 12, tallest)
  return { under, beside }
}

describe('the stage fits its window', () => {
  // Feature: warden-guide-and-first-visit, Property 12: The stage fits its window
  it('has the lengths the reference assumes', () => {
    expect(STAGE_WIDE_PX).toBe(900)
    expect(STAGE_GUTTER_PX).toBe(12)
    expect(STAGE_REM).toEqual({ guideMin: 20, guideMax: 26, strip: 8, apron: 22, sceneMinSide: 30, sceneMinStacked: 38, sideMin: 56 })
    expect(STRIP_OF_SCENE).toBe(0.085)
    // The strip is at least as deep as the part of the Warden that stands below the room.
    expect(STRIP_OF_SCENE).toBeGreaterThanOrEqual(WARDEN_BELOW)
  })

  it('Property 12: is narrow exactly below 900 pixels of window width', () => {
    fc.assert(
      fc.property(stageArb, (stage) => {
        const fit = stageFit(stage)
        expect(fit.layout === 'narrow').toBe(stage.windowWidth < 900)
        if (fit.layout === 'narrow') {
          expect(fit.sceneWidth).toBe(stage.houseWidth)
          expect(fit.guideWidth).toBe(0)
        }
      }),
      { numRuns: RUNS },
    )
  })

  it('Property 12: puts the balloon beside the room exactly when that gives the larger room', () => {
    fc.assert(
      fc.property(stageArb, (stage) => {
        fc.pre(stage.windowWidth >= 900)
        const fit = stageFit(stage)
        const { under, beside } = fits(stage)
        const wideEnough = stage.houseWidth >= 56 * stage.rem
        expect(fit.layout).toBe(wideEnough && beside >= under ? 'side' : 'stacked')
      }),
      { numRuns: RUNS },
    )
  })

  it('Property 12: never draws the room and its column wider than the house', () => {
    fc.assert(
      fc.property(stageArb, (stage) => {
        const fit = stageFit(stage)
        expect(fit.sceneWidth).toBeGreaterThanOrEqual(0)
        if (fit.layout === 'side') {
          expect(fit.guideWidth).toBeGreaterThanOrEqual(20 * stage.rem - EPSILON)
          expect(fit.guideWidth).toBeLessThanOrEqual(26 * stage.rem + EPSILON)
          expect(fit.sceneWidth + 12 + fit.guideWidth).toBeLessThanOrEqual(stage.houseWidth + EPSILON)
          // A house wide enough for the side layout always has room for its smallest room.
          expect(fit.sceneWidth).toBeGreaterThanOrEqual(30 * stage.rem - EPSILON)
        } else {
          expect(fit.guideWidth).toBe(0)
          expect(fit.sceneWidth).toBeLessThanOrEqual(Math.max(0, stage.houseWidth) + EPSILON)
        }
        if (fit.layout === 'stacked') expect(fit.sceneWidth).toBeGreaterThanOrEqual(Math.min(stage.houseWidth, 38 * stage.rem) - EPSILON)
      }),
      { numRuns: RUNS },
    )
  })

  it('Property 12: ends the room and what stands under it inside the window, unless the room is at its smallest', () => {
    fc.assert(
      fc.property(stageArb, (stage) => {
        const fit = stageFit(stage)
        const roomBottom = stage.sceneTop + fit.sceneWidth * HEIGHT_OF_WIDTH
        if (fit.layout === 'stacked' && fit.sceneWidth > 38 * stage.rem + EPSILON) {
          expect(roomBottom + 22 * stage.rem).toBeLessThanOrEqual(stage.windowHeight + EPSILON)
        }
        if (fit.layout === 'side' && fit.sceneWidth > 30 * stage.rem + EPSILON) {
          expect(roomBottom + 8 * stage.rem).toBeLessThanOrEqual(stage.windowHeight + EPSILON)
          // The Warden's feet, which stand below the room, are inside the window too.
          expect(roomBottom + fit.sceneWidth * WARDEN_BELOW).toBeLessThanOrEqual(stage.windowHeight + EPSILON)
        }
      }),
      { numRuns: RUNS },
    )
  })

  it('Property 12: never gives a smaller room to a taller window', () => {
    fc.assert(
      fc.property(stageArb, fc.integer({ min: 1, max: 800 }), (stage, more) => {
        const shorter = stageFit(stage)
        const taller = stageFit({ ...stage, windowHeight: stage.windowHeight + more })
        expect(taller.sceneWidth).toBeGreaterThanOrEqual(shorter.sceneWidth - EPSILON)
      }),
      { numRuns: RUNS },
    )
  })

  it('gives the windows of the design their layouts', () => {
    const at = (windowWidth: number, windowHeight: number, houseWidth: number, sceneTop: number) => stageFit({ windowWidth, windowHeight, houseWidth, sceneTop, rem: 16 })
    // A laptop window showing a recording: the balloon stands beside the room, and takes the width the room cannot use.
    expect(at(1280, 720, 1192, 159)).toEqual({ layout: 'side', sceneWidth: (720 - 159 - 128) * 1.6, guideWidth: 416 })
    // A larger window, live: the room is as wide as the house allows beside the narrowest balloon.
    expect(at(1440, 900, 1192, 60)).toEqual({ layout: 'side', sceneWidth: 1192 - 320 - 12, guideWidth: 320 })
    // A tall window: the balloon lies under a much larger room.
    expect(at(1920, 1080, 1192, 159)).toEqual({ layout: 'stacked', sceneWidth: (1080 - 159 - 352) * 1.6, guideWidth: 0 })
    // A phone.
    expect(at(390, 844, 366, 438)).toEqual({ layout: 'narrow', sceneWidth: 366, guideWidth: 0 })
    // A window too short for anything: the balloon still stands beside the smallest room, where it can be seen.
    expect(at(1280, 420, 1192, 159)).toEqual({ layout: 'side', sceneWidth: 480, guideWidth: 416 })
  })
})
