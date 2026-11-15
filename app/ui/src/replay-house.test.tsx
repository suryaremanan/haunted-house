// Replay of the guarded workflow (Spec 4 tasks 15.1 and 15.2). The house is
// mounted on the replay stand-in exactly as the replay build maps it, with the
// recorded fixture served by a fetch stub and every other way out of the page
// stubbed to throw. What it shows must be the backend's projection of the same
// canonical records, with integrity decided by Spec 2 alone.
// **Validates: Requirements 10.4, 10.5, 10.6, 10.8**
import { act, fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../fixtures/replay/demo.jsonl?raw'
import demoWorkflow from '../../../fixtures/replay/demo.workflow.json'
import { houseRooms } from './core/house-view'
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

async function mountReplayHouse() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const shim = await import('./adapters/sdk-shim')
  const adapter = await import('./adapters/sdk')
  expect(adapter.useAppApi).toBe(shim.useAppApi)
  expect(adapter.useNotify).toBe(shim.useNotify)
  const { House } = await import('./rooms/house/House')
  const announcements: string[] = []
  const view = render(<House mansionId={MANSION} onAnnounce={(message) => announcements.push(message)} />)
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  /** Plays the whole recording. Several steps, so the page renders and re-reads between them. */
  const playAll = async () => {
    for (let step = 0; step < 12; step += 1) await advance(20_000)
  }
  return { view, announcements, advance, playAll }
}

/** Phase status, Door status and waiting count of a projection, as one comparable line. */
function signature(projection: WorkflowProjection): string {
  return projection.phases.map((phase) => `${phase.phase}:${phase.status}/${phase.door.status}`).join('|')
}

/** The same line read from the house map on the page. */
function shownSignature(container: HTMLElement): string {
  return Array.from(container.querySelectorAll<HTMLElement>('.hh-map [data-phase]'), (line) =>
    `${line.dataset.phase}:${line.dataset.status}/${line.dataset.door}`,
  ).join('|')
}

const roomLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.hh-map .hh-room'), (room) => room.getAttribute('aria-label'))

/** The backend's final projection of the recording, from the committed fixture. */
function backendFinal(): WorkflowProjection {
  const parsed = parseWorkflowProjection((demoWorkflow.steps as { workflow: unknown }[]).at(-1)!.workflow, MANSION)
  if (!parsed.ok) throw new Error(`backend projection refused at ${parsed.path}`)
  return parsed.projection
}

describe('replay house', () => {
  it('plays the workflow in canonical order and ends on the backend projection, with one request in all', async () => {
    const { view, announcements, advance } = await mountReplayHouse()

    // The distinct workflow states of every prefix of the canonical log, in order.
    const expected: string[] = []
    for (let count = 0; count <= LOG.length; count += 1) {
      const line = signature(foldWorkflow(LOG.slice(0, count), { mansionId: MANSION }).projection)
      if (expected.at(-1) !== line) expected.push(line)
    }
    expect(expected.length).toBeGreaterThan(8)

    const shown: string[] = []
    for (let step = 0; step < 500; step += 1) {
      await advance(250)
      const line = shownSignature(view.container)
      if (line !== '' && shown.at(-1) !== line) shown.push(line)
    }
    // What the page showed is a walk through those states in order: none out of order, none invented.
    let cursor = 0
    for (const line of shown) {
      const index = expected.indexOf(line, cursor)
      expect(index, `state shown out of canonical order: ${line}`).toBeGreaterThanOrEqual(cursor)
      cursor = index
    }
    expect(shown.length).toBeGreaterThan(5)
    expect(shown.at(-1)).toBe(expected.at(-1))

    // The end state is the backend's projection of the same records, joined with the Spec 2 ghost fold.
    const final = backendFinal()
    expect(shown.at(-1)).toBe(signature(final))
    expect(roomLabels(view.container)).toEqual(houseRooms(final, projectEvents(LOG).snapshots).map((room) => room.label))
    expect(roomLabels(view.container)).toEqual([
      'Study. Requirements: Approved, Open door. Archivist: Done.',
      'Drafting Room. Design: Approved, Open door. Draughtsman: Done.',
      'Workshop. Tasks: Working, Sealed door. Implementation: Not started, Sealed door. Foreman: Working, Tinker 1: Blocked, Tinker 2: Waiting, Tinker 3: Failed. 1 thing needs you.',
    ])

    // Both Doors needed a decision on the way, and each was announced once.
    for (const sentence of ['The requirements door needs your decision.', 'The design door needs your decision.', 'Tinker 2 asks to run a command.']) {
      expect(announcements.filter((message) => message.includes(sentence))).toHaveLength(1)
    }

    // One request in all: the recording. No backend, gateway or socket.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])

    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows the exact pending proposal read-only: nothing can be decided or started in a recording', async () => {
    const { view, advance, playAll } = await mountReplayHouse()
    await playAll()
    const page = within(view.container)

    expect(view.container.querySelector('.hh-house-blocked[data-block="read_only"]')).toHaveTextContent(
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
    const { view, playAll } = await mountReplayHouse()
    await playAll()

    expect(
      within(view.container).getByText('The séance log failed its integrity check at line 20. Showing only the records before it.'),
    ).toBeInTheDocument()
    // The Door decision after the failure never happened as far as the house can show.
    const prefix = foldWorkflow(LOG.slice(0, 19), { mansionId: MANSION }).projection
    expect(shownSignature(view.container)).toBe(signature(prefix))
    expect(shownSignature(view.container)).toMatch(/^requirements:waiting\/waiting\|design:not_started\/sealed/)
    expect(roomLabels(view.container)).toEqual(
      houseRooms(prefix, projectEvents(LOG.slice(0, 19)).snapshots).map((room) => room.label),
    )
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
  })

  it('shows that the house is unavailable when the recording cannot be loaded, and asks nothing else', async () => {
    fixtureResponse = () => new Response('missing', { status: 404 })
    const { view, playAll } = await mountReplayHouse()
    await playAll()

    expect(within(view.container).getByText('Could not read the séance log. Showing the last confirmed state.')).toBeInTheDocument()
    expect(within(view.container).queryByRole('button', { name: /^(Approve|Reject|Start)/ })).toBeNull()
    // The failure is kept by the stand-in: no second fetch, no fallback.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
  })
})

describe('Spec 4 owns no event log in the UI', () => {
  const sources = import.meta.glob<string>(
    ['/src/core/workflow-*.ts', '/src/core/house-*.ts', '/src/core/notify-coalescer.ts', '/src/adapters/workflow-live.ts', '/src/adapters/house-interruptions.ts', '/src/adapters/sdk-shim/workflow-replay.ts', '/src/rooms/house/*.{ts,tsx}', '!**/*.test.{ts,tsx}'],
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
