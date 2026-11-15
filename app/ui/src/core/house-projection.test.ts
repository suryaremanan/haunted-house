import { describe, expect, it } from 'vitest'
import {
  ATTIC_TEXT,
  INTEGRITY_TEXT,
  LOCKED_SEANCE_TEXT,
  READ_ONLY_TEXT,
  UNPLACED_ACTION_ROOM,
  buildHouseProjection,
  doorAccessibleName,
  ghostAccessibleName,
  houseRoomOfGhost,
  needsYouTarget,
  roomAccessibleName,
  surfaceKey,
  surfaceStillOpen,
  worseIntegrity,
  type HouseOptions,
  type OpenSurface,
  type RoomPresentation,
} from './house-projection'
import { needsYou } from './house-view'
import { composeUpstream, snapshot } from '../test/house-projection-kit'
import { artifact, document, roomGhosts, run } from '../test/room-kit'
import { SHA_A, decision, doorProposal, projection, riskyProposal } from '../test/workflow-arbitraries'

const LIVE: HouseOptions = { seanceRoom: 'hidden', mode: 'live' }

function roomOf(rooms: readonly RoomPresentation[], id: string): RoomPresentation {
  return rooms.find((room) => room.roomId === id)!
}

describe('buildHouseProjection: a quiet, valid house', () => {
  const workflow = projection()
  const { input } = composeUpstream({ workflow, roomGhosts: roomGhosts({ version: workflow.version }) })
  const house = buildHouseProjection(input, LIVE)

  it('shows the five MVP rooms in Room order with exact upstream states', () => {
    expect(house.mansionName).toBe('demo-mansion')
    expect(house.rooms.map((room) => [room.roomId, room.name, room.phase, room.door, room.ghost])).toEqual([
      ['foyer', 'Foyer', 'navigation', 'not_applicable', 'not_applicable'],
      ['study', 'Study', 'requirements', 'sealed', 'not_applicable'],
      ['drafting-room', 'Drafting Room', 'design', 'sealed', 'not_applicable'],
      ['workshop', 'Workshop', 'tasks-and-implementation', 'sealed', 'not_applicable'],
      ['attic', 'Attic', 'replay', 'not_applicable', 'not_applicable'],
    ])
    expect(roomOf(house.rooms, 'workshop').doors.map((door) => [door.phase, door.state, door.text])).toEqual([
      ['tasks', 'sealed', 'Sealed door'],
      ['implementation', 'sealed', 'Sealed door'],
    ])
  })

  it('enables mutation where a room has one and says nothing is wrong', () => {
    for (const id of ['foyer', 'study', 'drafting-room', 'workshop']) {
      const room = roomOf(house.rooms, id)
      expect([id, room.integrity, room.mutatingActionsEnabled, room.diagnostic]).toEqual([id, 'valid', true, null])
    }
    // The Attic only shows the record; it has nothing to enable.
    expect(roomOf(house.rooms, 'attic')).toMatchObject({ integrity: 'valid', mutatingActionsEnabled: false, diagnostic: null })
    expect(house.needsYou).toEqual([])
    expect(house.replay).toEqual({ integrity: 'valid', validRecordCount: 0, diagnostic: null })
  })
})

describe('buildHouseProjection: Séance Room setting', () => {
  const workflow = projection()
  const { input } = composeUpstream({ workflow, snapshots: [snapshot('medium', 'working')] })

  it('omits the room when hidden', () => {
    expect(buildHouseProjection(input, { seanceRoom: 'hidden', mode: 'live' }).rooms.map((room) => room.roomId)).not.toContain('seance-room')
  })

  it('shows a locked room after the Attic that explains itself and can change nothing', () => {
    const house = buildHouseProjection(input, { seanceRoom: 'locked', mode: 'live' })
    expect(house.rooms.map((room) => room.roomId).slice(-2)).toEqual(['attic', 'seance-room'])
    expect(roomOf(house.rooms, 'seance-room')).toMatchObject({
      locked: true,
      mutatingActionsEnabled: false,
      diagnostic: LOCKED_SEANCE_TEXT,
      door: 'not_applicable',
      waitingItems: [],
      recoveryActions: [],
    })
  })

  it('shows the room in use when enabled, without changing any MVP room', () => {
    const enabled = buildHouseProjection(input, { seanceRoom: 'enabled', mode: 'live' })
    const hidden = buildHouseProjection(input, { seanceRoom: 'hidden', mode: 'live' })
    expect(roomOf(enabled.rooms, 'seance-room')).toMatchObject({ locked: false, ghost: 'working', mutatingActionsEnabled: true, diagnostic: null })
    expect(enabled.rooms.slice(0, 5)).toEqual(hidden.rooms)
  })
})

