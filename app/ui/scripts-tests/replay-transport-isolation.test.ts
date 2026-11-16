// Replay transport isolation (replay-and-submission task 6.4).
// Renders the replay entry, replay/main.tsx, with the SDK mapped to the
// stand-in exactly as vite.replay.config.ts maps it. Every way out of the page
// is replaced by a trap that records the attempt and throws: sockets, XHR,
// server-sent events, beacons, workers, new windows, history navigation, the
// Crew chat launcher and every fetch except ./fixture.jsonl.
// **Validates: Requirements 4.1, 4.3, 4.4, 4.5, 4.6, 4.8, 8.9, 11.4**
import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../fixtures/replay/demo.jsonl?raw'

const FIXTURE_URL = './fixture.jsonl'

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

const isFixture = (url: string): boolean => {
  if (url === FIXTURE_URL) return true
  try {
    return new URL(url, document.baseURI).href === new URL(FIXTURE_URL, document.baseURI).href
  } catch {
    return false
  }
}

let attempts: string[] = []
let fixtureResponse: () => Response

const trapClass = (name: string) =>
  class {
    constructor() {
      attempts.push(name)
      throw new Error(`The replay must not open a ${name}.`)
    }
  }

const trapFunction = (name: string) => () => {
  attempts.push(name)
  throw new Error(`The replay must not call ${name}.`)
}

const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = urlOf(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  if (!isFixture(url) || method !== 'GET') {
    attempts.push(`fetch ${method} ${url}`)
    throw new TypeError('The replay must not make this request.')
  }
  return fixtureResponse()
})

let startHref = ''
let startHistory = 0

beforeEach(() => {
  attempts = []
  fixtureResponse = () => new Response(demo, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
  fetchSpy.mockClear()
  vi.doMock('@kirocrew/app-sdk', () => import('../src/adapters/sdk-shim'))
  vi.stubGlobal('fetch', fetchSpy)
  for (const name of ['WebSocket', 'XMLHttpRequest', 'EventSource', 'Worker', 'SharedWorker', 'BroadcastChannel']) {
    vi.stubGlobal(name, trapClass(name))
  }
  vi.stubGlobal('open', trapFunction('window.open'))
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: trapFunction('navigator.sendBeacon') })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    get: () => {
      attempts.push('navigator.serviceWorker')
      throw new Error('The replay must not use a service worker.')
    },
  })
  vi.spyOn(history, 'pushState').mockImplementation(trapFunction('history.pushState'))
  vi.spyOn(history, 'replaceState').mockImplementation(trapFunction('history.replaceState'))
  startHref = location.href
  startHistory = history.length

  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
})

afterEach(() => {
  document.getElementById('root')?.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'sendBeacon')
  Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
})

async function renderReplay(): Promise<HTMLElement> {
  await act(async () => {
    await import('../replay/main')
  })
  const root = document.getElementById('root') as HTMLElement
  await waitFor(() => expect(root.textContent).toContain('Haunted House'))
  // Let the fixture load and every effect that follows it settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
  return root
}

describe('static replay transport isolation', () => {
  it('renders with no Crew global, account, token or environment value', async () => {
    const crewGlobals = Object.keys(globalThis).filter((key) => /kiro|crew/i.test(key))
    expect(crewGlobals).toEqual([])
    const viteEnv = Object.keys(import.meta.env).filter((key) => key.startsWith('VITE_'))
    expect(viteEnv).toEqual([])
    expect(document.cookie).toBe('')

    const root = await renderReplay()
    expect(root.querySelector('h1, h2')?.textContent).toBeTruthy()
    expect(attempts).toEqual([])
  })

  it('requests nothing but ./fixture.jsonl, with GET, at most once', async () => {
    await renderReplay()
    const requested = fetchSpy.mock.calls.map(([input]) => urlOf(input))
    expect(requested.every(isFixture)).toBe(true)
    expect(requested.length).toBeLessThanOrEqual(1)
    for (const [, init] of fetchSpy.mock.calls) {
      expect((init?.method ?? 'GET').toUpperCase()).toBe('GET')
      expect(init?.body).toBeUndefined()
      const headers = new Headers(init?.headers)
      expect(headers.has('authorization')).toBe(false)
      expect(headers.has('x-kirocrew-proxy')).toBe(false)
    }
    expect(attempts).toEqual([])
  })

  it('opens no socket, stream, worker, beacon or window and never navigates', async () => {
    await renderReplay()
    expect(attempts).toEqual([])
    expect(location.href).toBe(startHref)
    expect(history.length).toBe(startHistory)
  })

  it('launches no Crew chat and sends no host notification or badge', async () => {
    await renderReplay()
    const shim = await import('../src/adapters/sdk-shim')
    expect(shim.replayChatLauncherCalls).toEqual([])
    // The stand-in launcher is inert: a call is recorded and nothing leaves the page.
    shim.useChatLauncher().openChat({ slotKey: 'ghost-slot' })
    expect(shim.replayChatLauncherCalls).toHaveLength(1)
    shim.replayChatLauncherCalls.length = 0
    expect(attempts).toEqual([])
    expect(location.href).toBe(startHref)
  })

  it('refuses every mutation through the stand-in API without a request', async () => {
    await renderReplay()
    const shim = await import('../src/adapters/sdk-shim')
    const api = shim.useAppApi() as unknown as Record<string, (path: string, body?: unknown) => Promise<unknown>>
    const before = fetchSpy.mock.calls.length
    for (const method of ['post', 'put', 'patch', 'del', 'delete']) {
      if (typeof api[method] !== 'function') continue
      await expect(api[method]('/apps/haunted-house/api/mansions/demo-mansion/rooms/study/start', { confirm: true })).rejects.toBeDefined()
    }
    expect(fetchSpy.mock.calls.length).toBe(before)
    expect(attempts).toEqual([])
  })

  it('makes no fallback request when the fixture cannot be loaded', async () => {
    fixtureResponse = () => new Response('not found', { status: 404 })
    await renderReplay()
    const requested = fetchSpy.mock.calls.map(([input]) => urlOf(input))
    expect(requested.every(isFixture)).toBe(true)
    expect(requested.length).toBeLessThanOrEqual(1)
    expect(attempts).toEqual([])
  })
})
