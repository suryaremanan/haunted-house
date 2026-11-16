// Artifact-first room panels on the existing house (Spec 5 tasks 9.3, 9.4,
// 9.6 and 9.7): Study, Drafting Room and Workshop with their documents, task
// board, runs, recovery controls and secondary session links, wired to the
// same House, Door and approval controls as before.
// **Validates: Requirements 4.2, 4.3, 4.4, 4.6, 4.7, 5.6, 5.7, 6.6, 6.7, 7.9, 7.10, 8.1, 8.2, 8.3, 8.6, 9.7, 11.1 to 11.9, 12.1, 12.5, 12.6**
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOOR_STATUS_TEXT } from '../../core/house-view'
import type { RoomGhosts } from '../../core/room-projection'
import { DOOR_STATUSES, type WorkflowProjection } from '../../core/workflow-projection'
import { BASE, ghostEvent, wire } from '../../test/house-kit'
import { FEEDBACK_ROUTE, FakeRoomBackend, ROOM_ROUTE, RUNS_BASE, WORKSHOP_START_ROUTE, httpError } from '../../test/room-house-kit'
import {
  GUEST_BOOK_TASKS,
  GUEST_BOOK_WAVES,
  REQUIREMENTS_WAITING,
  SPEC,
  TASKS_APPROVED,
  artifact,
  document as roomDocument,
  requirementsWritten,
  roomGhosts,
  run,
  workshopAtWork,
} from '../../test/room-kit'
import { MANSION, SHA_A, decision, doorProposal, projection, riskyProposal } from '../../test/workflow-arbitraries'
import { liveRegions } from '../foyer/foyer-test-kit'
import type { SeanceRoomSetting } from '../../core/house-registry'
import { MANSION_DESCRIPTOR } from '../../test/house-projection-kit'
import { ROOM_OUTPUT_STYLES } from '../../components/room-output-styles'
import { House } from './House'
import { HOUSE_PANEL_STYLES } from './panel-styles'

const host = vi.hoisted(() => ({
  backend: null as unknown as { get: (path: string) => Promise<unknown>; post: (path: string, body?: unknown) => Promise<unknown> },
  handlers: new Map<string, Set<(data: unknown) => void>>(),
  notify: vi.fn(),
  badge: vi.fn(),
  openChat: vi.fn(),
}))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({
    get: (path: string) => host.backend.get(path),
    post: (path: string, body?: unknown) => host.backend.post(path, body),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  }),
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
  useNotify: () => host.notify,
  useNavBadge: () => host.badge,
  useChatLauncher: () => ({ openChat: host.openChat }),
}))

type RoomName = 'Study' | 'Drafting Room' | 'Workshop' | 'Séance Room'

let backend: FakeRoomBackend
const announce = vi.fn<(message: string) => void>()
const onReturn = vi.fn()

/** The Archivist finished; its requirements wait at the Door. Everything is at version 10. */
const STUDY_LOG = [
  ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing requirements', room: 'study' }),
  ghostEvent(2, 'archivist', 'run_completed', { reason: 'requirements.md is ready for review' }),
]
const studyAnswer = (overrides: Partial<RoomGhosts> = {}): RoomGhosts =>
  requirementsWritten({
    runs: [run({ runId: 'archivist-run', sessionSlot: 'hh-archivist', summary: 'Wrote 2 EARS criteria and a glossary.', sessionLink: 'hh-archivist' })],
    ...overrides,
  })

/** The plan is approved, Tinker 1 works on task 1.2. */
const WORKSHOP_LOG = [ghostEvent(1, 'tinker-1', 'run_started', { reason: 'Building task 1.2', room: 'workshop' })]
const workshopAnswer = (overrides: Partial<RoomGhosts> = {}): RoomGhosts => {
  const base = workshopAtWork()
  return {
    ...base,
    taskPlan: {
      ...base.taskPlan!,
      tasks: base.taskPlan!.tasks.map((item) => (item.taskId === '1.2' ? { ...item, outcome: { ...item.outcome!, runId: 'tinker-1-run' } } : item)),
    },
    runs: [run({ ...base.runs[0], runId: 'tinker-1-run', sessionSlot: 'hh-tinker-1', sessionLink: 'hh-tinker-1' })],
    ...overrides,
  }
}

let watcher: MutationObserver | null = null

