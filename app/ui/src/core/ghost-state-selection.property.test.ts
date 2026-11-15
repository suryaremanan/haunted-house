// Feature: seance-log-and-ghost-state, Property 8: Selection and reduction converge under duplicates and permutations
//
// For all finite canonical App_Event collections, duplicating records,
// permuting in-memory delivery, adding lower-ranked variants, and delaying
// lower Run_Sequence events produces the same selected Event_ID-to-Record_ID
// map, Sequence order, diagnostics set, and Ghost_Snapshots as the reference
// model.
//
// **Validates: Requirements 5.2, 5.4, 5.9, 5.10**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  byCodePoint,
  deepFreeze,
  diagnosticKey,
  eventLogArb,
  makeEvent,
  permutationArb,
  referenceSelect,
  referenceSnapshots,
} from '../test/seance-arbitraries'
import { foldGhostEvents, reduceGhostSnapshots, selectEvents, type ProjectionResult } from './ghost-state'
import type { AppEvent } from './seance-event'

const RUNS = 200

/** Everything Property 8 compares, in a form `toEqual` can diff. */
function observed(result: ProjectionResult) {
  return {
    winners: Object.fromEntries(result.selection.events.map((event) => [event.event_id, event.record_id])),
    order: result.selection.events.map((event) => [event.sequence, event.event_id]),
    diagnostics: result.selection.diagnostics.map(diagnosticKey).sort(),
    snapshots: result.snapshots,
  }
}

function expected(events: readonly AppEvent[]) {
  const reference = referenceSelect(events)
  return {
    winners: Object.fromEntries(reference.winners),
    order: reference.events.map((event) => [event.sequence, event.event_id]),
    diagnostics: [...reference.diagnostics].sort(),
    snapshots: referenceSnapshots(reference.events),
  }
}

/** A log, plus the same records duplicated and delivered in another order. */
const scrambledArb = eventLogArb().chain((events) =>
  fc
    .array(fc.nat({ max: Math.max(events.length - 1, 0) }), { maxLength: events.length })
    .chain((copies) => {
      // Exact in-memory duplicates: the same physical record delivered again.
      const duplicated = [...events, ...copies.filter(() => events.length > 0).map((index) => events[index])]
      return permutationArb(duplicated).map((scrambled) => ({ events, scrambled }))
    }),
)

describe('Property 8: selection and reduction converge under duplicates and permutations', () => {
  it('matches the reference model for any delivery order and any number of exact duplicates', () => {
    fc.assert(
      fc.property(scrambledArb, ({ events, scrambled }) => {
        deepFreeze(events)
        const model = expected(events)
        const inOrder = foldGhostEvents(events)
        const outOfOrder = foldGhostEvents(scrambled)

        expect(observed(inOrder)).toEqual(model)
        expect(observed(outOfOrder)).toEqual(model)
        // Not only the compared projection: the complete results are equal.
        expect(outOfOrder).toEqual(inOrder)
        expect(selectEvents(scrambled)).toEqual(inOrder.selection)
        expect(reduceGhostSnapshots(scrambled)).toEqual(inOrder.snapshots)

        // Canonical_Order is Sequence order with Event_ID as the tie-breaker.
        const order = inOrder.selection.events
        for (let index = 1; index < order.length; index += 1) {
          const step =
            order[index - 1].sequence - order[index].sequence ||
            byCodePoint(order[index - 1].event_id, order[index].event_id)
          expect(step).toBeLessThan(0)
        }
      }),
      { numRuns: RUNS },
    )
  })

  it('keeps every winner and snapshot when lower-ranked variants arrive later', () => {
    const arb = eventLogArb().chain((events) =>
      fc.record({
        events: fc.constant(events),
        targets: fc.subarray(events),
        order: fc.integer({ min: 0, max: 1_000_000 }),
      }),
    )
    fc.assert(
      fc.property(arb, ({ events, targets, order }) => {
        deepFreeze(events)
        const before = foldGhostEvents(events)
        const winners = new Map(before.selection.events.map((event) => [event.event_id, event]))
        let sequence = events.length
        // A stale variant of the current winner: one revision lower, so it
        // loses whatever its payload or Record_ID is.
        const stale: AppEvent[] = []
        const used = new Set<string>()
        for (const target of targets) {
          const winner = winners.get(target.event_id)!
          if (winner.source.revision === 0 || used.has(winner.event_id)) continue
          used.add(winner.event_id)
          sequence += 1
          stale.push(
            makeEvent(
              {
                schema_version: winner.schema_version,
                event_type: winner.event_type,
                scope: winner.scope,
                source: { ...winner.source, revision: winner.source.revision - 1 },
                caused_by: winner.caused_by,
                occurred_at_ms: winner.occurred_at_ms,
                payload: { late: true, detail: ['stale', 'but', 'verbose'], reason: 'stalled', mid: 'mid-9' },
              },
              sequence,
            ),
          )
        }
        const all = [...events, ...stale]
        const delivered = order % 2 === 0 ? all : [...stale, ...events].reverse()
        const after = foldGhostEvents(delivered)

        expect(observed(after)).toEqual(expected(all))
        expect(observed(after).winners).toEqual(observed(before).winners)
        expect(observed(after).order).toEqual(observed(before).order)
        expect(after.snapshots).toEqual(before.snapshots)
        expect(after.transitions).toEqual(before.transitions)
      }),
      { numRuns: RUNS },
    )
  })

  it('keeps the selected Run and state when events for a lower Run_Sequence are delayed', () => {
    const lateTypes = ['run_started', 'run_failed', 'run_blocked', 'run_completed', 'approval_requested'] as const
    const arb = eventLogArb().chain((events) =>
      fc.record({
        events: fc.constant(events),
        late: fc.array(
          fc.record({
            pick: fc.nat(),
            type: fc.constantFrom(...lateTypes),
            below: fc.integer({ min: 1, max: 3 }),
          }),
          { maxLength: 6 },
        ),
        seed: fc.integer({ min: 0, max: 1_000_000 }),
      }),
    )
    fc.assert(
      fc.property(arb, ({ events, late, seed }) => {
        deepFreeze(events)
        const before = foldGhostEvents(events)
        const running = before.snapshots.filter((snapshot) => (snapshot.run_sequence ?? 0) > 0)
        const delayed: AppEvent[] = late.flatMap(({ pick, type, below }, index) => {
          if (running.length === 0) return []
          const target = running[pick % running.length]
          return [
            makeEvent(
              {
                schema_version: 1,
                event_type: type,
                scope: {
                  mansion_id: target.mansion_id,
                  ghost_id: target.ghost_id,
                  session_slot: `${target.ghost_id}-slot`,
                  run_id: target.run_id!,
                  run_sequence: Math.max(target.run_sequence! - below, 0),
                },
                source: {
                  origin: 'house',
                  source_type: type,
                  identity_parts: [`delayed-${index}`],
                  revision: 0,
                  generation: '',
                  source_sequence: 0,
                },
                caused_by: [],
                occurred_at_ms: null,
                payload: { mid: 'mid-late', reason: 'stale block' },
              },
              events.length + index + 1,
            ),
          ]
        })
        const all = [...events, ...delayed]
        const delivered = seed % 2 === 0 ? all : [...delayed, ...events]
        const after = foldGhostEvents(delivered)

        expect(observed(after)).toEqual(expected(all))
        // Every ghost keeps its selected Run, state and the rest of its snapshot.
        expect(after.snapshots).toEqual(before.snapshots)
      }),
      { numRuns: RUNS },
    )
  })
})
