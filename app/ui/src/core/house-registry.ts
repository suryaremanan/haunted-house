// The static room registry of the house (Spec 6, Requirements 1.3 to 1.5, 3.2,
// 3.3, 6.4): which rooms exist, their names, phases, order and scope, and the
// fixed map the arrow keys follow. This is the one place room names and Room
// order are written down; every other module reads them from here.
//
// The arrow map is geometric and fixed. A layout change (wide cutaway, compact
// grid, one column) never reaches this file, so it cannot change what a key does.
// No React, DOM, Crew SDK, network, filesystem, or clock.

import type { GhostState } from './ghost-state'
import type { DoorStatus, Phase } from './workflow-projection'

export const HOUSE_ROOM_IDS = ['foyer', 'study', 'drafting-room', 'workshop', 'attic', 'seance-room'] as const
export type RoomId = (typeof HOUSE_ROOM_IDS)[number]

export const ROOM_PHASES = ['navigation', 'requirements', 'design', 'tasks-and-implementation', 'replay', 'review'] as const
export type RoomPhase = (typeof ROOM_PHASES)[number]

export const ARROW_DIRECTIONS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const
export type ArrowDirection = (typeof ARROW_DIRECTIONS)[number]

export type RoomScope = 'mvp' | 'stretch'

export interface RoomDefinition {
  readonly id: RoomId
  readonly name: string
  readonly phase: RoomPhase
  /** Position in Room order, from 0. */
  readonly order: number
  readonly scope: RoomScope
  readonly neighbors: Partial<Record<ArrowDirection, RoomId>>
  /** The workflow phases whose Doors belong to this room. Empty for a room without a Door. */
  readonly workflowPhases: readonly Phase[]
  /** Ghost id prefixes that live here (`tinker` matches `tinker-2`). Empty for a room without a ghost. */
  readonly ghostRoles: readonly string[]
}

/** The words shown and read for each room phase. */
export const ROOM_PHASE_TEXT: Readonly<Record<RoomPhase, string>> = {
  navigation: 'navigation',
  requirements: 'requirements',
  design: 'design',
  'tasks-and-implementation': 'tasks and implementation',
  replay: 'replay',
  review: 'review',
}

/** Every room in Room order. The Séance Room is stretch and may be hidden. */
export const HOUSE_ROOMS: readonly RoomDefinition[] = [
  {
    id: 'foyer',
    name: 'Foyer',
    phase: 'navigation',
    order: 0,
    scope: 'mvp',
    neighbors: { ArrowUp: 'drafting-room', ArrowLeft: 'study', ArrowRight: 'workshop' },
    workflowPhases: [],
    ghostRoles: [],
  },
  {
    id: 'study',
    name: 'Study',
    phase: 'requirements',
    order: 1,
    scope: 'mvp',
    neighbors: { ArrowUp: 'attic', ArrowRight: 'foyer' },
    workflowPhases: ['requirements'],
    ghostRoles: ['archivist'],
  },
  {
    id: 'drafting-room',
    name: 'Drafting Room',
    phase: 'design',
    order: 2,
    scope: 'mvp',
    neighbors: { ArrowUp: 'attic', ArrowDown: 'foyer', ArrowLeft: 'study', ArrowRight: 'workshop' },
    workflowPhases: ['design'],
    ghostRoles: ['draughtsman'],
  },
  {
    id: 'workshop',
    name: 'Workshop',
    phase: 'tasks-and-implementation',
    order: 3,
    scope: 'mvp',
    neighbors: { ArrowUp: 'attic', ArrowLeft: 'foyer', ArrowRight: 'seance-room' },
    workflowPhases: ['tasks', 'implementation'],
    ghostRoles: ['foreman', 'tinker'],
  },
  {
    id: 'attic',
    name: 'Attic',
    phase: 'replay',
    order: 4,
    scope: 'mvp',
    neighbors: { ArrowDown: 'drafting-room', ArrowLeft: 'study', ArrowRight: 'workshop' },
    workflowPhases: [],
    ghostRoles: [],
  },
  {
    id: 'seance-room',
    name: 'Séance Room',
    phase: 'review',
    order: 5,
    scope: 'stretch',
    neighbors: { ArrowUp: 'attic', ArrowLeft: 'workshop' },
    workflowPhases: [],
    ghostRoles: ['medium'],
  },
]