async function mount(workflow: WorkflowProjection, rooms: RoomGhosts | Error | { raw: unknown }, log = STUDY_LOG, props: { seanceRoom?: SeanceRoomSetting } = {}) {
  backend = new FakeRoomBackend(workflow, rooms)
  backend.log = [...log]
  host.backend = backend
  const view = render(<House mansion={MANSION_DESCRIPTOR} onReturn={onReturn} {...props} />)
  // Everything the page's one live region says is recorded as one `announce` call.
  const region = view.container.querySelector('[data-announcer]')!
  watcher = new MutationObserver(() => {
    if (region.textContent !== '') announce(region.textContent ?? '')
  })
  watcher.observe(region, { childList: true, subtree: true, characterData: true })
  await screen.findByRole('button', { name: /^Study\./ })
  await waitFor(() => expect(view.container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
  await waitFor(() => expect(backend.roomReads).toBeGreaterThan(0))
  return view
}

const roomButton = (name: RoomName) => screen.getByRole('button', { name: new RegExp(`^${name}\\.`) })

async function openRoom(name: RoomName) {
  fireEvent.click(roomButton(name))
  const panel = await screen.findByRole('region', { name })
  await waitFor(() => expect(panel.querySelector('[data-output-note]')).toBeNull())
  return panel
}

const follows = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

beforeEach(() => {
  host.handlers.clear()
  host.notify.mockReset()
  host.badge.mockReset()
  host.openChat.mockReset()
  announce.mockReset()
})

afterEach(() => {
  watcher?.disconnect()
  watcher = null
  vi.useRealTimers()
})

describe('Study and Drafting Room: artifact first', () => {
  it('shows the requirements before the phase state, the Door, the ghost and the session link', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    const panel = await openRoom('Study')

    const artifactView = within(panel).getByRole('article', { name: 'Requirements document' })
    expect(within(artifactView).getByRole('region', { name: 'Requirements document text' })).toHaveTextContent('THE Guest_Book SHALL store the entry.')
    expect(artifactView.querySelector('[data-digest]')).toHaveTextContent(SHA_A)
    expect(artifactView).toHaveTextContent("Valid: it passed the house's checks")
    expect(within(artifactView).getByRole('list', { name: /may write/i })).toHaveTextContent('.kiro/specs/demo/requirements.md')

    const phaseLine = within(panel).getByText('Requirements: Waiting for your decision')
    const door = within(panel).getByRole('article', { name: 'Requirements door' })
    const ghosts = within(panel).getByText('Ghosts in this room')
    const ghostLine = panel.querySelector('.hh-ghost-lines [data-ghost="archivist"]')!
    expect(ghostLine).toHaveTextContent(/^Archivist: Done/)
    const link = within(panel).getByRole('button', { name: "Open Archivist's Crew session (Done)" })
    const order = [artifactView, phaseLine, door, ghosts, ghostLine, link]
    for (let index = 1; index < order.length; index += 1) expect(follows(order[index - 1], order[index])).toBe(true)

    // The run's own summary sits with the runs, after the decisions.
    expect(within(panel).getByText('Wrote 2 EARS criteria and a glossary.')).toBeInTheDocument()
    expect(within(panel).getByText('Archivist: Done. Attempt 1 of 3.')).toBeInTheDocument()
  })

  it('has no chat composer: nothing to type until a revision is explicitly asked for', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    const panel = await openRoom('Study')
    expect(within(panel).queryAllByRole('textbox')).toEqual([])
    expect(panel.querySelectorAll('textarea, input[type="text"], [contenteditable]')).toHaveLength(0)
    expect(panel.textContent).not.toMatch(/chat with|send a message|type a message/i)
  })

  it('keeps the existing Door controls as the only decision controls', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    const panel = await openRoom('Study')
    expect(within(panel).getAllByRole('button', { name: /^Approve / })).toHaveLength(1)
    expect(within(panel).getAllByRole('button', { name: /^Reject / })).toHaveLength(1)
    backend.onPost = () => {
      throw httpError(409, { workflow: wire(REQUIREMENTS_WAITING) })
    }
    fireEvent.click(within(panel).getByRole('button', { name: /^Approve Requirements door/ }))
    await waitFor(() => expect(backend.posts).toHaveLength(1))
    // The decision went to the Spec 4 Door route; Room Ghosts has no approval route.
    expect(backend.posts[0].path).toBe(`${BASE}/doors/door-requirements-1/approve`)
    expect(backend.roomPosts).toEqual([])
  })

  it.each(DOOR_STATUSES)('shows the %s Door as an icon and words after the document', async (status) => {
    const proposal =
      status === 'sealed'
        ? null
        : doorProposal('design', {
            status: status === 'waiting' ? 'pending' : status === 'open' ? 'approved' : 'rejected',
            createdSequence: 5,
            decision: status === 'waiting' ? null : decision(status === 'open' ? 'approved' : 'rejected', 6),
          })
    const answer = roomGhosts({ documents: [roomDocument('requirements'), roomDocument('design', { artifact: proposal === null ? null : artifact() }), roomDocument('tasks')] })
    await mount(projection({ phaseOverrides: { design: { status: status === 'waiting' ? 'waiting' : 'ready', door: { status, proposal } } } }), answer)
    const panel = await openRoom('Drafting Room')
    const artifactView = within(panel).getByRole('article', { name: 'Design document' })
    const doorLine = panel.querySelector(`.hh-phase [data-tone] svg.lucide-${status === 'sealed' ? 'lock' : status === 'waiting' ? 'door-closed' : status === 'open' ? 'door-open' : 'ban'}`)?.closest('.hh-room-line')
    expect(doorLine).not.toBeNull()
    expect(follows(artifactView, doorLine!)).toBe(true)
    // The map says the exact state word in the room's name and the Spec 4 words on the Door control.
    expect(roomButton('Drafting Room')).toHaveAccessibleName(`Drafting Room. Phase: design. Door: ${status}. Ghost: not applicable.`)
    const doorControl = screen.getByRole('button', { name: `Design door of the Drafting Room. State: ${status}.` })
    expect(doorControl).toHaveTextContent(DOOR_STATUS_TEXT[status])
    expect(doorControl.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('shows deterministic findings and offers Retry for a failed run, never an approval', async () => {
    const findings = [{ code: 'ears_pattern_missing', location: 'criterion:1.2', message: 'This criterion matches no EARS pattern.' }]
    const failedLog = [
      ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing requirements', room: 'study' }),
      ghostEvent(2, 'archivist', 'run_failed', { reason: 'artifact_invalid' }),
    ]
    const answer = roomGhosts({
      documents: [roomDocument('requirements', { artifact: artifact({ validated: false, findings }) }), roomDocument('design'), roomDocument('tasks')],
      runs: [run({ runId: 'archivist-run', sessionSlot: 'hh-archivist', canRetry: true, reasonCode: 'artifact_invalid' })],
    })
    await mount(projection({ phaseOverrides: { requirements: { status: 'failed', ghostIds: ['archivist'] } } }), answer, failedLog)
    const panel = await openRoom('Study')
    expect(within(panel).getByRole('list', { name: 'Requirements document findings' })).toHaveTextContent('This criterion matches no EARS pattern.')
    expect(within(panel).getByText('Sealed door: approve the requirements to open it.')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /^Approve / })).toBeNull()

    fireEvent.click(within(panel).getByRole('button', { name: 'Retry with a fresh session' }))
    await waitFor(() => expect(backend.roomPosts).toHaveLength(1))
    expect(backend.roomPosts[0]).toEqual({
      path: `${RUNS_BASE}/archivist-run/retry`,
      body: { command_id: expect.stringMatching(/^[A-Za-z0-9-]{8,64}$/), expected_version: 10, mansion_id: MANSION },
    })
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Retry accepted. A fresh session takes the next attempt.'))
  })
})

