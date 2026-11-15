// useSeanceLive against a mocked Crew SDK (task 7.3): subscriptions, raw
// forwarding from real hook callbacks, and cleanup on unmount.
// **Validates: Requirements 2.1, 10.1 to 10.3, 11.4, 11.6, 11.8**
import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import { GhostStatusView } from '../components/GhostStatusView'
import { appEventToJson, type AppEvent } from '../core/seance-event'
import { parseEventLog } from '../core/seance-log'
import { SUBSCRIBED_CREW_EVENTS, useSeanceLive } from './seance-live'

const LOG = parseEventLog(demo).events
const BASE = '/apps/haunted-house/api/mansions/demo-mansion/seance'

// A stand-in host: it keeps the callback each subscription registered, the way
// the dashboard's hook does inside its own effect, and drops it on cleanup.
const host = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  handlers: new Map<string, Set<(data: unknown) => void>>(),
  subscribed: [] as string[],
}))

vi.mock('@kirocrew/app-sdk', () => ({
  // A new client object on every render, as the host may hand out.
  useAppApi: () => ({ get: host.get, post: host.post, put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: (event: string, cb: (data: unknown) => void) => {
    useEffect(() => {
      host.subscribed.push(event)
      const set = host.handlers.get(event) ?? new Set()
      host.handlers.set(event, set)
      set.add(cb)
      return () => {
        set.delete(cb)
      }
    }, [event, cb])
    // Crew 0.12.2 returns nothing useful here; the adapter must not depend on it.
    return undefined as unknown as () => void
  },
  useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
}))

const page = (events: readonly AppEvent[], highest: number) => ({
  events: events.map(appEventToJson),
  highest_sequence: highest,
  diagnostics: [],
})

function emit(type: string, data: unknown): void {
  for (const handler of [...(host.handlers.get(type) ?? [])]) handler(data)
}

function Harness({ mansionId }: { mansionId: string | null }) {
  const state = useSeanceLive(mansionId)
  return (
    <>
      <output data-testid="sequence">{state.highestSequence}</output>
      <GhostStatusView state={state} />
    </>
  )
}

const flush = () => act(async () => {})

beforeEach(() => {
  host.get.mockReset()
  host.post.mockReset()
  host.handlers.clear()
  host.subscribed.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSeanceLive', () => {
  it('subscribes once to each supported Crew event and to nothing else', async () => {
    host.get.mockResolvedValue(page([], 0))
    const view = render(<Harness mansionId="demo-mansion" />)
    await flush()

    expect([...host.subscribed].sort()).toEqual([...SUBSCRIBED_CREW_EVENTS].sort())
    // Re-rendering keeps the same callbacks, so the host hook does not resubscribe.
    view.rerender(<Harness mansionId="demo-mansion" />)
    await flush()
    expect(host.subscribed).toHaveLength(SUBSCRIBED_CREW_EVENTS.length)
    // Dashboard noise the app has no use for is never subscribed.
    for (const noise of ['session_update', 'notification', 'subagent_chunk', 'approval', 'presence']) {
      expect(host.subscribed).not.toContain(noise)
    }
  })

  it('reads the canonical log on mount, then forwards a raw callback and renders only its acknowledgment', async () => {
    let acknowledge: (body: unknown) => void = () => {}
    host.get.mockResolvedValueOnce(page(LOG.slice(0, 1), 1))
    host.post.mockReturnValueOnce(
      new Promise((resolve) => {
        acknowledge = resolve
      }),
    )
    render(<Harness mansionId="demo-mansion" />)
    expect(screen.getByText('Loading the séance log…')).toBeInTheDocument()
    await flush()

    expect(host.get).toHaveBeenCalledWith(`${BASE}/events?after_sequence=0&limit=500`)
    expect(screen.getByTestId('sequence')).toHaveTextContent('1')
    expect(screen.getByText('Idle')).toBeInTheDocument()

    // Crew says the Archivist failed. Until the backend answers, nothing changes.
    const data = { slot: 'hh-archivist-requirements-1', status: 'failed', ghost: 'archivist' }
    act(() => emit('chat_status', data))
    await flush()
    expect(host.post).toHaveBeenCalledTimes(1)
    const [path, body] = host.post.mock.calls[0] as [string, { envelopes: { type: string; data: unknown }[] }]
    expect(path).toBe(`${BASE}/ingest`)
    expect(body).toEqual({ envelopes: [{ type: 'chat_status', data }] })
    expect(body.envelopes[0].data).toBe(data)
    expect(screen.queryByText('Failed')).not.toBeInTheDocument()
    expect(screen.queryByText('Working')).not.toBeInTheDocument()
    expect(screen.getByTestId('sequence')).toHaveTextContent('1')

    // The backend's canonical record says: working.
    await act(async () => acknowledge(page([LOG[1]], 2)))
    expect(screen.getByTestId('sequence')).toHaveTextContent('2')
    expect(screen.getByText('Working')).toBeInTheDocument()
    expect(screen.queryByText('Failed')).not.toBeInTheDocument()
  })

  it('keeps the rows and shows a diagnostic when ingest fails', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    host.get.mockResolvedValue(page(LOG.slice(0, 3), 3))
    host.post.mockRejectedValue(Object.assign(new Error('API 503'), { status: 503, body: '' }))
    render(<Harness mansionId="demo-mansion" />)
    await flush()
    expect(screen.getByText('Working')).toBeInTheDocument()

    act(() => emit('tool_call', { tool_call_id: 't1' }))
    await flush()
    expect(screen.getByText('The backend did not confirm the latest ghost activity. Trying again.')).toBeInTheDocument()
    expect(screen.getByText('Working')).toBeInTheDocument()
    expect(screen.getByTestId('sequence')).toHaveTextContent('3')
  })

  it('marks the stream as catching up on return to the page, without touching ghost states', async () => {
    let finish: (body: unknown) => void = () => {}
    host.get.mockResolvedValueOnce(page(LOG.slice(0, 3), 3)).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    render(<Harness mansionId="demo-mansion" />)
    await flush()

    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    try {
      visibility.mockReturnValue('hidden')
      act(() => void document.dispatchEvent(new Event('visibilitychange')))
      visibility.mockReturnValue('visible')
      act(() => void document.dispatchEvent(new Event('visibilitychange')))
      await flush()

      expect(screen.getByText('Catching up with the séance log…')).toBeInTheDocument()
      expect(screen.getByText('Working')).toBeInTheDocument()
      expect(host.get).toHaveBeenLastCalledWith(`${BASE}/events?after_sequence=3&limit=500`)

      await act(async () => finish(page(LOG.slice(3, 6), 6)))
      expect(screen.queryByText('Catching up with the séance log…')).not.toBeInTheDocument()
      expect(screen.getByTestId('sequence')).toHaveTextContent('6')
    } finally {
      visibility.mockRestore()
    }
  })

  it('unsubscribes, clears its timers and ignores late answers after unmount', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let late: (body: unknown) => void = () => {}
    host.get.mockResolvedValueOnce(page(LOG.slice(0, 3), 3))
    host.post.mockReturnValueOnce(
      new Promise((resolve) => {
        late = resolve
      }),
    )
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const view = render(<Harness mansionId="demo-mansion" />)
    await flush()
    // A ghost is working, so the bounded poll timer is pending.
    expect(vi.getTimerCount()).toBe(1)
    act(() => emit('chat_chunk', { seq: 1 }))
    await flush()

    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect([...host.handlers.values()].every((set) => set.size === 0)).toBe(true)
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))

    // A late acknowledgment, a late Crew callback and time passing do nothing.
    const calls = host.get.mock.calls.length + host.post.mock.calls.length
    late(page(LOG.slice(3, 9), 9))
    await vi.advanceTimersByTimeAsync(60_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(host.get.mock.calls.length + host.post.mock.calls.length).toBe(calls)
    expect(vi.getTimerCount()).toBe(0)
    removeListener.mockRestore()
  })

  it('starts over for another Mansion and reads nothing while none is open', async () => {
    host.get.mockResolvedValue(page([], 0))
    const view = render(<Harness mansionId={null} />)
    await flush()
    expect(host.get).not.toHaveBeenCalled()
    // Crew events with no Mansion open go nowhere.
    act(() => emit('chat_chunk', { seq: 1 }))
    await flush()
    expect(host.post).not.toHaveBeenCalled()

    host.get.mockResolvedValueOnce(page(LOG.slice(0, 3), 3))
    view.rerender(<Harness mansionId="demo-mansion" />)
    await flush()
    expect(screen.getByTestId('sequence')).toHaveTextContent('3')

    view.rerender(<Harness mansionId="other-mansion" />)
    await flush()
    expect(host.get).toHaveBeenLastCalledWith(
      '/apps/haunted-house/api/mansions/other-mansion/seance/events?after_sequence=0&limit=500',
    )
    expect(screen.getByTestId('sequence')).toHaveTextContent('0')
    expect(screen.queryByText('Working')).not.toBeInTheDocument()
  })
})
