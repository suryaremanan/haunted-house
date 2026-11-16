import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseWhoami, WHOAMI_PATH } from '../../core/backend-status'
import { act, renderHook } from '@testing-library/react'
import { recordReplayHostEffects, setReplayTheme, useAppApi, useNavBadge, useNotify, useTheme, type ReplayHostRecorder } from './index'

// Presentation timing is covered by the Replay Engine tests and the route
// behaviour by seance-replay.test.ts. This checks the stand-in's API client,
// its host hooks and, last, the canonical recording seam.
describe('replay stand-in API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('answers the status check as the replay backend', async () => {
    const body = await useAppApi().get(WHOAMI_PATH)
    expect(body).toEqual({ backend: 'replay', gateway: { version: 'replay' } })
    expect(parseWhoami(body)).toEqual({ kind: 'ok', gateway: { version: 'replay' } })
  })

  it('rejects any other GET with status 404', async () => {
    await expect(useAppApi().get('/api/version')).rejects.toMatchObject({ status: 404 })
  })

  it('rejects every write', async () => {
    const api = useAppApi()
    const writes = [() => api.post('/x', {}), () => api.put('/x', {}), () => api.patch('/x', {}), () => api.del('/x')]
    for (const write of writes) {
      await expect(write()).rejects.toMatchObject({ status: 405 })
    }
  })

  it('makes no network request for API calls', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const api = useAppApi()
    await api.get(WHOAMI_PATH)
    await api.get('/api/version').catch(() => {})
    await api.post('/x').catch(() => {})
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// Spec 6 task 3.3: the stand-in offers the same three host hooks as Crew, with no transport.
describe('replay stand-in host hooks', () => {
  afterEach(() => {
    recordReplayHostEffects(null)
    setReplayTheme({ mode: 'dark', accent: '', colorTheme: 'default' })
    vi.unstubAllGlobals()
  })

  it('has a reactive theme with the documented fields', () => {
    const view = renderHook(() => useTheme())
    expect(view.result.current).toEqual({ mode: 'dark', accent: '', colorTheme: 'default' })
    act(() => setReplayTheme({ mode: 'light' }))
    expect(view.result.current.mode).toBe('light')
    view.unmount()
  })

  it('is inert in production: a toast and a badge do nothing and keep nothing', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(useNotify()('Tinker 2 is blocked.')).toBeUndefined()
    expect(useNavBadge()(3)).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('records synthetic toast and badge calls only while a test asks it to', () => {
    const seen: ReplayHostRecorder = { notifications: [], badges: [] }
    useNotify()('before')
    recordReplayHostEffects(seen)
    useNotify()('Tinker 2 is blocked.')
    useNavBadge()(2)
    useNavBadge()(0)
    recordReplayHostEffects(null)
    useNotify()('after')
    expect(seen).toEqual({ notifications: ['Tinker 2 is blocked.'], badges: [2, 0] })
  })

  it('opens no transport for any host hook', () => {
    const opened: string[] = []
    const blocked = (name: string) =>
      class {
        constructor() {
          opened.push(name)
        }
      }
    vi.stubGlobal('fetch', () => opened.push('fetch'))
    vi.stubGlobal('WebSocket', blocked('WebSocket'))
    vi.stubGlobal('XMLHttpRequest', blocked('XMLHttpRequest'))
    vi.stubGlobal('EventSource', blocked('EventSource'))
    const view = renderHook(() => useTheme())
    useNotify()('x')
    useNavBadge()(1)
    act(() => setReplayTheme({ mode: 'light' }))
    view.unmount()
    expect(opened).toEqual([])
  })
})

// replay-and-submission tasks 3.2 and 3.4: the stand-in's one recording, read
// only from ./fixture.jsonl, presented only by the Attic's Cursor, and every
// mutation, navigation and live transport inert.
describe('replay stand-in canonical recording', () => {
  const EVENTS = '/apps/haunted-house/api/mansions/demo-mansion/seance/events?after_sequence=0&limit=500'
  const WORKFLOW = '/apps/haunted-house/api/mansions/demo-mansion/workflow'
  const ROOM_GHOSTS = '/apps/haunted-house/api/mansions/demo-mansion/specs/demo-mansion/room-ghosts'

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  /** A fresh stand-in module, as one page load has it, on a page whose every way out is recorded. */
  async function freshStandIn(response: () => Response) {
    vi.resetModules()
    const opened: string[] = []
    const blocked = (name: string) =>
      class {
        constructor() {
          opened.push(name)
          throw new Error(`The replay must not open a ${name}.`)
        }
      }
    const fetchSpy = vi.fn(async (url: string) => response())
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('WebSocket', blocked('WebSocket'))
    vi.stubGlobal('XMLHttpRequest', blocked('XMLHttpRequest'))
    vi.stubGlobal('EventSource', blocked('EventSource'))
    const shim = await import('./index')
    return { shim, fetchSpy, opened }
  }

  const demoText = async () => (await import('../../../../../fixtures/replay/demo.jsonl?raw')).default

  it('loads only ./fixture.jsonl, once, for the seam and every read route together', async () => {
    const text = await demoText()
    const { shim, fetchSpy, opened } = await freshStandIn(() => new Response(text, { status: 200 }))
    expect(await shim.replayRecording.load()).toBe(text)
    const api = shim.useAppApi()
    await api.get(EVENTS)
    await api.get(WORKFLOW)
    await api.get(ROOM_GHOSTS)
    expect(await shim.replayRecording.load()).toBe(text)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith('./fixture.jsonl')
    expect(shim.FIXTURE_URL).toBe('./fixture.jsonl')
    expect(opened).toEqual([])
  })

  it('serves nothing until the Attic presents a prefix, then exactly that prefix on every route', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const text = await demoText()
    const { shim } = await freshStandIn(() => new Response(text, { status: 200 }))
    const api = shim.useAppApi()
    const count = async () => ((await api.get(EVENTS)) as { events: unknown[] }).events.length
    const version = async (path: string) => ((await api.get(path)) as { version: number }).version

    expect(await count()).toBe(0)
    // The recording does not advance by itself.
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(await count()).toBe(0)
    expect(await version(WORKFLOW)).toBe(0)

    shim.replayRecording.present('demo-mansion', 25)
    expect(await count()).toBe(25)
    expect(await version(WORKFLOW)).toBe(25)
    expect(await version(ROOM_GHOSTS)).toBe(25)
    expect((await api.get(EVENTS)) as object).not.toHaveProperty('next_event_in_ms')
    expect((await api.get(WORKFLOW)) as object).toMatchObject({ read_only: true })

    // A seek back and a restart shorten what is served.
    shim.replayRecording.present('demo-mansion', 3)
    expect(await count()).toBe(3)
    shim.replayRecording.present('demo-mansion', 0)
    expect(await count()).toBe(0)
  })

  it('keeps a failed load, answers every read with fixed copy, and falls back to nothing', async () => {
    const { shim, fetchSpy, opened } = await freshStandIn(() => new Response('<html>secret-host</html>', { status: 404 }))
    await expect(shim.replayRecording.load()).rejects.toMatchObject({ status: 502, body: 'Could not load the replay recording.' })
    const api = shim.useAppApi()
    for (const path of [EVENTS, WORKFLOW, ROOM_GHOSTS]) {
      await expect(api.get(path)).rejects.toMatchObject({ status: 502, body: 'Could not load the replay recording.' })
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(opened).toEqual([])
  })

  it('refuses every mutation of the recording as read-only, without a request', async () => {
    const text = await demoText()
    const { shim, fetchSpy, opened } = await freshStandIn(() => new Response(text, { status: 200 }))
    const api = shim.useAppApi()
    shim.replayRecording.present('demo-mansion', 64)
    const base = '/apps/haunted-house/api/mansions/demo-mansion'
    const writes: (() => Promise<unknown>)[] = [
      () => api.post(`${base}/seance/ingest`, { envelopes: [] }),
      () => api.post(`${base}/seance/reconcile`, { slots: [] }),
      () => api.post(`${base}/workflow/phases/requirements/start`, {}),
      () => api.post(`${base}/workflow/doors/requirements/decision`, { decision: 'approve' }),
      () => api.post('/api/chat', { message: 'hello' }),
      () => api.post('/api/spawn', {}),
      () => api.put(`${base}/workflow`, {}),
      () => api.patch(`${base}/workflow`, {}),
      () => api.del(`${base}/seance/events`),
    ]
    for (const write of writes) {
      await expect(write()).rejects.toMatchObject({ status: 405, body: expect.stringContaining('The replay is read-only') })
    }
    // Nothing a refused write tried changed what the recording serves.
    expect(((await api.get(`${base}/seance/events?after_sequence=0&limit=500`)) as { events: unknown[] }).events).toHaveLength(64)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(opened).toEqual([])
  })

  it('delivers no Crew event, opens no socket, and launches no chat', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const text = await demoText()
    const { shim, fetchSpy, opened } = await freshStandIn(() => new Response(text, { status: 200 }))
    const received = vi.fn()
    const unsubscribes = ['chat_chunk', 'tool_call', 'approval_resolved', 'shared_crew.decision'].map((type) =>
      shim.useAppEvents(type, received),
    )
    shim.replayRecording.present('demo-mansion', 64)
    await shim.useAppApi().get(EVENTS)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(received).not.toHaveBeenCalled()
    for (const unsubscribe of unsubscribes) expect(unsubscribe()).toBeUndefined()

    // Session navigation is inert: the call is noted and nothing leaves the page.
    shim.useChatLauncher().openChat({ slotKey: 'slot-1' })
    expect(shim.replayChatLauncherCalls).toEqual([{ slotKey: 'slot-1' }])
    expect(shim.useNotify()('x')).toBeUndefined()
    expect(shim.useNavBadge()(2)).toBeUndefined()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(opened).toEqual([])
  })
})