describe('revision request', () => {
  it('opens on request, sends one bounded note to the feedback route, and keeps the Door pending', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    const panel = await openRoom('Study')
    const toggle = within(panel).getByRole('button', { name: 'Ask for a revision of the requirements' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // It comes after the Door decision controls: a secondary action.
    expect(follows(within(panel).getByRole('button', { name: /^Reject / }), toggle)).toBe(true)

    fireEvent.click(toggle)
    const form = within(panel).getByRole('form', { name: 'Ask for a revision of the requirements' })
    const field = within(form).getByRole('textbox', { name: 'What should change?' })
    expect(field).toHaveFocus()
    expect(field).toHaveAccessibleDescription(/same ghost session.*door stays sealed/i)

    // An empty note is refused here and nothing is sent.
    fireEvent.click(within(form).getByRole('button', { name: 'Send revision request' }))
    expect(within(form).getByText('Write what should change before sending.')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(backend.roomPosts).toEqual([])

    fireEvent.change(field, { target: { value: '  Add a criterion for empty names.  ' } })
    expect(backend.roomPosts).toEqual([]) // typing sends nothing
    fireEvent.click(within(form).getByRole('button', { name: 'Send revision request' }))
    await waitFor(() => expect(backend.roomPosts).toHaveLength(1))
    expect(backend.roomPosts[0]).toEqual({
      path: FEEDBACK_ROUTE,
      body: { command_id: expect.any(String), expected_version: 10, phase: 'requirements', feedback: 'Add a criterion for empty names.' },
    })
    expect(backend.posts).toEqual([]) // no Door decision was made
    await waitFor(() => expect(announce).toHaveBeenCalledWith(expect.stringMatching(/^Revision request sent to the same session\./)))
    // The form closed and focus went back to the control that opened it.
    await waitFor(() => expect(within(panel).queryByRole('form')).toBeNull())
    expect(within(panel).getByRole('button', { name: 'Ask for a revision of the requirements' })).toHaveFocus()
    expect(within(panel).getByRole('button', { name: /^Approve Requirements door/ })).toBeInTheDocument()
  })

  it('closes with Escape without closing the room, and returns focus', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    const panel = await openRoom('Study')
    const toggle = within(panel).getByRole('button', { name: 'Ask for a revision of the requirements' })
    fireEvent.click(toggle)
    const field = within(panel).getByRole('textbox', { name: 'What should change?' })
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(within(panel).queryByRole('form')).toBeNull()
    expect(toggle).toHaveFocus()
    expect(screen.getByRole('region', { name: 'Study' })).toBeInTheDocument()
    expect(backend.roomPosts).toEqual([])
  })

  it('is not offered once the Door is approved, or while the ghost is still working', async () => {
    const approved = projection({
      phaseOverrides: { requirements: { status: 'approved', ghostIds: ['archivist'], door: { status: 'open', proposal: doorProposal('requirements', { status: 'approved', decision: decision('approved', 9) }) } } },
    })
    const first = await mount(approved, studyAnswer())
    expect(within(await openRoom('Study')).queryByRole('button', { name: /Ask for a revision/ })).toBeNull()
    first.unmount()
    await mount(projection({ phaseOverrides: { requirements: { status: 'working', ghostIds: ['archivist'] } } }), studyAnswer({ documents: roomGhosts().documents }))
    expect(within(await openRoom('Study')).queryByRole('button', { name: /Ask for a revision/ })).toBeNull()
  })
})

describe('session link', () => {
  it('comes after the document and status, and opens exactly the run slot with nothing else', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    const panel = await openRoom('Study')
    const link = within(panel).getByRole('button', { name: "Open Archivist's Crew session (Done)" })
    expect(link).toHaveClass('hh-button-quiet')
    expect(link).not.toHaveClass('hh-button-primary')
    for (const earlier of [within(panel).getByRole('article', { name: 'Requirements document' }), within(panel).getByRole('article', { name: 'Requirements door' })]) {
      expect(follows(earlier, link)).toBe(true)
    }
    expect(host.openChat).not.toHaveBeenCalled()
    fireEvent.click(link)
    expect(host.openChat).toHaveBeenCalledTimes(1)
    // One property, the slot key: no message, agent or new-chat option.
    expect(host.openChat.mock.calls[0]).toEqual([{ slotKey: 'hh-archivist' }])
    expect(backend.roomPosts).toEqual([])
    expect(backend.posts).toEqual([])
  })

  it('stays off, with its reason, while the backend reports no verified link', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer({ runs: [run({ runId: 'archivist-run', sessionSlot: 'hh-archivist', sessionLink: null })] }))
    const panel = await openRoom('Study')
    const link = within(panel).getByRole('button', { name: "Open Archivist's Crew session (Done)" })
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).toHaveAccessibleDescription(/not available yet/)
    fireEvent.click(link)
    expect(host.openChat).not.toHaveBeenCalled()
  })
})

