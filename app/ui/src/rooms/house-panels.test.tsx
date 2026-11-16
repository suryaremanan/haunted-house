// Room panels composed into the house (Spec 6 task 6.6): every room opened in
// its representative states, with the artifact first, the session link last,
// one live region, no composer, and nothing sent by looking.
// **Validates: Requirements 1.7, 1.8, 1.9, 1.10, 2.4, 2.9, 2.10, 4.4, 9.6, 9.7, 11.5, 11.6**
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GhostState } from '../core/ghost-state'
import type { SeanceRoomSetting } from '../core/house-registry'
import type { RoomGhosts } from '../core/room-projection'
import type { AppEvent } from '../core/seance-event'
import type { WorkflowProjection } from '../core/workflow-projection'
import { BASE, ghostEvent, wire } from '../test/house-kit'
import { MANSION_DESCRIPTOR } from '../test/house-projection-kit'
import { FakeRoomBackend, RUNS_BASE } from '../test/room-house-kit'
import { REQUIREMENTS_WAITING, SPEC, TASKS_APPROVED, requirementsWritten, run, workshopAtWork } from '../test/room-kit'
import { MANSION, eventId } from '../test/workflow-arbitraries'
import { liveRegions } from './foyer/foyer-test-kit'
import { House } from './house/House'

const host = vi.hoisted(() => ({
  backend: null as unknown as { get: (path: string) => Promise<unknown>; post: (path: string, body?: unknown) => Promise<unknown> },
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
  useAppEvents: (_event: string, _cb: (data: unknown) => void) => {
    useEffect(() => undefined, [])
    return undefined as unknown as () => void
  },
  useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
  useNotify: () => host.notify,
  useNavBadge: () => host.badge,
  useChatLauncher: () => ({ openChat: host.openChat }),
}))

let backend: FakeRoomBackend
const onReturn = vi.fn()

const STUDY_LOG = [
  ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing requirements', room: 'study' }),
  ghostEvent(2, 'archivist', 'run_completed', { reason: 'requirements.md is ready for review' }),
]
const studyAnswer = (overrides: Partial<RoomGhosts> = {}): RoomGhosts =>
  requirementsWritten({
    runs: [run({ runId: 'archivist-run', sessionSlot: 'hh-archivist', summary: 'Wrote 2 EARS criteria and a glossary.', sessionLink: 'hh-archivist' })],
    ...overrides,
  })

type RoomName = 'Foyer' | 'Study' | 'Drafting Room' | 'Workshop' | 'Attic' | 'Séance Room'