describe('buildHouseProjection: states pass through unchanged', () => {
  it('names the Door in front of the Operator and the ghost that most needs attention', () => {
    const workflow = projection({
      phaseOverrides: {
        requirements: { status: 'approved', door: { status: 'open', proposal: doorProposal('requirements', { status: 'approved', decision: decision('approved', 4) }) } },
        design: { status: 'revision_required', door: { status: 'rejected', proposal: doorProposal('design', { status: 'rejected', decision: decision('rejected', 6) }) } },
        tasks: { status: 'approved', door: { status: 'open', proposal: doorProposal('tasks', { status: 'approved', decision: decision('approved', 8) }) } },
        implementation: { status: 'working', ghostIds: ['helper'] },
      },
    })
    const { input } = composeUpstream({
      workflow,
      snapshots: [
        snapshot('archivist', 'done'),
        snapshot('draughtsman', 'idle'),
        snapshot('foreman', 'done'),
        snapshot('tinker-1', 'working'),
        snapshot('tinker-2', 'blocked', { reason: 'stalled' }),
        // Bound to implementation by the backend, so it lives in the Workshop whatever its name.
        snapshot('helper', 'waiting', { pending_approvals: ['m1'] }),
        // The house operator's own scope is not a ghost.
        snapshot('house-operator', 'working'),
        // A ghost of no room is shown nowhere.
        snapshot('stranger', 'failed'),
      ],
    })
    const house = buildHouseProjection(input, LIVE)
    expect(house.rooms.map((room) => [room.roomId, room.door, room.ghost])).toEqual([
      ['foyer', 'not_applicable', 'not_applicable'],
      ['study', 'open', 'done'],
      ['drafting-room', 'rejected', 'idle'],
      // Tasks is open, so the implementation Door is the one in front of the Operator.
      ['workshop', 'sealed', 'blocked'],
      ['attic', 'not_applicable', 'not_applicable'],
    ])
    const workshop = roomOf(house.rooms, 'workshop')
    expect(workshop.ghosts.map((ghost) => [ghost.ghostId, ghost.name, ghost.state])).toEqual([
      ['foreman', 'Foreman', 'done'],
      ['tinker-1', 'Tinker 1', 'working'],
      ['tinker-2', 'Tinker 2', 'blocked'],
      ['helper', 'Helper', 'waiting'],
    ])
    expect(workshop.ghosts[2].reason).toBe('The run stalled.')
    expect(workshop.ghosts[3].pendingText).toBe('1 approval pending')
    // A blocked ghost with no action attached is ambient: nothing needs the Operator.
    expect(house.needsYou).toEqual([])
  })

  it('places a ghost by its bound phase, then its role, then a stretch role', () => {
    const workflow = projection({ phaseOverrides: { design: { ghostIds: ['tinker-9'] } } })
    expect(houseRoomOfGhost('tinker-9', workflow)).toBe('drafting-room')
    expect(houseRoomOfGhost('tinker-9', null)).toBe('workshop')
    expect(houseRoomOfGhost('medium', workflow)).toBe('seance-room')
    expect(houseRoomOfGhost('stranger', workflow)).toBeNull()
  })

  it('shows an unread workflow as unavailable, never as a Door state', () => {
    const { input } = composeUpstream({ workflow: null, workflowStatus: 'unavailable' })
    const study = roomOf(buildHouseProjection(input, LIVE).rooms, 'study')
    expect(study).toMatchObject({ door: 'unavailable', integrity: 'uncertain', mutatingActionsEnabled: false })
    expect(study.diagnostic).toBe('The house could not be reached. Decisions are off until it answers.')
    expect(roomAccessibleName(study)).toBe('Study. Phase: requirements. Door: unavailable. Ghost: not applicable.')
  })
})

