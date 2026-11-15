// Feature: seance-log-and-ghost-state, Property 9: Six-state reduction agrees with the reference fact model
//
// For all finite valid multi-Mansion, multi-ghost canonical histories,
// Ghost_State_Reducer equals the reference set model for selected Run,
// terminal precedence, pending approvals, open tools, latest event, and reason;
// `crew_turn_ended` and `crew_error_observed` alone remain nonterminal; foreign
// scopes and input values remain unchanged.
//
// **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  GHOSTS,
  MANSIONS,
  candidateArb,
  deepFreeze,
  eventLogArb,
  makeEvent,
  referenceSelect,
  referenceSnapshot,
  referenceSnapshots,
} from '../test/seance-arbitraries'
import {
  GHOST_STATES,
  deriveGhostTransitions,
  foldGhostEvents,
  ghostTransitionId,
  reduceGhostSnapshot,
  reduceGhostSnapshots,
} from './ghost-state'
import type { AppEvent, AppEventCandidate, EventType } from './seance-event'

const RUNS = 200

/** Event types that settle a Run. Only the house appends them. */
const DOMAIN_TERMINALS: readonly EventType[] = ['run_completed', 'run_blocked', 'run_failed']

describe('Property 9: six-state reduction agrees with the reference fact model', () => {
  it('equals the reference model for every ghost of every mansion and never mutates its input', () => {
    fc.assert(
      fc.property(eventLogArb({ maxLength: 60 }), (events) => {
        deepFreeze(events)
        const before = JSON.stringify(events)
        const selected = referenceSelect(events).events

        // Every ghost that could exist, including those with no event at all.
        for (const mansionId of MANSIONS) {
          for (const ghostId of GHOSTS) {
            const snapshot = reduceGhostSnapshot(events, mansionId, ghostId)
            expect(snapshot).toEqual(referenceSnapshot(selected, mansionId, ghostId))
            expect(GHOST_STATES).toContain(snapshot.state)

            // Requirement 6.2: no run_started for this ghost means idle.
            const started = events.some(
              (event) =>
                event.event_type === 'run_started' &&
                event.scope.mansion_id === mansionId &&
                event.scope.ghost_id === ghostId,
            )
            expect(snapshot.state === 'idle').toBe(!started)

            // Requirement 6.12: events of other ghosts and mansions change nothing.
            const own = events.filter(
              (event) => event.scope.mansion_id === mansionId && event.scope.ghost_id === ghostId,
            )
            expect(reduceGhostSnapshot(own, mansionId, ghostId)).toEqual(snapshot)
          }
        }
        expect(reduceGhostSnapshots(events)).toEqual(referenceSnapshots(selected))
        expect(foldGhostEvents(events).snapshots).toEqual(referenceSnapshots(selected))

        // Requirement 6.13: frozen input would have thrown on a write; it is also unchanged.
        expect(JSON.stringify(events)).toBe(before)
      }),
      { numRuns: RUNS },
    )
  })

  it('never settles a Run from crew_turn_ended or crew_error_observed without a domain terminal', () => {
    // Histories with no run_completed, run_blocked or run_failed at all.
    const transportOnly = fc
      .array(
        candidateArb().filter((candidate) => !DOMAIN_TERMINALS.includes(candidate.event_type)),
        { maxLength: 40 },
      )
      .chain((candidates) =>
        fc
          .array(
            fc.record({
              at: fc.nat(),
              type: fc.constantFrom<EventType>('crew_turn_ended', 'crew_error_observed'),
              continuing: fc.boolean(),
              needsInput: fc.boolean(),
            }),
            { minLength: 1, maxLength: 8 },
          )
          .map((transport) => {
            // Every Crew transport fact is attached to the scope of an existing candidate.
            const extra = transport.flatMap(({ at, type, continuing, needsInput }, index): AppEventCandidate[] => {
              if (candidates.length === 0) return []
              const host = candidates[at % candidates.length]
              return [
                {
                  schema_version: 1,
                  event_type: type,
                  scope: host.scope,
                  source: {
                    origin: 'crew',
                    source_type: type === 'crew_turn_ended' ? 'chat_done' : 'chat_error',
                    identity_parts: [`transport-${index}`],
                    revision: 0,
                    generation: 'g1',
                    source_sequence: index,
                  },
                  caused_by: [],
                  occurred_at_ms: null,
                  payload:
                    type === 'crew_turn_ended'
                      ? { continuing, needs_input: needsInput, reason: 'done' }
                      : { category: 'provider_error', reason: 'failed' },
                },
              ]
            })
            return [...candidates, ...extra].map((candidate, index) => makeEvent(candidate, index + 1))
          }),
      )

    fc.assert(
      fc.property(transportOnly, (events) => {
        deepFreeze(events)
        const withoutTransport = events.filter(
          (event) => event.event_type !== 'crew_turn_ended' && event.event_type !== 'crew_error_observed',
        )
        for (const snapshot of reduceGhostSnapshots(events)) {
          expect(['idle', 'working', 'waiting']).toContain(snapshot.state)
          // Removing the transport facts changes no state, approval or tool set.
          const bare = reduceGhostSnapshot(withoutTransport, snapshot.mansion_id, snapshot.ghost_id)
          expect(snapshot.state).toBe(bare.state)
          expect(snapshot.pending_approvals).toEqual(bare.pending_approvals)
          expect(snapshot.open_tools).toEqual(bare.open_tools)
          expect(snapshot.reason).toBe(bare.reason)
          expect(snapshot.run_id).toBe(bare.run_id)
        }
        for (const transition of deriveGhostTransitions(events)) {
          expect(['idle', 'working', 'waiting']).toContain(transition.to_state)
        }
      }),
      { numRuns: RUNS },
    )
  })

  it('derives each transition from the snapshots before and after its causing event', () => {
    fc.assert(
      fc.property(eventLogArb({ maxLength: 40 }), (events) => {
        deepFreeze(events)
        const selected = referenceSelect(events).events
        const transitions = deriveGhostTransitions(events)
        expect(foldGhostEvents(events).transitions).toEqual(transitions)

        const expectedTransitions = []
        const prefix: AppEvent[] = []
        for (const event of selected) {
          const { mansion_id: mansionId, ghost_id: ghostId } = event.scope
          const before = referenceSnapshot(prefix, mansionId, ghostId)
          prefix.push(event)
          const after = referenceSnapshot(prefix, mansionId, ghostId)
          if (JSON.stringify(before) === JSON.stringify(after)) continue
          expectedTransitions.push({
            transition_id: ghostTransitionId(event.event_id, mansionId, ghostId, after.state),
            causing_event_id: event.event_id,
            causing_sequence: event.sequence,
            mansion_id: mansionId,
            ghost_id: ghostId,
            from_state: before.state,
            to_state: after.state,
          })
        }
        expect(transitions).toEqual(expectedTransitions)
      }),
      { numRuns: RUNS },
    )
  })
})
