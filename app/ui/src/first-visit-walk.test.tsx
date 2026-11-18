// The first visit, walked end to end (Spec 8, Requirements 4, 6.5, 14.7 and
// 14.8). A visitor with no mansion knocks, says what to build, and reaches an
// approved requirements Door pressing only what the Warden offers: once with a
// pointer, once with the keyboard alone. Only the host client is mocked, so
// every request the walk causes is seen, and each is one the house's own
// controls send. Then, with the Warden stepped back, the control behind every
// choice is found and reached by hand.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HauntedHouseApp from './App'
import { GATE_QUESTION, IDEA_FIELD_LABEL, mansionNameFromIdea } from './core/first-visit'
import { emptyRoomGhosts, type RoomGhosts } from './core/room-projection'
import type { AppEvent } from './core/seance-event'
import type { WorkflowProjection } from './core/workflow-projection'
import { MANSIONS, OPEN, listBody, liveRegions, mansion } from './rooms/foyer/foyer-test-kit'
import { House } from './rooms/house/House'
import { BASE, ghostEvent, wire } from './test/house-kit'
import { MANSION_DESCRIPTOR } from './test/house-projection-kit'
import { FakeRoomBackend } from './test/room-house-kit'
import { REQUIREMENTS_WAITING, SPEC, TASKS_APPROVED, artifact, requirementsWritten, roomGhosts, run, workshopAtWork } from './test/room-kit'
import { MANSION, SHA_A, decision, doorProposal, eventId, projection } from './test/workflow-arbitraries'

