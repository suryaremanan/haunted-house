// Room Ghosts adapter (Spec 5 task 9.1).
// **Validates: Requirements 10.4, 10.6, 11.1, 12.1, 12.5**
import { describe, expect, it, vi } from 'vitest'
import { roomGhostsToJson, type RoomGhosts } from '../core/room-projection'
import { deriveRoomGate, type RoomCommand } from '../core/room-view'
import { SPEC, roomGhosts, run, workshopAtWork } from '../test/room-kit'
import { MANSION, decision, doorProposal, projection } from '../test/workflow-arbitraries'
import { createRoomGhostsController, type RoomSendContext } from './room-ghosts-api'

const ROUTE = `/apps/haunted-house/api/mansions/${MANSION}/specs/${SPEC}/room-ghosts`
const wire = (value: RoomGhosts): unknown => JSON.parse(JSON.stringify(roomGhostsToJson(value)))
const httpError = (status: number, code?: string) =>
  Object.assign(new Error(`API ${status}`), { status, body: JSON.stringify(code === undefined ? {} : { error: { code, message: 'raw server text' } }) })

class ManualTimers {
  private next = 1
  readonly pending = new Map<number, { fn: () => void; delayMs: number }>()
  set = (fn: () => void, delayMs: number): unknown => {
    const id = this.next++
    this.pending.set(id, { fn, delayMs })
    return id
  }
  clear = (handle: unknown): void => {
    this.pending.delete(handle as number)
  }
  /** Runs every pending timer once. */
  fire(): void {
    const due = [...this.pending.entries()]
    this.pending.clear()
    for (const [, timer] of due) timer.fn()
  }
  get delays(): number[] {
    return [...this.pending.values()].map((timer) => timer.delayMs)
  }
}

function setup(first: unknown = wire(roomGhosts())) {
  const timers = new ManualTimers()
  const answers: unknown[] = [first]
  const gets: string[] = []
  const posts: { path: string; body: unknown }[] = []
  let postAnswer: () => unknown = () => ({ accepted: true })
  const settledCalls = vi.fn()
  let nextId = 0
  const controller = createRoomGhostsController({
    mansionId: MANSION,
    specName: SPEC,
    timers,
    newCommandId: () => `command-${++nextId}`.padEnd(12, '0'),
    onCommandSettled: settledCalls,
    api: {
      get: async (path) => {
        gets.push(path)
        const answer = answers.length > 1 ? answers.shift() : answers[0]
        if (answer instanceof Error) throw answer
        return answer
      },
      post: async (path, body) => {
        posts.push({ path, body })
        const answer = postAnswer()
        if (answer instanceof Error) throw answer
        return answer
      },
    },
  })
  const flush = async () => {
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve()
  }
  return {
    controller,
    timers,
    gets,
    posts,
    settledCalls,
    flush,
    answerNext: (...next: unknown[]) => answers.splice(0, answers.length, ...next),
    answerPost: (answer: () => unknown) => {
      postAnswer = answer
    },
  }
}

function context(answer: RoomGhosts | null, workflow = projection(), workflowBusy = false): RoomSendContext {
  return {
    projection: workflow,
    gate: deriveRoomGate({ projection: workflow, roomGhosts: answer, roomGhostsStatus: 'ready', authority: { canDecide: true, block: null, text: null } }),
    workflowBusy,
  }
}

const tasksOpen = projection({
  phaseOverrides: {
    tasks: { status: 'approved', door: { status: 'open', proposal: doorProposal('tasks', { status: 'approved', decision: decision('approved', 9) }) } },
  },
})

