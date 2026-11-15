// Readable examples of the Interruption Policy (Spec 6, Requirements 8.1 to 8.6).
import { describe, expect, it } from 'vitest'
import type { GhostState, GhostTransition } from './ghost-state'
import { HOUSE_OPERATOR_GHOST_ID } from './ghost-status'
import type { RoomId } from './house-registry'
import {
  EMPTY_INTERRUPTION_STATE,
  INTERRUPTION_BURST_MS,
  MAX_SUMMARY_CODE_POINTS,
  canonicalTransitionOf,
  flushInterruption,
  nextInterruptionFlushAtMs,
  reduceInterruption,
  type CanonicalGhostTransition,
  type InterruptionEffect,
  type InterruptionPolicyState,
} from './interruption-policy'

function change(
  eventId: string,
  ghostId: string,
  toState: GhostState,
  observedAtMs: number,
  extra: { roomId?: RoomId; ghostName?: string; fromState?: GhostState } = {},
): CanonicalGhostTransition {
  return {
    kind: 'transition',
    eventId,
    ghostId,
    ghostName: extra.ghostName ?? ghostId.charAt(0).toUpperCase() + ghostId.slice(1),
    roomId: extra.roomId ?? 'study',
    fromState: extra.fromState ?? 'working',
    toState,
    observedAtMs,
  }
}

/** Runs events in order and returns the final state with every effect emitted. */
function run(events: readonly CanonicalGhostTransition[], from: InterruptionPolicyState = EMPTY_INTERRUPTION_STATE) {
  let state = from
  const effects: InterruptionEffect[] = []
  for (const event of events) {
    const step = reduceInterruption(state, event)
    state = step.state
    effects.push(...step.effects)
  }
  return { state, effects }
}

