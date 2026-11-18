// Replay DOM test (crew-app-foundation Requirements 7.3, 7.4;
// seance-log-and-ghost-state Requirements 8.3 to 8.6). Renders the replay entry,
// replay/main.tsx, with the SDK mapped to the replay stand-in as
// vite.replay.config.ts maps it, and the recorded fixture served by a fetch
// stub. Every other way out of the page is stubbed to throw and recorded.
import { act, render, screen, within } from '@testing-library/react'
import { isValidElement } from 'react'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../fixtures/replay/demo.jsonl?raw'
import { HELD_MOMENT_RECORDS } from './test/held-moment'
import { ghostRows } from './core/ghost-status'
import { parseEventLog, projectEvents } from './core/seance-log'

// replay/main.tsx doesn't export its root. This pass-through keeps each root
// and what it rendered, so the test can check the root component and unmount it.
interface CreatedRoot {
  container: Element | DocumentFragment
  root: Root
  rendered: unknown[]
}
const roots = vi.hoisted(() => [] as CreatedRoot[])
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>()
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      const root = actual.createRoot(...args)
      const created: CreatedRoot = { container: args[0], root, rendered: [] }
      const renderRoot = root.render.bind(root)
      root.render = (children) => {
        created.rendered.push(children)
        renderRoot(children)
      }
      roots.push(created)
      return root
    },
  }
})

const FIXTURE_URL = './fixture.jsonl'

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/** The fixture URL as written, or resolved against the page. */
function isFixture(url: string): boolean {
  if (url === FIXTURE_URL) return true
  try {
    return new URL(url, document.baseURI).href === new URL(FIXTURE_URL, document.baseURI).href
  } catch {
    return false
  }
}

/** The canonical records of the recording, parsed without the stand-in. */
const LOG = parseEventLog(demo).events

/** What the fixture request answers with. Tests may swap it for a damaged or missing recording. */
let fixtureResponse = (): Response =>
  new Response(demo, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })

// Requests the page tried that it must not make. Checked by each test.
let unexpected: string[] = []

const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
  const url = urlOf(input)
  if (!isFixture(url)) {
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
  // Same mapping as the replay build. Registered per test, not with a hoisted
  // vi.mock: Vitest keeps a factory's result across vi.resetModules(), which
  // would hand every test the first test's stand-in (its player and fetch state).
  vi.doMock('@kirocrew/app-sdk', () => import('./adapters/sdk-shim'))
  unexpected = []
  fixtureResponse = () => new Response(demo, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubGlobal('XMLHttpRequest', blocked('XMLHttpRequest'))
  vi.stubGlobal('WebSocket', blocked('WebSocket'))
  vi.stubGlobal('EventSource', blocked('EventSource'))
})

afterEach(() => {
  for (const { root } of roots.splice(0)) act(() => root.unmount())
  document.getElementById('root')?.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
})

