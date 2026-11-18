// Replay of the guarded workflow (Spec 4 tasks 15.1 and 15.2). The house is
// mounted on the replay stand-in exactly as the replay build maps it, with the
// recorded fixture served by a fetch stub and every other way out of the page
// stubbed to throw. What it shows must be the backend's projection of the same
// canonical records, with integrity decided by Spec 2 alone.
// **Validates: Requirements 10.4, 10.5, 10.6, 10.8**
import { act, fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../fixtures/replay/demo.jsonl?raw'
import { HELD_MOMENT_RECORDS } from './test/held-moment'
import demoWorkflow from '../../../fixtures/replay/demo.workflow.json'
import { parseEventLog, projectEvents } from './core/seance-log'
import { foldWorkflow } from './core/workflow-fold'
import { parseWorkflowProjection, type WorkflowProjection } from './core/workflow-projection'

const FIXTURE_URL = './fixture.jsonl'
const MANSION = 'demo-mansion'
const LOG = parseEventLog(demo).events

let fixtureResponse = (): Response => new Response(demo, { status: 200 })
let unexpected: string[] = []

const fetchSpy = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url !== FIXTURE_URL) {
    unexpected.push(`fetch ${url}`)
    throw new TypeError(`The replay must not request ${url}.`)
  }
  return fixtureResponse()
})

function blocked(name: string) {
  return class {
    constructor() {
      unexpected.push(name)
      throw new Error(`The replay must not open a ${name}.`)
    }
  }
}

beforeEach(() => {
  // Same mapping as the replay build; registered per test so each gets a fresh stand-in.
  vi.doMock('@kirocrew/app-sdk', () => import('./adapters/sdk-shim'))
  unexpected = []
  fixtureResponse = () => new Response(demo, { status: 200 })
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubGlobal('XMLHttpRequest', blocked('XMLHttpRequest'))
  vi.stubGlobal('WebSocket', blocked('WebSocket'))
  vi.stubGlobal('EventSource', blocked('EventSource'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
})

const DESCRIPTOR = { name: MANSION, projectSpec: MANSION, displayPath: `~/mansions/${MANSION}`, status: 'ready' } as const

async function mountReplayHouse() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const shim = await import('./adapters/sdk-shim')
  const adapter = await import('./adapters/sdk')
  expect(adapter.useAppApi).toBe(shim.useAppApi)
  expect(adapter.REPLAY_RECORDING).toBe(shim.replayRecording)
  const { House } = await import('./rooms/house/House')
  const view = render(<House mansion={DESCRIPTOR} onReturn={() => {}} />)
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  // The recording is read in promise callbacks: let them settle.
  await advance(0)
  const page = within(view.container)
  /** Everything the page's one live region said, in order, without repeats of the same text. */
  const announcements: string[] = []
  const said = () => view.container.querySelector('[data-announcer]')?.textContent ?? ''
  const note = () => {
    const text = said()
    if (text !== '' && announcements.at(-1) !== text) announcements.push(text)
  }
  const openAttic = () => {
    fireEvent.click(page.getByRole('button', { name: /^Attic\./ }))
    return page.getByRole('region', { name: 'Attic' })
  }
  const closeRoom = () => fireEvent.keyDown(document.activeElement ?? view.container, { key: 'Escape' })
  /** Moves the Attic's Cursor with its seek slider: the house shows that prefix of the recording. */
  const seek = (cursor: number) => {
    const attic = view.container.querySelector('[data-attic-panel]') === null ? openAttic() : page.getByRole('region', { name: 'Attic' })
    fireEvent.change(within(attic).getByRole('slider'), { target: { value: String(cursor) } })
    note()
  }
  /** Plays the whole recording: the Cursor goes to its last record, then the Attic closes. */
  const playAll = async () => {
    const attic = openAttic()
    const slider = within(attic).getByRole('slider') as HTMLInputElement
    fireEvent.change(slider, { target: { value: slider.max } })
    note()
    closeRoom()
    await advance(0)
  }
  return { view, page, announcements, said, note, advance, playAll, openAttic, closeRoom, seek }
}

/** Phase status, Door status and waiting count of a projection, as one comparable line. */
function signature(projection: WorkflowProjection): string {
  return projection.phases.map((phase) => `${phase.phase}:${phase.status}/${phase.door.status}`).join('|')
}

/** The same line read from the house map on the page. */
function shownSignature(container: HTMLElement): string {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-door-control]'), (line) =>
    `${line.dataset.phase}:${line.dataset.status}/${line.dataset.door}`,
  ).join('|')
}

const roomLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-room-control]'), (room) => room.getAttribute('aria-label'))

