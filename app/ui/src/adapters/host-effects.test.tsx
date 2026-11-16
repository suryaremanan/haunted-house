// Host Effects adapter (Spec 6 task 3.3).
// **Validates: Requirements 4.4, 4.5, 5.4, 8.6, 8.7, 8.9, 9.5**
import { renderHook } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GhostSnapshot, GhostState, GhostTransition } from '../core/ghost-state'
import type { RoomId } from '../core/house-registry'
import type { HostSummary } from '../core/interruption-policy'
import { snapshot, snapshotMap } from '../test/house-projection-kit'
import { MANSION } from '../test/workflow-arbitraries'
import { useHostEffects, type HostEffectsInput } from './host-effects'

const host = vi.hoisted(() => ({
  theme: { mode: 'dark', accent: '#c58b45', colorTheme: 'midnight' } as unknown,
  notify: vi.fn(),
  badge: vi.fn(),
}))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({}),
  useAppEvents: () => () => {},
  useTheme: () => host.theme,
  useNotify: () => host.notify,
  useNavBadge: () => host.badge,
}))

let serial = 0
function transition(ghostId: string, from: GhostState, to: GhostState): GhostTransition {
  serial += 1
  return {
    transition_id: `t-${serial}` as GhostTransition['transition_id'],
    causing_event_id: `e-${serial}` as GhostTransition['causing_event_id'],
    causing_sequence: serial,
    mansion_id: MANSION,
    ghost_id: ghostId,
    from_state: from,
    to_state: to,
  }
}

const roomOf = (ghostId: string): RoomId | null => (ghostId.startsWith('tinker') ? 'workshop' : ghostId === 'archivist' ? 'study' : null)
const nameOf = (ghostId: string) => (ghostId === 'archivist' ? 'Archivist' : ghostId === 'tinker-1' ? 'Tinker 1' : ghostId)

const summaries: HostSummary[] = []
const onSummary = (summary: HostSummary) => summaries.push(summary)

function input(transitions: readonly GhostTransition[], snapshots: readonly GhostSnapshot[], change: Partial<HostEffectsInput> = {}): HostEffectsInput {
  return {
    mansionId: MANSION,
    active: true,
    transitions,
    snapshots: snapshotMap(snapshots),
    roomOf,
    nameOf,
    needsYouCount: 0,
    onSummary,
    now: () => Date.now(),
    ...change,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  serial = 0
  summaries.length = 0
  host.theme = { mode: 'dark', accent: '#c58b45', colorTheme: 'midnight' }
  host.notify.mockReset()
  host.badge.mockReset()
})

afterEach(() => {
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})

