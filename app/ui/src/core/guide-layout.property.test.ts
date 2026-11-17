// Property 10 of the Warden guide (Spec 8, warden-guide-and-first-visit).
//
// For all rooms, door layouts, ghost counts from zero to four and ghost
// states, every working-object box lies inside the scene and does not
// intersect the Guide Reserve; and the Warden's width constant makes his
// height exactly twice a ghost's.
//
// **Validates: Requirements 1.6, 5.6, 5.7, 8.4**
//
// The references are written here and not read from the module: what "inside
// the scene" and "shares area" mean, which objects a room holds, what reading
// order is, and a whole-word matcher for Kiro's words. The module's own
// `withinScene` and `intersects` are checked against them on the way.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { guideCaseArb } from '../test/guide-arbitraries'
import {
  GHOST_ASPECT,
  GHOST_WIDTH,
  GUIDE_RESERVE,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  STAGE_BOXES,
  WARDEN_ASPECT,
  WARDEN_WIDTH,
  ghostBox,
  ghostHeight,
  intersects,
  withinScene,
  workingObjects,
  type Box,
  type WorkingObject,
} from './guide-layout'
import { guideView } from './house-guide'
import type { DoorPresentation, GhostPresentation, HouseProjection, RoomPresentation } from './house-projection'
import { PRESENTATION_DOOR_STATES, PRESENTATION_GHOST_STATES, type PresentationDoorState, type PresentationGhostState, type RoomId } from './house-registry'
import { TERMS, type WordMode } from './house-words'
import { PHASES, type Phase } from './workflow-projection'

const RUNS = 300
const TOLERANCE = 1e-9
const WORDS: readonly WordMode[] = ['plain', 'with-kiro']
const MAX_GHOSTS = 4
const MAX_DOORS = 2

type Neighbour = { readonly roomId: RoomId; readonly name: string } | null

// ---------------------------------------------------------------------------
// Geometry, written out.

/** The scene runs from 0 to 100 percent on both axes. A box inside it has a size and crosses no edge. */
function insideScene(box: Box): boolean {
  return box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0 && box.left + box.width <= 100 && box.top + box.height <= 100
}

/** Two boxes share area when their spans overlap on both axes. Boxes that only touch share none. */
function sharesArea(one: Box, other: Box): boolean {
  const across = Math.min(one.left + one.width, other.left + other.width) - Math.max(one.left, other.left)
  const down = Math.min(one.top + one.height, other.top + other.height) - Math.max(one.top, other.top)
  return across > 0 && down > 0
}

function show(box: Box): string {
  return `left ${box.left}, top ${box.top}, width ${box.width}, height ${box.height}`
}

// ---------------------------------------------------------------------------
// Kiro's words, as whole words.

/** What makes a neighbour part of the same word: a letter, a digit, an underscore or `$`. */
function joinsWord(character: string | undefined): boolean {
  if (character === undefined || character === '') return false
  return (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') || character === '_' || character === '$'
}

/** Folds A to Z only, so the text keeps its length and positions. */
function lowerAscii(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase())
}

/** The Kiro words of the book a text holds as whole words, in any case. Plain string search, no pattern. */
function kiroWordsIn(text: string): string[] {
  const haystack = lowerAscii(text)
  return TERMS.map((entry) => entry.kiro).filter((kiro) => {
    const needle = lowerAscii(kiro)
    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
      if (!joinsWord(haystack[at - 1]) && !joinsWord(haystack[at + needle.length])) return true
    }
    return false
  })
}

// ---------------------------------------------------------------------------
// What a room holds, and the order it is read in.

/**
 * The working objects of a room: the door back, the room's own Door in the
 * right wall or else the way on, a second Door in the back wall, one figure
 * for each ghost, and the ledger and the bell on the desk.
 */
function expectedKeys(room: RoomPresentation, previous: Neighbour, next: Neighbour): string[] {
  const keys: string[] = []
  if (previous !== null) keys.push('previous')
  if (room.doors.length >= 1) keys.push('door')
  else if (next !== null) keys.push('next')
  if (room.doors.length >= 2) keys.push('door-2')
  for (const ghost of room.ghosts) keys.push(`ghost:${ghost.ghostId}`)
  keys.push('ledger', 'bell')
  return keys
}