/** The backend's final projection of the recording, from the committed fixture. */
function backendFinal(): WorkflowProjection {
  const parsed = parseWorkflowProjection((demoWorkflow.steps as { workflow: unknown }[]).at(-1)!.workflow, MANSION)
  if (!parsed.ok) throw new Error(`backend projection refused at ${parsed.path}`)
  return parsed.projection
}

describe('replay house', () => {
  it('plays the workflow in canonical order and ends on the backend projection, with one request in all', async () => {
    const { view, announcements, note, advance, openAttic } = await mountReplayHouse()

    // The distinct workflow states of every prefix of the canonical log, in order.
    const expected: string[] = []
    for (let count = 0; count <= LOG.length; count += 1) {
      const line = signature(foldWorkflow(LOG.slice(0, count), { mansionId: MANSION }).projection)
      if (expected.at(-1) !== line) expected.push(line)
    }
    expect(expected.length).toBeGreaterThan(8)

    // A recording starts paused at its start and does not play by itself.
    expect(view.container.querySelector('[data-replay-start]')).toHaveTextContent(/paused at its start/)
    await advance(10 * 60_000)
    expect(shownSignature(view.container)).toBe(expected[0])

    // The judge opens the Attic and presses Play; the house follows the Cursor.
    const attic = openAttic()
    fireEvent.click(within(attic).getByRole('button', { name: 'Play' }))
    expect(view.container.querySelector('[data-replay-start]')).not.toBeNull()
    const shown: string[] = [shownSignature(view.container)]
    for (let step = 0; step < 1_200; step += 1) {
      await advance(250)
      note()
      const line = shownSignature(view.container)
      if (line !== '' && shown.at(-1) !== line) shown.push(line)
    }
    // What the page showed is exactly the walk through those states: none out of order, none skipped, none invented.
    expect(shown).toEqual(expected)
    expect(view.container.querySelector('[data-replay-start]')).toBeNull()
    expect(within(attic).getByText(/^Replay complete\./)).toBeInTheDocument()

    // The end state is the backend's projection of the same records, joined with the Spec 2 ghost fold.
    const final = backendFinal()
    expect(shown.at(-1)).toBe(signature(final))
    expect(roomLabels(view.container)).toEqual([
      'Foyer. Phase: navigation. Door: not applicable. Ghost: not applicable.',
      'Study. Phase: requirements. Door: open. Ghost: done.',
      'Drafting Room. Phase: design. Door: open. Ghost: done.',
      'Workshop. Phase: tasks and implementation. Door: open. Ghost: done.',
      'Attic. Phase: replay. Door: not applicable. Ghost: not applicable.',
      'Séance Room. Phase: review. Door: not applicable. Ghost: idle.',
    ])
    // Every ghost of the Spec 2 fold is on the map in its final state.
    const ghosts = Object.fromEntries(
      Array.from(view.container.querySelectorAll<HTMLElement>('[data-ghost-control]'), (ghost) => [ghost.dataset.ghostControl, ghost.dataset.ghost]),
    )
    expect(ghosts).toEqual(Object.fromEntries(projectEvents(LOG).snapshots.map((snapshot) => [snapshot.ghost_id, snapshot.state])))
    expect(ghosts).toMatchObject({ archivist: 'done', draughtsman: 'done', foreman: 'done', 'tinker-1': 'done', 'tinker-2': 'done', 'tinker-3': 'done' })

    // Playback interrupts nobody (replay-and-submission Requirement 3.6): the Doors and ghosts that
    // waited on the way were shown in place and not announced. The one thing said is that the replay ended.
    expect(announcements).toEqual([`Replay complete. Event ${LOG.length} of ${LOG.length}.`])
    expect(view.container.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]')).toHaveLength(1)

    // One request in all: the recording. No backend, gateway or socket.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])

    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  }, 30_000)

  it('shows the fold of the prefix at every Cursor, backwards as well as forwards', async () => {
    const { view, seek } = await mountReplayHouse()
    for (const cursor of [LOG.length, 19, 20, 5, 0, 41, 40]) {
      seek(cursor)
      expect(shownSignature(view.container)).toBe(signature(foldWorkflow(LOG.slice(0, cursor), { mansionId: MANSION }).projection))
      const ghosts = Object.fromEntries(
        Array.from(view.container.querySelectorAll<HTMLElement>('[data-ghost-control]'), (ghost) => [ghost.dataset.ghostControl, ghost.dataset.ghost]),
      )
      expect(ghosts).toEqual(
        Object.fromEntries(projectEvents(LOG.slice(0, cursor)).snapshots.map((snapshot) => [snapshot.ghost_id, snapshot.state])),
      )
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
  })

  it('shows the exact pending proposal read-only: nothing can be decided or started in a recording', async () => {
    const { view, page, advance, seek } = await mountReplayHouse()
    // The held moment: Tinker 2's whole-project test run waits on the owner.
    seek(HELD_MOMENT_RECORDS)

    expect(view.container.querySelector('.hh-ui-note[data-block="read_only"]')).toHaveTextContent(
      'This is a recording. Nothing can be started, approved or rejected here.',
    )
    fireEvent.click(page.getByRole('button', { name: /^Workshop\./ }))
    const panel = page.getByRole('region', { name: 'Workshop' })
    const action = within(panel).getByRole('article', { name: 'Tinker 2 asks: Run a command' })
    expect(within(action).getByText('"bun" "test"')).toBeInTheDocument()
    expect(within(action).getByText('hh-tinker-2-task-2')).toBeInTheDocument()
    expect(within(action).getByText('src')).toBeInTheDocument()

    const approve = within(action).getByRole('button', { name: /^Approve run a command/ })
    const reject = within(action).getByRole('button', { name: /^Reject run a command/ })
    expect(approve).toHaveAttribute('aria-disabled', 'true')
    expect(reject).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(approve)
    fireEvent.click(reject)
    await advance(1_000)
    expect(within(action).getByText('Waiting for your decision')).toBeInTheDocument()

    // A decided Door shows its outcome and actor, and no controls.
    fireEvent.click(page.getByRole('button', { name: /^Study\./ }))
    const study = page.getByRole('region', { name: 'Study' })
    expect(within(study).getByText('Approved by the operator in Haunted House.')).toBeInTheDocument()
    expect(within(study).queryByRole('button', { name: /^(Approve|Reject|Start)/ })).toBeNull()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
  })

  it('folds only the valid prefix Spec 2 hands over and shows its integrity diagnostic', async () => {
    const lines = demo.split('\n').filter((line) => line !== '')
    // Damage the record that approves the requirements Door (line 20).
    lines[19] = lines[19].replace(/"persisted_at_ms":\d+/, '"persisted_at_ms":1')
    fixtureResponse = () => new Response(`${lines.join('\n')}\n`, { status: 200 })
    const { view, openAttic, playAll } = await mountReplayHouse()

    // The Attic holds only the nineteen records before the failure.
    const slider = within(openAttic()).getByRole('slider') as HTMLInputElement
    expect(slider.max).toBe('19')
    fireEvent.keyDown(document.activeElement ?? view.container, { key: 'Escape' })
    await playAll()

    expect(
      within(view.container).getByText('The séance log failed its integrity check at line 20. Showing only the records before it.'),
    ).toBeInTheDocument()
    // The Door decision after the failure never happened as far as the house can show.
    const prefix = foldWorkflow(LOG.slice(0, 19), { mansionId: MANSION }).projection
    expect(shownSignature(view.container)).toBe(signature(prefix))
    expect(shownSignature(view.container)).toMatch(/^requirements:waiting\/waiting\|design:not_started\/sealed/)
    const ghosts = Object.fromEntries(
      Array.from(view.container.querySelectorAll<HTMLElement>('[data-ghost-control]'), (ghost) => [ghost.dataset.ghostControl, ghost.dataset.ghost]),
    )
    expect(ghosts).toEqual(Object.fromEntries(projectEvents(LOG.slice(0, 19)).snapshots.map((snapshot) => [snapshot.ghost_id, snapshot.state])))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
  })

  it('shows that the house is unavailable when the recording cannot be loaded, and asks nothing else', async () => {
    fixtureResponse = () => new Response('missing', { status: 404 })
    const { view, openAttic, advance } = await mountReplayHouse()
    await advance(120_000)

    expect(within(view.container).getByText('Could not read the séance log. Showing the last confirmed state.')).toBeInTheDocument()
    expect(within(view.container).queryByRole('button', { name: /^(Approve|Reject|Start)/ })).toBeNull()
    // The Attic says the same in fixed copy and has nothing to play.
    const attic = openAttic()
    expect(within(attic).getByText('The replay recording could not be loaded.')).toBeInTheDocument()
    expect(within(attic).getByRole('button', { name: 'Play' })).toHaveAttribute('aria-disabled', 'true')
    // The failure is kept by the stand-in: no second fetch, no fallback.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
  })
})

describe('Spec 4 owns no event log in the UI', () => {
  const sources = import.meta.glob<string>(
    ['/src/core/workflow-*.ts', '/src/core/house-*.ts', '/src/core/interruption-policy.ts', '/src/adapters/workflow-live.ts', '/src/adapters/host-effects.ts', '/src/adapters/house-projection.ts', '/src/adapters/sdk-shim/workflow-replay.ts', '/src/rooms/house/*.{ts,tsx}', '!**/*.test.{ts,tsx}'],
    { query: '?raw', import: 'default', eager: true },
  )
  const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

  it('scans the Spec 4 UI modules', () => {
    expect(Object.keys(sources)).toEqual(
      expect.arrayContaining([
        '/src/core/workflow-fold.ts',
        '/src/core/workflow-projection.ts',
        '/src/core/workflow-api.ts',
        '/src/adapters/workflow-live.ts',
        '/src/adapters/sdk-shim/workflow-replay.ts',
        '/src/rooms/house/House.tsx',
      ]),
    )
  })

  it('has no log parser, hash-chain verifier, identifier algorithm, log file or storage of its own', () => {
    const owned =
      /parseEventLog|parseAppEventLine|serializeAppEvent|calculateEventHash|calculateEventId|calculateRecordId|GENESIS_HASH|prev_hash|mergeAcknowledged|\.jsonl|\bfetch\s*\(|localStorage|sessionStorage|indexedDB/
    expect(Object.entries(sources).filter(([, source]) => owned.test(code(source))).map(([file]) => file)).toEqual([])
    // Diagnostics about the log come from Spec 2's parser; the fold only passes its verdict on.
    expect(code(sources['/src/adapters/sdk-shim/workflow-replay.ts'])).toMatch(/integrityOk \? 'valid' : 'corrupt'/)
    expect(code(sources['/src/core/workflow-fold.ts'])).not.toMatch(/integrityOk|diagnostics\.push\(\{[^}]*hash/)
  })

  it('folds only domain payloads and canonical approval facts, never a Crew envelope', () => {
    const fold = code(sources['/src/core/workflow-fold.ts'])
    const eventTypes = Array.from(fold.matchAll(/event_type [!=]== '([a-z_]+)'/g), (match) => match[1]).sort()
    expect(eventTypes).toEqual(['approval_decided', 'approval_requested', 'domain_event_recorded'])
    expect(fold).not.toMatch(/tool_input|tool_name|approval_id|request_id/)
  })

  it('applies no decision in the browser: live state changes only from a backend projection', () => {
    const live = code(sources['/src/adapters/workflow-live.ts'])
    expect(live).not.toMatch(/foldWorkflow|workflow-fold/)
    for (const [file, source] of Object.entries(sources)) {
      if (file.includes('/sdk-shim/') || file.endsWith('/workflow-fold.ts')) continue
      expect(code(source), file).not.toMatch(/foldWorkflow|from '.*workflow-fold'/)
    }
  })
})

// The replay bar (visual design pass, 2026-11-16): one read-only sentence for
// the whole house, and a second view of the Attic's one replay.
describe('replay bar', () => {
  it('drives the same replay as the Attic, says the end once, and plays again from the start at the end', async () => {
    const { view, page, announcements, note, advance, openAttic, closeRoom } = await mountReplayHouse()
    const bar = page.getByRole('group', { name: 'Recording playback' })
    // One read-only sentence for the house; the rooms keep theirs for assistive technology only.
    expect(view.container.querySelectorAll('[data-block="read_only"]')).toHaveLength(1)
    expect(within(bar).getByText(/This is a recording\./)).toBeInTheDocument()
    for (const reason of view.container.querySelectorAll('[data-room-reason="read-only"]')) {
      expect(reason).toHaveClass('hh-ui-visually-hidden')
    }
    expect(within(bar).getByRole('button', { name: 'Restart' })).toHaveAttribute('aria-disabled', 'true')

    // Play from the bar with the Attic closed: the house fills and the end is said once.
    fireEvent.click(within(bar).getByRole('button', { name: 'Play' }))
    expect(within(bar).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    for (let step = 0; step < 500; step += 1) {
      await advance(250)
      note()
    }
    const total = LOG.length
    expect(within(bar).getByText(`Event ${total} of ${total}`)).toBeInTheDocument()
    expect(announcements.filter((text) => text.startsWith('Replay complete.'))).toHaveLength(1)

    // The Attic shows the same Cursor: one replay, two views.
    const attic = openAttic()
    expect(within(attic).getByRole('slider')).toHaveValue(String(total))
    closeRoom()

    // Play at the end starts again from the beginning and plays.
    fireEvent.click(within(bar).getByRole('button', { name: 'Play' }))
    expect(within(bar).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    await advance(250)
    const slider = within(bar).getByRole('slider') as HTMLInputElement
    expect(Number(slider.value)).toBeLessThan(total)
    fireEvent.click(within(bar).getByRole('button', { name: 'Pause' }))
    fireEvent.click(within(bar).getByRole('button', { name: 'Restart' }))
    expect(slider).toHaveValue('0')
    expect(view.container.querySelector('[data-replay-start]')).not.toBeNull()
    expect(unexpected).toEqual([])
  })
})