describe('Workshop task board', () => {
  it('shows the task plan document, then the board by wave, before phase state and decisions', async () => {
    await mount(TASKS_APPROVED, workshopAnswer(), WORKSHOP_LOG)
    const panel = await openRoom('Workshop')
    const plan = within(panel).getByRole('article', { name: 'Task plan' })
    const board = within(panel).getByRole('region', { name: 'Task board' })
    const phaseLine = within(panel).getByText('Tasks: Approved')
    expect(follows(plan, board)).toBe(true)
    expect(follows(board, phaseLine)).toBe(true)

    expect(within(board).getByText('1 of 5 tasks done. 1 of 3 Tinkers working.')).toBeInTheDocument()
    const waves = within(board).getAllByRole('group')
    expect(waves.map((group) => group.getAttribute('aria-labelledby')).every(Boolean)).toBe(true)
    expect(waves.map((group) => within(group).getAllByRole('listitem').filter((item) => item.hasAttribute('data-task')).map((item) => item.getAttribute('data-task')))).toEqual([
      ['1.2', '2.1'],
      ['1.3', '2.2'],
      ['1.1'],
    ])
    expect(within(board).getByText('Wave 1')).toBeInTheDocument()
    expect(within(board).getByText('Outside the waves')).toBeInTheDocument()
  })

  it('says every task state in words next to an icon, with claims, requirements and optional markers', async () => {
    await mount(TASKS_APPROVED, workshopAnswer(), WORKSHOP_LOG)
    const board = within(await openRoom('Workshop')).getByRole('region', { name: 'Task board' })
    const taskItem = (id: string) => board.querySelector(`[data-task="${id}"]`) as HTMLElement
    const status = (id: string) => taskItem(id).querySelector('[data-task-status]')!

    expect(status('1.1')).toHaveTextContent('Done')
    expect(status('1.2')).toHaveTextContent('A Tinker is working on it. Attempt 1 of 3')
    expect(status('2.1')).toHaveTextContent('Queued: waiting for capacity')
    expect(status('1.3')).toHaveTextContent('Queued')
    expect(status('2.2')).toHaveTextContent('Not selected')
    for (const id of ['1.1', '1.2', '2.1', '1.3', '2.2']) expect(status(id).querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)

    expect(taskItem('2.1').querySelector('[data-task-detail]')).toHaveTextContent(
      'Crew has no room for another ghost right now. Next try in 4 seconds (2 refusals so far). This does not use up an attempt.',
    )
    expect(taskItem('2.1')).toHaveTextContent('src/guestbook/render.py, src/guestbook/templates/*.html')
    expect(taskItem('1.2')).toHaveTextContent('1.3, 2.1, 2.2, 2.3')
    expect(within(taskItem('1.3')).getByText('Optional')).toBeInTheDocument()
    expect(within(taskItem('1.2')).queryByText('Optional')).toBeNull()

    // The Tinker of task 1.2: its state, its claim, its cancel control and its own session link.
    expect(taskItem('1.2')).toHaveTextContent('Tinker 1: Working, task 1.2. Attempt 1 of 3.')
    expect(taskItem('1.2')).toHaveTextContent('This run may write only: src/guestbook/store.py')
    expect(within(taskItem('1.2')).getByRole('button', { name: "Cancel Tinker 1's run" })).toBeInTheDocument()
    expect(within(taskItem('1.2')).getAllByRole('button', { name: /Crew session/ })).toHaveLength(1)
    // The run is on the board, so it is not listed a second time below.
    expect(screen.getByRole('region', { name: 'Workshop' }).querySelector('[data-room-runs]')).toBeNull()
  })

  it('shows three Tinkers working and a fourth task queued, never four', async () => {
    const tasks = [...GUEST_BOOK_TASKS.slice(1), { ...GUEST_BOOK_TASKS[0], taskId: '3.1', title: 'Add the footer', complete: false, wave: 0 }].map((item, index) => ({
      ...item,
      wave: 0,
      selected: true,
      outcome: index < 3 ? { status: 'active' as const, attempt: 1, runId: `tinker-${index + 1}-run`, reasonCode: null } : { status: 'queued' as const, attempt: 0, runId: null, reasonCode: null },
      backpressure: index === 3 ? { dispatchFailures: 0, nextDelaySeconds: 1, lastReason: 'local_capacity' as const } : null,
    }))
    const answer = workshopAnswer({
      taskPlan: { tasks, waves: [tasks.map((item) => item.taskId)], findings: [] },
      runs: tasks.slice(0, 3).map((item, index) =>
        run({ runId: `tinker-${index + 1}-run`, ghostId: `tinker-${index + 1}`, sessionSlot: `hh-tinker-${index + 1}`, phase: 'implementation', taskId: item.taskId, canCancel: true, claimPaths: [...item.writes] }),
      ),
    })
    const log = [1, 2, 3].map((n) => ghostEvent(n, `tinker-${n}`, 'run_started', { reason: 'Building', room: 'workshop' }))
    await mount(TASKS_APPROVED, answer, log)
    const board = within(await openRoom('Workshop')).getByRole('region', { name: 'Task board' })
    expect(within(board).getByText('0 of 5 tasks done. 3 of 3 Tinkers working.')).toBeInTheDocument()
    expect(board.querySelectorAll('[data-task][data-status="active"]')).toHaveLength(3)
    const queued = board.querySelector('[data-task][data-status="backpressure"]')!
    expect(queued).toHaveTextContent('All 3 Tinker seats are taken. Next try in 1 second (0 refusals so far). This does not use up an attempt.')
    expect(within(board).getAllByRole('button', { name: /^Cancel Tinker \d's run$/ })).toHaveLength(3)
  })

  it('starts only the ticked tasks, only on a press, through the Workshop route', async () => {
    const idle = workshopAnswer({ runs: [], taskPlan: { tasks: GUEST_BOOK_TASKS, waves: GUEST_BOOK_WAVES, findings: [] } })
    await mount(TASKS_APPROVED, idle, [])
    const panel = await openRoom('Workshop')
    const board = within(panel).getByRole('region', { name: 'Task board' })
    const start = () => within(board).getByRole('button', { name: /^Start \d+ selected tasks?$/ })

    // With a board, implementation starts from ticked tasks: the bare phase start is not offered.
    expect(within(panel).queryByRole('button', { name: 'Start implementation' })).toBeNull()
    expect(start()).toHaveAttribute('aria-disabled', 'true')
    expect(start()).toHaveAccessibleDescription('Tick at least one open task to start.')
    // A complete task cannot be ticked.
    expect(within(board).queryByRole('checkbox', { name: /^Select task 1\.1/ })).toBeNull()

    fireEvent.click(within(board).getByRole('checkbox', { name: 'Select task 2.1: Implement the page renderer' }))
    fireEvent.click(within(board).getByRole('checkbox', { name: 'Select task 1.2: Implement the entry store' }))
    expect(backend.roomPosts).toEqual([]) // ticking sends nothing
    expect(start()).toHaveTextContent('Start 2 selected tasks')
    expect(start()).toHaveAttribute('aria-disabled', 'false')

    fireEvent.click(start())
    await waitFor(() => expect(backend.roomPosts).toHaveLength(1))
    expect(backend.roomPosts[0]).toEqual({
      path: WORKSHOP_START_ROUTE,
      body: { command_id: expect.any(String), expected_version: 10, task_ids: ['1.2', '2.1'] },
    })
    expect(backend.posts).toEqual([])
    await waitFor(() => expect(announce).toHaveBeenCalledWith('2 tasks selected. Tinkers start as seats and files come free, at most three at a time.'))
  })

  it('keeps the start off behind a sealed tasks Door, and says so', async () => {
    const sealed = projection({ phaseOverrides: { tasks: { status: 'working', ghostIds: ['foreman'] } } })
    const idle = workshopAnswer({ runs: [], taskPlan: { tasks: GUEST_BOOK_TASKS, waves: GUEST_BOOK_WAVES, findings: [] } })
    await mount(sealed, idle, [])
    const board = within(await openRoom('Workshop')).getByRole('region', { name: 'Task board' })
    fireEvent.click(within(board).getByRole('checkbox', { name: /^Select task 1\.2/ }))
    const start = within(board).getByRole('button', { name: 'Start 1 selected task' })
    expect(start).toHaveAttribute('aria-disabled', 'true')
    expect(start).toHaveAccessibleDescription('Sealed door: approve the task plan before any task can start.')
    fireEvent.click(start)
    expect(backend.roomPosts).toEqual([])
  })

  it('keeps the existing bare implementation start when there is no task board', async () => {
    await mount(TASKS_APPROVED, roomGhosts(), [])
    const panel = await openRoom('Workshop')
    expect(within(panel).queryByRole('region', { name: 'Task board' })).toBeNull()
    expect(within(panel).getByRole('button', { name: 'Start implementation' })).toBeInTheDocument()
  })

  it('keeps the existing risky-action panel, with a withheld tool input shown as blocked', async () => {
    const withRisky = { ...TASKS_APPROVED, waitingCount: 1, riskyProposals: [riskyProposal({ ghostId: 'tinker-1', descriptor: null, createdSequence: 9 })] }
    await mount(withRisky, workshopAnswer(), WORKSHOP_LOG)
    const panel = await openRoom('Workshop')
    const risky = within(panel).getByRole('article', { name: /Tinker 1 asks: Risky action \(details unavailable\)/ })
    expect(within(risky).getByRole('button', { name: /^Approve / })).toHaveAttribute('aria-disabled', 'true')
    expect(within(risky).getByRole('button', { name: /^Reject / })).toHaveAttribute('aria-disabled', 'false')
    expect(within(risky).getByText(/cannot be shown completely/)).toBeInTheDocument()
    // The board comes first; the decision panel is the same one as before.
    expect(follows(within(panel).getByRole('region', { name: 'Task board' }), risky)).toBe(true)
  })
})

describe('cancel', () => {
  it('asks once on a press, announces the request once, and never claims the run stopped', async () => {
    await mount(TASKS_APPROVED, workshopAnswer(), WORKSHOP_LOG)
    const panel = await openRoom('Workshop')
    const cancel = within(panel).getByRole('button', { name: "Cancel Tinker 1's run" })
    expect(cancel).toHaveAttribute('aria-disabled', 'false')
    backend.onRoomPost = () => {
      // The backend accepted: the next read shows the cancellation as requested, not done.
      backend.rooms = workshopAnswer({ runs: [run({ ...workshopAnswer().runs[0], canCancel: false, cancelRequested: true })] })
      return { accepted: true }
    }
    fireEvent.click(cancel)
    await waitFor(() => expect(backend.roomPosts).toHaveLength(1))
    expect(backend.roomPosts[0]).toEqual({
      path: `${RUNS_BASE}/tinker-1-run/cancel`,
      body: { command_id: expect.any(String), expected_version: 10, mansion_id: MANSION },
    })
    const pending = await within(panel).findByRole('button', { name: 'Cancelling…' })
    expect(pending).toHaveAttribute('aria-disabled', 'true')
    expect(pending).toHaveAccessibleDescription(/Waiting for Crew to confirm/)
    fireEvent.click(pending)
    expect(backend.roomPosts).toHaveLength(1)
    expect(announce.mock.calls.filter(([message]) => message.startsWith('Cancellation requested'))).toHaveLength(1)
    // The task is still the Tinker's and still unchecked.
    expect(panel.querySelector('[data-task="1.2"] [data-task-status]')).toHaveTextContent('A Tinker is working on it')
  })

  it('explains a refusal in fixed words and does not repeat the request', async () => {
    await mount(TASKS_APPROVED, workshopAnswer(), WORKSHOP_LOG)
    const panel = await openRoom('Workshop')
    backend.onRoomPost = () => httpError(503, { error: { code: 'contract_unavailable', message: 'raw /private detail' } })
    fireEvent.click(within(panel).getByRole('button', { name: "Cancel Tinker 1's run" }))
    await waitFor(() => expect(announce).toHaveBeenCalledWith('The house cannot do this right now: a contract it depends on is unavailable. Nothing was done.'))
    expect(backend.roomPosts).toHaveLength(1)
    expect(document.body.textContent).not.toContain('raw /private detail')
    expect(document.querySelector('[data-room-notice]')).toHaveTextContent(/a contract it depends on is unavailable/)
  })

  it('moves focus to the room heading when the pressed control goes away', async () => {
    await mount(TASKS_APPROVED, workshopAnswer(), WORKSHOP_LOG)
    const panel = await openRoom('Workshop')
    const cancel = within(panel).getByRole('button', { name: "Cancel Tinker 1's run" })
    cancel.focus()
    backend.onRoomPost = () => {
      // Crew confirmed at once: the run is over and its controls are gone.
      backend.rooms = workshopAnswer({ runs: [], taskPlan: { tasks: GUEST_BOOK_TASKS, waves: GUEST_BOOK_WAVES, findings: [] } })
      return { accepted: true }
    }
    fireEvent.click(cancel)
    await waitFor(() => expect(within(panel).queryByRole('button', { name: "Cancel Tinker 1's run" })).toBeNull())
    await waitFor(() => expect(within(panel).getByRole('heading', { name: 'Workshop' })).toHaveFocus())
  })
})

describe('doubt withholds room controls and keeps the display', () => {
  it('turns room controls off on a version mismatch, asks for one fresh read, and does not loop', async () => {
    await mount(TASKS_APPROVED, workshopAnswer({ version: 9 }), WORKSHOP_LOG)
    fireEvent.click(roomButton('Workshop'))
    const open = await screen.findByRole('region', { name: 'Workshop' })
    const cancel = within(open).getByRole('button', { name: "Cancel Tinker 1's run" })
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    expect(cancel).toHaveAccessibleDescription(/from different moments\. Refreshing/)
    // The board is still shown, and so is the revision the room holds.
    expect(within(open).getByRole('region', { name: 'Task board' })).toBeInTheDocument()
    fireEvent.click(cancel)
    expect(backend.roomPosts).toEqual([])
    // The page asked again by itself, once: a gap that stays is not hammered.
    await waitFor(() => expect(backend.roomReads).toBe(2))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })
    expect(backend.roomReads).toBe(2)
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
  })

  it('turns room controls back on once the fresh read matches the house', async () => {
    backend = undefined as unknown as FakeRoomBackend
    const matching = workshopAnswer()
    const view = mount(TASKS_APPROVED, workshopAnswer({ version: 9 }), WORKSHOP_LOG)
    // The second read, the one the mismatch asks for, gets the matching answer.
    await waitFor(() => expect(backend).toBeDefined())
    backend.onRoomRead = (count) => {
      if (count >= 2) backend.rooms = matching
    }
    await view
    fireEvent.click(roomButton('Workshop'))
    const open = await screen.findByRole('region', { name: 'Workshop' })
    await waitFor(() => expect(within(open).getByRole('button', { name: "Cancel Tinker 1's run" })).toHaveAttribute('aria-disabled', 'false'))
    expect(backend.roomReads).toBe(2)
  })

  it('keeps showing Door facts and decisions when the room answer cannot be read', async () => {
    await mount(REQUIREMENTS_WAITING, httpError(500))
    fireEvent.click(roomButton('Study'))
    const panel = await screen.findByRole('region', { name: 'Study' })
    expect(panel.querySelector('[data-output-note]')).toHaveTextContent("This room's output could not be read.")
    const artifactView = within(panel).getByRole('article', { name: 'Requirements document' })
    expect(artifactView).toHaveTextContent('Not checked here')
    expect(artifactView.querySelector('[data-digest]')).toHaveTextContent(SHA_A)
    // The Spec 4 Door decision is unaffected.
    expect(within(panel).getByRole('button', { name: /^Approve Requirements door/ })).toHaveAttribute('aria-disabled', 'false')
    expect(within(panel).queryByRole('button', { name: /Ask for a revision/ })).toBeNull()
  })

  it('refuses a malformed room answer whole: no text from it reaches the page', async () => {
    await mount(REQUIREMENTS_WAITING, { raw: { ...(JSON.parse(JSON.stringify({ documents: 'SHOULD NOT APPEAR' })) as object), schema_version: 1 } })
    fireEvent.click(roomButton('Study'))
    const panel = await screen.findByRole('region', { name: 'Study' })
    expect(panel.querySelector('[data-output-note]')).toHaveTextContent('The house sent room output this page cannot read.')
    expect(document.body.textContent).not.toContain('SHOULD NOT APPEAR')
  })

  it('turns every room control off when decisions are off, with the same reason the Door gives', async () => {
    // The log is ahead of the projection: the screen is behind.
    const ahead = [...WORKSHOP_LOG, ...Array.from({ length: 12 }, (_, index) => ghostEvent(index + 2, 'tinker-1', 'run_started', { reason: 'again', room: 'workshop' }))]
    await mount(TASKS_APPROVED, workshopAnswer(), ahead)
    const panel = await openRoom('Workshop')
    const cancel = within(panel).getByRole('button', { name: "Cancel Tinker 1's run" })
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    expect(cancel).toHaveAccessibleDescription(/Something changed in the house/)
    fireEvent.click(cancel)
    expect(backend.roomPosts).toEqual([])
  })
})

describe('interruption budget, focus and motion with room output', () => {
  it('shows a working ghost in place: no toast, no announcement, no live region of its own', async () => {
    const { container } = await mount(TASKS_APPROVED, workshopAnswer(), WORKSHOP_LOG)
    await openRoom('Workshop')
    expect(host.notify).not.toHaveBeenCalled()
    expect(announce).not.toHaveBeenCalled()
    // The shell's one region, empty; the room panel adds none.
    expect(liveRegions(container)).toHaveLength(1)
    expect(liveRegions(container)[0]).toHaveTextContent('')
    expect(host.badge).toHaveBeenLastCalledWith(0)
  })

  it('pairs every state line of the open room with an icon and words', async () => {
    await mount(TASKS_APPROVED, workshopAnswer(), WORKSHOP_LOG)
    const panel = await openRoom('Workshop')
    const lines = panel.querySelectorAll('.hh-room-line')
    expect(lines.length).toBeGreaterThan(8)
    for (const line of lines) {
      expect(line.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
      expect(line.textContent?.trim()).not.toBe('')
    }
  })

  it('reaches every room control with Tab order of the document, and Escape returns focus to the room', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    const panel = await openRoom('Study')
    expect(within(panel).getByRole('heading', { name: 'Study' })).toHaveFocus()
    const focusable = [...panel.querySelectorAll<HTMLElement>('button, [tabindex="0"], input, textarea')]
    // The document text is a focusable scrolling region; every button is a real button.
    expect(focusable.map((element) => element.getAttribute('aria-label') ?? element.textContent?.trim())).toEqual([
      'Close room',
      'Requirements document text',
      'Approve Requirements door, revision 1',
      'Reject Requirements door, revision 1',
      'Ask for a revision of the requirements',
      "Open Archivist's Crew session (Done)",
    ])
    for (const element of focusable) expect(element.tabIndex).toBe(0)
    fireEvent.keyDown(panel, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Study' })).toBeNull())
    expect(roomButton('Study')).toHaveFocus()
  })

  it('adds no motion: the room panels animate only the spinner, and nothing while the house is still', async () => {
    const { container } = await mount(TASKS_APPROVED, workshopAnswer(), WORKSHOP_LOG)
    await openRoom('Workshop')
    // jsdom cannot say what the browser prefers, so motion is off.
    expect(container.querySelector('.hh-ui')).toHaveAttribute('data-motion', 'none')
    expect(container.querySelector('.hh-ui')).toHaveAttribute('data-still', 'true')
    const css = HOUSE_PANEL_STYLES + ROOM_OUTPUT_STYLES
    expect(container.querySelector('style')!.textContent).toContain(css)
    expect(css.match(/animation:/g)).toHaveLength(1)
    expect(css).toContain("[data-motion='low-frequency'] .hh-spin { animation: hh-house-spin 2s linear infinite; }")
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)')
    expect(css).not.toMatch(/transition/)
  })

  it('reads the Room Ghosts route of this Mansion and spec, and no other new route', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    await openRoom('Study')
    expect(backend.roomReads).toBeGreaterThan(0)
    expect(ROOM_ROUTE).toBe(`/apps/haunted-house/api/mansions/${MANSION}/specs/${SPEC}/room-ghosts`)
  })
})