async function mount(workflow: WorkflowProjection, rooms: RoomGhosts | Error, log: AppEvent[] = STUDY_LOG, props: { seanceRoom?: SeanceRoomSetting } = {}) {
  backend = new FakeRoomBackend(workflow, rooms)
  backend.log = [...log]
  host.backend = backend
  const view = render(<House mansion={MANSION_DESCRIPTOR} onReturn={onReturn} {...props} />)
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
const sent = () => [...backend.posts, ...backend.roomPosts]

beforeEach(() => {
  host.notify.mockReset()
  host.badge.mockReset()
  host.openChat.mockReset()
  onReturn.mockReset()
})

describe('Foyer room of an open Mansion', () => {
  it('names the active Mansion and its Project_Spec and routes Return through the Foyer action', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    const panel = await openRoom('Foyer')
    const facts = panel.querySelector('[data-active-mansion]')!
    expect(facts).toHaveAttribute('data-active-mansion', MANSION)
    expect(facts).toHaveTextContent(`Mansion${MANSION}Project spec${SPEC}Folder~/workspace/haunted-house/mansions/${MANSION}`)
    // No list, create or open control here: those stay in the Foyer itself.
    expect(within(panel).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Close room', 'Return to Foyer'])
    expect(panel.querySelector('input, textarea, form')).toBeNull()
    expect(onReturn).not.toHaveBeenCalled()
    fireEvent.click(within(panel).getByRole('button', { name: 'Return to Foyer' }))
    expect(onReturn).toHaveBeenCalledTimes(1)
    expect(sent()).toEqual([])
  })
})

describe('Study and Drafting Room', () => {
  it('put the artifact first, then state and authority, then decisions, and the session link last', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    const panel = await openRoom('Study')
    const artifact = within(panel).getByRole('article', { name: 'Requirements document' })
    const state = within(panel).getByText('Requirements: Waiting for your decision')
    const door = within(panel).getByRole('article', { name: 'Requirements door' })
    const approve = within(panel).getByRole('button', { name: /^Approve Requirements door/ })
    const link = within(panel).getByRole('button', { name: /Crew session/ })
    expect([artifact, state, door, approve, link].every((element, index, all) => index === 0 || follows(all[index - 1], element))).toBe(true)
    // Authority: the exact document path the decision covers.
    expect(within(door).getByText('.kiro/specs/demo/requirements.md')).toBeInTheDocument()
  })

  it('has no composer and no second live region in either room', async () => {
    const { container } = await mount(REQUIREMENTS_WAITING, studyAnswer())
    for (const name of ['Study', 'Drafting Room'] as const) {
      const panel = await openRoom(name)
      expect(panel.querySelector('textarea, input, [contenteditable]')).toBeNull()
      expect(liveRegions(container)).toHaveLength(1)
      expect(liveRegions(panel)).toEqual([])
    }
  })

  it('sends the existing exact Door decision only through its visible control', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    const panel = await openRoom('Study')
    expect(sent()).toEqual([])
    backend.onPost = () => ({ event_id: eventId(11), sequence: 11, version: 11, workflow: wire({ ...REQUIREMENTS_WAITING, version: 11 }) })
    fireEvent.click(within(panel).getByRole('button', { name: /^Approve Requirements door/ }))
    await waitFor(() => expect(backend.posts).toHaveLength(1))
    expect(backend.posts[0].path).toBe(`${BASE}/doors/door-requirements-1/approve`)
    expect(backend.posts[0].body).toMatchObject({ expected_version: 10, phase: 'requirements', document_path: '.kiro/specs/demo/requirements.md' })
  })

  it('shows the same Door decision on the Door surface, with its state in words, and nothing is sent by opening it', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    fireEvent.click(screen.getByRole('button', { name: 'Requirements door of the Study. State: waiting.' }))
    const surface = await screen.findByRole('region', { name: 'Requirements door' })
    expect(surface).toHaveTextContent('Door state: waiting')
    expect(surface.querySelector('[data-door-hint]')).toHaveTextContent('Approve or reject them to decide this door.')
    expect(within(surface).getByRole('button', { name: /^Approve Requirements door, revision 1/ })).toHaveAttribute('aria-disabled', 'false')
    fireEvent.click(within(surface).getByRole('button', { name: 'Open the Study' }))
    expect(await screen.findByRole('region', { name: 'Study' })).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Open the Study' })).toHaveFocus()
    expect(sent()).toEqual([])
  })
})

describe('ghost states in a room', () => {
  const stateLog = (state: GhostState): AppEvent[] => {
    const started = ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing requirements', room: 'study' })
    switch (state) {
      case 'idle':
        return []
      case 'working':
        return [started]
      case 'waiting':
        return [started, ghostEvent(2, 'archivist', 'approval_requested', { mid: 'mid-1' }, 'crew')]
      case 'blocked':
        return [started, ghostEvent(2, 'archivist', 'run_blocked', { reason: 'locked_door' })]
      case 'failed':
        return [started, ghostEvent(2, 'archivist', 'run_failed', { reason: 'crew_error' })]
      case 'done':
        return [started, ghostEvent(2, 'archivist', 'run_completed', { reason: 'ready' })]
    }
  }

  it.each(['working', 'waiting', 'blocked', 'failed', 'done'] as const)('shows a %s ghost in words on the map, on its own surface and in its room', async (state) => {
    await mount(REQUIREMENTS_WAITING, studyAnswer(), stateLog(state))
    expect(roomButton('Study')).toHaveAccessibleName(`Study. Phase: requirements. Door: waiting. Ghost: ${state}.`)
    const control = screen.getByRole('button', { name: `Archivist, ghost in the Study. State: ${state}.` })
    fireEvent.click(control)
    const surface = await screen.findByRole('region', { name: 'Archivist' })
    expect(surface).toHaveTextContent(`Ghost state: ${state}`)
    expect(surface.querySelector(`svg[aria-hidden="true"][data-ghost="${state}"]`)).not.toBeNull()
    // The ghost surface has no decision: only Close and the way to its room.
    expect(within(surface).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Close ghost details', 'Open the Study'])
    fireEvent.click(within(surface).getByRole('button', { name: 'Close ghost details' }))
    expect(control).toHaveFocus()
    expect(sent()).toEqual([])
  })

  it('shows a room no ghost has entered as not applicable, without a ghost control', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer(), stateLog('idle'))
    expect(roomButton('Study')).toHaveAccessibleName('Study. Phase: requirements. Door: waiting. Ghost: not applicable.')
    expect(screen.queryByRole('button', { name: /^Archivist, ghost/ })).toBeNull()
  })
})

