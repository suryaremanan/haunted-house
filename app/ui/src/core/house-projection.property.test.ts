import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { GhostSnapshot, GhostState } from './ghost-state'
import { MAX_DIAGNOSTIC_CODE_POINTS, buildHouseProjection, type HouseOptions, type UpstreamReplay } from './house-projection'
import type { CanonicalHealth, ProjectionStatus } from './house-view'
import type { RoomGhostsStatus } from './room-view'
import type { DoorStatus, Integrity, WorkflowProjection } from './workflow-projection'
import { composeUpstream, healthyCanonical, snapshot } from '../test/house-projection-kit'
import { roomGhosts, run } from '../test/room-kit'
import { deepFreeze } from '../test/seance-arbitraries'
import { projectionArb } from '../test/workflow-arbitraries'

// ---------------------------------------------------------------------------
// Independent reference: small tables written here, not read from the registry
// or from house-view.

const ROOM_ORDER = ['foyer', 'study', 'drafting-room', 'workshop', 'attic', 'seance-room'] as const
type Room = (typeof ROOM_ORDER)[number]

/** Index of each room's phases in the four workflow phases. */
const PHASE_INDEXES: Readonly<Record<Room, readonly number[]>> = {
  foyer: [],
  study: [0],
  'drafting-room': [1],
  workshop: [2, 3],
  attic: [],
  'seance-room': [],
}
const ROLE_ROOM: ReadonlyArray<readonly [string, Room]> = [
  ['archivist', 'study'],
  ['draughtsman', 'drafting-room'],
  ['foreman', 'workshop'],
  ['tinker', 'workshop'],
  ['medium', 'seance-room'],
]
const ATTENTION: readonly GhostState[] = ['failed', 'blocked', 'waiting', 'working', 'done', 'idle']
const DOOR_VALUES: readonly string[] = ['sealed', 'waiting', 'open', 'rejected']
const GHOST_VALUES: readonly string[] = ['idle', 'working', 'waiting', 'blocked', 'failed', 'done']

function referenceRoomOfGhost(ghostId: string, workflow: WorkflowProjection | null): Room | null {
  if (workflow !== null) {
    for (let index = 0; index < workflow.phases.length; index += 1) {
      if (workflow.phases[index].ghostIds.includes(ghostId)) return (['study', 'drafting-room', 'workshop', 'workshop'] as const)[index]
    }
  }
  for (const [role, room] of ROLE_ROOM) {
    if (ghostId === role || ghostId.startsWith(`${role}-`)) return room
  }
  return null
}

function referenceDoors(room: Room, workflow: WorkflowProjection | null): string[] {
  return PHASE_INDEXES[room].map((index) => {
    const status: string | undefined = workflow?.phases[index].door.status
    return status !== undefined && DOOR_VALUES.includes(status) ? status : 'unavailable'
  })
}

function referenceHeadlineDoor(doors: readonly string[]): string {
  if (doors.length === 0) return 'not_applicable'
  if (doors.includes('unavailable')) return 'unavailable'
  return doors.find((door) => door !== 'open') ?? doors[doors.length - 1]
}

function referenceHeadlineGhost(states: readonly string[]): string {
  if (states.length === 0) return 'not_applicable'
  if (states.includes('unavailable')) return 'unavailable'
  return ATTENTION.find((state) => states.includes(state))!
}

// ---------------------------------------------------------------------------
// Generators.

const GHOST_IDS = ['archivist', 'draughtsman', 'foreman', 'tinker-1', 'tinker-2', 'medium', 'ghost-a', 'ghost-b', 'stranger', 'house-operator'] as const
const ghostStateArb = fc.constantFrom<GhostState>('idle', 'working', 'waiting', 'blocked', 'failed', 'done')

/** Mostly real states; sometimes a value no upstream contract defines. */
const snapshotsArb: fc.Arbitrary<GhostSnapshot[]> = fc
  .uniqueArray(fc.tuple(fc.constantFrom(...GHOST_IDS), fc.oneof({ weight: 12, arbitrary: ghostStateArb }, { weight: 1, arbitrary: fc.constant('haunting' as GhostState) })), {
    selector: ([ghostId]) => ghostId,
    maxLength: 7,
  })
  .map((entries) => entries.map(([ghostId, state]) => snapshot(ghostId, state)))

const canonicalArb = (version: number): fc.Arbitrary<CanonicalHealth> =>
  fc.oneof(
    { weight: 6, arbitrary: fc.constant(healthyCanonical(version)) },
    { weight: 1, arbitrary: fc.constant<CanonicalHealth>({ loaded: false, catchingUp: false, highestSequence: version, diagnostic: null }) },
    { weight: 1, arbitrary: fc.constant<CanonicalHealth>({ loaded: true, catchingUp: true, highestSequence: version, diagnostic: null }) },
    { weight: 1, arbitrary: fc.constant<CanonicalHealth>({ loaded: true, catchingUp: false, highestSequence: version + 3, diagnostic: null }) },
    {
      weight: 1,
      arbitrary: fc.constantFrom('hash_mismatch', 'persistence_failed').map(
        (code): CanonicalHealth => ({
          loaded: true,
          catchingUp: false,
          highestSequence: version,
          diagnostic: { code, safe_detail: 'synthetic' } as CanonicalHealth['diagnostic'],
        }),
      ),
    },
  )

