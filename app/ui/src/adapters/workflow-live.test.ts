// Signed workflow adapter (Spec 4 task 13.5; Requirements 4.8, 8.1 to 8.5, 8.7, 9.5 to 9.7).
// Requests are held open by hand so each test sees the state before the backend answers.
import { describe, expect, it } from 'vitest'
import { doorDecisionView, riskyDecisionView, startView, type Authority } from '../core/house-view'
import {
  approvalDecisionPath,
  doorDecisionPath,
  parseWorkflowAck,
  phaseStartPath,
  workflowFailure,
  workflowPath,
  workflowRequest,
} from '../core/workflow-api'
import { workflowProjectionToJson, type WorkflowProjection } from '../core/workflow-projection'
import { MANSION, SHA_A, SHA_B, decision, doorProposal, eventId, projection, riskyProposal } from '../test/workflow-arbitraries'
import { createWorkflowController, type WorkflowTimers } from './workflow-live'

const OK: Authority = { canDecide: true, block: null, text: null }
const BASE = `/apps/haunted-house/api/mansions/${MANSION}`

interface Call {
  readonly method: 'GET' | 'POST'
  readonly path: string
  readonly body: unknown
  resolve(value: unknown): void
  reject(error: unknown): void
}

function heldApi() {
  const calls: Call[] = []
  let taken = 0
  const request = (method: Call['method'], path: string, body: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      calls.push({ method, path, body, resolve, reject })
    })
  return {
    calls,
    api: {
      get: (path: string) => request('GET', path, undefined),
      post: (path: string, body?: unknown) => request('POST', path, body),
    },
    next(): Call {
      const call = calls[taken]
      if (call === undefined) throw new Error(`No request ${taken + 1}; saw ${calls.length}.`)
      taken += 1
      return call
    },
    /** The oldest untaken request, after letting queued promise callbacks issue it. */
    async take(): Promise<Call> {
      await tick()
      return this.next()
    },
    get pending() {
      return calls.length - taken
    },
  }
}