describe('Workshop', () => {
  it('puts the plan and the task board before phase state and decisions, with session links after the work they belong to', async () => {
    const log = [ghostEvent(1, 'tinker-1', 'run_started', { reason: 'Building task 1.2', room: 'workshop' })]
    await mount(TASKS_APPROVED, workshopAtWork(), log)
    const panel = await openRoom('Workshop')
    const plan = within(panel).getByRole('article', { name: 'Task plan' })
    const board = within(panel).getByRole('heading', { name: 'Task board' })
    const phase = within(panel).getByText(/^Tasks: /)
    expect(follows(plan, board)).toBe(true)
    expect(follows(board, phase)).toBe(true)
    expect(panel.querySelector('textarea, [contenteditable]')).toBeNull()
    expect(sent()).toEqual([])
  })

  it('offers the existing recovery only where the backend does, and sends it only on a press', async () => {
    const failedLog = [
      ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing requirements', room: 'study' }),
      ghostEvent(2, 'archivist', 'run_failed', { reason: 'crew_error' }),
    ]
    const answer = studyAnswer({ runs: [run({ runId: 'archivist-run', canRetry: true, sessionSlot: 'hh-archivist' })] })
    await mount(REQUIREMENTS_WAITING, answer, failedLog)
    // A failed run the backend offers to retry counts as needing the Operator, beside the Door.
    expect(screen.getByRole('button', { name: /^Needs you: 2 things need you/ })).toBeInTheDocument()
    const panel = await openRoom('Study')
    expect(sent()).toEqual([])
    fireEvent.click(within(panel).getByRole('button', { name: /^Retry/ }))
    await waitFor(() => expect(backend.roomPosts).toHaveLength(1))
    expect(backend.roomPosts[0].path).toBe(`${RUNS_BASE}/archivist-run/retry`)
    expect(backend.posts).toEqual([])
  })
})

describe('doubt and recordings', () => {
  it.each([
    ['uncertain', /not confirmed yet/],
    ['corrupt', /failed its integrity check/],
  ] as const)('keeps a room with %s state readable, says why, and turns every mutation off', async (integrity, text) => {
    await mount({ ...REQUIREMENTS_WAITING, integrity }, studyAnswer({ integrity }))
    expect(roomButton('Study').closest('li')).toHaveAttribute('data-integrity', integrity)
    const panel = await openRoom('Study')
    expect(panel.querySelector('[data-room-note]')).toHaveTextContent(text)
    // The valid content stays on screen.
    expect(within(panel).getByRole('article', { name: 'Requirements document' })).toBeInTheDocument()
    // The revision form's own toggle only shows or hides the form; what it holds is checked below.
    fireEvent.click(within(panel).getByRole('button', { name: 'Ask for a revision of the requirements' }))
    const controls = within(panel)
      .getAllByRole('button')
      .filter((button) => !button.hasAttribute('aria-expanded') && /^(Approve|Reject|Send|Retry|Cancel|Start)/.test(button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''))
    expect(controls.length).toBeGreaterThan(2)
    expect(controls.filter((control) => control.getAttribute('aria-disabled') !== 'true').map((control) => control.getAttribute('aria-label') ?? control.textContent)).toEqual([])
    for (const control of controls) fireEvent.click(control)
    expect(sent()).toEqual([])
    // Nothing unreadable is counted as waiting on the Operator beyond what the house already knew.
    expect(host.notify).not.toHaveBeenCalled()
  })

  it('shows a recording read-only in every room: visible copy, controls off, no session link, nothing sent', async () => {
    await mount({ ...REQUIREMENTS_WAITING, readOnly: true }, studyAnswer({ readOnly: true }))
    const panel = await openRoom('Study')
    expect(panel).toHaveTextContent('This is a recording.')
    const toggle = within(panel).queryByRole('button', { name: 'Ask for a revision of the requirements' })
    if (toggle !== null) fireEvent.click(toggle)
    const controls = within(panel)
      .getAllByRole('button')
      .filter((button) => !button.hasAttribute('aria-expanded') && !/^Close/.test(button.textContent?.trim() ?? ''))
    expect(controls.length).toBeGreaterThan(2)
    expect(controls.filter((control) => control.getAttribute('aria-disabled') !== 'true').map((control) => control.getAttribute('aria-label') ?? control.textContent)).toEqual([])
    for (const control of controls) fireEvent.click(control)
    expect(sent()).toEqual([])
    expect(host.openChat).not.toHaveBeenCalled()
  })
})

