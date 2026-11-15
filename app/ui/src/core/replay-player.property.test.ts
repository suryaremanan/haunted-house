// Feature: crew-app-foundation, Property 11: Replay delivers each frame once, in order, to the right subscribers
//
// Migrated to the canonical replay contract by seance-log-and-ghost-state task
// 8.1, which replaced recorded `{t, frame}` gateway frames with the canonical
// App_Event log. The property keeps its intent under the new contract:
//
// For any canonical Event_Log, any order the records are handed over in, any
// positive speed and any advancing clock, the replay timeline makes each record
// visible exactly once, in Canonical_Order (Sequence), never before its
// presentation time, and all of them by the end.
//
// **Validates: crew-app-foundation Requirements 7.2, 7.3; seance-log-and-ghost-state Requirements 8.3, 8.6**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { permutationArb, writerLogArb } from '../test/seance-arbitraries'
import { createTimeline, presentationTimeMs } from './replay-player'
import type { AppEvent } from './seance-event'

/** Any positive finite speed, weighted towards realistic ones. */
const speedArb = fc.oneof(
  fc.constantFrom(1, 2, 0.5),
  fc.double({ min: 1e-3, max: 1e3, noNaN: true }),
  fc.double({ min: Number.MIN_VALUE, max: Number.MAX_VALUE, noNaN: true }),
)

/** Gaps between records: often none, sometimes a long silence. */
const gapArb = fc.oneof(
  { weight: 3, arbitrary: fc.constant(0) },
  { weight: 4, arbitrary: fc.integer({ min: 0, max: 5_000 }) },
  { weight: 1, arbitrary: fc.integer({ min: 3_600_000, max: 1_000_000_000 }) },
  // A source clock that runs backwards between two records.
  { weight: 1, arbitrary: fc.integer({ min: -5_000, max: -1 }) },
)

/** A writer log whose records carry generated occurrence or persistence times. */
const timedLogArb: fc.Arbitrary<AppEvent[]> = writerLogArb({ maxLength: 40 }).chain((events) =>
  fc
    .array(fc.tuple(gapArb, fc.boolean()), { minLength: events.length, maxLength: events.length })
    .map((steps) => {
      let time = 1_000_000
      return events.map((event, index): AppEvent => {
        const [gap, timed] = steps[index]
        time = Math.max(time + gap, 0)
        // Occurrence time is not part of what this property checks about identity,
        // so the record keeps its identifiers and only its presentation time moves.
        return timed
          ? { ...event, occurred_at_ms: time, persisted_at_ms: time + 4 }
          : { ...event, occurred_at_ms: null, persisted_at_ms: time }
      })
    }),
)

const scenarioArb = timedLogArb.chain((events) =>
  fc.record({
    events: fc.constant(events),
    delivered: permutationArb(events),
    speed: speedArb,
    maxGapMs: fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: undefined }),
    // Clock readings: steps forward of zero, small, or huge size.
    ticks: fc.array(
      fc.oneof(fc.constant(0), fc.double({ min: 0, max: 10_000, noNaN: true }), fc.constant(1e12)),
      { maxLength: 60 },
    ),
  }),
)

describe('Property 11: replay presents each canonical record once, in Sequence order', () => {
  it('reveals a growing prefix of Canonical_Order and every record by the end', () => {
    fc.assert(
      fc.property(scenarioArb, ({ events, delivered, speed, maxGapMs, ticks }) => {
        const timeline = createTimeline(delivered, { speed, maxGapMs })

        // Canonical_Order, not arrival order: the writer log is already in Sequence order.
        expect(timeline.events).toEqual(events)
        expect(timeline.delays).toHaveLength(events.length)
        if (events.length > 0) expect(timeline.delays[0]).toBe(0)
        for (let index = 1; index < events.length; index += 1) {
          const step = timeline.delays[index] - timeline.delays[index - 1]
          // Never earlier than the predecessor; infinite waits (an extreme speed) are allowed.
          expect(step >= 0 || Number.isNaN(step)).toBe(true)
          expect(Number.isNaN(timeline.delays[index])).toBe(false)
          if (maxGapMs !== undefined) {
            // Delays are running sums, so a step may exceed the cap by one rounding error.
            const rounding = Math.abs(timeline.delays[index]) * Number.EPSILON * 4
            expect(step <= maxGapMs + rounding || Number.isNaN(step)).toBe(true)
          }
          // Records that share a presentation instant appear together.
          if (presentationTimeMs(events[index]) <= presentationTimeMs(events[index - 1])) {
            expect(timeline.delays[index]).toBe(timeline.delays[index - 1])
          }
        }

        // Advance a clock. What is visible only ever grows, one prefix at a time,
        // so each record is presented exactly once and in order.
        let elapsed = 0
        let visible = timeline.visibleCount(elapsed)
        const presented: AppEvent[] = timeline.events.slice(0, visible)
        for (const tick of ticks) {
          elapsed += tick
          const now = timeline.visibleCount(elapsed)
          expect(now).toBeGreaterThanOrEqual(visible)
          presented.push(...timeline.events.slice(visible, now))
          visible = now

          // Nothing is visible before its time, and everything due is visible.
          for (let index = 0; index < events.length; index += 1) {
            expect(index < visible).toBe(timeline.delays[index] <= elapsed)
          }
          const next = timeline.nextInMs(elapsed)
          if (visible === events.length) expect(next).toBeNull()
          else {
            expect(next).toBeGreaterThan(0)
            expect(next).toBe(timeline.delays[visible] - elapsed)
          }
        }
        expect(presented).toEqual(events.slice(0, visible))
        expect(new Set(presented.map((event) => event.record_id)).size).toBe(presented.length)

        // At the last presentation time everything has been presented.
        const end = timeline.delays.at(-1) ?? 0
        expect(timeline.visibleCount(end)).toBe(events.length)
        expect(timeline.nextInMs(end)).toBeNull()
      }),
      { numRuns: 200 },
    )
  })
})
