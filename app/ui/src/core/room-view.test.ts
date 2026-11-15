// The joined Room_Projection and its gate (Spec 5 tasks 9.1 and 9.7).
// **Validates: Requirements 10.4, 10.5, 10.6, 11.1, 11.2, 12.1, 12.5, 12.6**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { GhostSnapshot, GhostState } from './ghost-state'
import { deriveAuthority, houseRooms, type Authority, type RoomId } from './house-view'
import type { RoomGhosts } from './room-projection'
import {
  MAX_FEEDBACK_CHARACTERS,
  authorizeRoomCommand,
  checkFeedback,
  deriveRoomGate,
  joinRoomProjection,
  reviewView,
  roomCommandTarget,
  workshopStartCommand,
  type RoomCommand,
  type RoomGhostsStatus,
  type RoomProjection,
} from './room-view'
import type { WorkflowProjection } from './workflow-projection'
import { SPEC, artifact, document, roomGhosts, run, workshopAtWork } from '../test/room-kit'
import { MANSION, SHA_A, SHA_B, decision, doorProposal, projection } from '../test/workflow-arbitraries'

const CAN: Authority = { canDecide: true, block: null, text: null }
const CANNOT: Authority = { canDecide: false, block: 'stale', text: 'Something changed in the house. Refreshing before you decide.' }

function snapshot(ghostId: string, state: GhostState, runId: string | null = `${ghostId}-run`): GhostSnapshot {
  return {
    mansion_id: MANSION,
    ghost_id: ghostId,
    run_id: runId,
    run_sequence: 0,
    state,
    pending_approvals: [],
    open_tools: [],
    latest_event_id: null,
    latest_sequence: 1,
    reason: null,
  }
}

function join(
  roomId: RoomId,
  options: {
    workflow?: WorkflowProjection | null
    answer?: RoomGhosts | null
    status?: RoomGhostsStatus
    authority?: Authority
    snapshots?: readonly GhostSnapshot[]
    inFlight?: string | null
  } = {},
): RoomProjection {
  const workflow = options.workflow === undefined ? projection() : options.workflow
  const snapshots = new Map((options.snapshots ?? []).map((item) => [item.ghost_id, item]))
  const room = houseRooms(workflow, snapshots.values()).find((item) => item.id === roomId)!
  const answer = options.answer === undefined ? roomGhosts() : options.answer
  return joinRoomProjection({
    room,
    specName: SPEC,
    projection: workflow,
    snapshots,
    roomGhosts: answer,
    roomGhostsStatus: options.status ?? (answer === null ? 'unavailable' : 'ready'),
    authority: options.authority ?? CAN,
    inFlight: options.inFlight ?? null,
  })
}

/** Requirements written and waiting at their Door, version 10 on both sides. */
const waitingWorkflow = projection({
  phaseOverrides: {
    requirements: {
      status: 'waiting',
      ghostIds: ['archivist'],
      door: { status: 'waiting', proposal: doorProposal('requirements', { artifactRevision: { revision: 1, sha256: SHA_A, sizeBytes: 1200 } }) },
    },
  },
})
const waitingAnswer = roomGhosts({
  documents: [document('requirements', { artifact: artifact() }), document('design'), document('tasks')],
  runs: [run({ summary: 'Wrote 2 EARS criteria\nand a glossary.', sessionLink: 'hh-archivist-requirements-1' })],
})