describe('Attic', () => {
  it('shows the canonical replay of this Mansion with its record count, and offers nothing that changes the house', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    expect(roomButton('Attic')).toHaveAccessibleName('Attic. Phase: replay. Door: not applicable. Ghost: not applicable.')
    fireEvent.click(roomButton('Attic'))
    const panel = await screen.findByRole('region', { name: 'Attic' })
    await waitFor(() => expect(panel.querySelector('[data-attic-panel]')).toHaveAttribute('data-source', 'ready'))
    expect(panel.querySelector('[data-attic-panel]')).toHaveAttribute('data-mode', 'live')
    expect(panel).toHaveTextContent(/2 (events|records)/)
    expect(liveRegions(panel)).toEqual([])
    fireEvent.click(within(panel).getByRole('button', { name: 'Close room' }))
    expect(roomButton('Attic')).toHaveFocus()
    expect(sent()).toEqual([])
  })

  it('shows the valid prefix and the exact safe diagnostic of a damaged log, and invents no later state', async () => {
    backend = new FakeRoomBackend(REQUIREMENTS_WAITING, studyAnswer())
    backend.log = [...STUDY_LOG]
    const reads = backend.get
    backend.get = async (path: string) => {
      const body = (await reads(path)) as { diagnostics?: unknown[] }
      return path.includes('/seance/events') ? { ...body, diagnostics: [{ code: 'hash_mismatch', safe_detail: 'hash_mismatch', line: 3 }] } : body
    }
    host.backend = backend
    render(<House mansion={MANSION_DESCRIPTOR} onReturn={onReturn} />)
    await waitFor(() => expect(document.querySelector('[data-log-problem]')).not.toBeNull())
    expect(document.querySelector('[data-log-problem]')).toHaveTextContent('The séance log failed its integrity check at line 3. Showing only the records before it.')
    const attic = await screen.findByRole('button', { name: /^Attic\./ })
    expect(attic.closest('li')).toHaveAttribute('data-integrity', 'incompatible')
    expect(attic).toHaveAccessibleDescription(/failed its integrity check/)
    fireEvent.click(attic)
    const panel = await screen.findByRole('region', { name: 'Attic' })
    expect(panel.querySelector('[data-attic-diagnostic]')).toHaveTextContent('The séance log failed its integrity check. The Attic shows only the records before the failure.')
    // The house itself decides nothing while its log is in doubt.
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull()
    expect(sent()).toEqual([])
  })
})

describe('Séance Room', () => {
  it('is locked by default: explanation only, no review control', async () => {
    await mount(REQUIREMENTS_WAITING, studyAnswer())
    const panel = await openRoom('Séance Room')
    expect(panel.querySelector('[data-seance="locked"]')).toHaveTextContent('nothing can be started or changed here')
    expect(within(panel).getAllByRole('button')).toHaveLength(1)
  })
})

describe('looking is never deciding', () => {
  it('opens and closes every room, ghost and Door surface without one request that changes anything', async () => {
    const log = [...STUDY_LOG, ghostEvent(3, 'tinker-1', 'run_started', { reason: 'Building', room: 'workshop' })]
    const { container } = await mount(REQUIREMENTS_WAITING, studyAnswer(), log)
    const controls = Array.from(container.querySelectorAll<HTMLElement>('.hh-ui-map button'))
    expect(controls.length).toBeGreaterThanOrEqual(12)
    for (const control of controls) {
      fireEvent.click(control)
      expect(await screen.findByRole('button', { name: /^Close (room|ghost details|door details)$/ })).toBeInTheDocument()
      expect(liveRegions(container)).toHaveLength(1)
      fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(container.querySelector('.hh-ui-panel')).toBeNull()
    }
    fireEvent.click(screen.getByRole('button', { name: /^Needs you:/ }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(sent()).toEqual([])
    expect(host.openChat).not.toHaveBeenCalled()
    expect(onReturn).not.toHaveBeenCalled()
  })
})
