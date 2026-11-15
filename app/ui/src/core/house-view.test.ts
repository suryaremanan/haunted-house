// House view model and reducer (Spec 4 tasks 13.1, 13.3; Requirements 4.8, 9.1 to 9.9).
import { describe, expect, it } from 'vitest'
import { SHA_A, SHA_B, decision, doorProposal, projection, riskyProposal } from '../test/workflow-arbitraries'
import type { GhostSnapshot } from './ghost-state'
import { INITIAL_HOUSE_STATE, authorizeCommand, reduceHouse } from './house-reducer'
import {
  ONE_ATTEMPT_TEXT,
  deriveAuthority,
  doorDecisionView,
  doorHint,
  houseRooms,
  moveRoom,
  needsYou,
  needsYouText,
  riskyDecisionView,
  roomOfGhost,
  startView,
  waitingAnnouncement,
  type Authority,
  type CanonicalHealth,
} from './house-view'
import { DOOR_STATUSES, PHASES, PHASE_STATUSES, RISKY_STATUSES } from './workflow-projection'

const OK: Authority = { canDecide: true, block: null, text: null }
const health = (overrides: Partial<CanonicalHealth> = {}): CanonicalHealth => ({
  loaded: true,
  catchingUp: false,
  highestSequence: 10,
  diagnostic: null,
  ...overrides,
})

function snapshot(ghostId: string, state: GhostSnapshot['state'], reason: string | null = null): GhostSnapshot {
  return {
    mansion_id: 'demo-mansion',
    ghost_id: ghostId,
    run_id: 'run-1',
    run_sequence: 0,
    state,
    pending_approvals: state === 'waiting' ? ['mid-1'] : [],
    open_tools: [],
    latest_event_id: null,
    latest_sequence: 1,
    reason,
  }
}

const waitingDoor = projection({
  waitingCount: 1,
  phaseOverrides: {
    requirements: {
      status: 'waiting',
      ghostIds: ['archivist'],
      door: { status: 'waiting', proposal: doorProposal('requirements', { artifactRevision: { revision: 3, sha256: SHA_A, sizeBytes: 2048 } }) },
    },
  },
})

describe('deriveAuthority', () => {
  const ready = { projection: projection(), projectionStatus: 'ready' as const, canonical: health() }

  it('allows decisions only when everything is current', () => {
    expect(deriveAuthority(ready)).toEqual(OK)
  })

  it.each([
    ['read_only', { ...ready, readOnly: true }],
    ['read_only', { ...ready, projection: projection({ readOnly: true }) }],
    ['loading', { ...ready, projection: null, projectionStatus: 'loading' as const }],
    ['unavailable', { ...ready, projection: null, projectionStatus: 'unavailable' as const }],
    ['unavailable', { ...ready, projectionStatus: 'unavailable' as const }],
    ['malformed', { ...ready, projectionStatus: 'malformed' as const }],
    ['integrity', { ...ready, projection: projection({ integrity: 'corrupt' }) }],
    ['uncertain', { ...ready, projection: projection({ integrity: 'uncertain' }) }],
    ['integrity', { ...ready, canonical: health({ diagnostic: { code: 'hash_mismatch', safe_detail: '' } }) }],
    ['uncertain', { ...ready, canonical: health({ diagnostic: { code: 'persistence_failed', safe_detail: '' } }) }],
    ['catching_up', { ...ready, canonical: health({ catchingUp: true }) }],
    ['catching_up', { ...ready, canonical: health({ loaded: false }) }],
    ['stale', { ...ready, canonical: health({ highestSequence: 11 }) }],
  ])('blocks decisions as %s', (block, input) => {
    const authority = deriveAuthority(input)
    expect(authority.canDecide).toBe(false)
    expect(authority.block).toBe(block)
    expect(authority.text).toMatch(/\.$/)
  })
})

