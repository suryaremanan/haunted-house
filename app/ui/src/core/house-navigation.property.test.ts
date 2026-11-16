import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ARROW_DIRECTIONS,
  HOUSE_ROOMS,
  HOUSE_ROOM_IDS,
  arrowDirection,
  compareRooms,
  isRoomId,
  nextRoom,
  roomDefinition,
  roomName,
  visibleRoomIds,
  visibleRooms,
  type ArrowDirection,
  type RoomId,
  type SeanceRoomSetting,
} from './house-registry'

/**
 * Independent reference: the fixed navigation map of design.md, written out as
 * a table (Up, Down, Left, Right) and not read from the registry.
 */
const REFERENCE: Readonly<Record<RoomId, readonly [RoomId | null, RoomId | null, RoomId | null, RoomId | null]>> = {
  foyer: ['drafting-room', null, 'study', 'workshop'],
  study: ['drafting-room', null, null, 'foyer'],
  'drafting-room': ['attic', 'foyer', null, 'seance-room'],
  workshop: ['seance-room', null, 'foyer', null],
  attic: [null, 'drafting-room', null, null],
  'seance-room': ['attic', 'workshop', 'drafting-room', null],
}
const COLUMN: Readonly<Record<ArrowDirection, number>> = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3 }

/** Every room met by walking one direction from `room`, nearest first. */
function reachable(room: RoomId, direction: ArrowDirection): RoomId[] {
  const path: RoomId[] = []
  let current = REFERENCE[room][COLUMN[direction]]
  while (current !== null && !path.includes(current) && current !== room) {
    path.push(current)
    current = REFERENCE[current][COLUMN[direction]]
  }
  return path
}

function referenceNext(room: RoomId, direction: ArrowDirection, visible: ReadonlySet<RoomId>): RoomId {
  if (!visible.has(room)) return room
  return reachable(room, direction).find((candidate) => visible.has(candidate)) ?? room
}

const LAYOUT_MODES = ['wide', 'compact', 'linear'] as const
const roomArb = fc.constantFrom(...HOUSE_ROOM_IDS)
const directionArb = fc.constantFrom(...ARROW_DIRECTIONS)
const seanceArb = fc.constantFrom<SeanceRoomSetting>('hidden', 'locked', 'enabled')

/** A non-empty visible set that holds the focused room: a build setting, or any subset. */
const caseArb = fc
  .tuple(roomArb, fc.oneof(seanceArb.map((setting) => [...visibleRoomIds(setting)]), fc.subarray([...HOUSE_ROOM_IDS])))
  .map(([room, others]) => ({ room, visible: new Set<RoomId>([room, ...others]) }))