describe('buildHouseProjection: fails closed', () => {
  const workflow = projection()

  it.each([
    ['a corrupt workflow', composeUpstream({ workflow: projection({ integrity: 'corrupt' }) }), 'corrupt'],
    ['an uncertain workflow', composeUpstream({ workflow: projection({ integrity: 'uncertain' }) }), 'uncertain'],
    ['a malformed answer', composeUpstream({ workflow, workflowStatus: 'malformed' }), 'incompatible'],
    ['a log that is still catching up', composeUpstream({ workflow, canonical: { loaded: true, catchingUp: true, highestSequence: 10, diagnostic: null } }), 'uncertain'],
    ['a screen behind the log', composeUpstream({ workflow, canonical: { loaded: true, catchingUp: false, highestSequence: 99, diagnostic: null } }), 'uncertain'],
    ['a corrupt room answer', composeUpstream({ workflow, roomGhosts: roomGhosts({ version: 10, integrity: 'corrupt' }) }), 'corrupt'],
    ['a room answer from another moment', composeUpstream({ workflow, roomGhosts: roomGhosts({ version: 11 }) }), 'uncertain'],
    ['a room answer this page cannot read', composeUpstream({ workflow, roomGhosts: null, roomGhostsStatus: 'malformed' }), 'incompatible'],
  ] as const)('turns the workflow rooms off for %s', (_name, { input }, integrity) => {
    const house = buildHouseProjection(input, LIVE)
    for (const id of ['study', 'drafting-room', 'workshop']) {
      const room = roomOf(house.rooms, id)
      expect([id, room.integrity, room.mutatingActionsEnabled]).toEqual([id, integrity, false])
      expect(room.diagnostic).not.toBeNull()
      expect(Array.from(room.diagnostic!).length).toBeLessThanOrEqual(240)
    }
    // The valid prefix stays visible: Door states are still the upstream ones.
    expect(roomOf(house.rooms, 'study').door).toBe('sealed')
    // The Foyer and its way back do not depend on workflow state.
    expect(roomOf(house.rooms, 'foyer')).toMatchObject({ integrity: 'valid', mutatingActionsEnabled: true })
  })

  it('uses the fixed sentence for a state value no contract defines', () => {
    const { input } = composeUpstream({ workflow, snapshots: [snapshot('archivist', 'haunting' as never)] })
    const study = roomOf(buildHouseProjection(input, LIVE).rooms, 'study')
    expect(study).toMatchObject({ ghost: 'unavailable', integrity: 'incompatible', mutatingActionsEnabled: false, diagnostic: INTEGRITY_TEXT.incompatible })
    expect(study.ghosts).toEqual([{ ghostId: 'archivist', name: 'archivist', state: 'unavailable', reason: null, pendingText: null }])
  })

  it('keeps pending decisions counted while their controls are off', () => {
    const waiting = projection({
      integrity: 'uncertain',
      phaseOverrides: { requirements: { status: 'waiting', ghostIds: ['archivist'], door: { status: 'waiting', proposal: doorProposal('requirements') } } },
    })
    const house = buildHouseProjection(composeUpstream({ workflow: waiting }).input, LIVE)
    expect(roomOf(house.rooms, 'study').mutatingActionsEnabled).toBe(false)
    expect(house.needsYou.map((item) => item.id)).toEqual(['door:door-requirements-1'])
  })

  it('reports a mansion whose folder is no longer ready on the Foyer only', () => {
    const { input } = composeUpstream({ workflow, mansion: { name: 'demo-mansion', projectSpec: 'demo', displayPath: '~/x', status: 'missing' } })
    const house = buildHouseProjection(input, LIVE)
    expect(roomOf(house.rooms, 'foyer')).toMatchObject({ integrity: 'uncertain', mutatingActionsEnabled: false })
    expect(roomOf(house.rooms, 'study').mutatingActionsEnabled).toBe(true)
  })

  it('orders integrity from valid to corrupt', () => {
    expect(worseIntegrity('valid', 'uncertain')).toBe('uncertain')
    expect(worseIntegrity('incompatible', 'uncertain')).toBe('incompatible')
    expect(worseIntegrity('incompatible', 'corrupt')).toBe('corrupt')
    expect(worseIntegrity('valid', 'valid')).toBe('valid')
  })
})

