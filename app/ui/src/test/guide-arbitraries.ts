// fast-check generators for the guide (Spec 8). A generated house goes through
// the real upstream derivations (`composeUpstream`, `buildHouseProjection`),
// once live and once as a recording, so a guide test reads what the page
// would read. Not shipped.
import fc from 'fast-check'
import { GHOST_STATES, type GhostSnapshot } from '../core/ghost-state'
import { REASON_COPY } from '../core/ghost-status'
import type { GuideContext } from '../core/house-guide'
import { buildHouseProjection, selectNeedsYouItems, type HouseProjection, type HouseSurfaceTarget, type RecoveryActionView } from '../core/house-projection'
import type { SeanceRoomSetting } from '../core/house-registry'
import type { PendingPermission, WorkflowProjection } from '../core/workflow-projection'
import { composeUpstream, snapshot } from './house-projection-kit'
import { projectionArb } from './workflow-arbitraries'

/** The ghosts a generated house may hold. `ghost-a` and `ghost-b` are bound to phases by the workflow generator. */
export const GUIDE_GHOST_IDS = ['archivist', 'draughtsman', 'foreman', 'tinker-1', 'tinker-2', 'tinker-3', 'ghost-a', 'ghost-b'] as const

/** Display names with no Kiro word, no banned phrase and no punctuation, as the house's own default names are. */
export const GUIDE_GHOST_NAMES: Readonly<Record<string, string>> = {
  archivist: 'Archivist',
  draughtsman: 'Draughtsman',
  foreman: 'Foreman',
  'tinker-1': 'Tinker 1',
  'tinker-2': 'Tinker 2',
  'tinker-3': 'Tinker 3',
  'ghost-a': 'Ghost A',
  'ghost-b': 'Ghost B',
}

/** What the upstream specs would hand over: the same for a live house and for its recording. */
export interface UpstreamCase {
  readonly workflow: WorkflowProjection
  readonly snapshots: readonly GhostSnapshot[]
  readonly seanceRoom: SeanceRoomSetting
  /** Rooms given a failed run that can be retried. Applied to both modes alike. */
  readonly retryRooms: readonly string[]
}

/** Reason codes the house writes that have no fixed copy: they are shown as their own words, Kiro's included. */
export const UNLISTED_REASONS = ['tasks_unreadable', 'requirements_unclear', 'artifact_invalid', 'design_missing'] as const

const permissionArb: fc.Arbitrary<PendingPermission> = fc.record({
  slot: fc.constantFrom('hh-archivist', 'hh-tinker-1'),
  mid: fc.stringMatching(/^[a-z0-9]{4}$/),
  requestedSequence: fc.integer({ min: 1, max: 500 }),
  toolName: fc.option(fc.constantFrom('fs_write', 'execute_bash'), { nil: null }),
  actionDigest: fc.constant(null),
  proposalId: fc.constant(null),
})

const snapshotsArb: fc.Arbitrary<readonly GhostSnapshot[]> = fc
  .uniqueArray(fc.tuple(fc.constantFrom(...GUIDE_GHOST_IDS), fc.constantFrom(...GHOST_STATES), fc.option(fc.constantFrom(...Object.keys(REASON_COPY), ...UNLISTED_REASONS), { nil: null })), {
    selector: ([ghostId]) => ghostId,
    maxLength: 6,
  })
  .map((rows) => rows.map(([ghostId, state, reason]) => snapshot(ghostId, state, { reason: state === 'blocked' || state === 'failed' ? reason : null })))

export const upstreamCaseArb: fc.Arbitrary<UpstreamCase> = fc.record({
  workflow: fc
    .tuple(projectionArb(), fc.uniqueArray(permissionArb, { maxLength: 2, selector: (permission) => `${permission.slot}:${permission.mid}` }))
    .map(([workflow, pendingPermissions]) => ({ ...workflow, pendingPermissions })),
  snapshots: snapshotsArb,
  seanceRoom: fc.constantFrom<SeanceRoomSetting>('hidden', 'locked'),
  retryRooms: fc.subarray(['study', 'drafting-room', 'workshop']),
})

/** The House Projection of a case, live or as a recording of the same facts. */
export function houseOfCase(upstream: UpstreamCase, mode: 'live' | 'replay'): HouseProjection {
  const { input } = composeUpstream({ workflow: upstream.workflow, snapshots: upstream.snapshots, ghostNames: GUIDE_GHOST_NAMES, readOnly: mode === 'replay' })
  const built = buildHouseProjection(input, { seanceRoom: upstream.seanceRoom, mode })
  // The joined Room Ghosts answer is not composed here, so a retry is added the way that answer would add it.
  const rooms = built.rooms.map((room) => {
    const failed = room.ghosts.find((ghost) => ghost.state === 'failed')
    if (failed === undefined || !upstream.retryRooms.includes(room.roomId)) return room
    const retry: RecoveryActionView = { runId: `${failed.ghostId}-run`, ghostId: failed.ghostId, label: `${failed.name} failed. A fresh attempt can be started.`, available: true }
    return { ...room, recoveryActions: [retry] }
  })
  return { ...built, rooms, needsYou: selectNeedsYouItems(rooms) }
}

/** Every surface that can be on top while one room is on show, and none. */
export function surfacesOf(projection: HouseProjection, roomId: string): readonly (HouseSurfaceTarget | null)[] {
  const room = projection.rooms.find((candidate) => candidate.roomId === roomId)
  if (room === undefined) return [null]
  return [
    null,
    { kind: 'room', roomId: room.roomId },
    ...room.ghosts.map((ghost): HouseSurfaceTarget => ({ kind: 'ghost', roomId: room.roomId, ghostId: ghost.ghostId })),
    ...room.doors.map((door): HouseSurfaceTarget => ({ kind: 'door', roomId: room.roomId, phase: door.phase, proposalId: door.proposalId })),
  ]
}

/** A guide context for some room of the house. */
export function contextArb(projection: HouseProjection): fc.Arbitrary<GuideContext> {
  return fc.constantFrom(...projection.rooms.map((room) => room.roomId)).chain((roomId) =>
    fc.record({
      roomId: fc.constant(roomId),
      surface: fc.constantFrom(...surfacesOf(projection, roomId)),
      task: fc.option(fc.record({ kind: fc.constant('revise' as const), phase: fc.constantFrom('requirements' as const, 'design' as const, 'tasks' as const), filled: fc.boolean() }), { nil: null }),
      quiet: fc.boolean(),
      words: fc.constantFrom('plain' as const, 'with-kiro' as const),
      reveal: fc.boolean(),
      mapOpen: fc.boolean(),
      canLeave: fc.boolean(),
    }),
  )
}

export interface GuideCase {
  readonly upstream: UpstreamCase
  readonly live: HouseProjection
  /** The same facts as a recording. It shows the same rooms as `live`. */
  readonly replay: HouseProjection
  readonly context: GuideContext
}

/** A house in both modes and a context valid for either. */
export const guideCaseArb: fc.Arbitrary<GuideCase> = upstreamCaseArb.chain((upstream) => {
  const live = houseOfCase(upstream, 'live')
  return contextArb(live).map((context) => ({ upstream, live, replay: houseOfCase(upstream, 'replay'), context }))
})
