// The rhythm of the rooms with the real panels (Spec 8, Requirements 4, 11,
// 12 and 13). Each of the Warden's choices is pressed in the real house over a
// fake backend, and what goes out is compared with what the panel's own
// control sends: the same path and the same body, once. A choice that only
// looks sends nothing.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { READY_MADE_CHANGES } from '../../core/house-guide'
import type { RoomId } from '../../core/house-registry'
import type { RoomGhosts } from '../../core/room-projection'
import type { AppEvent } from '../../core/seance-event'
import type { WorkflowProjection } from '../../core/workflow-projection'
import { BASE, ghostEvent, wire } from '../../test/house-kit'
import { MANSION_DESCRIPTOR } from '../../test/house-projection-kit'
import { FEEDBACK_ROUTE, FakeRoomBackend, RUNS_BASE, WORKSHOP_START_ROUTE } from '../../test/room-house-kit'
import { REQUIREMENTS_WAITING, TASKS_APPROVED, requirementsWritten, roomGhosts, run, workshopAtWork } from '../../test/room-kit'
import { MANSION, SHA_B, decision, doorProposal, eventId, projection, riskyProposal } from '../../test/workflow-arbitraries'
import { House } from './House'

const host = vi.hoisted(() => ({
  backend: null as unknown as { get: (path: string) => Promise<unknown>; post: (path: string, body?: unknown) => Promise<unknown> },
  handlers: new Map<string, Set<(data: unknown) => void>>(),
}))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({ get: (path: string) => host.backend.get(path), post: (path: string, body?: unknown) => host.backend.post(path, body), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: (event: string, cb: (data: unknown) => void) => {
    useEffect(() => {
      const set = host.handlers.get(event) ?? new Set()
      host.handlers.set(event, set)
      set.add(cb)
      return () => {
        set.delete(cb)
      }
    }, [event, cb])
    return undefined as unknown as () => void
  },
  useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
  useNotify: () => () => {},
  useNavBadge: () => () => {},
}))

let backend: FakeRoomBackend