describe('buildHouseProjection: Needs You', () => {
  const workflow = projection({
    version: 12,
    phaseOverrides: {
      requirements: { status: 'approved', door: { status: 'open', proposal: doorProposal('requirements', { status: 'approved', decision: decision('approved', 3) }) } },
      design: { status: 'waiting', ghostIds: ['draughtsman'], door: { status: 'waiting', proposal: doorProposal('design') } },
    },
    riskyProposals: [
      riskyProposal({ proposalId: 'risky-1', ghostId: 'tinker-2' }),
      riskyProposal({ proposalId: 'risky-0', ghostId: 'tinker-1', status: 'rejected', decision: decision('rejected', 9) }),
    ],
    pendingPermissions: [{ slot: 'hh-other', mid: 'm7', requestedSequence: 11, toolName: 'fs_write', actionDigest: null, proposalId: null }],
  })

  it('carries exactly the decisions Spec 4 reports, in Room order', () => {
    const house = buildHouseProjection(composeUpstream({ workflow }).input, LIVE)
    expect(house.needsYou.map((item) => [item.kind, item.id, item.roomId, item.ghostId])).toEqual([
      // A Crew prompt no room can be named for is shown in the hall.
      ['tool-decision', 'permission:["hh-other","m7"]', UNPLACED_ACTION_ROOM, null],
      ['door-decision', 'door:door-design-1', 'drafting-room', 'draughtsman'],
      ['risky-decision', 'risky:risky-1', 'workshop', 'tinker-2'],
    ])
    // The same actions Spec 4 counts: no second selection, no extra item.
    expect(house.needsYou.map((item) => item.id).sort()).toEqual(needsYou(workflow).map((item) => item.id).sort())
    expect(needsYouTarget(house.needsYou)).toBe('foyer')
    expect(roomOf(house.rooms, 'drafting-room').doors[0].proposalId).toBe('door-design-1')
    for (const item of house.needsYou) expect(Array.from(item.label).length).toBeLessThanOrEqual(160)
  })

  it('adds a failed run only when the backend offers a fresh attempt', () => {
    const quiet = projection({ version: 10, phaseOverrides: { requirements: { status: 'failed', ghostIds: ['archivist'] } } })
    const failed = [snapshot('archivist', 'failed', { run_id: 'requirements-1' })]
    const answer = (canRetry: boolean) =>
      roomGhosts({
        version: 10,
        documents: [document('requirements', { artifact: artifact({ artifactRevision: { revision: 1, sha256: SHA_A, sizeBytes: 10 } }) }), document('design'), document('tasks')],
        runs: [run({ runId: 'requirements-1', ghostId: 'archivist', canRetry })],
      })

    const offered = buildHouseProjection(composeUpstream({ workflow: quiet, snapshots: failed, roomGhosts: answer(true) }).input, LIVE)
    expect(offered.needsYou).toEqual([
      {
        id: 'requirements-1',
        kind: 'failed-run-recovery',
        roomId: 'study',
        ghostId: 'archivist',
        label: 'Archivist failed. A fresh attempt can be started.',
        actionAvailable: true,
      },
    ])

    const exhausted = buildHouseProjection(composeUpstream({ workflow: quiet, snapshots: failed, roomGhosts: answer(false) }).input, LIVE)
    expect(roomOf(exhausted.rooms, 'study').recoveryActions).toEqual([
      { runId: 'requirements-1', ghostId: 'archivist', label: 'Archivist failed. A fresh attempt can be started.', available: false },
    ])
    expect(exhausted.needsYou).toEqual([])
  })
})