const host = vi.hoisted(() => ({
  get: null as unknown as (path: string) => Promise<unknown>,
  post: null as unknown as (path: string, body?: unknown) => Promise<unknown>,
  handlers: new Map<string, Set<(data: unknown) => void>>(),
  notify: vi.fn(),
  badge: vi.fn(),
}))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({ get: (path: string) => host.get(path), post: (path: string, body?: unknown) => host.post(path, body), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
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

const WHOAMI = '/apps/haunted-house/api/whoami'
const VISITOR = 'Ada Lovelace'
/** An idea whose project folder is the mansion the fake backend serves. */
const IDEA = 'A demo mansion'
/** The mansion as the Foyer's create and open answer it: its spec is named after it. */
const MADE = mansion(MANSION)
/** The kit's house answers for a spec named `demo`, so the house's requests for the mansion's own spec are handed to it under that name. */
const forKit = (path: string) => path.replace(`/specs/${MANSION}/`, `/specs/${SPEC}/`)

// The walk's house is a mansion made in the Foyer, so its spec is named after it and its documents live under that name.
const REQUIREMENTS_PATH = `.kiro/specs/${MANSION}/requirements.md`
const REVISION = { revision: 1, sha256: SHA_A, sizeBytes: 1200 }

/** Requirements being written: the phase was started and the Archivist is at work. */
const WRITING = projection({ version: 11, phaseOverrides: { requirements: { status: 'working', ghostIds: ['archivist'] } } })
/** Requirements written and waiting at their Door. */
const WAITING = projection({
  version: 14,
  waitingCount: 1,
  phaseOverrides: {
    requirements: { status: 'waiting', ghostIds: ['archivist'], door: { status: 'waiting', proposal: doorProposal('requirements', { documentPath: REQUIREMENTS_PATH, artifactRevision: REVISION }) } },
  },
})
/** The requirements Door opened by the visitor; design may be started. */
const APPROVED = projection({
  version: 15,
  phaseOverrides: {
    requirements: {
      status: 'approved',
      ghostIds: ['archivist'],
      door: { status: 'open', proposal: doorProposal('requirements', { documentPath: REQUIREMENTS_PATH, status: 'approved', artifactRevision: REVISION, decision: decision('approved', 15) }) },
    },
    design: { status: 'ready' },
  },
})

/** What the rooms hold: nothing yet, or the requirements the Archivist wrote. */
const empty = (version: number): RoomGhosts => emptyRoomGhosts(MANSION, MANSION, { version })
function written(version: number): RoomGhosts {
  const rooms = empty(version)
  return {
    ...rooms,
    documents: [{ ...rooms.documents[0], artifact: artifact() }, rooms.documents[1], rooms.documents[2]],
    runs: [run({ summary: 'Wrote 2 EARS criteria and a glossary.' })],
  }
}

let backend: FakeRoomBackend
/** The Foyer's own requests, in order. The house's are in `backend.posts`. */
let foyerPosts: [string, unknown][]
let listed: unknown

function serve(workflow: WorkflowProjection, rooms: RoomGhosts) {
  backend = new FakeRoomBackend(workflow, rooms)
  foyerPosts = []
  listed = listBody()
  host.get = async (path) => (path === WHOAMI ? { backend: 'ok', gateway: { version: '0.12.2' } } : path === MANSIONS ? listed : backend.get(forKit(path)))
  host.post = async (path, body) => {
    if (path !== MANSIONS && path !== OPEN) return backend.post(forKit(path), body)
    foyerPosts.push([path, body])
    listed = listBody(MADE)
    return path === MANSIONS ? { outcome: 'created', mansion: MADE } : { mansion: MADE }
  }
}

/**
 * The backend acknowledges these canonical records on the next Crew frame. A
 * record numbered past the workflow the page holds makes the page read the
 * workflow again, as it does in Crew.
 */
async function happen(...events: AppEvent[]) {
  backend.nextIngest = events
  await act(async () => {
    for (const handler of [...(host.handlers.get('chat_status') ?? [])]) handler({})
  })
}

/** A state the house reaches on its own takes a moment: a frame, a read, a render. */
const soon = { timeout: 4000 }

const says = () => document.querySelector<HTMLElement>('[data-guide-text]')?.textContent ?? null
const offers = () => Array.from(document.querySelectorAll('[data-guide-primary] .hh-guide-option-label'), (label) => label.textContent)
const shown = () => document.querySelector<HTMLElement>('.hh-ui-panel')
const everyChoice = () => Array.from(document.querySelectorAll<HTMLElement>('[data-guide-option]')).filter((button) => button.closest('[hidden], [inert]') === null)

/** One of the Warden's choices, by its label. There is exactly one. */
function choice(label: string): HTMLElement {
  const found = everyChoice().filter((button) => button.querySelector('.hh-guide-option-label')?.textContent === label)
  expect(found, label).toHaveLength(1)
  return found[0]
}

/** Everything Tab stops at, in document order. */
function tabStops(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('button, summary, a[href], input, textarea, select, [tabindex]')).filter(
    (element) => element.tabIndex >= 0 && !element.hasAttribute('disabled') && element.closest('[inert], [hidden]') === null,
  )
}

type Press = (control: HTMLElement) => void
const byPointer: Press = (control) => fireEvent.click(control)
/** Reached by Tab, then Enter: a native button answers Enter with the click a browser sends. */
const byKeyboard: Press = (control) => {
  expect(tabStops()).toContain(control)
  expect(control.tagName).toBe('BUTTON')
  control.focus()
  expect(control).toHaveFocus()
  fireEvent.keyDown(control, { key: 'Enter' })
  fireEvent.click(control)
  fireEvent.keyUp(control, { key: 'Enter' })
}

beforeEach(() => {
  host.handlers.clear()
  host.notify.mockReset()
  host.badge.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** The whole walk. Every element pressed is one the Warden offers: it carries `data-guide-option`. */
async function walk(press: Press) {
  const pressed: HTMLElement[] = []
  const take = async (control: HTMLElement) => {
    expect(control).toHaveAttribute('data-guide-option')
    pressed.push(control)
    await act(async () => press(control))
  }

  serve(projection(), empty(10))
  const { container } = render(<HauntedHouseApp />)

  // The Gate: who is knocking.
  const knock = await screen.findByRole('button', { name: 'Knock' })
  expect(liveRegions(container)).toHaveLength(1)
  fireEvent.change(screen.getByLabelText(GATE_QUESTION), { target: { value: VISITOR } })
  await take(knock)
  expect(says()).toBe(`Come in, ${VISITOR}. Nothing here opens unless you open it.`)

  // The hall: what to build. The folder's name is shown before anything is made.
  expect(mansionNameFromIdea(IDEA, new Set())).toBe(MANSION)
  fireEvent.change(screen.getByRole('textbox', { name: IDEA_FIELD_LABEL }), { target: { value: IDEA } })
  expect(document.querySelector('[data-idea-name]')!.textContent).toBe(`Project folder: ${MANSION}`)
  expect(foyerPosts).toEqual([])
  await take(screen.getByRole('button', { name: 'Build this' }))
  await screen.findByRole('region', { name: `Mansion ${MANSION}` })
  await waitFor(() => expect(container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
  expect(foyerPosts).toEqual([
    [MANSIONS, { name: MANSION, brief: IDEA }],
    [OPEN, { name: MANSION }],
  ])

  // The house opens in the Study, where the work is, and nothing has been asked of it yet.
  expect(container.querySelector('[data-stage-room]')).toHaveAttribute('data-stage-room', 'study')
  expect(says()).toBe('This is the Study. The Archivist writes what it must do here. Nothing is written yet.')
  expect(offers()[0]).toBe('Have the Archivist write what it must do')
  expect(liveRegions(container)).toHaveLength(1)
  expect(liveRegions(container)[0]).toHaveAttribute('data-announcer')
  expect(backend.posts).toEqual([])

  // Start: the Study's sheet opens and its own Start control is pressed. One request, the sheet's own.
  backend.onPost = () => {
    backend.workflow = WRITING
    return { event_id: eventId(11), sequence: 11, version: 11, workflow: wire(WRITING) }
  }
  await take(choice('Have the Archivist write what it must do'))
  await waitFor(() => expect(backend.posts).toHaveLength(1))
  expect(backend.posts[0]).toEqual({ path: `${BASE}/phases/requirements/start`, body: { command_id: expect.any(String), expected_version: 10 } })
  expect(shown()).toHaveAttribute('data-room-panel', 'study')
  await happen(ghostEvent(12, 'archivist', 'run_started', { reason: 'Writing requirements', room: 'study' }))
  await waitFor(() => expect(says()).toBe('The Archivist is writing. This door stays shut until you open it.'), soon)
  // While the ghost works nothing decides, in the short list or the long one.
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Something else…' })))
  expect(everyChoice().filter((button) => ['decide', 'start', 'ask'].includes(button.getAttribute('data-kind') ?? ''))).toEqual([])
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Something else…' })))

  // The Archivist finishes: the document waits at its Door.
  backend.workflow = WAITING
  backend.rooms = written(14)
  await happen(ghostEvent(13, 'archivist', 'run_completed', { reason: 'requirements.md is ready for review' }))
  await waitFor(() => expect(says()).toBe('The Archivist has finished what it must do. The door waits for you.'), soon)
  await take(choice('Close this sheet'))
  expect(shown()).toBeNull()
  // "Ask for a change" needs the room's answer, which can arrive after the status line on a slow machine.
  await waitFor(() => expect(offers()).toEqual(['Read what it must do', 'Ask for a change', 'Go to the door', 'See the whole house']), soon)
  // In the bare room nothing decides.
  expect(everyChoice().filter((button) => button.getAttribute('data-kind') === 'decide')).toEqual([])

  // To the Door: its surface opens, focus is on what is being decided, and a second Enter decides nothing.
  await take(choice('Go to the door'))
  expect(shown()).toHaveAttribute('data-surface', 'door')
  const focused = document.activeElement as HTMLElement
  expect(shown()!.contains(focused)).toBe(true)
  expect(focused.tagName).not.toBe('BUTTON')
  fireEvent.keyDown(focused, { key: 'Enter' })
  fireEvent.keyUp(focused, { key: 'Enter' })
  expect(backend.posts).toHaveLength(1)

  // Open the Door: the Door panel's own Approve is pressed. One request, the panel's own.
  backend.onPost = () => {
    backend.workflow = APPROVED
    backend.rooms = written(15)
    return { event_id: eventId(15), sequence: 15, version: 15, workflow: wire(APPROVED) }
  }
  expect(offers()[0]).toBe('Open the door')
  await take(choice('Open the door'))
  await waitFor(() => expect(backend.posts).toHaveLength(2))
  expect(backend.posts[1]).toEqual({
    path: `${BASE}/doors/door-requirements-1/approve`,
    body: {
      command_id: expect.any(String),
      expected_version: 14,
      phase: 'requirements',
      document_path: REQUIREMENTS_PATH,
      artifact_revision: { revision: 1, sha256: SHA_A, size_bytes: 1200 },
    },
  })

  // The Door is open, and the next thing offered is the next room. Nothing was started there.
  await waitFor(() => expect(offers()[0]).toBe('Go to the Drafting Room'), soon)
  expect(document.querySelector('[data-door-control="requirements"]')).toHaveAttribute('data-door', 'open')
  expect(backend.posts.map((call) => call.path)).toEqual([`${BASE}/phases/requirements/start`, `${BASE}/doors/door-requirements-1/approve`])
  expect(backend.roomPosts).toEqual([])
  // The name stayed on the page.
  expect(JSON.stringify([foyerPosts, backend.posts, backend.ingests, host.notify.mock.calls, host.badge.mock.calls])).not.toMatch(/Ada|Lovelace/)
  return pressed
}

describe('a first visit reaches an approved requirements Door on what the Warden offers', () => {
  it('with pointer presses', async () => {
    const pressed = await walk(byPointer)
    // Knock, Build this, start, close, to the door, open the door.
    expect(pressed).toHaveLength(6)
  })

  it('with the keyboard alone', async () => {
    const pressed = await walk(byKeyboard)
    expect(pressed).toHaveLength(6)
  })
})

// ---------------------------------------------------------------------------
// Quiet Mode: every choice names the existing controls it presses
// (`data-presses`). With the Warden stepped back each of those controls is
// still on the page, reached through the House Map, and switched on.

const SHELL_CONTROLS: Readonly<Record<string, string>> = {
  'shell:map': '[data-map-toggle]',
  'shell:reveal': '[data-reveal-toggle]',
  'shell:kiro-words': '[data-words-toggle]',
  'shell:needs-you': '[data-opener-key="needs-you"]',
  'shell:exit': '[data-guide-exit]',
}

interface Offered {
  readonly label: string
  readonly presses: readonly string[]
}

async function house(workflow: WorkflowProjection, rooms: RoomGhosts, log: AppEvent[] = []) {
  serve(workflow, rooms)
  backend.log = [...log]
  const view = render(<House mansion={MANSION_DESCRIPTOR} onReturn={() => {}} />)
  await waitFor(() => expect(view.container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
  return view
}

/** Every choice of the room on show, the long list included, with the controls each presses. */
function allOffered(): Offered[] {
  fireEvent.click(screen.getByRole('button', { name: 'Something else…' }))
  return everyChoice().map((button) => ({
    label: button.querySelector('.hh-guide-option-label')!.textContent!,
    presses: (button.getAttribute('data-presses') ?? '').split(' ').filter((key) => key !== ''),
  }))
}

const isOn = (control: Element) => control.getAttribute('aria-disabled') !== 'true' && !control.hasAttribute('disabled')
/** A key as an attribute value in a selector. A House Map key holds quotes. */
const quoted = (key: string) => key.replace(/["\\]/g, '\\$&')

/** Finds and reaches, by hand, each control one choice presses. Surfaces are opened through the House Map. */
function reachByHand(offered: Offered) {
  for (const key of offered.presses) {
    if (key === 'shell:close') continue // Only offered with a sheet open; the sheet's own Close is checked where a sheet is opened below.
    if (key in SHELL_CONTROLS) {
      const control = document.querySelector<HTMLElement>(SHELL_CONTROLS[key])
      expect(control, `${offered.label}: ${key}`).not.toBeNull()
      expect(isOn(control!), `${offered.label}: ${key}`).toBe(true)
      continue
    }
    const opener = document.querySelector<HTMLElement>(`[data-opener-key="${quoted(key)}"]`)
    if (opener !== null) {
      // A control of the House Map: it opens its surface, which has its own Close.
      fireEvent.click(opener)
      expect(shown(), `${offered.label}: ${key}`).not.toBeNull()
      expect(document.querySelector('.hh-ui-panel-close')).not.toBeNull()
      continue
    }
    // A control inside the surface the map just opened.
    const selector = key.endsWith('*') ? `[data-guide-control^="${quoted(key.slice(0, -1))}"]` : `[data-guide-control="${quoted(key)}"]`
    const controls = Array.from(shown()?.querySelectorAll<HTMLElement>(selector) ?? document.querySelectorAll<HTMLElement>(selector))
    expect(controls.length, `${offered.label}: ${key}`).toBeGreaterThan(0)
    expect(controls.some(isOn), `${offered.label}: ${key}`).toBe(true)
    // "Every" is a tick on each: ticking chooses and sends nothing, and it is what switches the board's start on.
    if (key.endsWith('*')) for (const control of controls.filter(isOn)) fireEvent.click(control)
  }
  // Put the sheet away again, by its own control, before the next choice.
  while (shown() !== null) fireEvent.click(document.querySelector<HTMLElement>('.hh-ui-panel-close')!)
}

describe('with the Warden stepped back', () => {
  const failedLog = [ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing', room: 'study' }), ghostEvent(2, 'archivist', 'run_failed', { reason: 'crew_error' })]
  /** Each state, and the one control its most pressing choice must press. */
  const matrix: readonly { readonly name: string; readonly workflow: WorkflowProjection; readonly rooms: RoomGhosts; readonly log?: AppEvent[]; readonly presses: string }[] = [
    { name: 'a phase that can be started', workflow: projection(), rooms: roomGhosts(), presses: 'start:requirements' },
    { name: 'a document waiting at its Door', workflow: REQUIREMENTS_WAITING, rooms: requirementsWritten(), presses: '["door","study","requirements"]' },
    {
      name: 'a failed run that can be tried again',
      workflow: projection({ phaseOverrides: { requirements: { status: 'failed', ghostIds: ['archivist'] } } }),
      rooms: roomGhosts({ runs: [run({ runId: 'archivist-run', canRetry: true })] }),
      log: failedLog,
      presses: 'retry:archivist-run',
    },
    // The plan is approved and nobody is building yet.
    { name: 'the to-do list approved and the build ready', workflow: TASKS_APPROVED, rooms: { ...workshopAtWork(), runs: [] }, presses: 'start-workshop' },
  ]

  it.each(matrix)('every choice of $name still has its control on the page, reached through the map', async ({ workflow, rooms, log, presses }) => {
    await house(workflow, rooms, log)
    const offered = allOffered()
    expect(offered.flatMap((item) => item.presses)).toContain(presses)
    // Every choice names at least one existing control, or is a step of the conversation itself.
    expect(offered.filter((item) => item.presses.length === 0).map((item) => item.label)).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Step back' }))
    expect(document.querySelector('[data-guide-balloon]')).toBeNull()
    for (const item of offered) reachByHand(item)
    // Reaching them by hand sent nothing: finding a control is not pressing it.
    expect(backend.posts).toEqual([])
    expect(backend.roomPosts).toEqual([])
  })
})