const BY_ID: ReadonlyMap<string, RoomDefinition> = new Map(HOUSE_ROOMS.map((room) => [room.id, room]))

export function isRoomId(value: unknown): value is RoomId {
  return typeof value === 'string' && BY_ID.has(value)
}

export function roomDefinition(id: RoomId): RoomDefinition {
  return BY_ID.get(id)!
}

export function roomName(id: RoomId): string {
  return roomDefinition(id).name
}

/** Position of a room in Room order. */
export function roomOrder(id: RoomId): number {
  return roomDefinition(id).order
}

/** Sorts by Room order. Usable with `Array.prototype.sort`. */
export function compareRooms(left: RoomId, right: RoomId): number {
  return roomOrder(left) - roomOrder(right)
}

/**
 * Whether the Séance Room is left out, shown locked, or shown in use. One
 * build-time setting; never an Operator-controlled authority value.
 */
export type SeanceRoomSetting = 'hidden' | 'locked' | 'enabled'

/** The rooms the house shows, in Room order. MVP rooms always show. */
export function visibleRooms(seanceRoom: SeanceRoomSetting): readonly RoomDefinition[] {
  return HOUSE_ROOMS.filter((room) => room.scope === 'mvp' || seanceRoom !== 'hidden')
}

export function visibleRoomIds(seanceRoom: SeanceRoomSetting): ReadonlySet<RoomId> {
  return new Set(visibleRooms(seanceRoom).map((room) => room.id))
}

/**
 * The room an arrow key moves to. It follows the fixed map in the requested
 * direction, stepping over rooms that are not visible, and returns the origin
 * when that direction holds no visible room. Total: any input yields a room,
 * and the result is the origin or a member of `visible`.
 */
export function nextRoom(room: RoomId, direction: ArrowDirection, visible: ReadonlySet<RoomId>): RoomId {
  if (!visible.has(room)) return room
  const passed = new Set<RoomId>([room])
  let current = BY_ID.get(room)?.neighbors[direction]
  while (current !== undefined && !passed.has(current)) {
    if (visible.has(current)) return current
    passed.add(current)
    current = BY_ID.get(current)?.neighbors[direction]
  }
  return room
}

/** The arrow direction of a key name, or null for any other key. */
export function arrowDirection(key: string): ArrowDirection | null {
  return (ARROW_DIRECTIONS as readonly string[]).includes(key) ? (key as ArrowDirection) : null
}

// ---------------------------------------------------------------------------
// The states the house can depict. Upstream Door and Ghost values pass through
// unchanged; the two extra words are presentation copy, never workflow state.

/** `not_applicable`: the room has no such thing. `unavailable`: it has one, but its state could not be read. */
export type PresentationDoorState = DoorStatus | 'not_applicable' | 'unavailable'
export type PresentationGhostState = GhostState | 'not_applicable' | 'unavailable'

export const PRESENTATION_DOOR_STATES: readonly PresentationDoorState[] = [
  'sealed',
  'waiting',
  'open',
  'rejected',
  'not_applicable',
  'unavailable',
]

export const PRESENTATION_GHOST_STATES: readonly PresentationGhostState[] = [
  'idle',
  'working',
  'waiting',
  'blocked',
  'failed',
  'done',
  'not_applicable',
  'unavailable',
]

/** The exact state word shown and read: the upstream value, or the presentation copy in words. */
export function stateWord(state: PresentationDoorState | PresentationGhostState): string {
  return state === 'not_applicable' ? 'not applicable' : state
}
