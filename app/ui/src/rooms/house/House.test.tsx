// House, Door and waiting panels in the DOM (Spec 4 task 14.4).
// **Validates: Requirements 4.8, 9.1 to 9.9**
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOOR_STATUS_TEXT, PHASE_STATUS_TEXT, RISKY_STATUS_TEXT } from '../../core/house-view'
import { DOOR_STATUSES, PHASE_STATUSES, RISKY_STATUSES, type WorkflowProjection } from '../../core/workflow-projection'
import { BASE, FakeHouseBackend, ghostEvent, httpError, wire } from '../../test/house-kit'
import { MANSION, SHA_A, SHA_B, decision, doorProposal, eventId, projection, riskyProposal } from '../../test/workflow-arbitraries'
import { liveRegions } from '../foyer/foyer-test-kit'
import { House } from './House'
import { HOUSE_STYLES } from './house-styles'

const host = vi.hoisted(() => ({
  backend: null as unknown as { get: (path: string) => Promise<unknown>; post: (path: string, body?: unknown) => Promise<unknown> },
  handlers: new Map<string, Set<(data: unknown) => void>>(),
  notify: vi.fn(),
  badge: vi.fn(),
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
}))

function emit(type: string, data: unknown): void {
  for (const handler of [...(host.handlers.get(type) ?? [])]) handler(data)
}

/** Requirements wait at their Door; Tinker 2 waits on a risky command. */
const waiting = projection({
  version: 20,
  waitingCount: 2,
  phaseOverrides: {
    requirements: {
      status: 'waiting',
      ghostIds: ['archivist'],
      door: { status: 'waiting', proposal: doorProposal('requirements', { createdSequence: 12, artifactRevision: { revision: 3, sha256: SHA_A, sizeBytes: 2048 } }) },
    },
  },
  riskyProposals: [riskyProposal({ createdSequence: 15 })],
})

const requirementsApproved = (version: number, actor: 'operator' | 'crew' = 'operator'): WorkflowProjection =>
  projection({
    version,
    waitingCount: 1,
    phaseOverrides: {
      requirements: {
        status: 'approved',
        ghostIds: ['archivist'],
        door: {
          status: 'open',
          proposal: doorProposal('requirements', {
            status: 'approved',
            createdSequence: 12,
            artifactRevision: { revision: 3, sha256: SHA_A, sizeBytes: 2048 },
            decision: decision('approved', version, actor),
          }),
        },
      },
      design: { status: 'ready' },
    },
    riskyProposals: [riskyProposal({ createdSequence: 15 })],
  })

const LOG = [
  ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing requirements', room: 'study' }),
  ghostEvent(2, 'archivist', 'run_completed', { reason: 'requirements.md is ready for review' }),
  ghostEvent(3, 'tinker-2', 'run_started', { reason: 'Building task 2', room: 'workshop' }),
  ghostEvent(4, 'tinker-2', 'approval_requested', { mid: 'mid-tinker-2' }, 'crew'),
]

let backend: FakeHouseBackend
const announce = vi.fn<(message: string) => void>()

async function mount(workflow: WorkflowProjection = waiting, props: { stillHouse?: boolean } = {}) {
  backend = new FakeHouseBackend(workflow)
  backend.log = [...LOG]
  host.backend = backend
  const view = render(<House mansionId={MANSION} onAnnounce={announce} {...props} />)
  await screen.findByRole('button', { name: /^Study\./ })
  await waitFor(() => expect(view.container.querySelector('.hh-house-map')).toHaveAttribute('aria-busy', 'false'))
  return view
}

const room = (name: 'Study' | 'Drafting Room' | 'Workshop') => screen.getByRole('button', { name: new RegExp(`^${name}\\.`) })

async function openRoom(name: 'Study' | 'Drafting Room' | 'Workshop') {
  fireEvent.click(room(name))
  return screen.findByRole('region', { name })
}