describe('Séance Room (stretch, off by default)', () => {
  const review = {
    cycle: 3,
    status: 'blocked' as const,
    ghostId: 'medium',
    sessionLink: null,
    findings: [{ findingId: 'f-1', requirementIds: ['1.3'], paths: ['src/guestbook/store.py'], summary: 'Entries are sorted by name, not kept in insertion order.' }],
    repairs: [{ taskId: '4.1', findingId: 'f-1', title: 'Keep insertion order in the store', writes: ['src/guestbook/store.py'], status: 'proposed' as const }],
  }

  it('is a locked room with nothing to operate in the default build, even when the backend has a review', async () => {
    await mount(TASKS_APPROVED, workshopAnswer({ seanceEnabled: true, review }), WORKSHOP_LOG)
    expect(roomButton('Séance Room')).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(roomButton('Séance Room'))
    const panel = await screen.findByRole('region', { name: 'Séance Room' })
    expect(panel).toHaveTextContent('The Séance Room is locked. Review is a later chapter of this house')
    // Only the panel's own Close: no review control, no session link, no verdict.
    expect(within(panel).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Close room'])
    expect(panel.querySelector('[data-verdict]')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Medium/)
    expect(backend.posts).toEqual([])
    expect(backend.roomPosts).toEqual([])
  })

  it('does not exist when the build hides it', async () => {
    await mount(TASKS_APPROVED, workshopAnswer({ seanceEnabled: true, review }), WORKSHOP_LOG, { seanceRoom: 'hidden' })
    await openRoom('Workshop')
    expect(screen.queryByRole('button', { name: /^Séance Room\./ })).toBeNull()
    expect(document.querySelector('.hh-ui-map')!.textContent).not.toMatch(/Séance Room|Medium/)
  })

  it('shows no review while the backend leaves the Séance Room off, even in the stretch build', async () => {
    await mount(TASKS_APPROVED, workshopAnswer(), WORKSHOP_LOG, { seanceRoom: 'enabled' })
    fireEvent.click(roomButton('Séance Room'))
    const panel = await screen.findByRole('region', { name: 'Séance Room' })
    expect(panel).toHaveTextContent('No review yet.')
    expect(panel.querySelector('[data-verdict]')).toBeNull()
  })

  it('shows the verdict, the traced findings, the repair proposal and the three-cycle stop when it is on', async () => {
    await mount(TASKS_APPROVED, workshopAnswer({ seanceEnabled: true, review }), WORKSHOP_LOG, { seanceRoom: 'enabled' })
    fireEvent.click(roomButton('Séance Room'))
    const panel = await screen.findByRole('region', { name: 'Séance Room' })
    await waitFor(() => expect(panel.querySelector('[data-verdict]')).not.toBeNull())
    expect(panel.querySelector('[data-verdict]')).toHaveTextContent('Blocked: the review needs your decision. Review cycle 3 of 3.')
    expect(panel.querySelector('[data-review-limit]')).toHaveTextContent('No fourth review starts on its own')
    const finding = within(within(panel).getByRole('list', { name: 'Review findings' })).getByRole('listitem')
    expect(finding).toHaveTextContent('Entries are sorted by name, not kept in insertion order.')
    expect(finding).toHaveTextContent('Requirements1.3')
    expect(finding).toHaveTextContent('Repair task 4.1: Keep insertion order in the store. Proposed: not started. May write: src/guestbook/store.py')
    // It shows proposals and decides nothing: besides the panel's Close, its only control is the (disabled) session link.
    const buttons = within(panel).getAllByRole('button').filter((button) => button.textContent?.trim() !== 'Close room')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName("Open Medium's Crew session (No run yet)")
    expect(buttons[0]).toHaveAttribute('aria-disabled', 'true')
  })
})