describe('rooms', () => {
  it('shows phase, Door and ghost state as text for every room', () => {
    const rooms = houseRooms(waitingDoor, [snapshot('archivist', 'done'), snapshot('tinker-2', 'waiting'), snapshot('medium', 'idle')])
    expect(rooms.map((room) => room.id)).toEqual(['study', 'drafting-room', 'workshop'])
    expect(rooms[0].label).toBe(
      'Study. Requirements: Waiting for your decision, Door waiting for your decision. Archivist: Done. 1 thing needs you.',
    )
    expect(rooms[1].label).toBe('Drafting Room. Design: Not started, Sealed door. No ghost here yet.')
    expect(rooms[2].phases.map((line) => line.phase)).toEqual(['tasks', 'implementation'])
    expect(rooms[2].ghosts.map((ghost) => ghost.name)).toEqual(['Tinker 2'])
    expect(rooms[0].phases[0].doorHint).toBe('The requirements are ready. Approve or reject them to decide this door.')
  })

  it('still names the rooms and their ghosts before the projection loads', () => {
    const rooms = houseRooms(null, [snapshot('foreman', 'working')])
    expect(rooms[2].label).toBe('Workshop. State not loaded. Foreman: Working.')
  })

  it('has words for every phase status and door status', () => {
    for (const status of PHASE_STATUSES) {
      const rooms = houseRooms(projection({ phaseOverrides: { requirements: { status } } }), [])
      expect(rooms[0].phases[0].statusText).not.toBe('')
    }
    for (const phase of PHASES) for (const status of DOOR_STATUSES) expect(doorHint(phase, status)).toMatch(/\.$/)
    expect(doorHint('requirements', 'sealed')).toBe('Sealed door: approve the requirements to open it.')
  })

  it('places a ghost by the phase the backend bound it to, then by role', () => {
    const bound = projection({ phaseOverrides: { design: { ghostIds: ['helper-7'] } } })
    expect(roomOfGhost('helper-7', bound)).toBe('drafting-room')
    expect(roomOfGhost('tinker-3', bound)).toBe('workshop')
    expect(roomOfGhost('tinkerbell', bound)).toBeNull()
    expect(roomOfGhost('medium', null)).toBeNull()
  })

  it('moves between rooms and stops at the ends', () => {
    expect(moveRoom('study', 'next')).toBe('drafting-room')
    expect(moveRoom('workshop', 'next')).toBe('workshop')
    expect(moveRoom('study', 'previous')).toBe('study')
    expect(moveRoom('drafting-room', 'last')).toBe('workshop')
    expect(moveRoom('workshop', 'first')).toBe('study')
  })
})

describe('doorDecisionView', () => {
  it('shows path, revision, digest prefix and exact commands for a pending proposal', () => {
    const view = doorDecisionView(waitingDoor, waitingDoor.phases[0], OK, null)!
    expect(view).toMatchObject({
      state: 'pending',
      title: 'Requirements door',
      documentPath: '.kiro/specs/demo/requirements.md',
      revisionText: 'Revision 3',
      digestPrefix: 'aaaaaaaaaaaa',
      sizeText: '2,048 bytes',
      canApprove: true,
      canReject: true,
      outcomeText: null,
    })
    expect(view.approve).toEqual({
      kind: 'decide_door',
      decision: 'approve',
      proposalId: 'door-requirements-1',
      phase: 'requirements',
      documentPath: '.kiro/specs/demo/requirements.md',
      artifactRevision: { revision: 3, sha256: SHA_A, sizeBytes: 2048 },
      expectedVersion: 10,
    })
    expect(view.reject).toEqual({ ...view.approve, decision: 'reject' })
  })

  it('returns null for a Door without a proposal', () => {
    expect(doorDecisionView(waitingDoor, waitingDoor.phases[1], OK, null)).toBeNull()
  })

  it('disables both controls and says why when authority is withheld', () => {
    const blocked = deriveAuthority({ projection: waitingDoor, projectionStatus: 'ready', canonical: health({ catchingUp: true }) })
    const view = doorDecisionView(waitingDoor, waitingDoor.phases[0], blocked, null)!
    expect(view).toMatchObject({ canApprove: false, canReject: false, approve: null, reject: null })
    expect(view.blockedText).toMatch(/Catching up/)
  })

  it('disables controls while a command is in flight and marks only its own proposal busy', () => {
    expect(doorDecisionView(waitingDoor, waitingDoor.phases[0], OK, 'proposal:door-requirements-1')).toMatchObject({ canApprove: false, busy: true })
    expect(doorDecisionView(waitingDoor, waitingDoor.phases[0], OK, 'phase:design')).toMatchObject({ canApprove: false, busy: false })
  })

  it('removes controls and shows outcome and actor once decided', () => {
    for (const [actor, text] of [
      ['operator', 'Approved by the operator in Haunted House.'],
      ['crew', 'Approved in Crew, outside Haunted House.'],
    ] as const) {
      const decided = projection({
        phaseOverrides: {
          requirements: {
            status: 'approved',
            door: { status: 'open', proposal: doorProposal('requirements', { status: 'approved', decision: decision('approved', 4, actor) }) },
          },
        },
      })
      expect(doorDecisionView(decided, decided.phases[0], OK, null)).toMatchObject({
        state: 'approved',
        canApprove: false,
        canReject: false,
        approve: null,
        reject: null,
        blockedText: null,
        outcomeText: text,
      })
    }
  })

  it('explains a superseded proposal', () => {
    const superseded = projection({
      phaseOverrides: { requirements: { status: 'working', door: { status: 'sealed', proposal: doorProposal('requirements', { status: 'superseded' }) } } },
    })
    const view = doorDecisionView(superseded, superseded.phases[0], OK, null)!
    expect(view.state).toBe('superseded')
    expect(view.canApprove).toBe(false)
    expect(view.outcomeText).toMatch(/^Superseded/)
  })
})