describe('reading', () => {
  it('starts loading, reads the one route of this spec, and holds the parsed answer', async () => {
    const { controller, gets, flush } = setup()
    expect(controller.getState()).toEqual({ status: 'loading', roomGhosts: null, inFlight: null, notice: null })
    controller.start()
    await flush()
    expect(gets).toEqual([ROUTE])
    expect(controller.getState()).toMatchObject({ status: 'ready', roomGhosts: { mansionId: MANSION, specName: SPEC, version: 10 } })
  })

  it('refuses a malformed answer and an answer about another Mansion or spec', async () => {
    for (const body of [{ nope: true }, wire({ ...roomGhosts(), mansionId: 'other-mansion' }), wire({ ...roomGhosts(), specName: 'other' }) /* paths of spec "demo" under another name */]) {
      const { controller, flush } = setup(body)
      controller.start()
      await flush()
      expect(controller.getState()).toMatchObject({ status: 'malformed', roomGhosts: null })
    }
  })

  it('reports an unreachable route and keeps what was read before', async () => {
    const { controller, flush, answerNext } = setup()
    controller.start()
    await flush()
    answerNext(httpError(503))
    await controller.refresh()
    expect(controller.getState()).toMatchObject({ status: 'unavailable', roomGhosts: { version: 10 } })
    answerNext({ bad: 1 })
    await controller.refresh()
    expect(controller.getState()).toMatchObject({ status: 'malformed', roomGhosts: { version: 10 } })
  })

  it('never lets an older answer replace a newer one', async () => {
    const { controller, flush, answerNext } = setup(wire(roomGhosts({ version: 12 })))
    controller.start()
    await flush()
    answerNext(wire(roomGhosts({ version: 11 })))
    await controller.refresh()
    expect(controller.getState().roomGhosts?.version).toBe(12)
  })

  it('shares one request between concurrent reads and reads once more afterwards', async () => {
    const { controller, gets, flush } = setup()
    controller.start()
    void controller.refresh()
    void controller.refresh()
    await flush()
    expect(gets).toHaveLength(2)
  })

  it('re-reads once when the workflow version differs, and not again for the same gap', async () => {
    const { controller, gets, timers, flush } = setup()
    controller.start()
    await flush()
    controller.noteWorkflowVersion(10)
    expect(timers.pending.size).toBe(0)
    controller.noteWorkflowVersion(11)
    controller.noteWorkflowVersion(11)
    expect(timers.delays).toEqual([150])
    timers.fire()
    await flush()
    expect(gets).toHaveLength(2)
    // The backend still answers version 10: the gap stays, and it is not asked again.
    controller.noteWorkflowVersion(11)
    expect(timers.pending.size).toBe(0)
    controller.noteWorkflowVersion(12)
    expect(timers.delays).toEqual([150])
  })

  it('re-reads once when the gate says the sources disagree at the same version', async () => {
    const { controller, gets, timers, flush } = setup()
    controller.start()
    await flush()
    controller.noteWorkflowVersion(10, true)
    controller.noteWorkflowVersion(10, true)
    expect(timers.delays).toEqual([150])
    timers.fire()
    await flush()
    expect(gets).toHaveLength(2)
    controller.noteWorkflowVersion(10, true)
    expect(timers.pending.size).toBe(0)
  })

  it('polls only while a cancellation or a backpressured task is pending, and not while hidden', async () => {
    const quiet = setup()
    quiet.controller.start()
    await quiet.flush()
    expect(quiet.timers.pending.size).toBe(0)

    const busy = setup(wire(workshopAtWork())) // task 2.1 is backpressured
    busy.controller.start()
    await busy.flush()
    expect(busy.timers.delays).toEqual([5000])
    busy.controller.setVisible(false)
    expect(busy.timers.pending.size).toBe(0)
    busy.controller.setVisible(true)
    await busy.flush()
    expect(busy.gets).toHaveLength(2)

    const cancelling = setup(wire(roomGhosts({ runs: [run({ cancelRequested: true })] })))
    cancelling.controller.start()
    await cancelling.flush()
    expect(cancelling.timers.delays).toEqual([5000])
  })

  it('does not poll a recording', async () => {
    const { controller, timers, flush } = setup(wire({ ...workshopAtWork(), readOnly: true }))
    controller.start()
    await flush()
    expect(timers.pending.size).toBe(0)
  })

  it('ignores every answer after dispose', async () => {
    const { controller, flush } = setup()
    controller.start()
    controller.dispose()
    await flush()
    expect(controller.getState().status).toBe('loading')
  })
})