describe('deriveRoomGate', () => {
  const base = { projection: projection(), roomGhosts: roomGhosts(), roomGhostsStatus: 'ready' as const, authority: CAN }

  it('allows mutations only when every source agrees', () => {
    expect(deriveRoomGate(base)).toEqual({ allowed: true, block: null, text: null, needsRefresh: false })
  })

  it('passes on the Spec 4 authority text when decisions are off', () => {
    expect(deriveRoomGate({ ...base, authority: CANNOT })).toMatchObject({ allowed: false, block: 'authority', text: CANNOT.text, needsRefresh: false })
  })

  it.each<[RoomGhostsStatus, RoomGhosts | null, string]>([
    ['loading', null, 'loading'],
    ['unavailable', null, 'unavailable'],
    ['malformed', null, 'malformed'],
    ['malformed', roomGhosts(), 'malformed'],
    ['unavailable', roomGhosts(), 'unavailable'],
  ])('withholds mutations while the answer is %s', (roomGhostsStatus, answer, block) => {
    const gate = deriveRoomGate({ ...base, roomGhosts: answer, roomGhostsStatus })
    expect(gate).toMatchObject({ allowed: false, block })
    expect(gate.text).not.toBeNull()
  })

  it('withholds mutations on a recording, whatever else is true', () => {
    expect(deriveRoomGate({ ...base, roomGhosts: roomGhosts({ readOnly: true }) })).toMatchObject({ allowed: false, block: 'read_only', needsRefresh: false })
  })

  it('withholds mutations and asks for a fresh read on a version mismatch', () => {
    for (const version of [9, 11]) {
      expect(deriveRoomGate({ ...base, roomGhosts: roomGhosts({ version }) })).toMatchObject({ allowed: false, block: 'mismatch', needsRefresh: true })
    }
  })

  it('withholds mutations on an integrity failure or an integrity mismatch', () => {
    expect(deriveRoomGate({ ...base, roomGhosts: roomGhosts({ integrity: 'corrupt' }) })).toMatchObject({ allowed: false, block: 'integrity', needsRefresh: false })
    expect(deriveRoomGate({ ...base, roomGhosts: roomGhosts({ integrity: 'uncertain' }) })).toMatchObject({ allowed: false, block: 'mismatch', needsRefresh: true })
    expect(deriveRoomGate({ ...base, projection: projection({ integrity: 'uncertain' }), roomGhosts: roomGhosts({ integrity: 'uncertain' }) })).toMatchObject({
      allowed: false,
      block: 'integrity',
    })
  })

  it('withholds mutations when a pending Door proposal covers other bytes than the room shows', () => {
    const other = roomGhosts({ documents: [document('requirements', { artifact: artifact({ artifactRevision: { revision: 2, sha256: SHA_B, sizeBytes: 1300 } }) }), document('design'), document('tasks')] })
    expect(deriveRoomGate({ ...base, projection: waitingWorkflow, roomGhosts: other })).toMatchObject({ allowed: false, block: 'mismatch', needsRefresh: true })
    expect(deriveRoomGate({ ...base, projection: waitingWorkflow, roomGhosts: roomGhosts() })).toMatchObject({ allowed: false, block: 'mismatch' })
    expect(deriveRoomGate({ ...base, projection: waitingWorkflow, roomGhosts: waitingAnswer }).allowed).toBe(true)
  })

  it('never allows a mutation without full authority (generated)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<RoomGhostsStatus>('loading', 'ready', 'malformed', 'unavailable'),
        fc.constantFrom('valid', 'uncertain', 'corrupt') as fc.Arbitrary<RoomGhosts['integrity']>,
        fc.constantFrom('valid', 'uncertain', 'corrupt') as fc.Arbitrary<RoomGhosts['integrity']>,
        fc.integer({ min: 8, max: 12 }),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (status, roomIntegrity, houseIntegrity, version, readOnly, canDecide, present) => {
          const gate = deriveRoomGate({
            projection: projection({ integrity: houseIntegrity }),
            roomGhosts: present ? roomGhosts({ version, integrity: roomIntegrity, readOnly }) : null,
            roomGhostsStatus: status,
            authority: canDecide ? CAN : CANNOT,
          })
          const everythingAgrees =
            present && status === 'ready' && canDecide && !readOnly && version === 10 && roomIntegrity === 'valid' && houseIntegrity === 'valid'
          expect(gate.allowed).toBe(everythingAgrees)
          expect(gate.text === null).toBe(gate.allowed)
          if (gate.needsRefresh) expect(gate.allowed).toBe(false)
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('joinRoomProjection: documents', () => {
  it('shows an unwritten document with its path and write scope', () => {
    const [view] = join('study').documents
    expect(view).toMatchObject({
      phase: 'requirements',
      title: 'Requirements document',
      documentPath: '.kiro/specs/demo/requirements.md',
      validation: 'unwritten',
      validationText: 'Not written yet',
      revisionText: null,
      digest: null,
      content: null,
      contentNote: 'Nothing has been written here yet.',
      writeScope: ['.kiro/specs/demo/requirements.md'],
      feedback: null,
    })
  })

  it('shows a written document with its text, exact digest and findings', () => {
    const findings = [{ code: 'ears_pattern_missing', location: 'criterion:1.2', message: 'This criterion matches no EARS pattern.' }]
    const answer = roomGhosts({ documents: [document('requirements', { artifact: artifact({ validated: false, findings }) }), document('design'), document('tasks')] })
    const [view] = join('study', { answer }).documents
    expect(view).toMatchObject({
      validation: 'invalid',
      revisionText: 'Revision 1 (1,200 bytes)',
      digest: SHA_A,
      digestPrefix: 'a'.repeat(12),
      contentNote: null,
      findings,
      findingsText: '1 finding',
      doorNote: null,
    })
    expect(view.content).toContain('# Requirements Document')
  })

  it('puts each room document in its own room', () => {
    expect(join('study').documents.map((view) => view.phase)).toEqual(['requirements'])
    expect(join('drafting-room').documents.map((view) => view.phase)).toEqual(['design'])
    expect(join('workshop').documents.map((view) => view.phase)).toEqual(['tasks'])
  })

  it('falls back to the Door proposal facts when the room answer is missing', () => {
    const room = join('study', { workflow: waitingWorkflow, answer: null })
    expect(room.outputNote).toMatch(/could not be read/)
    expect(room.documents[0]).toMatchObject({
      validation: 'unknown',
      validationText: 'Not checked here',
      revisionText: 'Revision 1 (1,200 bytes)',
      digest: SHA_A,
      content: null,
      writeScope: ['.kiro/specs/demo/requirements.md'],
    })
    expect(room.documents[0].contentNote).toMatch(/door proposal/)
    expect(room.gate.allowed).toBe(false)
  })

  it('places an unwritten document in the spec folder the Door proposals name', () => {
    // The page was told another spec name than the one the canonical records use.
    const answer = { ...roomGhosts({ readOnly: true }), specName: 'demo-mansion', documents: roomGhosts().documents.map((item) => ({ ...item, documentPath: item.documentPath.replace('/demo/', '/demo-mansion/'), writeScope: [item.documentPath.replace('/demo/', '/demo-mansion/')] })) as unknown as RoomGhosts['documents'] }
    const design = join('drafting-room', { workflow: waitingWorkflow, answer }).documents[0]
    expect(design).toMatchObject({ validation: 'unwritten', documentPath: '.kiro/specs/demo/design.md', writeScope: ['.kiro/specs/demo/design.md'] })
    // With no proposal anywhere, the room's own path stands.
    expect(join('drafting-room', { answer }).documents[0].documentPath).toBe('.kiro/specs/demo-mansion/design.md')
  })

  it('says a recording has no document text', () => {
    const room = join('study', { workflow: { ...waitingWorkflow, readOnly: true }, answer: roomGhosts({ readOnly: true }), authority: deriveAuthority({ projection: { ...waitingWorkflow, readOnly: true }, projectionStatus: 'ready', canonical: { loaded: true, catchingUp: false, highestSequence: 10, diagnostic: null } }) })
    expect(room.gate).toMatchObject({ allowed: false, block: 'read_only' })
    expect(room.documents[0].contentNote).toMatch(/recording has no text/)
    expect(room.documents[0].digest).toBe(SHA_A)
  })

  it('flags a document whose bytes differ from the pending Door proposal', () => {
    const other = roomGhosts({ documents: [document('requirements', { artifact: artifact({ artifactRevision: { revision: 2, sha256: SHA_B, sizeBytes: 1300 } }) }), document('design'), document('tasks')] })
    const room = join('study', { workflow: waitingWorkflow, answer: other })
    expect(room.documents[0].doorNote).toBe('The text shown is revision 2. The door proposal covers revision 1 (digest aaaaaaaaaaaa). The house is refreshing.')
    expect(room.gate.needsRefresh).toBe(true)
  })

  it('offers a revision request only before the Door is approved and only with a session to reuse', () => {
    expect(join('study', { workflow: waitingWorkflow, answer: waitingAnswer }).documents[0].feedback).toMatchObject({
      phase: 'requirements',
      label: 'Ask for a revision of the requirements',
      enabled: true,
      busy: false,
      blockedText: null,
      expectedVersion: 10,
      maxCharacters: MAX_FEEDBACK_CHARACTERS,
    })
    // No session of this phase: nothing to send a revision to.
    expect(join('study', { workflow: waitingWorkflow, answer: { ...waitingAnswer, runs: [] } }).documents[0].feedback).toBeNull()
    // Approved: the Door is open and the document is settled.
    const approved = projection({
      phaseOverrides: {
        requirements: {
          status: 'approved',
          door: { status: 'open', proposal: doorProposal('requirements', { status: 'approved', decision: decision('approved', 9) }) },
        },
      },
    })
    expect(join('study', { workflow: approved, answer: waitingAnswer }).documents[0].feedback).toBeNull()
    // Working: the ghost has not produced its output yet.
    expect(join('study', { workflow: projection({ phaseOverrides: { requirements: { status: 'working' } } }), answer: waitingAnswer }).documents[0].feedback).toBeNull()
  })

  it('keeps the revision request visible but off when the gate is closed', () => {
    const feedback = join('study', { workflow: waitingWorkflow, answer: waitingAnswer, authority: CANNOT }).documents[0].feedback
    expect(feedback).toMatchObject({ enabled: false, blockedText: CANNOT.text })
  })
})

describe('joinRoomProjection: runs', () => {
  it('joins a run with the Spec 2 state of its ghost and labels its session link', () => {
    const room = join('study', { workflow: waitingWorkflow, answer: waitingAnswer, snapshots: [snapshot('archivist', 'done', 'requirements-1')] })
    expect(room.runs).toHaveLength(1)
    expect(room.runs[0]).toMatchObject({
      ghostName: 'Archivist',
      state: 'done',
      stateText: 'Done',
      attemptText: 'Attempt 1 of 3',
      summary: 'Wrote 2 EARS criteria and a glossary.',
      cancel: null,
      retry: null,
      exhaustedText: null,
      sessionLink: { slotKey: 'hh-archivist-requirements-1', label: "Open Archivist's Crew session (Done)", disabledText: null },
    })
    expect(room.ghosts.map((ghost) => ghost.ghost_id)).toEqual(['archivist'])
  })

  it('does not borrow the state of a newer run for an earlier one', () => {
    const room = join('study', { answer: waitingAnswer, snapshots: [snapshot('archivist', 'working', 'requirements-2')] })
    expect(room.runs[0]).toMatchObject({ state: null, stateText: 'Earlier run' })
  })

  it('turns the session link off when the contract is unavailable or the page is a recording', () => {
    const noLink = join('study', { answer: { ...waitingAnswer, runs: [run()] } }).runs[0].sessionLink
    expect(noLink.slotKey).toBeNull()
    expect(noLink.disabledText).toMatch(/not available yet/)
    const recording = join('study', { answer: { ...waitingAnswer, readOnly: true } }).runs[0].sessionLink
    expect(recording.slotKey).toBeNull()
    expect(recording.disabledText).toMatch(/recording/)
  })

  it('offers Cancel for an active run and sends the exact run and version', () => {
    const room = join('workshop', { answer: workshopAtWork(), snapshots: [snapshot('tinker-1', 'working', 'task-1-2-a1')] })
    const active = room.runs[0]
    expect(active.cancel).toEqual({
      label: "Cancel Tinker 1's run",
      command: { kind: 'cancel_run', runId: 'task-1-2-a1', expectedVersion: 10 },
      busy: false,
      blockedText: null,
    })
    expect(active.retry).toBeNull()
    expect(active.writeScope).toEqual(['src/guestbook/store.py'])
  })

  it('shows a requested cancellation as pending and offers no second one', () => {
    const answer = { ...workshopAtWork(), runs: [run({ ...workshopAtWork().runs[0], canCancel: false, cancelRequested: true })] }
    const cancel = join('workshop', { answer }).runs[0].cancel
    expect(cancel).toMatchObject({ label: 'Cancelling…', command: null })
    expect(cancel?.blockedText).toMatch(/Waiting for Crew to confirm/)
  })

  it('offers Retry only where the backend does, and says when attempts are used up', () => {
    const failed = (attempt: number, canRetry: boolean) =>
      join('study', {
        answer: roomGhosts({ runs: [run({ attempt, canRetry, reasonCode: 'artifact_invalid' })] }),
        snapshots: [snapshot('archivist', 'failed', 'requirements-1')],
      }).runs[0]
    expect(failed(2, true).retry).toMatchObject({ label: 'Retry with a fresh session', command: { kind: 'retry_run', runId: 'requirements-1', expectedVersion: 10 } })
    expect(failed(2, true).exhaustedText).toBeNull()
    expect(failed(2, true).reasonText).toBe('Artifact invalid')
    const last = failed(3, false)
    expect(last.retry).toBeNull()
    expect(last.exhaustedText).toBe('All 3 attempts are used. Nothing retries on its own.')
  })

  it('keeps recovery controls visible but off when the gate is closed or another command is in flight', () => {
    const answer = workshopAtWork()
    expect(join('workshop', { answer, authority: CANNOT }).runs[0].cancel).toMatchObject({ command: null, blockedText: CANNOT.text })
    expect(join('workshop', { answer: { ...answer, version: 11 } }).runs[0].cancel?.command).toBeNull()
    expect(join('workshop', { answer, inFlight: 'workshop' }).runs[0].cancel).toMatchObject({ command: null, busy: false })
    expect(join('workshop', { answer, inFlight: 'run:task-1-2-a1' }).runs[0].cancel).toMatchObject({ busy: true, blockedText: null })
  })
})

describe('joinRoomProjection: Workshop task board', () => {
  const tasksOpen = projection({
    phaseOverrides: {
      tasks: { status: 'approved', door: { status: 'open', proposal: doorProposal('tasks', { status: 'approved', artifactRevision: { revision: 1, sha256: 'c'.repeat(64), sizeBytes: 912 }, decision: decision('approved', 9) }) } },
      implementation: { status: 'ready' },
    },
  })

  it('has no board outside the Workshop or before a valid plan exists', () => {
    expect(join('study', { answer: workshopAtWork() }).taskBoard).toBeNull()
    expect(join('workshop').taskBoard).toBeNull()
    expect(join('workshop').ownsImplementationStart).toBe(false)
  })

  it('groups tasks by wave in plan order and keeps tasks outside the waves', () => {
    const board = join('workshop', { workflow: tasksOpen, answer: workshopAtWork() }).taskBoard!
    expect(board.waves.map((wave) => [wave.title, wave.tasks.map((row) => row.taskId)])).toEqual([
      ['Wave 1', ['1.2', '2.1']],
      ['Wave 2', ['1.3', '2.2']],
      ['Outside the waves', ['1.1']],
    ])
    expect(board).toMatchObject({ taskCount: 5, doneCount: 1, activeCount: 1, capacityText: '1 of 3 Tinkers working', startBlockedText: null })
  })

  it('says each task state in words, with claim, requirements, attempt and backpressure detail', () => {
    const board = join('workshop', { workflow: tasksOpen, answer: workshopAtWork(), snapshots: [snapshot('tinker-1', 'working', 'task-1-2-a1')] }).taskBoard!
    const rows = new Map(board.waves.flatMap((wave) => wave.tasks).map((row) => [row.taskId, row]))
    expect(rows.get('1.1')).toMatchObject({ status: 'complete', statusText: 'Done', selectable: false, detail: null })
    expect(rows.get('1.2')).toMatchObject({
      status: 'active',
      statusText: 'A Tinker is working on it',
      attemptText: 'Attempt 1 of 3',
      requirementsText: '1.3, 2.1, 2.2, 2.3',
      writes: ['src/guestbook/store.py'],
      selectable: false,
    })
    expect(rows.get('1.2')?.run).toMatchObject({ runId: 'task-1-2-a1', ghostName: 'Tinker 1', state: 'working' })
    expect(rows.get('2.1')).toMatchObject({
      status: 'backpressure',
      statusText: 'Queued: waiting for capacity',
      attemptText: null,
      detail: 'Crew has no room for another ghost right now. Next try in 4 seconds (2 refusals so far). This does not use up an attempt.',
    })
    expect(rows.get('1.3')).toMatchObject({ status: 'queued', optional: true, selectable: false })
    expect(rows.get('2.2')).toMatchObject({ status: 'not_selected', statusText: 'Not selected', optional: true, selectable: true, run: null })
  })

  it('blocks a start behind a sealed tasks Door, plan findings, a closed gate, or nothing left to select', () => {
    const answer = workshopAtWork()
    expect(join('workshop', { answer }).taskBoard?.startBlockedText).toMatch(/Sealed door/)
    const withFindings = { ...answer, taskPlan: { ...answer.taskPlan!, findings: [{ code: 'wave_conflict', location: 'wave:0', message: 'Two tasks of this wave may write the same file.' }] } }
    expect(join('workshop', { workflow: tasksOpen, answer: withFindings }).taskBoard?.startBlockedText).toMatch(/findings/)
    expect(join('workshop', { workflow: tasksOpen, answer, authority: CANNOT }).taskBoard?.startBlockedText).toBe(CANNOT.text)
    const allTaken = { ...answer, taskPlan: { ...answer.taskPlan!, tasks: answer.taskPlan!.tasks.map((item) => (item.taskId === '2.2' ? { ...item, selected: true, outcome: { status: 'queued' as const, attempt: 0, runId: null, reasonCode: null } } : item)) } }
    expect(join('workshop', { workflow: tasksOpen, answer: allTaken }).taskBoard?.startBlockedText).toMatch(/already selected or done/)
  })

  it('builds the start command from ticked tasks in plan order, and refuses anything else', () => {
    const answer = { ...workshopAtWork(), runs: [], taskPlan: { ...workshopAtWork().taskPlan!, tasks: workshopAtWork().taskPlan!.tasks.map((item) => (item.complete ? item : { ...item, selected: false, outcome: null, backpressure: null })) } }
    const board = join('workshop', { workflow: tasksOpen, answer }).taskBoard!
    expect(workshopStartCommand(board, new Set(['2.1', '1.2']))).toEqual({ kind: 'start_workshop', taskIds: ['1.2', '2.1'], expectedVersion: 10 })
    expect(workshopStartCommand(board, new Set())).toBeNull()
    expect(workshopStartCommand(board, new Set(['1.1']))).toBeNull() // complete
    expect(workshopStartCommand(board, new Set(['1.2', '9.9']))).toBeNull() // not a task of this plan
    const sealed = join('workshop', { answer }).taskBoard!
    expect(workshopStartCommand(sealed, new Set(['1.2']))).toBeNull()
  })
})

describe('authorizeRoomCommand', () => {
  const tasksOpen = projection({
    phaseOverrides: {
      requirements: waitingWorkflow.phases[0],
      tasks: { status: 'approved', door: { status: 'open', proposal: doorProposal('tasks', { status: 'approved', decision: decision('approved', 9) }) } },
    },
  })
  const answer: RoomGhosts = {
    ...workshopAtWork(),
    documents: waitingAnswer.documents,
    runs: [...waitingAnswer.runs, ...workshopAtWork().runs, run({ runId: 'design-1', ghostId: 'draughtsman', phase: 'design', sessionSlot: 'hh-draughtsman-design-1', canRetry: true, attempt: 2 })],
  }
  const gate = deriveRoomGate({ projection: tasksOpen, roomGhosts: answer, roomGhostsStatus: 'ready', authority: CAN })
  const allow = (command: RoomCommand) => authorizeRoomCommand(answer, tasksOpen, gate, null, command)

  it('starts from an open gate', () => {
    expect(gate.allowed).toBe(true)
  })

  it('passes each exact command the current answer supports', () => {
    const commands: RoomCommand[] = [
      { kind: 'send_feedback', phase: 'requirements', feedback: 'Add a criterion for empty names.', expectedVersion: 10 },
      { kind: 'start_workshop', taskIds: ['2.2'], expectedVersion: 10 },
      { kind: 'cancel_run', runId: 'task-1-2-a1', expectedVersion: 10 },
      { kind: 'retry_run', runId: 'design-1', expectedVersion: 10 },
    ]
    for (const command of commands) expect(allow(command)).toBe(command)
    expect(commands.map(roomCommandTarget)).toEqual(['feedback:requirements', 'workshop', 'run:task-1-2-a1', 'run:design-1'])
  })

  it('refuses a command made on another version, with a closed gate, or while one is in flight', () => {
    const command: RoomCommand = { kind: 'cancel_run', runId: 'task-1-2-a1', expectedVersion: 10 }
    expect(allow({ ...command, expectedVersion: 9 })).toBeNull()
    expect(authorizeRoomCommand(answer, tasksOpen, { ...gate, allowed: false }, null, command)).toBeNull()
    expect(authorizeRoomCommand(answer, tasksOpen, gate, 'workshop', command)).toBeNull()
    expect(authorizeRoomCommand(null, tasksOpen, gate, null, command)).toBeNull()
    expect(authorizeRoomCommand(answer, null, gate, null, command)).toBeNull()
  })

  it('refuses feedback that is empty, untrimmed, too long, or for a phase that cannot be revised', () => {
    const feedback = (text: string, phase: 'requirements' | 'design' | 'tasks' = 'requirements'): RoomCommand => ({ kind: 'send_feedback', phase, feedback: text, expectedVersion: 10 })
    expect(allow(feedback(''))).toBeNull()
    expect(allow(feedback('  padded  '))).toBeNull()
    expect(allow(feedback('x'.repeat(MAX_FEEDBACK_CHARACTERS + 1)))).toBeNull()
    expect(allow(feedback('x'.repeat(MAX_FEEDBACK_CHARACTERS)))).not.toBeNull()
    expect(allow(feedback('Change it.', 'design'))).toBeNull() // design is not waiting
    expect(allow(feedback('Change it.', 'tasks'))).toBeNull() // its Door is open
  })

  it('refuses a Workshop start for no task, a repeated task, or a task that is not open', () => {
    const start = (taskIds: string[]): RoomCommand => ({ kind: 'start_workshop', taskIds, expectedVersion: 10 })
    expect(allow(start([]))).toBeNull()
    expect(allow(start(['2.2', '2.2']))).toBeNull()
    expect(allow(start(['1.1']))).toBeNull() // complete
    expect(allow(start(['1.2']))).toBeNull() // already active
    expect(allow(start(['7.7']))).toBeNull()
  })

  it('refuses cancel and retry the backend does not offer', () => {
    expect(allow({ kind: 'cancel_run', runId: 'design-1', expectedVersion: 10 })).toBeNull()
    expect(allow({ kind: 'retry_run', runId: 'task-1-2-a1', expectedVersion: 10 })).toBeNull()
    expect(allow({ kind: 'retry_run', runId: 'unknown-run', expectedVersion: 10 })).toBeNull()
  })

  it('passes a command only if the view offered that very command (generated)', () => {
    fc.assert(
      fc.property(
        fc.record({
          version: fc.integer({ min: 9, max: 11 }),
          canCancel: fc.boolean(),
          cancelRequested: fc.boolean(),
          canRetry: fc.boolean(),
          attempt: fc.integer({ min: 1, max: 3 }),
          canDecide: fc.boolean(),
          inFlight: fc.constantFrom(null, 'workshop', 'run:requirements-1'),
          kind: fc.constantFrom('cancel_run', 'retry_run') as fc.Arbitrary<'cancel_run' | 'retry_run'>,
        }),
        (c) => {
          fc.pre(!(c.canCancel && c.canRetry) && !(c.canRetry && c.attempt === 3))
          const generated = roomGhosts({ version: c.version, runs: [run({ canCancel: c.canCancel, cancelRequested: c.cancelRequested, canRetry: c.canRetry, attempt: c.attempt })] })
          const workflow = projection()
          const authority = c.canDecide ? CAN : CANNOT
          const room = join('study', { workflow, answer: generated, authority, inFlight: c.inFlight })
          const offered = c.kind === 'cancel_run' ? room.runs[0].cancel?.command : room.runs[0].retry?.command
          const command: RoomCommand = { kind: c.kind, runId: 'requirements-1', expectedVersion: c.version }
          const passed = authorizeRoomCommand(generated, workflow, room.gate, c.inFlight, command)
          // The view and the last check agree: a control that is off never sends, and one that is on always may.
          expect(passed !== null).toBe(offered != null)
          if (offered != null) expect(offered).toEqual(command)
        },
      ),
      { numRuns: 300 },
    )
  })
})

describe('checkFeedback', () => {
  it('trims, bounds and explains', () => {
    expect(checkFeedback('  Split criterion 2.  ')).toEqual({ ok: true, feedback: 'Split criterion 2.' })
    expect(checkFeedback('   ')).toEqual({ ok: false, text: 'Write what should change before sending.' })
    expect(checkFeedback('x'.repeat(MAX_FEEDBACK_CHARACTERS + 1))).toEqual({ ok: false, text: 'Keep the request under 4,000 characters.' })
  })
})

describe('reviewView (stretch)', () => {
  const review = {
    cycle: 2,
    status: 'changes_requested' as const,
    ghostId: 'medium',
    sessionLink: null,
    findings: [{ findingId: 'f-1', requirementIds: ['1.3'], paths: ['src/guestbook/store.py'], summary: 'Entries are sorted by name.' }],
    repairs: [{ taskId: '4.1', findingId: 'f-1', title: 'Keep insertion order', writes: ['src/guestbook/store.py'], status: 'proposed' as const }],
  }

  it('is absent while the Séance Room is off or has not reviewed', () => {
    expect(reviewView(null, new Map())).toBeNull()
    expect(reviewView(roomGhosts(), new Map())).toBeNull()
    expect(reviewView(roomGhosts({ seanceEnabled: true }), new Map())).toBeNull()
  })

  it('shows the verdict, the cycle, traced findings and one repair proposal per finding', () => {
    const view = reviewView(roomGhosts({ seanceEnabled: true, review }), new Map([['medium', snapshot('medium', 'done')]]))!
    expect(view).toMatchObject({ status: 'changes_requested', statusText: 'Changes requested', cycleText: 'Review cycle 2 of 3', limitText: null, ghostName: 'Medium', stateText: 'Done' })
    expect(view.findings).toEqual([
      {
        findingId: 'f-1',
        summary: 'Entries are sorted by name.',
        requirementsText: '1.3',
        paths: ['src/guestbook/store.py'],
        repair: { taskId: '4.1', title: 'Keep insertion order', writes: ['src/guestbook/store.py'], status: 'proposed', statusText: 'Proposed: not started' },
      },
    ])
    expect(view.sessionLink.slotKey).toBeNull()
  })

  it('says that nothing reviews again after the third cycle without a pass', () => {
    for (const value of [{ ...review, cycle: 3 }, { ...review, cycle: 3, status: 'blocked' as const }]) {
      expect(reviewView(roomGhosts({ seanceEnabled: true, review: value }), new Map())?.limitText).toMatch(/No fourth review starts on its own/)
    }
    expect(reviewView(roomGhosts({ seanceEnabled: true, review: { ...review, status: 'pass', findings: [], repairs: [] } }), new Map())).toMatchObject({
      statusText: 'Passed: the review found nothing to change',
      limitText: null,
      findings: [],
    })
  })
})

// Feature: room-ghosts, Property 11: Canonical room integration has one validated terminal fact
// The UI half of the property: for the same canonical sources, the live join and
// the replay join (a read-only answer without document text) expose the same
// ghost state, Door state and artifact readiness, and the replay offers nothing.
describe('Property 11: live and replay joins agree', () => {
  it('exposes the same room outcome and artifact readiness in live and replay joins', async () => {
    const { projectionArb } = await import('../test/workflow-arbitraries')
    const states = ['idle', 'working', 'waiting', 'blocked', 'failed', 'done'] as const
    fc.assert(
      fc.property(
        projectionArb(),
        fc.constantFrom<RoomId>('study', 'drafting-room', 'workshop'),
        fc.array(fc.constantFrom(...states), { minLength: 4, maxLength: 4 }),
        (workflow, roomId, ghostStates) => {
          const snapshots = ['archivist', 'draughtsman', 'foreman', 'tinker-1'].map((ghostId, index) => snapshot(ghostId, ghostStates[index]))
          // Live: the room answer agrees with every Door proposal it knows.
          const documents = (['requirements', 'design', 'tasks'] as const).map((phase, index) => {
            const proposal = workflow.phases[index].door.proposal
            return document(phase, { artifact: proposal === null ? null : artifact({ artifactRevision: proposal.artifactRevision }) })
          }) as unknown as RoomGhosts['documents']
          const liveAnswer = roomGhosts({ version: workflow.version, integrity: workflow.integrity, documents })
          const replayWorkflow = { ...workflow, readOnly: true }
          const replayAnswer = roomGhosts({ version: workflow.version, integrity: workflow.integrity, readOnly: true })
          const live = join(roomId, { workflow, answer: liveAnswer, snapshots })
          const replay = join(roomId, {
            workflow: replayWorkflow,
            answer: replayAnswer,
            snapshots,
            authority: deriveAuthority({ projection: replayWorkflow, projectionStatus: 'ready', canonical: { loaded: true, catchingUp: false, highestSequence: workflow.version, diagnostic: null } }),
          })

          expect(replay.ghosts).toEqual(live.ghosts)
          expect(replay.phases).toEqual(live.phases)
          expect(replay.projectionVersion).toBe(live.projectionVersion)
          expect(replay.integrity).toBe(live.integrity)
          // Artifact readiness: the same path, revision and digest, written or not.
          expect(replay.documents.map((view) => [view.documentPath, view.revisionText, view.digest])).toEqual(
            live.documents.map((view) => [view.documentPath, view.revisionText, view.digest]),
          )
          expect(replay.documents.map((view) => view.validation === 'unwritten')).toEqual(live.documents.map((view) => view.validation === 'unwritten'))
          // A recording offers no mutation and no session navigation.
          expect(replay.gate.allowed).toBe(false)
          expect(replay.documents.every((view) => view.feedback === null || !view.feedback.enabled)).toBe(true)
          expect(replay.runs.every((item) => item.sessionLink.slotKey === null && item.cancel?.command == null && item.retry?.command == null)).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })
})
