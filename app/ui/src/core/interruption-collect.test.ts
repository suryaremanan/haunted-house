// Which canonical transitions are offered to the Interruption Policy (Spec 6
// task 7.3). Ported from the Spec 4 collector this replaces: only a ghost's
// latest change of state that still holds is offered, and nothing twice.
// **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { GHOST_STATES, ghostTransitionId, type GhostState, type GhostTransition } from './ghost-state'
import { collectCanonicalTransitions, EMPTY_INTERRUPTION_STATE, reduceInterruption } from './interruption-policy'
import type { EventId } from './seance-event'

const GHOSTS = ['archivist', 'tinker-1', 'tinker-2', 'house-operator', 'stranger'] as const
const ROOMS = { archivist: 'study', 'tinker-1': 'workshop', 'tinker-2': 'workshop' } as const
const roomOf = (ghostId: string) => (ROOMS as Record<string, 'study' | 'workshop'>)[ghostId] ?? null
const nameOf = (ghostId: string) => `Ghost ${ghostId}`

function build(raw: readonly { ghost: string; from: GhostState; to: GhostState }[]): GhostTransition[] {
  return raw.map((item, index) => {
    const eventId: EventId = `e1:${index.toString(16).padStart(64, '0')}`
    return {
      transition_id: ghostTransitionId(eventId, 'demo-mansion', item.ghost, item.to),
      causing_event_id: eventId,
      causing_sequence: index + 1,
      mansion_id: 'demo-mansion',
      ghost_id: item.ghost,
      from_state: item.from,
      to_state: item.to,
    }
  })
}

function finalStates(transitions: readonly GhostTransition[]): Map<string, GhostState> {
  const states = new Map<string, GhostState>()
  for (const transition of transitions) {
    if (transition.from_state !== transition.to_state) states.set(transition.ghost_id, transition.to_state)
  }
  return states
}

describe('collectCanonicalTransitions', () => {
  it('offers only the latest state change of each ghost that still holds, once', () => {
    const transitionArb = fc.record({ ghost: fc.constantFrom(...GHOSTS), from: fc.constantFrom(...GHOST_STATES), to: fc.constantFrom(...GHOST_STATES) })
    fc.assert(
      fc.property(fc.array(transitionArb, { maxLength: 30 }), fc.integer({ min: 0, max: 1_000_000 }), (raw, nowMs) => {
        const transitions = build(raw)
        const states = finalStates(transitions)
        const first = collectCanonicalTransitions({
          transitions,
          currentState: (ghostId) => states.get(ghostId) ?? null,
          offered: new Set(),
          roomOf,
          nameOf,
          observedAtMs: nowMs,
        })
        // Every transition was looked at, exactly once.
        expect(first.offered).toHaveLength(new Set(transitions.map((transition) => transition.transition_id)).size)
        // One event per ghost that has a room and changed state at all: its latest change.
        const expected = Array.from(states.keys())
          .filter((ghost) => roomOf(ghost) !== null)
          .sort()
        expect(first.events.map((event) => (event.kind === 'transition' ? event.ghostId : '')).sort()).toEqual(expected)
        for (const event of first.events) {
          if (event.kind !== 'transition') throw new Error('only transitions are offered')
          expect(event.toState).toBe(states.get(event.ghostId))
          expect(event.observedAtMs).toBe(nowMs)
          expect(event.ghostName).toBe(nameOf(event.ghostId))
          expect(event.roomId).toBe(roomOf(event.ghostId))
        }
        // The policy then accepts exactly the ghosts now waiting, blocked or failed.
        let state = EMPTY_INTERRUPTION_STATE
        for (const event of first.events) state = reduceInterruption(state, event).state
        const interrupting = expected.filter((ghost) => ['waiting', 'blocked', 'failed'].includes(states.get(ghost)!))
        expect((state.burst?.events ?? []).map((event) => event.ghostId).sort()).toEqual(interrupting)
        // Nothing is offered a second time.
        const again = collectCanonicalTransitions({
          transitions,
          currentState: (ghostId) => states.get(ghostId) ?? null,
          offered: new Set(first.offered),
          roomOf,
          nameOf,
          observedAtMs: nowMs + 1,
        })
        expect(again).toEqual({ offered: [], events: [] })
      }),
      { numRuns: 300 },
    )
  })

  it('does not offer a transition the ghost has already moved past, or one its snapshot contradicts', () => {
    const history = build([
      { ghost: 'archivist', from: 'working', to: 'waiting' },
      { ghost: 'archivist', from: 'waiting', to: 'done' },
      { ghost: 'tinker-1', from: 'working', to: 'failed' },
    ])
    const collected = collectCanonicalTransitions({
      transitions: history,
      // The snapshot of Tinker 1 is already ahead of the transitions on hand.
      currentState: (ghostId) => (ghostId === 'archivist' ? 'done' : 'working'),
      offered: new Set(),
      roomOf,
      nameOf,
      observedAtMs: 5,
    })
    expect(collected.offered).toHaveLength(3)
    expect(collected.events.map((event) => (event.kind === 'transition' ? [event.ghostId, event.toState] : []))).toEqual([['archivist', 'done']])
  })

  it('never offers the house operator or a ghost that lives in no room', () => {
    const transitions = build([
      { ghost: 'house-operator', from: 'working', to: 'failed' },
      { ghost: 'stranger', from: 'working', to: 'blocked' },
    ])
    const states = finalStates(transitions)
    const collected = collectCanonicalTransitions({ transitions, currentState: (ghostId) => states.get(ghostId) ?? null, offered: new Set(), roomOf, nameOf, observedAtMs: 0 })
    expect(collected.events).toEqual([])
    expect(collected.offered).toHaveLength(2)
  })
})