describe('interruption policy', () => {
  it('holds one eligible event and summarizes it when its 10 seconds have passed', () => {
    const { state, effects } = run([change('t1', 'archivist', 'waiting', 1_000)])
    expect(effects).toEqual([])
    expect(nextInterruptionFlushAtMs(state)).toBe(1_000 + INTERRUPTION_BURST_MS)

    const flushed = flushInterruption(state, 11_000)
    expect(flushed.effects).toEqual([{ kind: 'summary', text: 'Archivist is waiting for your approval.', eventIds: ['t1'] }])
    expect(flushed.state.burst).toBeNull()
    // Emitted once: a second flush has nothing left.
    expect(flushInterruption(flushed.state, 50_000).effects).toEqual([])
  })

  it('rejects ambient changes and routine activity without touching the state', () => {
    const ambient: CanonicalGhostTransition[] = [
      change('a', 'archivist', 'working', 0, { fromState: 'idle' }),
      change('b', 'archivist', 'done', 1),
      change('c', 'archivist', 'idle', 2, { fromState: 'done' }),
      change('d', 'archivist', 'waiting', 3, { fromState: 'waiting' }),
      { kind: 'routine', eventId: 'e', observedAtMs: 4 },
    ]
    const { state, effects } = run(ambient)
    expect(effects).toEqual([])
    expect(state).toBe(EMPTY_INTERRUPTION_STATE)
    // A rejected id was not remembered: the real transition with that id still counts.
    expect(run([change('e', 'archivist', 'failed', 5)], state).state.burst?.events).toHaveLength(1)
  })

  it('ignores an event id it has already accepted, in the same burst and after it', () => {
    const first = run([change('t1', 'archivist', 'waiting', 0), change('t1', 'archivist', 'waiting', 500)])
    expect(first.state.burst?.events).toHaveLength(1)
    expect(first.state.burst?.lastAcceptedAtMs).toBe(0)

    const flushed = flushInterruption(first.state, 10_000)
    const again = reduceInterruption(flushed.state, change('t1', 'archivist', 'waiting', 60_000))
    expect(again.effects).toEqual([])
    expect(again.state).toBe(flushed.state)
  })

  it('reports the latest state of a ghost that escalates within one burst', () => {
    const { state } = run([
      change('t1', 'tinker-1', 'waiting', 0, { roomId: 'workshop', ghostName: 'Tinker 1' }),
      change('t2', 'tinker-1', 'failed', 4_000, { roomId: 'workshop', ghostName: 'Tinker 1', fromState: 'waiting' }),
    ])
    expect(flushInterruption(state, 14_000).effects).toEqual([
      { kind: 'summary', text: 'Tinker 1 failed. 2 events.', eventIds: ['t1', 't2'] },
    ])
  })

  it('merges several ghosts into one summary in Room order', () => {
    const { state, effects } = run([
      change('t1', 'tinker-2', 'failed', 0, { roomId: 'workshop', ghostName: 'Tinker 2' }),
      change('t2', 'draughtsman', 'blocked', 3_000, { roomId: 'drafting-room' }),
      change('t3', 'archivist', 'waiting', 9_000, { roomId: 'study' }),
    ])
    expect(effects).toEqual([])
    // Too early: 9,999 ms after the last accepted event.
    expect(flushInterruption(state, 18_999).effects).toEqual([])
    expect(flushInterruption(state, 19_000).effects).toEqual([
      {
        kind: 'summary',
        text: 'Archivist is waiting for your approval. Draughtsman is blocked. Tinker 2 failed. 3 events.',
        eventIds: ['t1', 't2', 't3'],
      },
    ])
  })

  it('joins at a gap of 9,999 ms and starts a new burst at exactly 10,000 ms', () => {
    const joined = run([change('t1', 'archivist', 'waiting', 0), change('t2', 'draughtsman', 'blocked', 9_999, { roomId: 'drafting-room' })])
    expect(joined.effects).toEqual([])
    expect(joined.state.burst?.events.map((event) => event.eventId)).toEqual(['t1', 't2'])

    const split = run([change('t1', 'archivist', 'waiting', 0), change('t2', 'draughtsman', 'blocked', 10_000, { roomId: 'drafting-room' })])
    expect(split.effects).toEqual([{ kind: 'summary', text: 'Archivist is waiting for your approval.', eventIds: ['t1'] }])
    expect(split.state.burst).toEqual({
      openedAtMs: 10_000,
      lastAcceptedAtMs: 10_000,
      events: [expect.objectContaining({ eventId: 't2', state: 'blocked' })],
    })
  })

  it('counts an observation older than the burst as made at its latest event', () => {
    const { state } = run([change('t1', 'archivist', 'waiting', 5_000), change('t2', 'draughtsman', 'failed', 100, { roomId: 'drafting-room' })])
    expect(state.burst?.lastAcceptedAtMs).toBe(5_000)
    expect(state.burst?.events[1].observedAtMs).toBe(5_000)
  })

  it('replaces copy over 240 code points with the fixed overflow sentence', () => {
    const rooms: RoomId[] = ['study', 'drafting-room', 'workshop', 'seance-room']
    const events = Array.from({ length: 8 }, (_, index) =>
      change(`t${index}`, `ghost-${index}`, 'blocked', index, { roomId: rooms[index % rooms.length], ghostName: `${'Wandering '.repeat(8)}${index}` }),
    )
    const [effect] = flushInterruption(run(events).state, 20_000).effects
    expect(effect).toEqual({
      kind: 'summary',
      text: '8 ghosts need attention. Open Needs you for details.',
      eventIds: events.map((event) => event.eventId),
    })
  })

  it('keeps a ghost name to one bounded line', () => {
    const { state } = run([change('t1', 'archivist', 'failed', 0, { ghostName: `  The\n\tArchivist\u0007 ${'x'.repeat(200)}` })])
    const [effect] = flushInterruption(state, 10_000).effects
    expect(effect.kind).toBe('summary')
    if (effect.kind !== 'summary') return
    expect(effect.text.startsWith('The Archivist xxx')).toBe(true)
    expect(effect.text).not.toMatch(/[\n\t\u0007]/)
    expect(Array.from(effect.text).length).toBeLessThanOrEqual(MAX_SUMMARY_CODE_POINTS)
    expect(effect.text.endsWith('… failed.')).toBe(true)
  })

  it('emits nothing when flushed with no burst', () => {
    const step = flushInterruption(EMPTY_INTERRUPTION_STATE, 1_000_000)
    expect(step.effects).toEqual([])
    expect(step.state).toBe(EMPTY_INTERRUPTION_STATE)
    expect(nextInterruptionFlushAtMs(EMPTY_INTERRUPTION_STATE)).toBeNull()
  })
})

describe('canonicalTransitionOf', () => {
  const transition: GhostTransition = {
    transition_id: 't1:abc',
    causing_event_id: `e1:${'0'.repeat(64)}`,
    causing_sequence: 7,
    mansion_id: 'demo-mansion',
    ghost_id: 'archivist',
    from_state: 'working',
    to_state: 'waiting',
  }

  it('maps a Spec 2 transition, using its transition id as the event id', () => {
    expect(canonicalTransitionOf(transition, { roomId: 'study', ghostName: 'The Archivist', observedAtMs: 42 })).toEqual({
      kind: 'transition',
      eventId: 't1:abc',
      ghostId: 'archivist',
      ghostName: 'The Archivist',
      roomId: 'study',
      fromState: 'working',
      toState: 'waiting',
      observedAtMs: 42,
    })
  })

  it('returns null for the house operator scope and for a ghost with no room', () => {
    expect(canonicalTransitionOf({ ...transition, ghost_id: HOUSE_OPERATOR_GHOST_ID }, { roomId: 'study', ghostName: 'x', observedAtMs: 0 })).toBeNull()
    expect(canonicalTransitionOf(transition, { roomId: null, ghostName: 'x', observedAtMs: 0 })).toBeNull()
  })
})