describe('buildHouseProjection: replay', () => {
  const recording = projection({
    readOnly: true,
    phaseOverrides: { requirements: { status: 'waiting', ghostIds: ['archivist'], door: { status: 'waiting', proposal: doorProposal('requirements') } } },
  })

  it('shows the same rooms and count, read-only', () => {
    const snapshots = [snapshot('archivist', 'waiting')]
    const live = buildHouseProjection(composeUpstream({ workflow: { ...recording, readOnly: false }, snapshots }).input, LIVE)
    const replay = buildHouseProjection(composeUpstream({ workflow: recording, snapshots, readOnly: true }).input, { seanceRoom: 'hidden', mode: 'replay' })

    const shown = (rooms: readonly RoomPresentation[]) => rooms.map((room) => [room.roomId, room.door, room.ghost, roomAccessibleName(room)])
    expect(shown(replay.rooms)).toEqual(shown(live.rooms))
    expect(replay.needsYou).toEqual(live.needsYou)
    for (const room of replay.rooms) {
      expect([room.roomId, room.readOnly, room.mutatingActionsEnabled, room.diagnostic]).toEqual([room.roomId, true, false, READ_ONLY_TEXT])
    }
  })

  it('reports a replay problem on the Attic with the valid prefix count', () => {
    const { input } = composeUpstream({
      workflow: recording,
      readOnly: true,
      replay: {
        integrity: 'incompatible',
        validRecordCount: 41,
        diagnostics: [{ code: 'integrity_failed', line: 42, safeDetail: 'The log failed its integrity check. Only the records before the failure are replayed.' }],
      },
    })
    const house = buildHouseProjection(input, { seanceRoom: 'hidden', mode: 'replay' })
    expect(house.replay).toEqual({
      integrity: 'incompatible',
      validRecordCount: 41,
      diagnostic: 'The log failed its integrity check. Only the records before the failure are replayed.',
    })
    expect(roomOf(house.rooms, 'attic')).toMatchObject({ integrity: 'incompatible', mutatingActionsEnabled: false, diagnostic: ATTIC_TEXT.incompatible })
  })
})

describe('control names and surfaces', () => {
  const workflow = projection({ phaseOverrides: { tasks: { ghostIds: ['foreman'] } } })
  const house = buildHouseProjection(composeUpstream({ workflow, snapshots: [snapshot('foreman', 'working')] }).input, LIVE)
  const workshop = roomOf(house.rooms, 'workshop')

  it('names Ghost and Door controls with the exact state word', () => {
    expect(ghostAccessibleName(workshop, workshop.ghosts[0])).toBe('Foreman, ghost in the Workshop. State: working.')
    expect(doorAccessibleName(workshop, workshop.doors[1])).toBe('Implementation door of the Workshop. State: sealed.')
  })

  it('gives each control a stable key and closes a surface whose target is gone', () => {
    const room: OpenSurface = { target: { kind: 'room', roomId: 'workshop' }, openerKey: surfaceKey({ kind: 'room', roomId: 'workshop' }) }
    const ghost: OpenSurface = { target: { kind: 'ghost', roomId: 'workshop', ghostId: 'foreman' }, openerKey: 'x' }
    const gone: OpenSurface = { target: { kind: 'ghost', roomId: 'workshop', ghostId: 'tinker-3' }, openerKey: 'x' }
    const seance: OpenSurface = { target: { kind: 'room', roomId: 'seance-room' }, openerKey: 'x' }
    const door: OpenSurface = { target: { kind: 'door', roomId: 'workshop', phase: 'tasks', proposalId: null }, openerKey: 'x' }

    expect(surfaceStillOpen(room, house)).toBe(room)
    expect(surfaceStillOpen(ghost, house)).toBe(ghost)
    expect(surfaceStillOpen(door, house)).toBe(door)
    expect(surfaceStillOpen(gone, house)).toBeNull()
    expect(surfaceStillOpen(seance, house)).toBeNull()
    expect(surfaceStillOpen(null, house)).toBeNull()

    // The key does not change when a Door's proposal changes, so focus can return to the same control.
    expect(surfaceKey({ kind: 'door', roomId: 'study', phase: 'requirements', proposalId: 'a' })).toBe(
      surfaceKey({ kind: 'door', roomId: 'study', phase: 'requirements', proposalId: null }),
    )
    expect(new Set([surfaceKey(room.target), surfaceKey(ghost.target), surfaceKey(door.target)]).size).toBe(3)
  })
})