describe('replay page', () => {
  it('renders the live root component, HauntedHouseApp, and requests nothing but ./fixture.jsonl', async () => {
    const container = document.createElement('div')
    container.id = 'root'
    document.body.append(container)

    await act(async () => {
      await import('../replay/main')
    })

    const summary = await screen.findByText('Backend reachable · Gateway replay')
    expect(summary).toHaveAttribute('aria-live', 'polite')

    // The element rendered into #root is the default export of src/App.tsx,
    // the module the live build ships as dist/index.mjs. Imported after the
    // entry, so it is the same module instance the entry used.
    const { default: HauntedHouseApp } = await import('./App')
    const pageRoots = roots.filter((r) => r.container === container)
    expect(pageRoots).toHaveLength(1)
    expect(pageRoots[0].rendered).toHaveLength(1)
    const element = pageRoots[0].rendered[0]
    expect(isValidElement(element) && element.type).toBe(HauntedHouseApp)

    const page = within(container)
    expect(page.getByRole('heading', { name: 'Haunted House' })).toBeInTheDocument()
    expect(page.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'BackendReachable',
      'GatewayVersion replay',
    ])
    expect(page.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()

    // Spec 1's page subscribes to no events, so zero fetches is as valid as one.
    const urls = fetchSpy.mock.calls.map(([input]) => urlOf(input))
    expect(urls.filter((url) => !url.endsWith('fixture.jsonl'))).toEqual([])
    expect(unexpected).toEqual([])
  })

  /** Name, state text, pending text and reason of every ghost row on the page. */
  function shownRows(container: HTMLElement) {
    return Array.from(container.querySelectorAll('.hh-ghost'), (row) => ({
      name: row.querySelector('.hh-ghost-name')?.textContent ?? null,
      stateText: row.querySelector('.hh-ghost-state-text')?.textContent ?? null,
      pendingText: row.querySelector('.hh-ghost-pending')?.textContent ?? null,
      reason: row.querySelector('.hh-ghost-reason')?.textContent ?? null,
    }))
  }

  /** The rows the Spec 2 fold gives for the first `count` records of the recording. */
  function foldedRows(count: number) {
    return ghostRows(projectEvents(LOG.slice(0, count)).snapshots).map(({ name, stateText, pendingText, reason }) => ({
      name,
      stateText,
      pendingText,
      reason,
    }))
  }

  /** Mounts the canonical ghost status for the recorded mansion on the replay stand-in. */
  async function mountReplayStatus() {
    // Timers and the clock are faked together; the fixture Response is read with real microtasks.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const shim = await import('./adapters/sdk-shim')
    const adapter = await import('./adapters/sdk')
    // The adapter the UI imports hands out the stand-in's hooks.
    expect(adapter.useAppEvents).toBe(shim.useAppEvents)
    expect(adapter.useAppApi).toBe(shim.useAppApi)
    const { MansionGhostStatus } = await import('./components/GhostStatusView')
    const announcements: string[] = []
    const view = render(<MansionGhostStatus mansionId="demo-mansion" onAnnounce={(message) => announcements.push(message)} />)
    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
      })
    /**
     * Moves the Attic's Cursor: the stand-in then serves that many records.
     * Nothing polls a recording, so the page is told to look again the way a
     * live page is: it became visible.
     */
    const present = async (cursor: number) => {
      shim.replayRecording.present('demo-mansion', cursor)
      for (const state of ['hidden', 'visible']) {
        Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
        act(() => {
          document.dispatchEvent(new Event('visibilitychange'))
        })
      }
      await advance(0)
    }
    return { view, announcements, advance, present }
  }

  it('fetches ./fixture.jsonl once and folds its canonical records into ghost states in Sequence order', async () => {
    const { view, announcements, advance, present } = await mountReplayStatus()
    expect(view.getByText('Loading the séance log…')).toBeInTheDocument()

    // A recording does not play by itself: until the Attic's Cursor moves, nothing is shown.
    await advance(10 * 60_000)
    expect(shownRows(view.container)).toEqual([])

    // Playback: at every Cursor the page shows exactly the fold of that prefix
    // of the canonical log, the prefix grows by one record, and it ends as the whole log.
    const stateSeries = new Map<string, string[]>()
    let heldStates = new Set<string | null>()
    for (let cursor = 1; cursor <= LOG.length; cursor += 1) {
      await present(cursor)
      const shown = shownRows(view.container)
      if (cursor === HELD_MOMENT_RECORDS) heldStates = new Set(shown.map((row) => row.stateText))
      expect(shown).toEqual(foldedRows(cursor))
      for (const row of shown) {
        const series = stateSeries.get(row.name!) ?? []
        if (series.at(-1) !== row.stateText) series.push(row.stateText!)
        stateSeries.set(row.name!, series)
      }
    }
    expect(shownRows(view.container)).toEqual(foldedRows(LOG.length))
    expect(view.queryByText('Loading the séance log…')).not.toBeInTheDocument()
    expect(view.queryByText(/Catching up/)).not.toBeInTheDocument()

    // The story played out over time, not in one jump, and in canonical order.
    expect(stateSeries.get('Archivist')).toEqual(['Working', 'Waiting', 'Working', 'Done'])
    expect(stateSeries.get('Foreman')).toEqual(['Working', 'Failed', 'Working', 'Done'])
    // One record per step shows the instant before Tinker 1's run starts, which the
    // wall-clock player presented together with the start.
    expect(stateSeries.get('Tinker 1')).toEqual(['Idle', 'Working', 'Blocked', 'Working', 'Done'])
    expect(stateSeries.get('Tinker 3')).toEqual(['Working', 'Failed', 'Working', 'Done'])
    // At the held moment every state shows at once; at the end the work is done.
    expect(heldStates).toEqual(new Set(['Idle', 'Working', 'Waiting', 'Blocked', 'Failed', 'Done']))
    expect(new Set(shownRows(view.container).map((row) => row.stateText))).toEqual(new Set(['Idle', 'Done']))
    // Only waiting, blocked and failed were announced, each once.
    expect(announcements).toEqual([
      'Archivist is waiting for your approval.',
      'Foreman failed: Artifact invalid',
      'Tinker 1 is blocked: A door upstream is still sealed.',
      'Tinker 2 is waiting for your approval.',
      'Tinker 3 failed: Crew error',
      'Tinker 2 is waiting for your approval.',
    ])

    // One request in all: the recording. No backend, gateway or socket.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchSpy.mock.calls[0][0])).toBe(FIXTURE_URL)
    expect(unexpected).toEqual([])

    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows the safe diagnostic and folds only the valid prefix of a damaged recording', async () => {
    const lines = demo.split('\n').filter((line) => line !== '')
    lines[11] = lines[11].replace(/"persisted_at_ms":\d+/, '"persisted_at_ms":1')
    fixtureResponse = () => new Response(`${lines.join('\n')}\n`, { status: 200 })
    const { view, present } = await mountReplayStatus()
    await present(LOG.length)

    expect(
      view.getByText('The séance log failed its integrity check at line 12. Showing only the records before it.'),
    ).toBeInTheDocument()
    expect(shownRows(view.container)).toEqual(foldedRows(11))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
  })

  it('shows a diagnostic and makes no other request when the recording cannot be loaded', async () => {
    fixtureResponse = () => new Response('missing', { status: 404 })
    const { view, advance } = await mountReplayStatus()
    await advance(120_000)

    expect(view.getByText('Could not read the séance log. Showing the last confirmed state.')).toBeInTheDocument()
    expect(shownRows(view.container)).toEqual([])
    expect(view.queryByText(/No ghost has stirred/)).not.toBeInTheDocument()
    // The failure is kept: no retry storm, no fallback to a backend or gateway.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
  })

  it('shows an empty mansion for an empty recording', async () => {
    fixtureResponse = () => new Response('', { status: 200 })
    const { view, advance } = await mountReplayStatus()
    await advance(1_000)

    expect(view.getByText('No ghost has stirred in this mansion yet.')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