describe('interruption summaries', () => {
  it('sends one toast and the identical summary when the burst closes, 10 seconds after its last event', () => {
    const first = transition('archivist', 'working', 'waiting')
    const view = renderHook((props: HostEffectsInput) => useHostEffects(props), {
      initialProps: input([first], [snapshot('archivist', 'waiting')]),
    })
    expect(host.notify).not.toHaveBeenCalled()
    vi.advanceTimersByTime(4_000)
    const second = transition('tinker-1', 'working', 'blocked')
    view.rerender(input([first, second], [snapshot('archivist', 'waiting'), snapshot('tinker-1', 'blocked')]))
    // The window trails the last accepted event: 9,999 ms after it, still nothing.
    vi.advanceTimersByTime(9_999)
    expect(host.notify).not.toHaveBeenCalled()
    expect(summaries).toEqual([])
    vi.advanceTimersByTime(1)
    expect(host.notify.mock.calls).toEqual([['Archivist is waiting for your approval. Tinker 1 is blocked. 2 events.']])
    expect(summaries).toEqual([
      { text: 'Archivist is waiting for your approval. Tinker 1 is blocked. 2 events.', eventIds: [first.transition_id, second.transition_id] },
    ])
    view.unmount()
  })

  it('offers each transition once, however often the page renders', () => {
    const first = transition('archivist', 'working', 'failed')
    const props = input([first], [snapshot('archivist', 'failed')])
    const view = renderHook((next: HostEffectsInput) => useHostEffects(next), { initialProps: props })
    for (let i = 0; i < 5; i += 1) view.rerender({ ...props, transitions: [...props.transitions], snapshots: new Map(props.snapshots) })
    vi.advanceTimersByTime(10_000)
    expect(host.notify.mock.calls).toEqual([['Archivist failed.']])
    vi.advanceTimersByTime(60_000)
    expect(host.notify).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('starts no timer and no effect for idle, working, done, or a ghost with no room', () => {
    const quiet = [
      transition('archivist', 'idle', 'working'),
      transition('tinker-1', 'working', 'done'),
      transition('archivist', 'working', 'idle'),
      transition('house-operator', 'working', 'failed'),
      transition('stranger', 'working', 'failed'),
    ]
    const view = renderHook(() =>
      useHostEffects(input(quiet, [snapshot('archivist', 'idle'), snapshot('tinker-1', 'done'), snapshot('house-operator', 'failed'), snapshot('stranger', 'failed')])),
    )
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(30_000)
    expect(host.notify).not.toHaveBeenCalled()
    expect(summaries).toEqual([])
    view.unmount()
  })

  it('does not read out history a ghost has already moved past', () => {
    // A page opened on a long log: the Archivist once waited and is done now.
    const history = [transition('archivist', 'working', 'waiting'), transition('archivist', 'waiting', 'working'), transition('archivist', 'working', 'done')]
    const view = renderHook(() => useHostEffects(input(history, [snapshot('archivist', 'done')])))
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(30_000)
    expect(summaries).toEqual([])
    view.unmount()
  })

  it('keeps the live summary when the host toast throws, and does not retry', () => {
    host.notify.mockImplementation(() => {
      throw new Error('toast host failed')
    })
    const view = renderHook(() => useHostEffects(input([transition('tinker-1', 'working', 'failed')], [snapshot('tinker-1', 'failed')])))
    vi.advanceTimersByTime(10_000)
    expect(summaries.map((summary) => summary.text)).toEqual(['Tinker 1 failed.'])
    vi.advanceTimersByTime(60_000)
    expect(host.notify).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('cancels the timer on unmount and discards the open burst', () => {
    const view = renderHook(() => useHostEffects(input([transition('tinker-1', 'working', 'blocked')], [snapshot('tinker-1', 'blocked')])))
    expect(vi.getTimerCount()).toBe(1)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(host.notify).not.toHaveBeenCalled()
    expect(summaries).toEqual([])
  })

  it('is silent while a recording is played back', () => {
    const view = renderHook(() =>
      useHostEffects(input([transition('tinker-1', 'working', 'failed')], [snapshot('tinker-1', 'failed')], { active: false, needsYouCount: 3 })),
    )
    vi.advanceTimersByTime(30_000)
    expect(host.notify).not.toHaveBeenCalled()
    expect(summaries).toEqual([])
    expect(host.badge.mock.calls.every(([count]) => count === 0)).toBe(true)
    view.unmount()
  })
})

describe('sidebar badge', () => {
  it('follows the Needs You count at once and is cleared on unmount', () => {
    const view = renderHook((props: HostEffectsInput) => useHostEffects(props), { initialProps: input([], [], { needsYouCount: 2 }) })
    expect(host.badge.mock.calls).toEqual([[2]])
    view.rerender(input([], [], { needsYouCount: 2 }))
    expect(host.badge).toHaveBeenCalledTimes(1)
    view.rerender(input([], [], { needsYouCount: 1 }))
    view.rerender(input([], [], { needsYouCount: 0 }))
    expect(host.badge.mock.calls).toEqual([[2], [1], [0]])
    host.badge.mockClear()
    view.unmount()
    expect(host.badge.mock.calls).toEqual([[0]])
  })

  it('survives a badge hook that throws, without calling it again for the same count', () => {
    host.badge.mockImplementation(() => {
      throw new Error('no sidebar')
    })
    const view = renderHook((props: HostEffectsInput) => useHostEffects(props), { initialProps: input([], [], { needsYouCount: 4 }) })
    view.rerender(input([], [], { needsYouCount: 4 }))
    view.rerender(input([], [], { needsYouCount: 4 }))
    expect(host.badge).toHaveBeenCalledTimes(1)
    view.unmount()
  })
})

describe('host theme', () => {
  it('exposes the normalized theme and follows a change without a remount', () => {
    const cleanup = vi.fn()
    const view = renderHook(() => {
      useEffect(() => cleanup, [])
      return useHostEffects(input([], []))
    })
    expect(view.result.current.theme).toEqual({ mode: 'dark', accent: '#c58b45', colorTheme: 'midnight' })
    host.theme = { mode: 'light' }
    view.rerender()
    expect(view.result.current.theme).toEqual({ mode: 'light', accent: null, colorTheme: null })
    // The hook's owner was never unmounted to pick the change up.
    expect(cleanup).not.toHaveBeenCalled()
    view.unmount()
  })
})
