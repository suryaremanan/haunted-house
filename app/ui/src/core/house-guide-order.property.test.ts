// Feature: warden-guide-and-first-visit, Property 2: The most pressing thing comes first, in words and in pose
//
// For all rooms, the status kind equals the first match of the reference order
// (locked, waiting decision, failed ghost, blocked ghost, working ghost,
// startable phase, open door, room description), and the pose equals the pose
// of that kind: stepped back exactly when Quiet Mode is on; holding only when
// the first match is a catch, with a label that names the held ghost when it
// has a name; offering a key exactly when the first match is a waiting door;
// and exactly one of the five poses with a non-empty label in every case.
//
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 3.2, 11.3, 12.1, 12.4, 12.5**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { guideCaseArb, houseOfCase, surfacesOf, type UpstreamCase } from '../test/guide-arbitraries'
import { snapshot } from '../test/house-projection-kit'
import { deepFreeze } from '../test/seance-arbitraries'
import type { GhostState } from './ghost-state'
import { WARDEN_POSES, guideView, wardenPose, type GuideContext, type GuideView } from './house-guide'
import { selectNeedsYouItems, type DoorPresentation, type GhostPresentation, type HouseProjection, type RoomPresentation } from './house-projection'
import type { SeanceRoomSetting } from './house-registry'
import { DOOR_STATUS_TEXT, doorHint } from './house-view'
import type { Phase } from './workflow-projection'

const RUNS = 300
// Each run reads every room of up to six houses, loud and quiet; the whole suite may run beside it.
const TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Independent reference: the design's "Status line and pose, first match wins"
// table as rows. Written here from the table; nothing is read from the module.

type Kind = 'locked' | 'door-waiting' | 'catch' | 'failed' | 'blocked' | 'working' | 'startable' | 'built' | 'door-open' | 'room'
type Pose = 'watching' | 'pointing' | 'offering-key' | 'holding' | 'stepped-back'

const POSES: readonly Pose[] = ['watching', 'pointing', 'offering-key', 'holding', 'stepped-back']

/** The phase statuses a phase is started from. The build is started piece by piece, so also while it is under way. */
const STARTED_FROM: Readonly<Record<Phase, readonly string[]>> = {
  requirements: ['ready', 'failed', 'revision_required'],
  design: ['ready', 'failed', 'revision_required'],
  tasks: ['ready', 'failed', 'revision_required'],
  implementation: ['ready', 'failed', 'revision_required', 'working'],
}

function ghostsIn(room: RoomPresentation, state: string): GhostPresentation[] {
  return room.ghosts.filter((ghost) => ghost.state === state)
}

/**
 * The Door the first waiting item is about, when that item is a door decision:
 * the Door that carries its proposal (the item id after the first colon), else
 * a Door of the room that waits.
 */
function waitingDoor(room: RoomPresentation): DoorPresentation | undefined {
  const first = room.waitingItems[0]
  if (first === undefined || first.kind !== 'door-decision') return undefined
  const [, ...rest] = first.id.split(':')
  const proposal = rest.join(':')
  return room.doors.find((door) => door.proposalId === proposal) ?? room.doors.find((door) => door.state === 'waiting')
}

/** The Door in front of the visitor: the first that is not open, else the last. None in a room without Doors. */
function doorInFront(room: RoomPresentation): DoorPresentation | undefined {
  const shut = room.doors.filter((door) => door.state !== 'open')
  return shut.length > 0 ? shut[0] : room.doors[room.doors.length - 1]
}

function canBeStarted(room: RoomPresentation): boolean {
  const door = doorInFront(room)
  if (door === undefined || door.phaseStatus === null) return false
  if (door.state === 'open' || door.state === 'waiting') return false
  return STARTED_FROM[door.phase].includes(door.phaseStatus)
}

/** Every Door of the whole house is open, and the house has one. */
function everyDoorOpen(house: HouseProjection): boolean {
  const states = house.rooms.flatMap((room) => room.doors.map((door) => door.state))
  return states.length > 0 && states.filter((state) => state !== 'open').length === 0
}

interface Row {
  readonly kind: Kind
  readonly when: (room: RoomPresentation, house: HouseProjection) => boolean
  /** The pose with Quiet Mode off. */
  readonly pose: (room: RoomPresentation) => Pose
}

/**
 * He points only where the room's state is confirmed (its integrity is valid):
 * a room whose controls are off for doubt has no next step to point at, so
 * there he watches. A recording is whole, so it reads like the live house.
 */
function pointsOrWatches(room: RoomPresentation): Pose {
  return room.integrity === 'valid' ? 'pointing' : 'watching'
}

