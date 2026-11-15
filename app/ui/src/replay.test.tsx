// Replay DOM test (Requirements 7.3, 7.4). Renders the replay entry,
// replay/main.tsx, with the SDK mapped to the replay stand-in as
// vite.replay.config.ts maps it, and the recorded fixture served by a fetch
// stub. Every other way out of the page is stubbed to throw and recorded.
import { act, render, screen, within } from '@testing-library/react'
import { isValidElement } from 'react'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../fixtures/replay/demo.jsonl?raw'

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

/** The `data` of every recorded frame of `type`, in file order, parsed without the player. */
function recorded(type: string): unknown[] {
  return demo
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as { frame: { type: string; data: unknown } })
    .filter(({ frame }) => frame.type === type)
    .map(({ frame }) => frame.data)
}

// Requests the page tried that it must not make. Checked by each test.
let unexpected: string[] = []

const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
  const url = urlOf(input)
  if (!isFixture(url)) {
    unexpected.push(`fetch ${url}`)
    throw new TypeError(`The replay must not request ${url}.`)
  }
  return new Response(demo, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
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

  it('fetches ./fixture.jsonl once for all subscriptions and delivers its recorded frames', async () => {
    // Only timers are faked: the fixture Response is read with real microtasks.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const shim = await import('./adapters/sdk-shim')
    const adapter = await import('./adapters/sdk')
    // The adapter the UI imports hands out the stand-in's hooks.
    expect(adapter.useAppEvents).toBe(shim.useAppEvents)
    expect(adapter.useAppApi).toBe(shim.useAppApi)

    const chunks: unknown[] = []
    const approvals: unknown[] = []
    // Stable callbacks, so the hook subscribes once per mount.
    const onChunk = (data: unknown) => {
      chunks.push(data)
    }
    const onApproval = (data: unknown) => {
      approvals.push(data)
    }
    const { useAppEvents } = shim
    function Probe() {
      useAppEvents('subagent_chunk', onChunk)
      useAppEvents('approval', onApproval)
      return null
    }
    render(<Probe />)

    // Playback starts once the fixture is fetched and parsed; then run it to the end.
    await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0))
    await vi.runAllTimersAsync()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(urlOf(fetchSpy.mock.calls[0][0])).toBe(FIXTURE_URL)

    const expectedChunks = recorded('subagent_chunk')
    const expectedApprovals = recorded('approval')
    expect(expectedChunks.length).toBeGreaterThan(0)
    expect(expectedApprovals.length).toBeGreaterThan(0)
    expect(chunks).toEqual(expectedChunks)
    expect(approvals).toEqual(expectedApprovals)
    expect(unexpected).toEqual([])
  })
})
