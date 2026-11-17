// Feature: warden-guide-and-first-visit, Property 9: The landing room is where the work is
//
// For all House Projections, `landingRoom` returns a visible room that is the
// room of the first Needs You item when one exists, otherwise the room of the
// earliest phase whose door is not open, otherwise the Attic.
//
// **Validates: Requirements 10.8, 11.1**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { guideCaseArb } from '../test/guide-arbitraries'
import { deepFreeze } from '../test/seance-arbitraries'
import { landingRoom } from './house-guide'
import { selectNeedsYouItems, type DoorPresentation, type HouseProjection, type RoomPresentation } from './house-projection'
import { DOOR_STATUS_TEXT, doorHint } from './house-view'
import type { Phase } from './workflow-projection'

const RUNS = 300
// Each run reads ten houses in each mode; the whole suite may run beside it.
const TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Independent reference: where the work is, as three plain steps written here.

const PHASE_ORDER: readonly Phase[] = ['requirements', 'design', 'tasks', 'implementation']

type Step = 'needs-you' | 'door' | 'attic'

/** The room a Mansion opens on and the step that chose it. Null for a house without an Attic, which no step covers. */
function referenceLanding(house: HouseProjection): { readonly roomId: string; readonly step: Step } | null {
  // 1. The room of the first thing that needs the visitor.
  const first = house.needsYou[0]
  if (first !== undefined) return { roomId: first.roomId, step: 'needs-you' }
  // 2. The first room, in the house's own room order, that has a Door which is not open.
  for (const room of house.rooms) {
    for (const door of room.doors) {
      if (door.state !== 'open') return { roomId: room.roomId, step: 'door' }
    }
  }
  // 3. The Attic, when the house shows it.
  return house.rooms.some((room) => room.roomId === 'attic') ? { roomId: 'attic', step: 'attic' } : null
}

/** Step 2 read by phase instead of by room: the room of the earliest phase whose Door is not open, or null. */
function roomOfEarliestShutPhase(house: HouseProjection): string | null {
  for (const phase of PHASE_ORDER) {
    for (const room of house.rooms) {
      if (room.doors.some((door) => door.phase === phase && door.state !== 'open')) return room.roomId
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Generators. The kit's houses come from the real upstream derivations. There
// something often needs the visitor and an open Door is rare, so each house is
// read again with Doors opened, and each of those with nothing to act on.

/**
 * The same house with the Doors of its first `count` phases open: a pure data
 * edit. An opened Door carries no proposal, every decision is settled except
 * that of a Door still waiting, and Needs You is selected again, so the result
 * is still a house the projection could show. With all four, the house is built.
 */
function withDoorsOpen(house: HouseProjection, count: number): HouseProjection {
  const opened = new Set<Phase>(PHASE_ORDER.slice(0, count))
  const rooms = house.rooms.map((room): RoomPresentation => {
    const doors = room.doors.map((door): DoorPresentation =>
      opened.has(door.phase) ? { ...door, state: 'open', text: DOOR_STATUS_TEXT.open, hint: doorHint(door.phase, 'open'), proposalId: null } : door,
    )
    const stillWaiting = new Set(doors.filter((door) => door.proposalId !== null).map((door) => `door:${door.proposalId}`))
    const shut = doors.filter((door) => door.state !== 'open')
    return {
      ...room,
      doors,
      door: doors.length === 0 ? room.door : (shut[0] ?? doors[doors.length - 1]).state,
      waitingItems: room.waitingItems.filter((item) => item.kind === 'door-decision' && stillWaiting.has(item.id)),
    }
  })
  return { ...house, rooms, needsYou: selectNeedsYouItems(rooms) }
}

/**
 * The same house with nothing the visitor can act on: a pure data edit. No
 * waiting decision can be acted on and no failed run offers a retry, so the
 * house's own selection leaves Needs You empty. The Doors are untouched.
 */
function withNothingToActOn(house: HouseProjection): HouseProjection {
  const rooms = house.rooms.map(
    (room): RoomPresentation => ({
      ...room,
      waitingItems: room.waitingItems.map((item) => ({ ...item, actionAvailable: false })),
      recoveryActions: room.recoveryActions.map((action) => ({ ...action, available: false })),
    }),
  )
  return { ...house, rooms, needsYou: selectNeedsYouItems(rooms) }
}

describe('the room a Mansion opens on', () => {
  // Feature: warden-guide-and-first-visit, Property 9: The landing room is where the work is
  it(
    'Property 9: The landing room is where the work is',
    () => {
      const stepsSeen = new Map<string, number>()
      const roomsByDoor = new Map<string, number>()

      fc.assert(
        fc.property(guideCaseArb, ({ live, replay }) => {
          for (const house of [live, replay]) {
            // As generated, then with the Doors of the first one to four phases open.
            for (const count of [0, 1, 2, 3, 4]) {
              const opened = count === 0 ? house : withDoorsOpen(house, count)
              const idle = withNothingToActOn(opened)
              expect(idle.needsYou).toEqual([])

              for (const read of [opened, idle]) {
                deepFreeze(read)
                const where = `${read.mode} house, first ${count} phases opened, ${read.needsYou.length} things need the visitor`
                const landed = landingRoom(read)

                // A room the house shows.
                expect(read.rooms.map((room) => room.roomId), where).toContain(landed)

                const expected = referenceLanding(read)
                if (expected === null) continue
                // Where the work is: what needs the visitor, else the first Door that is not open, else the Attic.
                expect(landed, where).toBe(expected.roomId)
                // The first such room in room order is the room of the earliest phase whose Door is not open.
                if (expected.step === 'door') expect(roomOfEarliestShutPhase(read), where).toBe(landed)
                if (expected.step === 'attic') expect(roomOfEarliestShutPhase(read), where).toBeNull()

                stepsSeen.set(expected.step, (stepsSeen.get(expected.step) ?? 0) + 1)
                if (expected.step === 'door') roomsByDoor.set(landed, (roomsByDoor.get(landed) ?? 0) + 1)
              }
            }
          }
        }),
        { numRuns: RUNS },
      )

      // Each step chose the room of some house, and the Doors led to every room that has one; the property is not vacuous.
      expect([...stepsSeen.keys()].sort()).toEqual(['attic', 'door', 'needs-you'])
      expect([...roomsByDoor.keys()].sort()).toEqual(['drafting-room', 'study', 'workshop'])
    },
    TIMEOUT_MS,
  )
})