async function house(workflow: WorkflowProjection, rooms: RoomGhosts, log: AppEvent[] = []) {
  backend = new FakeRoomBackend(workflow, rooms)
  backend.log = [...log]
  host.backend = backend
  const view = render(<House mansion={MANSION_DESCRIPTOR} onReturn={() => {}} />)
  await waitFor(() => expect(view.container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
  return view
}

const says = () => document.querySelector<HTMLElement>('[data-guide-text]')!.textContent
const offers = () => Array.from(document.querySelectorAll('[data-guide-primary] .hh-guide-option-label'), (label) => label.textContent)
const stage = () => document.querySelector<HTMLElement>('[data-stage-room]')!.getAttribute('data-stage-room')
const sheet = () => document.querySelector<HTMLElement>('.hh-ui-panel')
const everyChoice = () => Array.from(document.querySelectorAll<HTMLElement>('[data-guide-option]'))
const control = (key: string) => document.querySelector<HTMLElement>(`[data-guide-control="${key}"]`)

/** One of the Warden's choices, by its label. There is exactly one. */
function choice(label: string): HTMLElement {
  const found = everyChoice().filter((button) => button.querySelector('.hh-guide-option-label')?.textContent === label)
  expect(found, label).toHaveLength(1)
  return found[0]
}

const press = async (button: HTMLElement) => act(async () => fireEvent.click(button))
/** Walks to a room the way the map does. */
const walkTo = async (room: RoomId) => {
  await press(document.querySelector<HTMLElement>(`[data-room-control="${room}"]`)!)
  await press(document.querySelector<HTMLElement>('.hh-ui-panel-close')!)
}

beforeEach(() => {
  host.handlers.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a Door that waits', () => {
  it('offers to read, to ask for a change and to go to the Door, in that order, and decides nothing in the bare room', async () => {
    await house(REQUIREMENTS_WAITING, requirementsWritten())
    expect(stage()).toBe('study')
    expect(says()).toBe('The Archivist has finished what it must do. The door waits for you.')
    expect(offers()).toEqual(['Read what it must do', 'Ask for a change', 'Go to the door', 'See the whole house'])
    await press(screen.getByRole('button', { name: 'Something else…' }))
    expect(everyChoice().filter((button) => button.getAttribute('data-kind') === 'decide')).toEqual([])
  })

  it('offers to open it, to ask for a change and to read again once the Door is on show, with "Keep the door shut" in the long list', async () => {
    await house(REQUIREMENTS_WAITING, requirementsWritten())
    await press(choice('Go to the door'))
    expect(sheet()).toHaveAttribute('data-surface', 'door')
    expect(offers().slice(0, 3)).toEqual(['Open the door', 'Ask for a change', 'Read what it must do again'])
    await press(screen.getByRole('button', { name: 'Something else…' }))
    const keep = choice('Keep the door shut')
    expect(keep.closest('[data-guide-primary]')).toBeNull()
    expect(keep).toHaveAttribute('data-presses', 'reject:door-requirements-1')
    // Looking, walking and opening the long list sent nothing.
    expect(backend.posts).toEqual([])
    expect(backend.roomPosts).toEqual([])
  })

  it('asks for a change through the existing request: a ready-made note fills the real field, and sending presses the real button', async () => {
    await house(REQUIREMENTS_WAITING, requirementsWritten())
    await press(choice('Ask for a change'))
    // The Study's sheet is open with its own revision request, and the balloon offers what to ask for.
    expect(sheet()).toHaveAttribute('data-room-panel', 'study')
    const field = control('revise-text:requirements') as HTMLTextAreaElement
    expect(field).not.toBeNull()
    const ready = READY_MADE_CHANGES.requirements
    expect(offers()).toEqual([...ready.map((change) => change.label), 'Write my own'])
    expect(backend.roomPosts).toEqual([])

    await press(choice(ready[0].label))
    // The note is in the form's own field, as if typed. Nothing has gone out.
    expect(field.value).toBe(ready[0].text)
    expect(backend.roomPosts).toEqual([])
    expect(offers()[0]).toBe('Send this change')

    await press(choice('Send this change'))
    await waitFor(() => expect(backend.roomPosts).toHaveLength(1))
    // Exactly what the form's own Send sends.
    expect(backend.roomPosts[0]).toEqual({ path: FEEDBACK_ROUTE, body: { command_id: expect.any(String), expected_version: 10, phase: 'requirements', feedback: ready[0].text } })
    // A change was asked for. The Door was not decided.
    expect(backend.posts).toEqual([])
  })

  it('puts focus in the real field for "Write my own", and sends nothing', async () => {
    await house(REQUIREMENTS_WAITING, requirementsWritten())
    await press(choice('Ask for a change'))
    await press(choice('Write my own'))
    expect(control('revise-text:requirements')).toHaveFocus()
    expect(backend.roomPosts).toEqual([])
    expect(backend.posts).toEqual([])
  })
})

describe('work that can go on', () => {
  it('goes to the next room once a Door is open', async () => {
    const approved = projection({
      version: 21,
      phaseOverrides: {
        requirements: { status: 'approved', ghostIds: ['archivist'], door: { status: 'open', proposal: doorProposal('requirements', { status: 'approved', decision: decision('approved', 21) }) } },
        design: { status: 'ready' },
      },
    })
    await house(approved, requirementsWritten({ version: 21 }))
    // The house lands where the work is, and the Study points on.
    expect(stage()).toBe('drafting-room')
    await walkTo('study')
    expect(offers()[0]).toBe('Go to the Drafting Room')
    await press(choice('Go to the Drafting Room'))
    expect(sheet()).toHaveAttribute('data-room-panel', 'drafting-room')
    expect(backend.posts).toEqual([])
  })

  it('builds every task that is ready: each allowed task is ticked, then the board’s own start is pressed once', async () => {
    await house(TASKS_APPROVED, { ...workshopAtWork(), runs: [] })
    expect(stage()).toBe('workshop')
    expect(offers()[0]).toBe('Build everything that is ready')
    const build = choice('Build everything that is ready')
    expect(build).toHaveAttribute('data-presses', '["room","workshop"] task:* start-workshop')
    await press(build)
    await waitFor(() => expect(backend.roomPosts).toHaveLength(1))
    // Every task the board allows was ticked and sent, in the board's own request. (The board clears its ticks once the start is accepted.)
    const allowed = Array.from(sheet()!.querySelectorAll<HTMLInputElement>('[data-guide-control^="task:"]'))
      .filter((box) => !box.disabled && box.getAttribute('aria-disabled') !== 'true')
      .map((box) => box.getAttribute('data-guide-control')!.slice('task:'.length))
    expect(allowed.length).toBeGreaterThan(0)
    expect(backend.roomPosts[0]).toEqual({ path: WORKSHOP_START_ROUTE, body: { command_id: expect.any(String), expected_version: 10, task_ids: allowed } })
    expect(backend.posts).toEqual([])
  })

  it('tries a failed run again through that run’s own retry control', async () => {
    const failed = [ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing', room: 'study' }), ghostEvent(2, 'archivist', 'run_failed', { reason: 'crew_error' })]
    await house(projection({ phaseOverrides: { requirements: { status: 'failed', ghostIds: ['archivist'] } } }), roomGhosts({ runs: [run({ runId: 'archivist-run', canRetry: true })] }), failed)
    expect(stage()).toBe('study')
    expect(says()).toMatch(/^The Archivist failed\./)
    const retry = everyChoice().find((button) => (button.getAttribute('data-presses') ?? '').includes('retry:archivist-run'))!
    // It is the first thing offered.
    expect(retry.querySelector('.hh-guide-option-label')!.textContent).toBe(offers()[0])
    await press(retry)
    await waitFor(() => expect(backend.roomPosts).toHaveLength(1))
    expect(backend.roomPosts[0]).toEqual({ path: `${RUNS_BASE}/archivist-run/retry`, body: { command_id: expect.any(String), expected_version: 10, mansion_id: MANSION } })
    expect(backend.posts).toEqual([])
  })
})

describe('the catch', () => {
  const held = projection({ version: 20, waitingCount: 1, riskyProposals: [riskyProposal({ createdSequence: 15 })] })
  const log = [ghostEvent(3, 'tinker-2', 'run_started', { reason: 'Building task 2', room: 'workshop' })]

  it('says the ghost is held, opens the sheet at what it asked, and only then offers to allow or refuse it', async () => {
    await house(held, roomGhosts({ version: 20 }), log)
    expect(stage()).toBe('workshop')
    // The ghost by name, and what it asked to do, in the house's own bounded words.
    expect(says()).toMatch(/^Tinker 2 is held\. Tinker 2 asks to /)
    expect(document.querySelector('[data-guide-pose]')).toHaveAttribute('data-guide-pose', 'holding')
    expect(document.querySelector('[data-guide-pose]')!.textContent).toBe('The Warden is holding Tinker 2.')
    // Nothing decides until the proposal is on show.
    await press(screen.getByRole('button', { name: 'Something else…' }))
    expect(everyChoice().filter((button) => button.getAttribute('data-kind') === 'decide')).toEqual([])
    await press(screen.getByRole('button', { name: 'Something else…' }))

    await press(everyChoice()[0])
    expect(sheet()).toHaveAttribute('data-room-panel', 'workshop')
    // Focus is on the proposal, one Tab before its buttons: a second Enter decides nothing.
    const focused = document.activeElement as HTMLElement
    expect(focused.getAttribute('data-proposal')).toBe('risky-1')
    fireEvent.keyDown(focused, { key: 'Enter' })
    expect(backend.posts).toEqual([])
    expect(offers().slice(0, 2)).toEqual(['Allow it once', 'Refuse it'])
  })

  it('refuses it through that proposal’s own control', async () => {
    await house(held, roomGhosts({ version: 20 }), log)
    await press(everyChoice()[0])
    const refused = projection({ version: 21, riskyProposals: [riskyProposal({ createdSequence: 15, status: 'rejected', decision: decision('rejected', 21) })] })
    backend.onPost = () => {
      backend.workflow = refused
      return { event_id: eventId(21), sequence: 21, version: 21, workflow: wire(refused) }
    }
    await press(choice('Refuse it'))
    await waitFor(() => expect(backend.posts).toHaveLength(1))
    expect(backend.posts[0]).toEqual({ path: `${BASE}/approvals/risky-1/reject`, body: { command_id: expect.any(String), expected_version: 20, action_digest: SHA_B } })
  })
})

describe('a room with nothing to decide', () => {
  it('offers navigation only in the locked Séance Room, with its own words', async () => {
    await house(projection(), roomGhosts())
    await walkTo('seance-room')
    expect(stage()).toBe('seance-room')
    await press(screen.getByRole('button', { name: 'Something else…' }))
    // Ways to go, the guide's settings and the way out. Nothing that starts, decides or asks.
    expect(everyChoice().filter((button) => ['start', 'decide', 'ask'].includes(button.getAttribute('data-kind') ?? ''))).toEqual([])
    expect(everyChoice().every((button) => /^(\["room",|shell:)/.test(button.getAttribute('data-presses') ?? ''))).toBe(true)
  })

  it('gives the Study, the Drafting Room and the Workshop the same choices in the same order for the same situation', async () => {
    // The same situation three times: the room's own phase can be started and nothing else is going on.
    const opened = (phase: 'requirements' | 'design') => ({ status: 'approved' as const, door: { status: 'open' as const, proposal: doorProposal(phase, { status: 'approved', decision: decision('approved', 9) }) } })
    const situations: readonly { readonly room: RoomId; readonly workflow: WorkflowProjection }[] = [
      { room: 'study', workflow: projection() },
      { room: 'drafting-room', workflow: projection({ phaseOverrides: { requirements: opened('requirements'), design: { status: 'ready' } } }) },
      { room: 'workshop', workflow: projection({ phaseOverrides: { requirements: opened('requirements'), design: opened('design'), tasks: { status: 'ready' } } }) },
    ]
    const rhythm: string[][] = []
    for (const { room, workflow } of situations) {
      const view = await house(workflow, roomGhosts())
      // The house lands in the room whose turn it is.
      expect(stage()).toBe(room)
      rhythm.push(Array.from(document.querySelectorAll('[data-guide-primary] [data-guide-option]'), (button) => button.getAttribute('data-kind')!))
      view.unmount()
    }
    expect(rhythm[0][0]).toBe('start')
    expect(rhythm[1]).toEqual(rhythm[0])
    expect(rhythm[2]).toEqual(rhythm[0])
  })
})

describe('what was made', () => {
  const open = (phase: 'requirements' | 'design' | 'tasks' | 'implementation') => ({ status: 'open' as const, proposal: doorProposal(phase, { status: 'approved', decision: decision('approved', 30) }) })
  const built = projection({
    version: 40,
    phaseOverrides: {
      requirements: { status: 'approved', ghostIds: ['archivist'], door: open('requirements') },
      design: { status: 'approved', ghostIds: ['draughtsman'], door: open('design') },
      tasks: { status: 'approved', ghostIds: ['foreman'], door: open('tasks') },
      implementation: { status: 'done', door: open('implementation') },
    },
  })

  it('is offered in every room once every Door is open, and opens the Foyer’s sheet at the list, sending nothing', async () => {
    await house(built, { ...workshopAtWork(40), runs: [] })
    for (const room of ['foyer', 'study', 'drafting-room', 'workshop', 'attic'] as const) {
      await walkTo(room)
      await press(screen.getByRole('button', { name: 'Something else…' }))
      expect(everyChoice().filter((button) => button.querySelector('.hh-guide-option-label')?.textContent === 'See what was made'), room).toHaveLength(1)
      await press(screen.getByRole('button', { name: 'Something else…' }))
    }
    await press(choice('See what was made'))
    expect(sheet()).toHaveAttribute('data-room-panel', 'foyer')
    const section = document.querySelector<HTMLElement>('[data-section="built"]')!
    expect(section).toHaveFocus()
    // Each approved document under its plain word, Kiro's word and its real path, in phase order.
    expect(Array.from(section.querySelectorAll('[data-built-row]'), (row) => Array.from(row.children, (cell) => cell.textContent))).toEqual([
      ['What it must do', 'requirements', '.kiro/specs/demo/requirements.md'],
      ['How it will work', 'design', '.kiro/specs/demo/design.md'],
      ['To-do list', 'tasks', '.kiro/specs/demo/tasks.md'],
    ])
    expect(section.querySelector('[data-built-folder]')!.textContent).toBe(MANSION_DESCRIPTOR.displayPath)
    expect(section.querySelectorAll('button, a, input, textarea, select')).toHaveLength(0)
    expect(backend.posts).toEqual([])
    expect(backend.roomPosts).toEqual([])
  })
})