/** The desk lies below the top of the Guide Reserve. */
function onDesk(object: WorkingObject): boolean {
  return object.box.top >= GUIDE_RESERVE.top
}

/** Everything wrong with the working objects of one room. Empty when the layout holds. */
function layoutProblems(room: RoomPresentation, previous: Neighbour, next: Neighbour, words: WordMode, needsYou: number): string[] {
  const objects = workingObjects(room, { previous, next }, words, needsYou)
  const problems: string[] = []

  for (const object of objects) {
    const { box, key } = object
    if (!insideScene(box)) problems.push(`${key} leaves the scene (${show(box)})`)
    if (!withinScene(box)) problems.push(`${key}: withinScene refuses it (${show(box)})`)
    if (sharesArea(box, GUIDE_RESERVE)) problems.push(`${key} reaches the Guide Reserve (${show(box)})`)
    if (intersects(box, GUIDE_RESERVE) || intersects(GUIDE_RESERVE, box)) problems.push(`${key}: intersects says it reaches the Guide Reserve (${show(box)})`)
    if (object.label.trim() === '') problems.push(`${key} has no label`)
    if (object.name.trim() === '') problems.push(`${key} has no name`)
    if (object.steps.length < 1) problems.push(`${key} presses nothing`)
    if (words === 'plain') {
      for (const text of [object.label, object.name]) {
        const found = kiroWordsIn(text)
        if (found.length > 0) problems.push(`${key} says "${text}", which holds ${found.join(', ')}`)
      }
    }
  }

  const keys = objects.map((object) => object.key)
  if (new Set(keys).size !== keys.length) problems.push(`a key repeats: ${keys.join(', ')}`)
  const expected = expectedKeys(room, previous, next)
  if ([...keys].sort().join('\n') !== [...expected].sort().join('\n')) problems.push(`holds ${keys.join(', ')} and should hold ${expected.join(', ')}`)

  // Reading order: the wall and the figures, left to right; then the desk, left to right.
  for (let index = 1; index < objects.length; index += 1) {
    const before = objects[index - 1]
    const here = objects[index]
    if (onDesk(before) && !onDesk(here)) problems.push(`${here.key} is above the desk and comes after ${before.key}, which is on it`)
    if (onDesk(before) === onDesk(here) && here.box.left < before.box.left) problems.push(`${here.key} comes after ${before.key} and lies to its left`)
  }
  // The ledger and the bell are on the desk, and nothing else is.
  for (const object of objects) {
    const deskThing = object.kind === 'ledger' || object.kind === 'bell'
    if (onDesk(object) !== deskThing) problems.push(`${object.key} is ${onDesk(object) ? 'at' : 'above'} desk height`)
  }
  return problems
}

// ---------------------------------------------------------------------------
// Rooms with a chosen number of ghosts and Doors. Plain data, edited.

/** One figure for each state, each with a name of its own. */
function ghostsOf(states: readonly PresentationGhostState[]): GhostPresentation[] {
  return states.map((state, index) => ({ ghostId: `spirit-${index + 1}`, name: `Spirit ${index + 1}`, state, reason: null, pendingText: null }))
}

/** The house's own Doors of these phases, each put in the given state. */
function doorsOf(house: HouseProjection, phases: readonly Phase[], states: readonly PresentationDoorState[]): DoorPresentation[] {
  const generated = house.rooms.flatMap((room) => room.doors)
  return phases.map((phase, index) => {
    const door = generated.find((candidate) => candidate.phase === phase)
    if (door === undefined) throw new Error(`the generated house has no ${phase} door`)
    return { ...door, state: states[index] }
  })
}

const layoutArb = fc.record({
  ghostStates: fc.array(fc.constantFrom(...PRESENTATION_GHOST_STATES), { minLength: MAX_GHOSTS, maxLength: MAX_GHOSTS }),
  doorPhases: fc.subarray([...PHASES], { minLength: MAX_DOORS, maxLength: MAX_DOORS }),
  doorStates: fc.array(fc.constantFrom(...PRESENTATION_DOOR_STATES), { minLength: MAX_DOORS, maxLength: MAX_DOORS }),
  needsYou: fc.nat({ max: 12 }),
  // The width of the scene on the page, in CSS pixels.
  sceneWidth: fc.integer({ min: 320, max: 3840 }),
})