beforeEach(() => {
  host.handlers.clear()
  host.notify.mockReset()
  host.badge.mockReset()
  announce.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('house map', () => {
  it('is a navigation list of three rooms, each with phase, Door and ghost state as icon and text', async () => {
    const { container } = await mount()
    const map = screen.getByRole('navigation', { name: 'House map' })
    const rooms = within(map).getAllByRole('button')
    expect(rooms.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Study. Requirements: Waiting for your decision, Door waiting for your decision. Archivist: Done. 1 thing needs you.',
      'Drafting Room. Design: Not started, Sealed door. No ghost here yet.',
      'Workshop. Tasks: Not started, Sealed door. Implementation: Not started, Sealed door. Tinker 2: Waiting. 1 thing needs you.',
    ])
    expect(within(map).getAllByRole('listitem')).toHaveLength(3)
    // Every visible state line pairs an icon with words.
    for (const line of container.querySelectorAll('.hh-room .hh-room-line')) {
      expect(line.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
      expect(line.textContent?.trim()).not.toBe('')
    }
    expect(within(rooms[0]).getByText('Requirements: Waiting for your decision')).toBeInTheDocument()
    expect(within(rooms[0]).getByText('Door waiting for your decision')).toBeInTheDocument()
    expect(within(rooms[0]).getByText('Archivist: Done')).toBeInTheDocument()
    expect(within(rooms[2]).getByText('Tinker 2: Waiting')).toBeInTheDocument()
  })

  it('has words for every phase, Door and risky-action state', async () => {
    for (const status of PHASE_STATUSES) {
      const view = await mount(projection({ version: 20, phaseOverrides: { design: { status } } }))
      expect(within(room('Drafting Room')).getByText(`Design: ${PHASE_STATUS_TEXT[status]}`)).toBeInTheDocument()
      view.unmount()
    }
    for (const status of DOOR_STATUSES) {
      const proposal =
        status === 'sealed' ? null : doorProposal('design', {
          status: status === 'waiting' ? 'pending' : status === 'open' ? 'approved' : 'rejected',
          createdSequence: 5,
          decision: status === 'waiting' ? null : decision(status === 'open' ? 'approved' : 'rejected', 6),
        })
      const view = await mount(projection({ version: 20, phaseOverrides: { design: { door: { status, proposal } } } }))
      expect(within(room('Drafting Room')).getByText(DOOR_STATUS_TEXT[status])).toBeInTheDocument()
      view.unmount()
    }
    for (const status of RISKY_STATUSES) {
      const made = status === 'pending' || status === 'superseded' ? null : decision(status === 'rejected' ? 'rejected' : 'approved', 16)
      const view = await mount(projection({ version: 20, riskyProposals: [riskyProposal({ status, decision: made, createdSequence: 15 })] }))
      const panel = await openRoom('Workshop')
      expect(within(panel).getByText(RISKY_STATUS_TEXT[status])).toBeInTheDocument()
      if (status !== 'pending') expect(within(panel).queryByRole('button', { name: /^(Approve|Reject)/ })).toBeNull()
      view.unmount()
    }
  })

  it('moves between rooms with the arrow keys, Home and End, and stops at the ends', async () => {
    await mount()
    room('Study').focus()
    fireEvent.keyDown(room('Study'), { key: 'ArrowRight' })
    expect(room('Drafting Room')).toHaveFocus()
    fireEvent.keyDown(room('Drafting Room'), { key: 'ArrowDown' })
    expect(room('Workshop')).toHaveFocus()
    fireEvent.keyDown(room('Workshop'), { key: 'ArrowRight' })
    expect(room('Workshop')).toHaveFocus()
    fireEvent.keyDown(room('Workshop'), { key: 'ArrowLeft' })
    expect(room('Drafting Room')).toHaveFocus()
    fireEvent.keyDown(room('Drafting Room'), { key: 'Home' })
    expect(room('Study')).toHaveFocus()
    fireEvent.keyDown(room('Study'), { key: 'End' })
    expect(room('Workshop')).toHaveFocus()
    // Every room and control is a real button, so Tab reaches each of them.
    for (const button of screen.getAllByRole('button')) expect(button.tabIndex).toBe(0)
    // Moving opened nothing and decided nothing.
    expect(screen.queryByRole('region', { name: 'Workshop' })).toBeNull()
    expect(backend.posts).toEqual([])
  })

  it('opens a room on Enter, focuses its heading, and Escape closes it and restores focus', async () => {
    await mount()
    const study = room('Study')
    study.focus()
    // Enter on a button is a click.
    fireEvent.click(study)
    const panel = await screen.findByRole('region', { name: 'Study' })
    expect(within(panel).getByRole('heading', { name: 'Study' })).toHaveFocus()
    expect(study).toHaveAttribute('aria-expanded', 'true')
    expect(study).toHaveAttribute('aria-controls', panel.id)

    // Escape is handled by the house, so the Mansion Shell behind it does not also close.
    const seen: boolean[] = []
    const shell = (event: KeyboardEvent) => seen.push(event.defaultPrevented)
    document.addEventListener('keydown', shell)
    fireEvent.keyDown(within(panel).getByRole('button', { name: /^Approve/ }), { key: 'Escape' })
    document.removeEventListener('keydown', shell)
    expect(seen).toEqual([true])
    expect(screen.queryByRole('region', { name: 'Study' })).toBeNull()
    expect(room('Study')).toHaveFocus()
    expect(room('Study')).toHaveAttribute('aria-expanded', 'false')

    // With no room open, Escape is left for the shell.
    const after: boolean[] = []
    const shellAgain = (event: KeyboardEvent) => after.push(event.defaultPrevented)
    document.addEventListener('keydown', shellAgain)
    fireEvent.keyDown(room('Study'), { key: 'Escape' })
    document.removeEventListener('keydown', shellAgain)
    expect(after).toEqual([false])
  })

  it('closes a room with its Close button and restores focus to the room', async () => {
    await mount()
    const panel = await openRoom('Workshop')
    fireEvent.click(within(panel).getByRole('button', { name: 'Close room' }))
    expect(screen.queryByRole('region', { name: 'Workshop' })).toBeNull()
    expect(room('Workshop')).toHaveFocus()
  })
})

describe('Door panel', () => {
  it('shows the exact document path and revision with separate Approve and Reject controls', async () => {
    await mount()
    const panel = await openRoom('Study')
    const door = within(panel).getByRole('article', { name: 'Requirements door' })
    expect(within(door).getByText('.kiro/specs/demo/requirements.md')).toBeInTheDocument()
    expect(within(door).getByText('Revision 3, 2,048 bytes')).toBeInTheDocument()
    expect(within(door).getByText('aaaaaaaaaaaa')).toBeInTheDocument()
    const approve = within(door).getByRole('button', { name: 'Approve Requirements door, revision 3' })
    const reject = within(door).getByRole('button', { name: 'Reject Requirements door, revision 3' })
    expect(approve).not.toBe(reject)
    expect(approve).toHaveAttribute('aria-disabled', 'false')
    expect(reject).toHaveAttribute('aria-disabled', 'false')
    expect(approve).toHaveTextContent('Approve')
    expect(reject).toHaveTextContent('Reject')
  })

  it('sends the exact approval, then shows the outcome and actor without starting the next phase', async () => {
    await mount()
    const panel = await openRoom('Study')
    backend.onPost = () => {
      backend.workflow = requirementsApproved(21)
      return { event_id: eventId(21), sequence: 21, version: 21, workflow: wire(requirementsApproved(21)) }
    }
    fireEvent.click(within(panel).getByRole('button', { name: /^Approve Requirements door/ }))
    expect(await within(panel).findByText('Approved by the operator in Haunted House.')).toBeInTheDocument()
    expect(backend.posts).toEqual([
      {
        path: `${BASE}/doors/door-requirements-1/approve`,
        body: {
          command_id: expect.stringMatching(/^[A-Za-z0-9-]{8,64}$/),
          expected_version: 20,
          phase: 'requirements',
          document_path: '.kiro/specs/demo/requirements.md',
          artifact_revision: { revision: 3, sha256: SHA_A, size_bytes: 2048 },
        },
      },
    ])
    // Requirement 4.8: the decision controls of that proposal are gone.
    expect(within(panel).queryByRole('button', { name: /Requirements door/ })).toBeNull()
    // The successor is ready and waits for its own explicit start.
    expect(within(room('Drafting Room')).getByText('Design: Ready to start')).toBeInTheDocument()
    expect(backend.posts).toHaveLength(1)
    expect(announce).toHaveBeenCalledWith('Requirements door approved. The next phase starts only when you start it.')
    // Focus did not fall off the page when the buttons went away.
    expect(document.activeElement).not.toBe(document.body)
  })

  it('starts a phase only from its explicit start control', async () => {
    await mount(requirementsApproved(21))
    const panel = await openRoom('Drafting Room')
    expect(backend.posts).toEqual([])
    const working = projection({ ...requirementsApproved(22), phaseOverrides: undefined })
    backend.onPost = () => ({ event_id: eventId(22), sequence: 22, version: 22, workflow: wire(working) })
    fireEvent.click(within(panel).getByRole('button', { name: 'Start design' }))
    await waitFor(() => expect(backend.posts).toHaveLength(1))
    expect(backend.posts[0]).toEqual({
      path: `${BASE}/phases/design/start`,
      body: { command_id: expect.any(String), expected_version: 21 },
    })
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Design started.'))
  })

  it('removes the controls and names the actor when the proposal was resolved elsewhere', async () => {
    await mount()
    const panel = await openRoom('Study')
    expect(within(panel).getByRole('button', { name: /^Approve Requirements door/ })).toBeInTheDocument()
    // Someone decided in Crew. A canonical record arrives through the ingest acknowledgment.
    backend.workflow = requirementsApproved(21, 'crew')
    backend.nextIngest = [ghostEvent(21, 'tinker-2', 'ghost_progressed', { status: 'working' }, 'crew')]
    await act(async () => emit('chat_status', { slot: 'hh-tinker-2' }))
    expect(await within(panel).findByText('Approved in Crew, outside Haunted House.')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /Requirements door/ })).toBeNull()
    expect(backend.posts).toEqual([])
  })

  it('shows the current state after a stale decision and does not retry it', async () => {
    await mount()
    const panel = await openRoom('Study')
    const revised = projection({
      version: 23,
      waitingCount: 1,
      phaseOverrides: {
        requirements: {
          status: 'waiting',
          ghostIds: ['archivist'],
          door: {
            status: 'waiting',
            proposal: doorProposal('requirements', { proposalId: 'door-requirements-2', createdSequence: 23, artifactRevision: { revision: 4, sha256: SHA_B, sizeBytes: 2100 } }),
          },
        },
      },
    })
    backend.onPost = () => {
      backend.workflow = revised
      throw httpError(409, { error: { code: 'stale_version', message: 'stale' }, workflow: wire(revised) })
    }
    fireEvent.click(within(panel).getByRole('button', { name: /^Approve Requirements door, revision 3/ }))
    expect(await within(panel).findByText('Revision 4, 2,100 bytes')).toBeInTheDocument()
    expect(
      screen.getByText('The house changed before your decision arrived, so nothing was recorded. Check what is shown now and decide again.'),
    ).toBeInTheDocument()
    // The new revision needs its own press.
    expect(within(panel).getByRole('button', { name: 'Approve Requirements door, revision 4' })).toHaveAttribute('aria-disabled', 'false')
    expect(backend.posts).toHaveLength(1)
  })
})