/** First match wins. Quiet Mode (order 0) changes the pose alone and is applied where the table is read. */
const ORDER: readonly Row[] = [
  // 1. The room is locked.
  { kind: 'locked', when: (room) => room.locked, pose: () => 'watching' },
  // 2. Something waits. A door decision of this room is a waiting door; anything else is a catch.
  { kind: 'door-waiting', when: (room) => waitingDoor(room) !== undefined, pose: () => 'offering-key' },
  { kind: 'catch', when: (room) => room.waitingItems.length > 0, pose: () => 'holding' },
  // 3. A ghost failed. The next step is the visitor's only when a retry is offered.
  {
    kind: 'failed',
    when: (room) => ghostsIn(room, 'failed').length > 0,
    pose: (room) => (room.recoveryActions.some((action) => action.available) ? pointsOrWatches(room) : 'watching'),
  },
  // 4. A ghost is blocked: it is held.
  { kind: 'blocked', when: (room) => ghostsIn(room, 'blocked').length > 0, pose: () => 'holding' },
  // 5. A ghost is working.
  { kind: 'working', when: (room) => ghostsIn(room, 'working').length > 0, pose: () => 'watching' },
  // 6. The phase in front of the visitor can be started.
  { kind: 'startable', when: (room) => canBeStarted(room), pose: pointsOrWatches },
  // 7. Every Door of the house is open. The Attic keeps its own words.
  { kind: 'built', when: (room, house) => room.roomId !== 'attic' && everyDoorOpen(house), pose: pointsOrWatches },
  // 8. Every Door of the room is open.
  { kind: 'door-open', when: (room) => room.doors.length > 0 && room.doors.every((door) => door.state === 'open'), pose: pointsOrWatches },
  // 9. Otherwise: what the room is for.
  { kind: 'room', when: () => true, pose: () => 'watching' },
]

function referenceRow(room: RoomPresentation, house: HouseProjection): Row {
  // The last row matches every room.
  return ORDER.find((row) => row.when(room, house))!
}

/** The one ghost the Warden holds by name: the only blocked ghost, or the ghost of the room that the caught item names. */
function heldGhost(kind: Kind, room: RoomPresentation): GhostPresentation | null {
  if (kind === 'blocked') {
    const blocked = ghostsIn(room, 'blocked')
    return blocked.length === 1 ? blocked[0] : null
  }
  if (kind === 'catch') {
    const ghostId = room.waitingItems[0].ghostId
    return room.ghosts.find((ghost) => ghost.ghostId === ghostId) ?? null
  }
  return null
}

/** In words: the status line states the first match, in the house's own sentences where the house supplies them. */
function expectWords(status: string, kind: Kind, room: RoomPresentation, where: string): void {
  switch (kind) {
    case 'locked':
      // The room's own locked text.
      if (room.diagnostic !== null) expect(status, where).toBe(room.diagnostic)
      return
    case 'catch': {
      const item = room.waitingItems[0]
      // A Crew tool prompt: the upstream sentence, which says where it is answered.
      if (item.kind === 'tool-decision') {
        expect(status, where).toBe(item.label)
        expect(status, where).toContain('Crew')
      }
      // A risky action: what the ghost asked, in the wording the house supplies.
      if (item.kind === 'risky-decision') expect(status, where).toContain(item.label)
      return
    }
    case 'failed':
    case 'blocked': {
      const ghosts = ghostsIn(room, kind)
      for (const ghost of ghosts) expect(status, where).toContain(ghost.name)
      // One ghost: its safe reason is given.
      const only = ghosts.length === 1 ? ghosts[0] : null
      if (only !== null && only.reason !== null) expect(status, where).toContain(only.reason)
      return
    }
    case 'working':
      for (const ghost of ghostsIn(room, 'working')) expect(status, where).toContain(ghost.name)
      // The door is mentioned only while a Door of the room is still shut.
      if (room.doors.some((door) => door.state !== 'open')) expect(status, where).toMatch(/door stays shut until you open it/)
      else expect(status, where).not.toMatch(/door stays shut/)
      return
    default:
      return
  }
}

// ---------------------------------------------------------------------------
// Generators. The kit's houses come from the real upstream derivations. An
// open Door is rare there and the Séance Room is always empty, so each house
// is read again with Doors opened and again with a ghost in the Séance Room.

const PHASE_ORDER: readonly Phase[] = ['requirements', 'design', 'tasks', 'implementation']

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

/** How many phases to open: all four half the time (a built house), else the first one to three (an open Door with work ahead). */
const openedArb = fc.constantFrom(4, 4, 4, 1, 2, 3)

/**
 * The same facts with the Séance Room shown and a ghost in it, which the kit
 * never does: a locked room that holds a failed, blocked or working ghost, or
 * an unlocked room without a Door that does.
 */
function withMedium(upstream: UpstreamCase, medium: { readonly seanceRoom: SeanceRoomSetting; readonly state: GhostState }): UpstreamCase {
  return { ...upstream, seanceRoom: medium.seanceRoom, snapshots: [...upstream.snapshots, snapshot('medium', medium.state)] }
}

const mediumArb = fc.record({
  seanceRoom: fc.constantFrom<SeanceRoomSetting>('locked', 'locked', 'enabled'),
  state: fc.constantFrom<GhostState>('failed', 'blocked', 'working', 'idle'),
})

