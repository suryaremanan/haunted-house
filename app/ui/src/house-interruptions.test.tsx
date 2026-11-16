// Interruptions, the badge and ambient state through the integrated house
// (Spec 6 task 7.5): canonical records acknowledged by the backend drive the
// real adapters, the pure policy, the host toast and the one live region.
// **Validates: Requirements 4.4, 4.5, 4.6, 4.7, 8.1 to 8.10, 10.4**
import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomGhosts } from './core/room-projection'
import type { AppEvent } from './core/seance-event'
import type { WorkflowProjection } from './core/workflow-projection'
import { liveRegions } from './rooms/foyer/foyer-test-kit'
import { House } from './rooms/house/House'
import { ghostEvent } from './test/house-kit'
import { MANSION_DESCRIPTOR } from './test/house-projection-kit'
import { FakeRoomBackend } from './test/room-house-kit'
import { REQUIREMENTS_WAITING, requirementsWritten, roomGhosts, run } from './test/room-kit'
import { projection } from './test/workflow-arbitraries'

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

let backend: FakeRoomBackend
const QUIET = projection({ version: 10 })

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

async function mount(workflow: WorkflowProjection = QUIET, rooms: RoomGhosts = roomGhosts({ version: workflow.version }), log: AppEvent[] = []) {
  backend = new FakeRoomBackend(workflow, rooms)
  backend.log = [...log]
  host.backend = backend
  const view = render(<House mansion={MANSION_DESCRIPTOR} onReturn={() => {}} />)
  // Let the first reads settle. Well under the burst window.
  await advance(50)
  return view
}

/** The backend acknowledges these canonical records for the next Crew frame; one frame delivers them. */
async function acknowledge(...events: AppEvent[]) {
  backend.nextIngest = events
  await act(async () => {
    for (const handler of [...(host.handlers.get('chat_status') ?? [])]) handler({})
    await vi.advanceTimersByTimeAsync(20)
  })
}

const announcer = () => document.querySelector<HTMLElement>('[data-announcer]')!
const toasts = () => host.notify.mock.calls.map(([text]) => text as string)
const started = (sequence: number, ghost: string) => ghostEvent(sequence, ghost, 'run_started', { reason: 'Working', room: 'workshop' })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  host.handlers.clear()
  host.notify.mockReset()
  host.badge.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('one summary per burst, on both channels', () => {
  it('merges ghosts that go blocked and failed within 10 seconds into one toast and the identical announcement', async () => {
    await mount()
    await acknowledge(started(1, 'tinker-1'), ghostEvent(2, 'tinker-1', 'run_blocked', { reason: 'locked_door' }))
    await advance(4_000)
    await acknowledge(started(3, 'tinker-3'), ghostEvent(4, 'tinker-3', 'run_failed', { reason: 'crew_error' }))
    // In place at once: the map already says so.
    expect(document.querySelector('[data-ghost-control="tinker-1"]')).toHaveTextContent('Tinker 1: blocked')
    expect(document.querySelector('[data-ghost-control="tinker-3"]')).toHaveTextContent('Tinker 3: failed')
    // Nothing is said until the burst closes, 10 seconds after its last event.
    await advance(9_900)
    expect(toasts()).toEqual([])
    expect(announcer()).toHaveTextContent('')
    await advance(200)
    expect(toasts()).toEqual(['Tinker 1 is blocked. Tinker 3 failed. 2 events.'])
    expect(announcer().textContent).toBe(toasts()[0])
    expect(liveRegions(document.body)).toHaveLength(1)
    await advance(60_000)
    expect(toasts()).toHaveLength(1)
  })

  it('announces a ghost waiting for approval once, however often its records are delivered again', async () => {
    const waiting = [started(1, 'tinker-2'), ghostEvent(2, 'tinker-2', 'approval_requested', { mid: 'mid-1' }, 'crew')]
    await mount(QUIET, roomGhosts({ version: 10 }), waiting)
    await advance(10_000)
    expect(toasts()).toEqual(['Tinker 2 is waiting for your approval.'])
    // A reconnect reads the same canonical records again: same ids, nothing new.
    document.dispatchEvent(new Event('visibilitychange'))
    await acknowledge()
    await advance(30_000)
    expect(toasts()).toHaveLength(1)
    expect(announcer()).toHaveTextContent(/^Tinker 2 is waiting for your approval\.$/)
  })

  it('starts a new burst for an event that arrives after the previous one closed', async () => {
    await mount()
    await acknowledge(started(1, 'tinker-1'), ghostEvent(2, 'tinker-1', 'run_blocked', { reason: 'locked_door' }))
    await advance(10_100)
    await acknowledge(started(3, 'tinker-3'), ghostEvent(4, 'tinker-3', 'run_failed', { reason: 'crew_error' }))
    await advance(10_100)
    expect(toasts()).toEqual(['Tinker 1 is blocked.', 'Tinker 3 failed.'])
    expect(announcer()).toHaveTextContent(/^Tinker 3 failed\.$/)
  })
})