describe('house registry', () => {
  it('lists the rooms in Room order with the names and phases of the product', () => {
    expect(HOUSE_ROOMS.map((room) => [room.id, room.name, room.phase, room.scope, room.order])).toEqual([
      ['foyer', 'Foyer', 'navigation', 'mvp', 0],
      ['study', 'Study', 'requirements', 'mvp', 1],
      ['drafting-room', 'Drafting Room', 'design', 'mvp', 2],
      ['workshop', 'Workshop', 'tasks-and-implementation', 'mvp', 3],
      ['attic', 'Attic', 'replay', 'mvp', 4],
      ['seance-room', 'Séance Room', 'review', 'stretch', 5],
    ])
    expect([...HOUSE_ROOM_IDS].sort(compareRooms)).toEqual([...HOUSE_ROOM_IDS])
    expect(roomName('drafting-room')).toBe('Drafting Room')
    expect(isRoomId('attic')).toBe(true)
    expect(isRoomId('cellar')).toBe(false)
    expect(isRoomId(null)).toBe(false)
  })

  it('holds exactly the fixed navigation map', () => {
    for (const room of HOUSE_ROOM_IDS) {
      for (const direction of ARROW_DIRECTIONS) {
        expect(roomDefinition(room).neighbors[direction] ?? null, `${room} ${direction}`).toBe(REFERENCE[room][COLUMN[direction]])
      }
    }
  })

  it('shows the five MVP rooms always and the Séance Room only when the build setting says so', () => {
    const mvp = ['foyer', 'study', 'drafting-room', 'workshop', 'attic']
    expect(visibleRooms('hidden').map((room) => room.id)).toEqual(mvp)
    expect(visibleRooms('locked').map((room) => room.id)).toEqual([...mvp, 'seance-room'])
    expect(visibleRooms('enabled').map((room) => room.id)).toEqual([...mvp, 'seance-room'])
  })

  it('keeps focus where no room lies in the requested direction', () => {
    const all = visibleRoomIds('enabled')
    expect(nextRoom('foyer', 'ArrowDown', all)).toBe('foyer')
    expect(nextRoom('attic', 'ArrowUp', all)).toBe('attic')
    expect(nextRoom('study', 'ArrowLeft', all)).toBe('study')
    expect(nextRoom('seance-room', 'ArrowRight', all)).toBe('seance-room')
    expect(nextRoom('workshop', 'ArrowRight', all)).toBe('workshop')
    // A hidden Séance Room leaves the Drafting Room at the right edge.
    expect(nextRoom('drafting-room', 'ArrowRight', visibleRoomIds('hidden'))).toBe('drafting-room')
    expect(nextRoom('drafting-room', 'ArrowRight', visibleRoomIds('locked'))).toBe('seance-room')
  })

  it('steps over a hidden room in the same direction', () => {
    expect(nextRoom('workshop', 'ArrowLeft', new Set<RoomId>(['workshop', 'study']))).toBe('study')
    expect(nextRoom('foyer', 'ArrowUp', new Set<RoomId>(['foyer', 'attic']))).toBe('attic')
  })

  it('reads arrow keys and nothing else as directions', () => {
    for (const direction of ARROW_DIRECTIONS) expect(arrowDirection(direction)).toBe(direction)
    for (const key of ['Enter', 'Escape', 'Tab', 'Home', 'End', 'a', ' ', '']) expect(arrowDirection(key)).toBeNull()
  })

  // Feature: house-ui-and-accessibility, Property 3: Arrow navigation is valid, bounded, and layout-independent
  // Validates: Requirements 3.2, 3.3, 6.4
  it('Property 3: arrow navigation is valid, bounded, and layout-independent', () => {
    fc.assert(
      fc.property(caseArb, directionArb, ({ room, visible }, direction) => {
        const frozen = new Set(visible)
        const result = nextRoom(room, direction, visible)

        // Valid: the origin, or a visible room.
        expect(result === room || visible.has(result)).toBe(true)
        // Bounded: a move lands only on a room that lies in that direction on the fixed map.
        if (result !== room) expect(reachable(room, direction)).toContain(result)
        // No visible room in that direction: focus stays.
        if (!reachable(room, direction).some((candidate) => visible.has(candidate))) expect(result).toBe(room)
        // Agrees with the reference graph.
        expect(result).toBe(referenceNext(room, direction, visible))

        // Layout-independent: the function takes no layout, so every responsive
        // mode yields the same answer, and so does a rebuilt, reordered set.
        for (const layout of LAYOUT_MODES) {
          const sameRooms = new Set(layout === 'linear' ? [...visible].reverse() : [...visible])
          expect(nextRoom(room, direction, sameRooms)).toBe(result)
        }
        // The visible set is read, never changed.
        expect(visible).toEqual(frozen)
      }),
      { numRuns: 300 },
    )
  })

  it('returns the origin for a room that is not visible', () => {
    fc.assert(
      fc.property(roomArb, directionArb, fc.subarray([...HOUSE_ROOM_IDS]), (room, direction, others) => {
        const visible = new Set<RoomId>(others.filter((other) => other !== room))
        expect(nextRoom(room, direction, visible)).toBe(room)
      }),
      { numRuns: 100 },
    )
  })
})