describe('riskyDecisionView', () => {
  const pending = projection({ riskyProposals: [riskyProposal()] })

  it('shows the complete descriptor, scope, digest prefix and one-attempt wording', () => {
    const view = riskyDecisionView(pending, pending.riskyProposals[0], OK, null)
    expect(view.title).toBe('Run a command')
    expect(view.complete).toBe(true)
    expect(view.scope).toEqual([
      { label: 'Action', value: 'Run a command' },
      { label: 'Mansion', value: 'demo-mansion' },
      { label: 'Room', value: 'workshop' },
      { label: 'Session', value: 'hh-tinker-2-task-2' },
      { label: 'Working folder', value: 'The mansion folder' },
    ])
    expect(view.arguments).toEqual([
      { label: 'argv', value: '"bun" "test"' },
      { label: 'timeout_seconds', value: '120' },
    ])
    expect(view.paths).toEqual([
      { label: 'Command may read', value: 'src' },
      { label: 'Command may write', value: 'coverage' },
    ])
    expect(view.digestPrefix).toBe('bbbbbbbbbbbb')
    expect(view.oneAttemptText).toBe(ONE_ATTEMPT_TEXT)
    expect(view.approve).toEqual({ kind: 'decide_risky', decision: 'approve', proposalId: 'risky-1', actionDigest: SHA_B, expectedVersion: 10 })
    expect(view.reject).toEqual({ ...view.approve, decision: 'reject' })
  })

  it('disables approval and says blocked when the descriptor is redacted or incomplete', () => {
    const hidden = projection({ riskyProposals: [riskyProposal({ descriptor: null })] })
    const view = riskyDecisionView(hidden, hidden.riskyProposals[0], OK, null)
    expect(view).toMatchObject({ complete: false, canApprove: false, approve: null, canReject: true })
    expect(view.blockedText).toMatch(/^Blocked:/)
    expect(view.reject).toMatchObject({ decision: "reject" })
  })

  it('has status text for every outcome and offers no control once resolved', () => {
    for (const status of RISKY_STATUSES) {
      if (status === 'pending') continue
      const made = status === 'superseded' ? null : decision(status === 'rejected' ? 'rejected' : 'approved', 5, 'crew')
      const resolved = projection({ riskyProposals: [riskyProposal({ status, decision: made })] })
      const view = riskyDecisionView(resolved, resolved.riskyProposals[0], OK, null)
      expect(view.statusText).not.toBe('')
      expect(view).toMatchObject({ canApprove: false, canReject: false, approve: null, reject: null })
      if (made !== null) expect(view.outcomeText).toMatch(/in Crew, outside Haunted House\.$/)
    }
  })
})