describe('sending', () => {
  const answer = workshopAtWork()
  const cancel: RoomCommand = { kind: 'cancel_run', runId: 'task-1-2-a1', expectedVersion: 10 }

  async function ready(first: RoomGhosts = answer) {
    const kit = setup(wire(first))
    kit.controller.start()
    await kit.flush()
    return kit
  }

  it('sends each command to its own route with the command id and expected version, then re-reads', async () => {
    const waiting = projection({
      phaseOverrides: {
        requirements: { status: 'waiting', door: { status: 'waiting', proposal: doorProposal('requirements') } },
        tasks: tasksOpen.phases[2],
      },
    })
    const first: RoomGhosts = {
      ...answer,
      documents: [{ ...answer.documents[0], artifact: { ...answer.documents[0].artifact!, artifactRevision: doorProposal('requirements').artifactRevision } }, answer.documents[1], answer.documents[2]],
      runs: [...answer.runs, run(), run({ runId: 'design-1', ghostId: 'draughtsman', phase: 'design', sessionSlot: 'hh-draughtsman-design-1', canRetry: true })],
    }
    const kit = await ready(first)
    const commands: RoomCommand[] = [
      { kind: 'send_feedback', phase: 'requirements', feedback: 'Add a criterion for empty names.', expectedVersion: 10 },
      { kind: 'start_workshop', taskIds: ['2.2'], expectedVersion: 10 },
      cancel,
      { kind: 'retry_run', runId: 'design-1', expectedVersion: 10 },
    ]
    for (const command of commands) await kit.controller.send(command, context(first, waiting))
    const base = `/apps/haunted-house/api/mansions/${MANSION}/specs/${SPEC}`
    expect(kit.posts).toEqual([
      { path: `${base}/feedback`, body: { command_id: 'command-1000', expected_version: 10, phase: 'requirements', feedback: 'Add a criterion for empty names.' } },
      { path: `${base}/workshop/start`, body: { command_id: 'command-2000', expected_version: 10, task_ids: ['2.2'] } },
      { path: '/apps/haunted-house/api/room-ghosts/runs/task-1-2-a1/cancel', body: { command_id: 'command-3000', expected_version: 10, mansion_id: MANSION } },
      { path: '/apps/haunted-house/api/room-ghosts/runs/design-1/retry', body: { command_id: 'command-4000', expected_version: 10, mansion_id: MANSION } },
    ])
    // One read on start and one after each command.
    expect(kit.gets).toHaveLength(5)
    expect(kit.settledCalls).toHaveBeenCalledTimes(4)
    expect(kit.controller.getState()).toMatchObject({ inFlight: null, notice: 'Retry accepted. A fresh session takes the next attempt.' })
  })

  it('shows the command as in flight until the backend answers, and says the result once', async () => {
    const kit = await ready()
    let release!: () => void
    kit.answerPost(() => new Promise<void>((resolve) => (release = resolve)))
    const states: (string | null)[] = []
    kit.controller.subscribe((state) => states.push(state.inFlight))
    const sent = kit.controller.send(cancel, context(answer))
    await kit.flush()
    expect(kit.controller.getState()).toMatchObject({ inFlight: 'run:task-1-2-a1', notice: null })
    // A second press while the first is on its way sends nothing.
    await kit.controller.send(cancel, context(answer))
    expect(kit.posts).toHaveLength(1)
    release()
    await sent
    expect(kit.controller.getState()).toMatchObject({ inFlight: null, notice: 'Cancellation requested. The run stops when Crew confirms it.' })
  })

  it('sends nothing the last check refuses', async () => {
    const kit = await ready()
    await kit.controller.send({ ...cancel, expectedVersion: 9 }, context(answer))
    await kit.controller.send({ kind: 'retry_run', runId: 'task-1-2-a1', expectedVersion: 10 }, context(answer))
    await kit.controller.send(cancel, context(answer, projection({ version: 11 })))
    await kit.controller.send(cancel, context(answer, projection(), true))
    await kit.controller.send(cancel, { ...context(answer), gate: { allowed: false, block: 'authority', text: 'off', needsRefresh: false } })
    expect(kit.posts).toEqual([])
    expect(kit.settledCalls).not.toHaveBeenCalled()
  })

  it.each([
    [409, undefined, /room changed before your request arrived/],
    [400, undefined, /refused that request/],
    [404, undefined, /no longer exists/],
    [423, undefined, /integrity check/],
    [503, 'contract_unavailable', /contract it depends on is unavailable/],
    [405, undefined, /recording/],
    [504, undefined, /Crew did not answer in time/],
    [500, undefined, /could not be reached/],
  ] as const)('explains a %s refusal in fixed words, never the server text, and re-reads', async (status, code, text) => {
    const kit = await ready()
    kit.answerPost(() => httpError(status, code))
    await kit.controller.send(cancel, context(answer))
    const notice = kit.controller.getState().notice
    expect(notice).toMatch(text)
    expect(notice).not.toContain('raw server text')
    expect(kit.controller.getState().inFlight).toBeNull()
    expect(kit.gets).toHaveLength(2)
    expect(kit.posts).toHaveLength(1) // never repeated on its own
    expect(kit.settledCalls).toHaveBeenCalledTimes(1)
  })

  it('takes the room state from the re-read, not from the mutation answer', async () => {
    const kit = await ready()
    // Even an answer that looks like a projection is not applied.
    kit.answerPost(() => wire(roomGhosts({ version: 99 })))
    kit.answerNext(wire({ ...answer, version: 11, runs: [run({ ...answer.runs[0], canCancel: false, cancelRequested: true })] }))
    await kit.controller.send(cancel, context(answer))
    expect(kit.controller.getState().roomGhosts).toMatchObject({ version: 11, runs: [{ cancelRequested: true }] })
  })
})