describe('ambient state stays ambient', () => {
  it('raises nothing for idle, working, done, progress or tool activity, and keeps the last announcement', async () => {
    await mount()
    await acknowledge(started(1, 'tinker-1'), ghostEvent(2, 'tinker-1', 'run_failed', { reason: 'crew_error' }))
    await advance(10_100)
    expect(announcer()).toHaveTextContent('Tinker 1 failed.')
    const before = announcer().firstElementChild
    host.notify.mockClear()

    await acknowledge(started(3, 'tinker-2'))
    await acknowledge(ghostEvent(4, 'tinker-2', 'ghost_progressed', { status: 'working' }, 'crew'))
    await acknowledge(ghostEvent(5, 'tinker-2', 'run_completed', { reason: 'task is done' }))
    await acknowledge(started(6, 'archivist'), ghostEvent(7, 'archivist', 'run_completed', { reason: 'ready' }))
    await advance(60_000)

    expect(document.querySelector('[data-ghost-control="tinker-2"]')).toHaveTextContent('Tinker 2: done')
    expect(toasts()).toEqual([])
    expect(announcer().firstElementChild).toBe(before)
    expect(announcer()).toHaveTextContent(/^Tinker 1 failed\.$/)
  })
})

describe('sidebar badge', () => {
  it('counts only what the Operator can act on, at once, and drops a resolved item on the next projection', async () => {
    // A Door waits (1). A ghost is blocked with no action: not counted.
    await mount(REQUIREMENTS_WAITING, requirementsWritten())
    await acknowledge(started(1, 'tinker-1'), ghostEvent(2, 'tinker-1', 'run_blocked', { reason: 'locked_door' }))
    expect(host.badge).toHaveBeenLastCalledWith(1)
    // The badge did not wait for the interruption burst.
    expect(toasts()).toEqual([])
    expect(document.querySelector('.hh-ui-needs')).toHaveTextContent('1 thing needs you')

    // The Door is decided elsewhere: the item leaves the count with the next projection.
    backend.workflow = projection({ version: 11 })
    backend.rooms = roomGhosts({ version: 11 })
    await acknowledge(ghostEvent(11, 'tinker-1', 'ghost_progressed', { status: 'working' }, 'crew'))
    await advance(2_000)
    expect(host.badge).toHaveBeenLastCalledWith(0)
    expect(document.querySelector('.hh-ui-needs')).toHaveTextContent('Nothing needs you')
    // Working, done and progress never changed the count on their own.
    expect(new Set(host.badge.mock.calls.map(([count]) => count))).toEqual(new Set([0, 1]))
  })

  it('counts a failed run the backend offers to retry, beside the Door, and not a failed run nobody can retry', async () => {
    const failed = [ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing', room: 'study' }), ghostEvent(2, 'archivist', 'run_failed', { reason: 'crew_error' })]
    const retryable = await mount(REQUIREMENTS_WAITING, requirementsWritten({ runs: [run({ runId: 'archivist-run', canRetry: true })] }), failed)
    expect(host.badge).toHaveBeenLastCalledWith(2)
    retryable.unmount()
    host.badge.mockClear()
    await mount(REQUIREMENTS_WAITING, requirementsWritten({ runs: [run({ runId: 'archivist-run', canRetry: false })] }), failed)
    expect(host.badge).toHaveBeenLastCalledWith(1)
    expect(document.querySelector('[data-ghost-control="archivist"]')).toHaveTextContent('Archivist: failed')
  })

  it('is cleared, and the open burst dropped, when the house unmounts', async () => {
    const view = await mount(REQUIREMENTS_WAITING, requirementsWritten())
    await acknowledge(started(1, 'tinker-1'), ghostEvent(2, 'tinker-1', 'run_failed', { reason: 'crew_error' }))
    expect(host.badge).toHaveBeenLastCalledWith(1)
    view.unmount()
    expect(host.badge).toHaveBeenLastCalledWith(0)
    await advance(60_000)
    expect(toasts()).toEqual([])
  })
})