function viewOf(house: HouseProjection, context: GuideContext): GuideView {
  const view = guideView(house, context)
  if (view === null) throw new Error(`no guide view for the visible room ${context.roomId}`)
  return view
}

describe('the Warden says and shows the most pressing thing', () => {
  // Feature: warden-guide-and-first-visit, Property 2: The most pressing thing comes first, in words and in pose
  it(
    'Property 2: The most pressing thing comes first, in words and in pose',
    () => {
      const kindsSeen = new Set<string>()
      const posesSeen = new Set<string>()
      let namedCatches = 0
      let namedBlocks = 0
      let failedWithRetry = 0
      let failedWithoutRetry = 0
      let lockedWithGhost = 0
      let unlockedWithMedium = 0

      // The five poses of the design are the five the module can show.
      expect([...WARDEN_POSES].sort()).toEqual([...POSES].sort())

      fc.assert(
        fc.property(guideCaseArb, openedArb, mediumArb, fc.nat(), ({ upstream, live, replay, context }, opened, medium, pick) => {
          const haunted = withMedium(upstream, medium)
          const houses = [live, replay, withDoorsOpen(live, opened), withDoorsOpen(replay, opened), houseOfCase(haunted, 'live'), houseOfCase(haunted, 'replay')]
          for (const house of houses) {
            deepFreeze(house)
            house.rooms.forEach((room, index) => {
              // Any surface of the room on top: neither the kind of the words nor the pose depends on it.
              const surfaces = surfacesOf(house, room.roomId)
              const here: GuideContext = deepFreeze({ ...context, roomId: room.roomId, surface: surfaces[(pick + index) % surfaces.length] })
              const where = `${house.mode} house, ${room.name}`
              const row = referenceRow(room, house)
              const loud = viewOf(house, { ...here, quiet: false })
              const hushed = viewOf(house, { ...here, quiet: true })

              // In words: the status kind is the first match, and the line states it.
              expect(loud.statusKind, where).toBe(row.kind)
              expectWords(loud.status, row.kind, room, where)

              // Quiet Mode changes the pose and nothing that is said.
              expect(hushed.statusKind, where).toBe(loud.statusKind)
              expect(hushed.status, where).toBe(loud.status)

              for (const [quiet, view] of [[false, loud], [true, hushed]] as const) {
                // In pose: the pose of that kind, stepped back exactly when Quiet Mode is on.
                const pose: Pose = quiet ? 'stepped-back' : row.pose(room)
                expect(view.pose, where).toBe(pose)
                expect(view.pose === 'stepped-back', where).toBe(quiet)
                // Offering a key exactly for a waiting door; holding only for a catch.
                expect(view.pose === 'offering-key', where).toBe(!quiet && row.kind === 'door-waiting')
                if (view.pose === 'holding') expect(['catch', 'blocked'], where).toContain(row.kind)
                // Exactly one of the five, with words that name it.
                expect(WARDEN_POSES, where).toContain(view.pose)
                expect(view.poseLabel.trim(), where).not.toBe('')
                // The pose is a reading of the house, the room and Quiet Mode alone.
                expect(wardenPose(room, house, quiet), where).toEqual({ pose, label: view.poseLabel })
                posesSeen.add(view.pose)
              }

              // Holding one ghost that has a name: the label names it.
              const held = heldGhost(row.kind, room)
              if (held !== null) {
                expect(loud.pose, where).toBe('holding')
                expect(loud.poseLabel, where).toContain(held.name)
                if (row.kind === 'catch') namedCatches += 1
                else namedBlocks += 1
              }

              kindsSeen.add(row.kind)
              if (row.kind === 'failed' && loud.pose === 'pointing') failedWithRetry += 1
              if (row.kind === 'failed' && loud.pose === 'watching') failedWithoutRetry += 1
              if (row.kind === 'locked' && room.ghosts.some((ghost) => ghost.state !== 'idle')) lockedWithGhost += 1
              if (room.roomId === 'seance-room' && !room.locked && room.ghosts.length > 0) unlockedWithMedium += 1
            })
          }
        }),
        { numRuns: RUNS },
      )

      // The generators reach every row of the table and every pose; the property is not vacuous.
      expect([...kindsSeen].sort()).toEqual(ORDER.map((row) => row.kind).sort())
      expect([...posesSeen].sort()).toEqual([...POSES].sort())
      // Both named holds, a failed ghost with and without a retry, and a ghost in the Séance Room, locked and not.
      expect(namedCatches).toBeGreaterThan(0)
      expect(namedBlocks).toBeGreaterThan(0)
      expect(failedWithRetry).toBeGreaterThan(0)
      expect(failedWithoutRetry).toBeGreaterThan(0)
      expect(lockedWithGhost).toBeGreaterThan(0)
      expect(unlockedWithMedium).toBeGreaterThan(0)
    },
    TIMEOUT_MS,
  )
})