const replayArb: fc.Arbitrary<UpstreamReplay> = fc.oneof(
  { weight: 4, arbitrary: fc.nat({ max: 400 }).map((validRecordCount): UpstreamReplay => ({ integrity: 'valid', validRecordCount, diagnostics: [] })) },
  {
    weight: 1,
    arbitrary: fc.tuple(fc.constantFrom<'diagnostic' | 'incompatible'>('diagnostic', 'incompatible'), fc.nat({ max: 400 })).map(
      ([integrity, validRecordCount]): UpstreamReplay => ({
        integrity,
        validRecordCount,
        diagnostics: [{ code: 'invalid_record', line: 3, safeDetail: 'A record could not be read and was left out.' }],
      }),
    ),
  },
)

const optionsArb: fc.Arbitrary<HouseOptions> = fc.record({
  seanceRoom: fc.constantFrom<HouseOptions['seanceRoom']>('hidden', 'locked', 'enabled'),
  mode: fc.constantFrom<HouseOptions['mode']>('live', 'live', 'live', 'replay'),
})

interface Scenario {
  readonly workflow: WorkflowProjection | null
  readonly workflowStatus: ProjectionStatus
  readonly canonical: CanonicalHealth
  readonly snapshots: GhostSnapshot[]
  /** `absent`: Spec 5 handed over nothing. */
  readonly room: { readonly status: RoomGhostsStatus; readonly integrity: Integrity; readonly versionDrift: number; readonly failedRetry: boolean | null } | 'absent'
  readonly replay: UpstreamReplay
  readonly options: HouseOptions
  /** A Door status no upstream contract defines, planted in one phase. */
  readonly oddDoorPhase: number | null
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .tuple(
    // Mostly a projection with no Door waiting and valid integrity, so the all-valid case is common.
    fc.oneof({ weight: 5, arbitrary: projectionArb() }, { weight: 1, arbitrary: fc.constant(null) }),
    fc.constantFrom<ProjectionStatus>('ready', 'ready', 'ready', 'ready', 'loading', 'malformed', 'unavailable'),
    snapshotsArb,
    fc.oneof(
      { weight: 1, arbitrary: fc.constant('absent' as const) },
      {
        weight: 4,
        arbitrary: fc.record({
          status: fc.constantFrom<RoomGhostsStatus>('ready', 'ready', 'ready', 'ready', 'loading', 'malformed', 'unavailable'),
          integrity: fc.constantFrom<Integrity>('valid', 'valid', 'valid', 'uncertain', 'corrupt'),
          versionDrift: fc.constantFrom(0, 0, 0, 0, 1),
          failedRetry: fc.constantFrom<boolean | null>(null, null, true, false),
        }),
      },
    ),
    replayArb,
    optionsArb,
    fc.option(fc.integer({ min: 0, max: 3 }), { nil: null, freq: 8 }),
  )
  .chain(([workflow, workflowStatus, snapshots, room, replay, options, oddDoorPhase]) =>
    canonicalArb(workflow?.version ?? 0).map(
      (canonical): Scenario => ({ workflow, workflowStatus, canonical, snapshots, room, replay, options, oddDoorPhase }),
    ),
  )

function build(scenario: Scenario) {
  let workflow = scenario.workflow
  if (workflow !== null && scenario.oddDoorPhase !== null) {
    const phases = workflow.phases.map((phase, index) =>
      index === scenario.oddDoorPhase ? { ...phase, door: { ...phase.door, status: 'ajar' as DoorStatus } } : phase,
    )
    workflow = { ...workflow, phases: phases as unknown as WorkflowProjection['phases'] }
  }
  const room = scenario.room
  const answer =
    room === 'absent'
      ? undefined
      : room.status !== 'ready'
        ? null
        : roomGhosts({
            version: (workflow?.version ?? 0) + room.versionDrift,
            integrity: room.integrity,
            readOnly: scenario.options.mode === 'replay',
            runs:
              room.failedRetry === null
                ? []
                : [run({ runId: 'requirements-1', ghostId: 'archivist', phase: 'requirements', canRetry: room.failedRetry })],
          })
  const composed = composeUpstream({
    workflow,
    workflowStatus: workflow === null && scenario.workflowStatus === 'ready' ? 'loading' : scenario.workflowStatus,
    canonical: scenario.canonical,
    snapshots: scenario.snapshots,
    roomGhosts: answer,
    roomGhostsStatus: room === 'absent' ? undefined : room.status,
    replay: scenario.replay,
    readOnly: scenario.options.mode === 'replay',
  })
  deepFreeze(composed.input)
  return { ...composed, workflow, projection: buildHouseProjection(composed.input, scenario.options) }
}

describe('house projection', () => {
  // Feature: house-ui-and-accessibility, Property 1: House projection preserves authority and fails closed
  // Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.8
  it('Property 1: house projection preserves authority and fails closed', () => {
    let enabledSeen = 0
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const { projection, workflow, authority, joined, input } = build(scenario)
        const { options } = scenario

        // Rooms follow the configured Room order exactly.
        const expectedRooms = ROOM_ORDER.filter((room) => room !== 'seance-room' || options.seanceRoom !== 'hidden')
        expect(projection.rooms.map((room) => room.roomId)).toEqual(expectedRooms)
        expect(projection.mode).toBe(options.mode)

        const liveGhosts = scenario.snapshots.filter((item) => item.ghost_id !== 'house-operator')
        for (const room of projection.rooms) {
          const id = room.roomId as Room

          // Door states: the upstream value of every Door, unchanged and in workflow order.
          const doors = referenceDoors(id, workflow)
          expect(room.doors.map((door) => door.state)).toEqual(doors)
          expect(room.door).toBe(referenceHeadlineDoor(doors))
          for (const [index, door] of room.doors.entries()) {
            const upstream: string | undefined = workflow?.phases[PHASE_INDEXES[id][index]].door.status
            if (upstream !== undefined && DOOR_VALUES.includes(upstream)) expect(door.state).toBe(upstream)
            // An unknown or unread value is never coerced into a Door state.
            else expect(door.state).toBe('unavailable')
          }

          // Ghost states: the upstream value of every ghost of the room, unchanged.
          const here = liveGhosts.filter((item) => referenceRoomOfGhost(item.ghost_id, workflow) === id)
          const states = here.map((item) => (GHOST_VALUES.includes(item.state) ? item.state : 'unavailable'))
          expect(room.ghosts.map((ghost) => [ghost.ghostId, ghost.state])).toEqual(here.map((item, index) => [item.ghost_id, states[index]]))
          expect(room.ghost).toBe(referenceHeadlineGhost(states))

          // `not_applicable` only where the room has no such thing upstream.
          expect(room.door === 'not_applicable').toBe(PHASE_INDEXES[id].length === 0)
          expect(room.ghost === 'not_applicable').toBe(here.length === 0)

          // Fail closed: mutation needs every upstream value this room depends on to be valid.
          const usesWorkflow = PHASE_INDEXES[id].length > 0 || (id === 'seance-room' && options.seanceRoom === 'enabled')
          const joinedRoom = joined.get(id)
          // A value that was read and is not a known state. An unread workflow is uncertain, not malformed.
          const malformed = (workflow !== null && doors.includes('unavailable')) || states.includes('unavailable')
          const upstreamValid =
            !usesWorkflow ||
            (workflow !== null &&
              workflow.integrity === 'valid' &&
              authority.canDecide &&
              !malformed &&
              (joinedRoom === undefined || (joinedRoom.gate.allowed && joinedRoom.integrity === 'valid')))
          const mayMutate =
            options.mode === 'live' &&
            id !== 'attic' &&
            !(id === 'seance-room' && options.seanceRoom !== 'enabled') &&
            (id !== 'foyer' || input.mansion.status === 'ready') &&
            !malformed &&
            upstreamValid
          expect(room.mutatingActionsEnabled).toBe(mayMutate)
          if (room.mutatingActionsEnabled) {
            enabledSeen += 1
            expect(room.integrity).toBe('valid')
            expect(room.diagnostic).toBeNull()
          }

          // Anything not valid: mutation off and a bounded, non-empty sentence saying why.
          if (usesWorkflow && !upstreamValid) {
            expect(room.mutatingActionsEnabled).toBe(false)
            expect(room.diagnostic).not.toBeNull()
          }
          if (room.integrity !== 'valid') expect(room.mutatingActionsEnabled).toBe(false)
          if (!room.mutatingActionsEnabled && id !== 'attic') expect(room.diagnostic).not.toBeNull()
          if (room.diagnostic !== null) {
            expect(room.diagnostic.trim()).not.toBe('')
            expect(Array.from(room.diagnostic).length).toBeLessThanOrEqual(MAX_DIAGNOSTIC_CODE_POINTS)
            expect(room.diagnostic).not.toMatch(/undefined|null|\[object/)
          }
          // An unreadable value is at least `incompatible`; a corrupt source stays the worse of the two.
          if (malformed) expect(['incompatible', 'corrupt']).toContain(room.integrity)
          if (usesWorkflow && workflow?.integrity === 'corrupt') expect(room.integrity === 'corrupt' || room.integrity === 'incompatible').toBe(true)
          expect(room.readOnly).toBe(options.mode === 'replay')
        }

        // The Attic reports the replay projection as given.
        expect(projection.replay.integrity).toBe(scenario.replay.integrity)
        expect(projection.replay.validRecordCount).toBe(scenario.replay.validRecordCount)
        expect(projection.replay.diagnostic === null).toBe(scenario.replay.integrity === 'valid' && scenario.replay.diagnostics.length === 0)

        // Deterministic.
        expect(buildHouseProjection(input, options)).toEqual(projection)
      }),
      { numRuns: 300 },
    )
    // The generator reaches rooms whose controls are on; the property is not vacuous.
    expect(enabledSeen).toBeGreaterThan(0)
  })
})