function manualTimers() {
  let nextId = 1
  const pending = new Map<number, { fn: () => void; delayMs: number }>()
  const timers: WorkflowTimers = {
    set(fn, delayMs) {
      const id = nextId++
      pending.set(id, { fn, delayMs })
      return id
    },
    clear(handle) {
      pending.delete(handle as number)
    },
  }
  return {
    timers,
    delays: () => Array.from(pending.values(), (timer) => timer.delayMs),
    fire(delayMs: number) {
      const entry = Array.from(pending).find(([, timer]) => timer.delayMs === delayMs)
      if (entry === undefined) throw new Error(`No ${delayMs} ms timer; pending: ${Array.from(pending.values(), (t) => t.delayMs)}`)
      pending.delete(entry[0])
      entry[1].fn()
    },
  }
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const wire = (value: WorkflowProjection) => JSON.parse(JSON.stringify(workflowProjectionToJson(value))) as unknown
const httpError = (status: number, body: unknown = {}) => Object.assign(new Error(`API ${status}`), { status, body: JSON.stringify(body) })

const waiting = projection({
  version: 20,
  waitingCount: 2,
  phaseOverrides: {
    requirements: { status: 'waiting', ghostIds: ['archivist'], door: { status: 'waiting', proposal: doorProposal('requirements', { createdSequence: 12 }) } },
  },
  riskyProposals: [riskyProposal({ createdSequence: 15 })],
})
const doorApproved = projection({
  version: 21,
  waitingCount: 1,
  phaseOverrides: {
    requirements: {
      status: 'approved',
      ghostIds: ['archivist'],
      door: { status: 'open', proposal: doorProposal('requirements', { status: 'approved', createdSequence: 12, decision: decision('approved', 21) }) },
    },
    design: { status: 'ready' },
  },
  riskyProposals: [riskyProposal({ createdSequence: 15 })],
})

function setup(overrides: { pollMs?: number } = {}) {
  const held = heldApi()
  const clock = manualTimers()
  let ids = 0
  let settled = 0
  const controller = createWorkflowController({
    api: held.api,
    mansionId: MANSION,
    timers: clock.timers,
    pollMs: overrides.pollMs ?? 5_000,
    refreshDelayMs: 150,
    newCommandId: () => `command-${String(++ids).padStart(4, '0')}`,
    onCommandSettled: () => {
      settled += 1
    },
  })
  return { held, clock, controller, settledCount: () => settled }
}

async function loaded(value: WorkflowProjection) {
  const context = setup()
  context.controller.start()
  ;(await context.held.take()).resolve(wire(value))
  await tick()
  return context
}

describe('workflow paths and bodies', () => {
  it('builds the six signed routes', () => {
    expect(workflowPath(MANSION)).toBe(`${BASE}/workflow`)
    expect(phaseStartPath(MANSION, 'design')).toBe(`${BASE}/phases/design/start`)
    expect(doorDecisionPath(MANSION, 'door 1', 'approve')).toBe(`${BASE}/doors/door%201/approve`)
    expect(doorDecisionPath(MANSION, 'd', 'reject')).toBe(`${BASE}/doors/d/reject`)
    expect(approvalDecisionPath(MANSION, 'r/1', 'approve')).toBe(`${BASE}/approvals/r%2F1/approve`)
    expect(approvalDecisionPath(MANSION, 'r', 'reject')).toBe(`${BASE}/approvals/r/reject`)
  })

  it('carries command id, expected version and the exact proposal in every body', () => {
    expect(workflowRequest(MANSION, { kind: 'start_phase', phase: 'tasks', expectedVersion: 7 }, 'command-0001')).toEqual({
      path: `${BASE}/phases/tasks/start`,
      body: { command_id: 'command-0001', expected_version: 7 },
    })
    const door = doorDecisionView(waiting, waiting.phases[0], OK, null)!
    expect(workflowRequest(MANSION, door.reject!, 'command-0002')).toEqual({
      path: `${BASE}/doors/door-requirements-1/reject`,
      body: {
        command_id: 'command-0002',
        expected_version: 20,
        phase: 'requirements',
        document_path: '.kiro/specs/demo/requirements.md',
        artifact_revision: { revision: 1, sha256: SHA_A, size_bytes: 1200 },
      },
    })
    const risky = riskyDecisionView(waiting, waiting.riskyProposals[0], OK, null)
    expect(workflowRequest(MANSION, risky.approve!, 'command-0003')).toEqual({
      path: `${BASE}/approvals/risky-1/approve`,
      body: { command_id: 'command-0003', expected_version: 20, action_digest: SHA_B },
    })
  })

  it('accepts only a complete, consistent acknowledgment', () => {
    const ack = { event_id: eventId(21), sequence: 21, version: 21, workflow: wire(doorApproved) }
    expect(parseWorkflowAck(ack, MANSION)).toEqual({ eventId: eventId(21), sequence: 21, projection: doorApproved })
    expect(parseWorkflowAck({ ...ack, event_id: 'nope' }, MANSION)).toBeNull()
    expect(parseWorkflowAck({ ...ack, sequence: 22 }, MANSION)).toBeNull()
    expect(parseWorkflowAck({ ...ack, version: 20 }, MANSION)).toBeNull()
    expect(parseWorkflowAck({ ...ack, workflow: {} }, MANSION)).toBeNull()
    expect(parseWorkflowAck(ack, 'other-mansion')).toBeNull()
    expect(parseWorkflowAck(null, MANSION)).toBeNull()
  })

  it('classifies failures by status and never shows server text', () => {
    const kinds = [400, 404, 405, 409, 423, 502, 504, 500].map((status) => workflowFailure(httpError(status, { error: { code: 'x', message: 'SECRET' } }), MANSION))
    expect(kinds.map((failure) => failure.kind)).toEqual(['invalid', 'not_found', 'read_only', 'conflict', 'integrity', 'crew', 'crew', 'unavailable'])
    for (const failure of kinds) expect(failure.text).not.toContain('SECRET')
    expect(workflowFailure(new Error('offline'), MANSION).kind).toBe('unavailable')
    expect(workflowFailure(httpError(409, { error: { code: 'stale_version', message: '' }, workflow: wire(doorApproved) }), MANSION).projection).toEqual(doorApproved)
    expect(workflowFailure(httpError(409, { workflow: { nope: true } }), MANSION).projection).toBeNull()
    // A failed Crew setup answers 502 with the projection that now shows the phase as failed.
    expect(workflowFailure(httpError(502, { error: { code: 'crew_failed', message: '' }, workflow: wire(doorApproved) }), MANSION)).toMatchObject({
      kind: 'crew',
      projection: doorApproved,
    })
  })
})

describe('workflow controller', () => {
  it('reads the projection on start and polls only while something waits', async () => {
    const { held, clock, controller } = setup()
    controller.start()
    expect(controller.getState().projectionStatus).toBe('loading')
    const first = (await held.take())
    expect([first.method, first.path]).toEqual(['GET', `${BASE}/workflow`])
    first.resolve(wire(waiting))
    await tick()
    expect(controller.getState().projection).toEqual(waiting)
    // A Door and a risky proposal wait: one low-frequency poll is scheduled.
    expect(clock.delays()).toEqual([5_000])

    clock.fire(5_000)
    ;(await held.take()).resolve(wire(projection({ version: 22 })))
    await tick()
    // Nothing waits and nothing is uncertain: no timer at all.
    expect(clock.delays()).toEqual([])
    expect(held.pending).toBe(0)
  })

  it('polls while integrity is uncertain or a phase is starting', async () => {
    const uncertain = await loaded(projection({ integrity: 'uncertain' }))
    expect(uncertain.clock.delays()).toEqual([5_000])
    const starting = await loaded(projection({ phaseOverrides: { requirements: { status: 'starting' } } }))
    expect(starting.clock.delays()).toEqual([5_000])
  })

  it('never polls a recording', async () => {
    const replay = await loaded({ ...waiting, readOnly: true })
    expect(replay.clock.delays()).toEqual([])
  })

  it('marks a malformed projection, keeps the last good one, and keeps asking slowly', async () => {
    const { held, clock, controller } = await loaded(waiting)
    clock.fire(5_000)
    ;(await held.take()).resolve({ ...(wire(waiting) as object), integrity: 'fine' })
    await tick()
    expect(controller.getState()).toMatchObject({ projectionStatus: 'malformed', projection: waiting })
    expect(clock.delays()).toEqual([5_000])

    clock.fire(5_000)
    ;(await held.take()).reject(httpError(503))
    await tick()
    expect(controller.getState().projectionStatus).toBe('unavailable')
    clock.fire(5_000)
    ;(await held.take()).resolve(wire(waiting))
    await tick()
    expect(controller.getState().projectionStatus).toBe('ready')
  })

  it('re-reads once per burst when the canonical log passes the projection version', async () => {
    const { held, clock, controller } = await loaded(projection({ version: 20 }))
    controller.noteCanonical(20)
    expect(clock.delays()).toEqual([])
    controller.noteCanonical(21)
    controller.noteCanonical(22)
    controller.noteCanonical(23)
    expect(clock.delays()).toEqual([150])
    clock.fire(150)
    ;(await held.take()).resolve(wire(projection({ version: 23 })))
    await tick()
    expect(controller.getState().projection?.version).toBe(23)
    expect(held.pending).toBe(0)
    // The same Sequence never asks twice.
    controller.noteCanonical(23)
    expect(clock.delays()).toEqual([])
  })

  it('falls back to slow polling when a re-read does not close the version gap', async () => {
    const { held, clock, controller } = await loaded(projection({ version: 20 }))
    controller.noteCanonical(25)
    clock.fire(150)
    ;(await held.take()).resolve(wire(projection({ version: 22 })))
    await tick()
    controller.noteCanonical(25)
    expect(clock.delays()).toEqual([5_000])
  })

  it('shares one request between concurrent refreshes and reads once more afterwards', async () => {
    const { held, controller } = await loaded(projection())
    void controller.refresh()
    void controller.refresh()
    void controller.refresh()
    await tick()
    expect(held.pending).toBe(1)
    ;(await held.take()).resolve(wire(projection({ version: 11 })))
    await tick()
    await tick()
    expect(held.pending).toBe(1)
    ;(await held.take()).resolve(wire(projection({ version: 12 })))
    await tick()
    expect(held.pending).toBe(0)
    expect(controller.getState().projection?.version).toBe(12)
  })

  it('sends an exact Door approval, shows it in flight, then adopts the acknowledged projection', async () => {
    const { held, controller, settledCount } = await loaded(waiting)
    const door = doorDecisionView(waiting, waiting.phases[0], OK, null)!
    const done = controller.send(door.approve!, OK)
    await tick()
    const post = (await held.take())
    expect([post.method, post.path]).toEqual(['POST', `${BASE}/doors/door-requirements-1/approve`])
    expect(post.body).toEqual({
      command_id: 'command-0001',
      expected_version: 20,
      phase: 'requirements',
      document_path: '.kiro/specs/demo/requirements.md',
      artifact_revision: { revision: 1, sha256: SHA_A, size_bytes: 1200 },
    })
    // Nothing changed locally: the Door is still waiting until the backend acknowledges.
    expect(controller.getState()).toMatchObject({ inFlight: 'proposal:door-requirements-1', projection: waiting })
    // A second press while one is in flight sends nothing.
    await controller.send(door.reject!, OK)
    expect(held.pending).toBe(0)

    post.resolve({ event_id: eventId(21), sequence: 21, version: 21, workflow: wire(doorApproved) })
    await done
    expect(controller.getState()).toMatchObject({
      inFlight: null,
      projection: doorApproved,
      notice: 'Requirements door approved. The next phase starts only when you start it.',
    })
    // The successor is ready but nothing started it.
    expect(held.pending).toBe(0)
    expect(settledCount()).toBe(1)
  })

  it('sends an explicit phase start and a risky rejection', async () => {
    const { held, controller } = await loaded(doorApproved)
    const start = startView(doorApproved, doorApproved.phases[1], OK, null)!
    const started = controller.send(start.command!, OK)
    await tick()
    const post = (await held.take())
    expect(post.path).toBe(`${BASE}/phases/design/start`)
    expect(post.body).toEqual({ command_id: 'command-0001', expected_version: 21 })
    const working = projection({ ...doorApproved, version: 23, phaseOverrides: undefined, phases: [doorApproved.phases[0], { ...doorApproved.phases[1], status: 'working', ghostIds: ['draughtsman'] }, doorApproved.phases[2], doorApproved.phases[3]] as unknown as WorkflowProjection['phases'] })
    post.resolve({ event_id: eventId(23), sequence: 23, version: 23, workflow: wire(working) })
    await started
    expect(controller.getState().notice).toBe('Design started.')

    const risky = riskyDecisionView(working, working.riskyProposals[0], OK, null)
    const rejected = controller.send(risky.reject!, OK)
    await tick()
    const second = (await held.take())
    expect(second.path).toBe(`${BASE}/approvals/risky-1/reject`)
    expect(second.body).toEqual({ command_id: 'command-0002', expected_version: 23, action_digest: SHA_B })
    second.reject(httpError(504))
    await tick()
    // Crew did not answer: the outcome is unknown, so the projection is read again.
    ;(await held.take()).resolve(wire(working))
    await rejected
    expect(controller.getState()).toMatchObject({ inFlight: null, projection: working })
    expect(controller.getState().notice).toMatch(/^Crew did not answer/)
  })

  it('adopts the projection of a 409 conflict and does not retry the decision', async () => {
    const { held, controller } = await loaded(waiting)
    const door = doorDecisionView(waiting, waiting.phases[0], OK, null)!
    const done = controller.send(door.approve!, OK)
    await tick()
    ;(await held.take()).reject(httpError(409, { error: { code: 'stale_version', message: 'stale' }, workflow: wire(doorApproved) }))
    await done
    expect(controller.getState()).toMatchObject({ inFlight: null, projection: doorApproved })
    expect(controller.getState().notice).toMatch(/^The house changed before your decision arrived/)
    expect(held.pending).toBe(0)
  })

  it('re-reads after a conflict without a readable projection and after an unreadable acknowledgment', async () => {
    const { held, controller } = await loaded(waiting)
    const door = doorDecisionView(waiting, waiting.phases[0], OK, null)!
    const conflict = controller.send(door.approve!, OK)
    await tick()
    ;(await held.take()).reject(httpError(409, { error: { code: 'stale_version', message: '' } }))
    await tick()
    const reread = (await held.take())
    expect(reread.method).toBe('GET')
    reread.resolve(wire(waiting))
    await conflict

    const unreadable = controller.send(door.approve!, OK)
    await tick()
    ;(await held.take()).resolve({ ok: true })
    await tick()
    expect(controller.getState().notice).toMatch(/cannot read/)
    ;(await held.take()).resolve(wire(doorApproved))
    await unreadable
    expect(controller.getState().projection).toEqual(doorApproved)
  })

  it('sends nothing without authority, for a stale command, or for an incomplete approval', async () => {
    const hidden = projection({ version: 20, riskyProposals: [riskyProposal({ descriptor: null, createdSequence: 15 })] })
    const { held, controller } = await loaded(hidden)
    const blocked: Authority = { canDecide: false, block: 'catching_up', text: 'x' }
    await controller.send({ kind: 'decide_risky', decision: 'reject', proposalId: 'risky-1', actionDigest: SHA_B, expectedVersion: 20 }, blocked)
    await controller.send({ kind: 'decide_risky', decision: 'reject', proposalId: 'risky-1', actionDigest: SHA_B, expectedVersion: 19 }, OK)
    await controller.send({ kind: 'decide_risky', decision: 'reject', proposalId: 'risky-1', actionDigest: SHA_A, expectedVersion: 20 }, OK)
    await controller.send({ kind: 'decide_risky', decision: 'approve', proposalId: 'risky-1', actionDigest: SHA_B, expectedVersion: 20 }, OK)
    expect(held.pending).toBe(0)
    expect(controller.getState().inFlight).toBeNull()
  })

  it('dispatches only view actions and never changes the projection through them', async () => {
    const { held, controller } = await loaded(waiting)
    const before = controller.getState()
    controller.dispatch({ type: 'proposal_viewed', id: 'risky:risky-1' })
    controller.dispatch({ type: 'notice_dismissed' })
    expect(controller.getState()).toMatchObject({ projection: waiting, inFlight: null })
    expect(controller.getState().projection).toBe(before.projection)
    expect(held.pending).toBe(0)
  })

  it('stops polling while hidden, re-reads on return, and ignores everything after dispose', async () => {
    const { held, clock, controller } = await loaded(waiting)
    controller.setVisible(false)
    expect(clock.delays()).toEqual([])
    controller.setVisible(true)
    const call = (await held.take())
    controller.dispose()
    call.resolve(wire(doorApproved))
    await tick()
    expect(controller.getState().projection).toEqual(waiting)
    expect(clock.delays()).toEqual([])
    await controller.send(doorDecisionView(waiting, waiting.phases[0], OK, null)!.approve!, OK)
    expect(held.pending).toBe(0)
  })
})