describe('risky-action panel', () => {
  it('shows the complete descriptor, scope, digest prefix and one-attempt wording before the controls', async () => {
    await mount()
    const panel = await openRoom('Workshop')
    const action = within(panel).getByRole('article', { name: 'Tinker 2 asks: Run a command' })
    for (const text of [
      'Run a command',
      'demo-mansion',
      'workshop',
      'hh-tinker-2-task-2',
      'The mansion folder',
      '"bun" "test"',
      '120',
      'src',
      'coverage',
      'bbbbbbbbbbbb',
    ]) {
      expect(within(action).getAllByText(text).length).toBeGreaterThan(0)
    }
    expect(within(action).getByText('Command may read')).toBeInTheDocument()
    expect(within(action).getByText('Command may write')).toBeInTheDocument()
    const wording = within(action).getByText(/^Approving allows exactly one attempt of exactly this action\./)
    const approve = within(action).getByRole('button', { name: /^Approve run a command for Tinker 2, digest bbbbbbbbbbbb/ })
    // The wording and the descriptor come before the controls in reading order.
    expect(wording.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(approve).toHaveAttribute('aria-disabled', 'false')
  })

  it('sends the exact rejection with the digest and version', async () => {
    await mount()
    const panel = await openRoom('Workshop')
    const rejected = projection({
      version: 21,
      riskyProposals: [riskyProposal({ status: 'rejected', createdSequence: 15, decision: decision('rejected', 21) })],
      phaseOverrides: { requirements: waiting.phases[0] },
    })
    backend.onPost = () => {
      backend.workflow = rejected
      return { event_id: eventId(21), sequence: 21, version: 21, workflow: wire(rejected) }
    }
    fireEvent.click(within(panel).getByRole('button', { name: /^Reject run a command/ }))
    expect(await within(panel).findByText('Rejected by the operator in Haunted House.')).toBeInTheDocument()
    expect(backend.posts).toEqual([
      { path: `${BASE}/approvals/risky-1/reject`, body: { command_id: expect.any(String), expected_version: 20, action_digest: SHA_B } },
    ])
    expect(within(panel).queryByRole('button', { name: /run a command/ })).toBeNull()
  })

  it('disables approval and marks the proposal blocked when the descriptor is redacted or incomplete', async () => {
    const body = wire({ ...waiting, version: 21 }) as { risky_proposals: { descriptor: { arguments: unknown } }[] }
    body.risky_proposals[0].descriptor.arguments = { argv: ['deploy', '--token', '[redacted]'] }
    await mount(waiting)
    // The next projection carries a descriptor the persistence boundary redacted.
    backend.workflow = body
    backend.nextIngest = [ghostEvent(21, 'tinker-2', 'ghost_progressed', { status: 'working' }, 'crew')]
    await act(async () => emit('chat_status', {}))
    const panel = await openRoom('Workshop')
    expect(await within(panel).findByText(/^Blocked: this action cannot be shown completely/)).toBeInTheDocument()
    const approve = within(panel).getByRole('button', { name: /^Approve risky action/ })
    expect(approve).toHaveAttribute('aria-disabled', 'true')
    expect(approve).toHaveAccessibleDescription(/^Blocked:/)
    fireEvent.click(approve)
    expect(backend.posts).toEqual([])
    // Nothing of the unreadable descriptor is shown.
    expect(within(panel).queryByText(/redacted/)).toBeNull()
    expect(within(panel).getByRole('button', { name: /^Reject risky action/ })).toHaveAttribute('aria-disabled', 'false')
  })
})

describe('waiting, blocked and uncertain state', () => {
  it('updates Needs You, the sidebar badge and one polite announcement, with one toast per ghost', async () => {
    const { container } = await mount()
    expect(screen.getByRole('button', { name: 'Needs you: 2 things need you. Go to the first.' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Waiting on you' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'The requirements door needs your decision.',
      'Tinker 2 asks to run a command.',
    ])
    await waitFor(() => expect(host.badge).toHaveBeenLastCalledWith(2))
    // The house has no live region of its own: it hands messages to the page's one.
    expect(liveRegions(container)).toEqual([])
    const said = announce.mock.calls.map(([message]) => message).join(' ')
    expect(said).toContain('The requirements door needs your decision.')
    expect(said).toContain('Tinker 2 asks to run a command.')
    expect(said.match(/The requirements door needs your decision\./g)).toHaveLength(1)

    // Tinker 2 both went waiting and has a proposal: still one toast for that ghost.
    const toasts = host.notify.mock.calls.map(([text]) => text as string)
    expect(toasts.filter((text) => text.includes('Tinker 2'))).toHaveLength(1)
    expect(toasts.filter((text) => text.includes('requirements door'))).toHaveLength(1)
    // Done and working ghosts raise nothing.
    expect(toasts.some((text) => /Archivist (is|failed)/.test(text))).toBe(false)
  })

  it('jumps from Needs You to the first waiting room', async () => {
    await mount()
    fireEvent.click(screen.getByRole('button', { name: /^Needs you:/ }))
    const panel = await screen.findByRole('region', { name: 'Study' })
    expect(within(panel).getByRole('heading', { name: 'Study' })).toHaveFocus()
  })

  it('shows an empty Needs You and clears the badge when nothing waits, and on leaving', async () => {
    const view = await mount(projection({ version: 20 }))
    expect(screen.getByRole('button', { name: 'Needs you: Nothing needs you.' })).toHaveAttribute('aria-disabled', 'true')
    await waitFor(() => expect(host.badge).toHaveBeenLastCalledWith(0))
    expect(host.notify.mock.calls.filter(([text]) => /door|asks/.test(text as string))).toEqual([])
    host.badge.mockClear()
    view.unmount()
    expect(host.badge).toHaveBeenLastCalledWith(0)
  })

  it('does not decide anything from viewing, time, a finished Crew turn or a ghost result', async () => {
    await mount()
    const study = await openRoom('Study')
    fireEvent.click(within(study).getByRole('button', { name: 'Close room' }))
    const workshop = await openRoom('Workshop')
    // A Crew turn ends and the house settles the run: canonical ghost facts only.
    backend.workflow = { ...waiting, version: 22 }
    backend.nextIngest = [
      ghostEvent(21, 'tinker-2', 'crew_turn_ended', { generation: 'g', continuing: false, needs_input: false }, 'crew'),
      ghostEvent(22, 'tinker-2', 'run_completed', { reason: 'task 2 is done' }),
    ]
    await act(async () => emit('chat_done', { slot: 'hh-tinker-2' }))
    await waitFor(() => expect(backend.ingests).toHaveLength(1))
    await waitFor(() => expect(within(room('Workshop')).getByText('Tinker 2: Done')).toBeInTheDocument())
    // The projection was read again for the new records, and it still holds no approval.
    await waitFor(() => expect(backend.workflowReads).toBeGreaterThan(1))
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))

    expect(backend.posts).toEqual([])
    // Both proposals are still pending with their controls.
    expect(within(workshop).getByRole('button', { name: /^Approve run a command/ })).toHaveAttribute('aria-disabled', 'false')
    expect(within(workshop).getByText('Waiting for your decision')).toBeInTheDocument()
    expect(within(room('Study')).getByText('Door waiting for your decision')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Needs you: 2 things need you/ })).toBeInTheDocument()
  })

  it.each([
    ['a corrupt log', { integrity: 'corrupt' as const }, 'integrity', /failed its integrity check/],
    ['uncertain state', { integrity: 'uncertain' as const }, 'uncertain', /not confirmed yet/],
    ['a recording', { readOnly: true }, 'read_only', /This is a recording/],
  ])('blocks every decision and start for %s and says why', async (_name, change, block, text) => {
    const { container } = await mount({ ...waiting, ...change })
    expect(container.querySelector(`.hh-house-blocked[data-block="${block}"]`)).toHaveTextContent(text)
    const panel = await openRoom('Study')
    const approve = within(panel).getByRole('button', { name: /^Approve Requirements door/ })
    const reject = within(panel).getByRole('button', { name: /^Reject Requirements door/ })
    expect(approve).toHaveAttribute('aria-disabled', 'true')
    expect(reject).toHaveAttribute('aria-disabled', 'true')
    expect(approve).toHaveAccessibleDescription(text)
    fireEvent.click(approve)
    fireEvent.click(reject)
    expect(backend.posts).toEqual([])
  })

  it('blocks decisions when the backend sends a projection it cannot read, keeping the page up', async () => {
    const view = await mount()
    view.unmount()
    backend = new FakeHouseBackend(waiting)
    backend.log = [...LOG]
    backend.workflow = { ...(wire(waiting) as object), phases: [] }
    host.backend = backend
    const { container } = render(<House mansionId={MANSION} onAnnounce={announce} />)
    await waitFor(() => expect(container.querySelector('.hh-house-blocked[data-block="malformed"]')).not.toBeNull())
    expect(screen.getByRole('button', { name: /^Study\. State not loaded/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull()
  })

  it('shows blocked and failed ghosts with icon, words and reason', async () => {
    await mount(projection({ version: 20 }))
    backend.nextIngest = [
      ghostEvent(5, 'tinker-1', 'run_started', { reason: 'Building task 1', room: 'workshop' }),
      ghostEvent(6, 'tinker-1', 'run_blocked', { reason: 'locked_door' }),
      ghostEvent(7, 'tinker-3', 'run_started', { reason: 'Building task 3', room: 'workshop' }),
      ghostEvent(8, 'tinker-3', 'run_failed', { reason: 'crew_error' }),
    ]
    await act(async () => emit('chat_status', {}))
    const panel = await openRoom('Workshop')
    expect(await within(panel).findByText('Tinker 1: Blocked. A door upstream is still sealed.')).toBeInTheDocument()
    expect(within(panel).getByText('Tinker 3: Failed. Crew error')).toBeInTheDocument()
    await waitFor(() => {
      const said = announce.mock.calls.map(([message]) => message).join(' ')
      expect(said).toContain('Tinker 1 is blocked')
      expect(said).toContain('Tinker 3 failed')
    })
    const toasts = host.notify.mock.calls.map(([text]) => text as string)
    expect(toasts.filter((text) => text.includes('Tinker 1'))).toHaveLength(1)
    expect(toasts.filter((text) => text.includes('Tinker 3'))).toHaveLength(1)
  })
})

describe('motion', () => {
  it('animates only when the browser allows motion and Still House is off', async () => {
    const { container } = await mount(waiting, { stillHouse: true })
    expect(container.querySelector('.hh-house-map')).toHaveAttribute('data-still', 'true')
    const animated = HOUSE_STYLES.split('@media (prefers-reduced-motion: no-preference)')
    expect(animated).toHaveLength(2)
    // Outside the motion query nothing animates or transitions.
    expect(animated[0]).not.toMatch(/animation\s*:|transition\s*:/)
    expect(animated[1]).toContain(".hh-house-map:not([data-still='true']) .hh-spin")
    // One slow turn: nothing loops faster than once every 2 seconds.
    expect(animated[1]).toMatch(/animation: hh-house-spin 2s linear infinite/)
  })
})