describe('startView', () => {
  it('offers an explicit start only for a ready, failed or revision-required phase', () => {
    for (const status of PHASE_STATUSES) {
      const value = projection({ phaseOverrides: { design: { status } } })
      const view = startView(value, value.phases[1], OK, null)
      if (status === 'ready' || status === 'failed' || status === 'revision_required') {
        expect(view?.command).toEqual({ kind: 'start_phase', phase: 'design', expectedVersion: 10 })
      } else {
        expect(view).toBeNull()
      }
    }
  })

  it('is disabled without authority', () => {
    const value = projection()
    const view = startView(value, value.phases[0], { canDecide: false, block: 'stale', text: 'x' }, null)
    expect(view).toMatchObject({ label: 'Start requirements', enabled: false, command: null })
  })
})

describe('needsYou', () => {
  const busy = projection({
    phaseOverrides: waitingDoor.phases.reduce((all, phase) => ({ ...all, [phase.phase]: phase }), {}),
    riskyProposals: [
      riskyProposal(),
      riskyProposal({ proposalId: 'risky-2', status: 'approved', decision: decision('approved', 3) }),
      riskyProposal({ proposalId: 'risky-3', descriptor: null, ghostId: 'tinker-3' }),
    ],
    pendingPermissions: [
      { slot: 's', mid: 'm1', requestedSequence: 9, toolName: 'execute_approved_action', actionDigest: SHA_B, proposalId: 'risky-1' },
      { slot: 's', mid: 'm2', requestedSequence: 9, toolName: 'fs_write', actionDigest: null, proposalId: null },
    ],
  })

  it('lists pending Doors, pending risky proposals and unmatched Crew prompts, once each', () => {
    expect(needsYou(busy).map((item) => [item.id, item.room, item.text])).toEqual([
      ['door:door-requirements-1', 'study', 'The requirements door needs your decision.'],
      ['risky:risky-1', 'workshop', 'Tinker 2 asks to run a command.'],
      ['risky:risky-3', 'workshop', 'Tinker 3 asks to do something risky.'],
      ['permission:["s","m2"]', null, 'A ghost is waiting on a Crew tool prompt (fs_write). Answer it in Crew.'],
    ])
    expect(needsYou(null)).toEqual([])
    expect(needsYou(projection())).toEqual([])
  })

  it('counts an uncorrelated Crew prompt in the session of a pending proposal as that proposal', () => {
    const prompt = { slot: 'hh-tinker-2-task-2', mid: 'm3', requestedSequence: 9, toolName: null, actionDigest: null, proposalId: null }
    const pending = projection({ riskyProposals: [riskyProposal()], pendingPermissions: [prompt] })
    expect(needsYou(pending).map((item) => item.id)).toEqual(['risky:risky-1'])
    // Once that proposal is decided, a prompt still open there is its own thing to answer.
    const decided = projection({
      riskyProposals: [riskyProposal({ status: 'rejected', decision: decision('rejected', 3) })],
      pendingPermissions: [prompt],
    })
    expect(needsYou(decided).map((item) => [item.id, item.text])).toEqual([
      ['permission:["hh-tinker-2-task-2","m3"]', 'A ghost is waiting on a Crew tool prompt. Answer it in Crew.'],
    ])
  })

  it('uses given ghost names', () => {
    expect(needsYou(busy, { 'tinker-2': 'Pip' })[1].text).toBe('Pip asks to run a command.')
  })

  it('words the count', () => {
    expect([0, 1, 4].map(needsYouText)).toEqual(['Nothing needs you', '1 thing needs you', '4 things need you'])
  })

  it('announces each new item once and merges several into one message', () => {
    const items = needsYou(busy)
    const first = waitingAnnouncement(items.slice(0, 1), new Set())
    expect(first).toEqual({ seen: ['door:door-requirements-1'], message: 'The requirements door needs your decision.' })
    const rest = waitingAnnouncement(items, new Set(first.seen))
    expect(rest.seen).toHaveLength(3)
    expect(rest.message).toMatch(/^3 things need you\. Tinker 2 asks to run a command\./)
    expect(waitingAnnouncement(items, new Set(items.map((item) => item.id)))).toEqual({ seen: [], message: null })
  })
})