/** Boxes on a coarse grid, so edges often meet exactly. Some lie partly outside the scene. */
const gridBoxArb: fc.Arbitrary<Box> = fc.record({
  left: fc.integer({ min: -2, max: 20 }).map((value) => value * 5),
  top: fc.integer({ min: -2, max: 20 }).map((value) => value * 5),
  width: fc.integer({ min: 1, max: 8 }).map((value) => value * 5),
  height: fc.integer({ min: 1, max: 8 }).map((value) => value * 5),
})

describe('the stage layout', () => {
  // Feature: warden-guide-and-first-visit, Property 10: The guide never covers a working object
  it('Property 10: the guide never covers a working object', () => {
    // The Guide Reserve is a real corner of the scene: the bottom right one.
    expect(insideScene(GUIDE_RESERVE)).toBe(true)
    expect(withinScene(GUIDE_RESERVE)).toBe(true)
    expect(GUIDE_RESERVE.left + GUIDE_RESERVE.width).toBe(100)
    expect(GUIDE_RESERVE.top + GUIDE_RESERVE.height).toBe(100)

    // Every fixed press area.
    for (const [name, box] of Object.entries(STAGE_BOXES)) {
      expect(insideScene(box), name).toBe(true)
      expect(withinScene(box), name).toBe(true)
      expect(sharesArea(box, GUIDE_RESERVE), name).toBe(false)
      expect(intersects(box, GUIDE_RESERVE), name).toBe(false)
      expect(intersects(GUIDE_RESERVE, box), name).toBe(false)
    }

    // Every ghost place: each count from one to four, each index below it, each state.
    for (const state of PRESENTATION_GHOST_STATES) {
      for (let count = 1; count <= MAX_GHOSTS; count += 1) {
        const boxes = Array.from({ length: count }, (_, index) => ghostBox(index, count, state))
        boxes.forEach((box, index) => {
          const where = `ghost ${index + 1} of ${count}, ${state}: ${show(box)}`
          expect(insideScene(box), where).toBe(true)
          expect(withinScene(box), where).toBe(true)
          expect(sharesArea(box, GUIDE_RESERVE), where).toBe(false)
          expect(intersects(box, GUIDE_RESERVE), where).toBe(false)
          expect(intersects(GUIDE_RESERVE, box), where).toBe(false)
          // The box is the figure: a ghost's width and a ghost's height.
          expect(box.width, where).toBe(GHOST_WIDTH)
          expect(box.height, where).toBe(ghostHeight())
          // No two ghosts of a room stand in the same place.
          for (let other = 0; other < index; other += 1) {
            expect(sharesArea(box, boxes[other]), `${where} and ghost ${other + 1}`).toBe(false)
            expect(intersects(box, boxes[other]), `${where} and ghost ${other + 1}`).toBe(false)
          }
        })
      }
    }

    // The Warden is exactly twice as tall as a ghost.
    expect(Math.abs(WARDEN_WIDTH * WARDEN_ASPECT - 2 * GHOST_WIDTH * GHOST_ASPECT)).toBeLessThanOrEqual(TOLERANCE)

    const layouts = new Set<string>()
    const states = new Set<PresentationGhostState>()
    fc.assert(
      fc.property(guideCaseArb, layoutArb, ({ live, context }, layout) => {
        const edited = (room: RoomPresentation, ghostCount: number, doorCount: number): RoomPresentation => ({
          ...room,
          ghosts: ghostsOf(layout.ghostStates.slice(0, ghostCount)),
          doors: doorsOf(live, layout.doorPhases.slice(0, doorCount), layout.doorStates),
        })
        const drawn = (ghostCount: number, doorCount: number) => `${ghostCount} ghosts (${layout.ghostStates.slice(0, ghostCount).join(', ')}) and ${doorCount} doors`

        // Every room of the house: as generated, and as a full room of four ghosts and two Doors.
        for (const room of live.rooms) {
          for (const words of WORDS) {
            // The neighbours are the ones the guide names for this room.
            const view = guideView(live, { ...context, roomId: room.roomId, surface: null, task: null, words })
            if (view === null) throw new Error(`the house shows no guide for ${room.roomId}`)
            expect(layoutProblems(room, view.previous, view.next, words, live.needsYou.length), `${room.roomId} as generated, ${words}`).toEqual([])
            expect(layoutProblems(edited(room, MAX_GHOSTS, MAX_DOORS), view.previous, view.next, words, layout.needsYou), `${room.roomId} with ${drawn(MAX_GHOSTS, MAX_DOORS)}, ${words}`).toEqual([])
          }
        }

        // The room the visitor stands in, with zero to four ghosts and zero to two Doors, with and without a way back and a way on.
        // The rooms are taken round in a ring, so the first room has a way back to try and the last a way on.
        const index = live.rooms.findIndex((room) => room.roomId === context.roomId)
        if (index < 0) throw new Error(`the house does not show ${context.roomId}`)
        const here = live.rooms[index]
        const before = live.rooms[(index + live.rooms.length - 1) % live.rooms.length]
        const after = live.rooms[(index + 1) % live.rooms.length]
        const waysBack: Neighbour[] = [{ roomId: before.roomId, name: before.name }, null]
        const waysOn: Neighbour[] = [{ roomId: after.roomId, name: after.name }, null]
        for (let ghostCount = 0; ghostCount <= MAX_GHOSTS; ghostCount += 1) {
          for (let doorCount = 0; doorCount <= MAX_DOORS; doorCount += 1) {
            const room = edited(here, ghostCount, doorCount)
            for (const previous of waysBack) {
              for (const next of waysOn) {
                const ways = `${previous === null ? 'no way back' : 'a way back'}, ${next === null ? 'no way on' : 'a way on'}`
                layouts.add(`${ghostCount} ghosts, ${doorCount} doors, ${ways}`)
                for (const words of WORDS) expect(layoutProblems(room, previous, next, words, layout.needsYou), `${here.roomId} with ${drawn(ghostCount, doorCount)}, ${ways}, ${words}`).toEqual([])
              }
            }
          }
        }
        for (const state of layout.ghostStates) states.add(state)

        // Twice a ghost's height at any width of the scene, in pixels.
        const sceneHeight = (layout.sceneWidth * SCENE_HEIGHT) / SCENE_WIDTH
        const ghostTall = (ghostBox(0, 1, layout.ghostStates[0]).height / 100) * sceneHeight
        const wardenTall = (WARDEN_WIDTH / 100) * layout.sceneWidth * WARDEN_ASPECT
        expect(Math.abs(ghostTall - (GHOST_WIDTH / 100) * layout.sceneWidth * GHOST_ASPECT)).toBeLessThanOrEqual(TOLERANCE * layout.sceneWidth)
        expect(Math.abs(wardenTall / ghostTall - 2)).toBeLessThanOrEqual(TOLERANCE)
      }),
      { numRuns: RUNS },
    )
    // Every layout was drawn: five ghost counts, three door counts, with and without each way; and every ghost state.
    expect(layouts.size).toBe((MAX_GHOSTS + 1) * (MAX_DOORS + 1) * 4)
    expect(states.size).toBe(PRESENTATION_GHOST_STATES.length)
  })

  it('tells whether two boxes share area, either way round, and whether a box is inside the scene', () => {
    fc.assert(
      fc.property(gridBoxArb, gridBoxArb, (one, other) => {
        expect(intersects(one, other)).toBe(sharesArea(one, other))
        // Symmetric, and a box with a size meets itself.
        expect(intersects(other, one)).toBe(intersects(one, other))
        expect(intersects(one, one)).toBe(true)
        expect(withinScene(one)).toBe(insideScene(one))
        // A box that starts where another ends only touches it.
        const beside: Box = { ...one, left: one.left + one.width }
        const below: Box = { ...one, top: one.top + one.height }
        expect(intersects(one, beside)).toBe(false)
        expect(intersects(one, below)).toBe(false)
      }),
      { numRuns: RUNS },
    )
  })
})