describe('reduceHouse', () => {
  it('keeps the newest projection and ignores a late older one', () => {
    const newer = projection({ version: 12 })
    let state = reduceHouse(INITIAL_HOUSE_STATE, { type: 'projection_received', projection: newer })
    state = reduceHouse(state, { type: 'projection_received', projection: projection({ version: 9 }) })
    expect(state.projection).toBe(newer)
    expect(state.projectionStatus).toBe('ready')
  })

  it('keeps the last projection for reading when a later one is malformed or unavailable', () => {
    const ready = reduceHouse(INITIAL_HOUSE_STATE, { type: 'projection_received', projection: waitingDoor })
    const refused = reduceHouse(ready, { type: 'projection_refused' })
    expect(refused.projection).toBe(waitingDoor)
    expect(refused.projectionStatus).toBe('malformed')
    expect(reduceHouse(ready, { type: 'projection_unavailable' }).projectionStatus).toBe('unavailable')
    // A good projection restores it.
    expect(reduceHouse(refused, { type: 'projection_received', projection: waitingDoor }).projectionStatus).toBe('ready')
  })

  it('tracks focus, the open room, and one command in flight', () => {
    let state = reduceHouse(INITIAL_HOUSE_STATE, { type: 'room_moved', direction: 'next' })
    expect(state.focusedRoom).toBe('drafting-room')
    state = reduceHouse(state, { type: 'room_opened', room: 'workshop' })
    expect(state).toMatchObject({ focusedRoom: 'workshop', openRoom: 'workshop' })
    state = reduceHouse(state, { type: 'room_closed' })
    expect(state).toMatchObject({ focusedRoom: 'workshop', openRoom: null })
    state = reduceHouse(state, { type: 'command_sent', target: 'phase:design' })
    expect(state.inFlight).toBe('phase:design')
    state = reduceHouse(state, { type: 'command_settled', notice: 'Design started.' })
    expect(state).toMatchObject({ inFlight: null, notice: 'Design started.' })
    expect(reduceHouse(state, { type: 'notice_dismissed' }).notice).toBeNull()
  })
})

describe('authorizeCommand', () => {
  const state = reduceHouse(INITIAL_HOUSE_STATE, { type: 'projection_received', projection: waitingDoor })
  const view = doorDecisionView(waitingDoor, waitingDoor.phases[0], OK, null)!

  it('passes the exact command the panel built', () => {
    expect(authorizeCommand(state, OK, view.approve!)).toBe(view.approve)
    expect(authorizeCommand(state, OK, { kind: 'start_phase', phase: 'requirements', expectedVersion: 10 })).toBeNull()
  })

  it('refuses a stale revision, digest, path, proposal, phase or version', () => {
    const command = view.approve as Extract<typeof view.approve, { kind: 'decide_door' }>
    const stale = [
      { ...command, expectedVersion: 9 },
      { ...command, proposalId: 'door-requirements-0' },
      { ...command, phase: 'design' as const },
      { ...command, documentPath: '.kiro/specs/demo/design.md' },
      { ...command, artifactRevision: { ...command.artifactRevision, revision: 2 } },
      { ...command, artifactRevision: { ...command.artifactRevision, sha256: SHA_B } },
      { ...command, artifactRevision: { ...command.artifactRevision, sizeBytes: 1 } },
    ]
    for (const item of stale) expect(authorizeCommand(state, OK, item)).toBeNull()
  })

  it('refuses everything without a ready projection or authority', () => {
    expect(authorizeCommand(INITIAL_HOUSE_STATE, OK, view.approve!)).toBeNull()
    expect(authorizeCommand(reduceHouse(state, { type: 'projection_refused' }), OK, view.approve!)).toBeNull()
    expect(authorizeCommand(state, { canDecide: false, block: 'uncertain', text: 'x' }, view.approve!)).toBeNull()
  })

  it('lets a ready phase start and refuses a phase that is not startable', () => {
    const ready = reduceHouse(INITIAL_HOUSE_STATE, { type: 'projection_received', projection: projection() })
    const start = { kind: 'start_phase', phase: 'requirements', expectedVersion: 10 } as const
    expect(authorizeCommand(ready, OK, start)).toBe(start)
    expect(authorizeCommand(ready, OK, { ...start, phase: 'design' })).toBeNull()
  })
})
