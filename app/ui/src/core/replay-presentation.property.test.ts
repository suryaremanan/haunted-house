// Feature: crew-app-foundation, Property 11: Replay delivers each frame once, in order, to the right subscribers
//
// History of this property. seance-log-and-ghost-state task 8.1 replaced the
// recorded `{t, frame}` gateway frames with the canonical App_Event log, and
// replay-and-submission task 3.2 retired the wall-clock player
// (`core/replay-player.ts`) for the Replay Engine: a Cursor moved by the
// reducer and timed by Presentation_Time. The property keeps its intent:
//
// For any canonical Event_Log, any order the records are handed over in, any
// Playback_Speed and any advancing clock, playback presents each selected
// record exactly once, in Canonical_Order, never before its presentation time,
// and all of them by the end.
//
// **Validates: crew-app-foundation Requirements 7.2, 7.3; seance-log-and-ghost-state Requirements 8.3, 8.6; replay-and-submission Requirements 2.3, 2.5, 2.9**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { permutationArb, writerLogArb } from '../test/seance-arbitraries'
import { REPLAY_SPEEDS, initialReplayState, nextDelayMs, reduceReplayCommand, type ReplayState } from './replay-reducer'
import {
  MAX_STEP_INTERVAL_MS,
  MIN_STEP_INTERVAL_MS,
  buildReplayModel,
  selectCanonical,
  type ReplayFold,
} from './replay-timeline'
import type { AppEvent } from './seance-event'

/** Gaps between records: often none, sometimes a long silence. */
const gapArb = fc.oneof(
  { weight: 3, arbitrary: fc.constant(0) },
  { weight: 4, arbitrary: fc.integer({ min: 0, max: 5_000 }) },
  { weight: 1, arbitrary: fc.integer({ min: 3_600_000, max: 1_000_000_000 }) },
  // A source clock that runs backwards between two records.
  { weight: 1, arbitrary: fc.integer({ min: -5_000, max: -1 }) },
)

/** A writer log whose records carry generated occurrence times, or none. */
const timedLogArb: fc.Arbitrary<AppEvent[]> = writerLogArb({ maxLength: 40 }).chain((events) =>
  fc
    .array(fc.tuple(gapArb, fc.boolean()), { minLength: events.length, maxLength: events.length })
    .map((steps) => {
      let time = 1_000_000
      return events.map((event, index): AppEvent => {
        const [gap, timed] = steps[index]
        time = Math.max(time + gap, 0)
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
    speed: fc.constantFrom(...REPLAY_SPEEDS),
    // Clock readings: steps forward of zero, small, or huge size.
    ticks: fc.array(
      fc.oneof(fc.constant(0), fc.double({ min: 0, max: 10_000, noNaN: true }), fc.constant(1e12)),
      { maxLength: 60 },
    ),
  }),
)

/** The presented prefix itself: what a subscriber of the playback would have received. */
const prefixFold: ReplayFold<readonly AppEvent[]> = (records) => records

describe('Property 11: replay presents each canonical record once, in Canonical_Order', () => {
  it('reveals a growing prefix of Canonical_Order and every record by the end', () => {
    fc.assert(
      fc.property(scenarioArb, ({ events, delivered, speed, ticks }) => {
        const model = buildReplayModel(selectCanonical(delivered))
        const selected = model.records

        // Canonical_Order, not arrival order: the same model whatever order the records came in.
        expect(model).toEqual(buildReplayModel(selectCanonical(events)))
        expect(new Set(selected.map((record) => record.record_id)).size).toBe(selected.length)
        const known = new Set(events.map((record) => record.record_id))
        for (const record of selected) expect(known.has(record.record_id)).toBe(true)

        // Presentation_Time starts at zero and never decreases; each step is bounded.
        const offsets = model.timeline.map((entry) => entry.presentationOffsetMs)
        if (offsets.length > 0) expect(offsets[0]).toBe(0)
        for (let index = 1; index < offsets.length; index += 1) {
          const step = offsets[index] - offsets[index - 1]
          expect(step).toBeGreaterThanOrEqual(MIN_STEP_INTERVAL_MS)
          expect(step).toBeLessThanOrEqual(MAX_STEP_INTERVAL_MS)
        }
        /** When record `index` is due, in playback milliseconds. Exact: every speed is a power of two. */
        const dueAt = (index: number) => offsets[index] / speed

        let state: ReplayState<readonly AppEvent[]> = initialReplayState(model, prefixFold)
        state = reduceReplayCommand(model, state, { kind: 'set_speed', speed }, prefixFold)
        state = reduceReplayCommand(model, state, { kind: 'play' }, prefixFold)
        // Play alone presents nothing.
        expect(state.cursor).toBe(0)

        // A virtual scheduler: at most one pending step, timed by `nextDelayMs` from the instant the last one fired.
        const presented: AppEvent[] = []
        let elapsed = 0
        let pending: { readonly at: number; readonly generation: number } | null = null
        const schedule = (from: number) => {
          const delay = nextDelayMs(model, state)
          pending = delay === null ? null : { at: from + delay, generation: state.generation }
        }
        const runDue = () => {
          while (pending !== null && pending.at <= elapsed) {
            const fired: { readonly at: number; readonly generation: number } = pending
            const before = state.cursor
            state = reduceReplayCommand(model, state, { kind: 'step', generation: fired.generation }, prefixFold)
            // One step presents exactly one more record: the next of Canonical_Order.
            expect(state.cursor).toBe(before + 1)
            expect(state.projection).toEqual(selected.slice(0, state.cursor))
            presented.push(selected[before])
            // Never before its presentation time.
            expect(fired.at).toBe(dueAt(before))
            // A second firing of the same callback is stale and presents nothing.
            expect(reduceReplayCommand(model, state, { kind: 'step', generation: fired.generation }, prefixFold)).toBe(state)
            schedule(fired.at)
          }
        }
        schedule(0)
        runDue()

        for (const tick of ticks) {
          const visible = state.cursor
          elapsed += tick
          runDue()
          expect(state.cursor).toBeGreaterThanOrEqual(visible)
          // Nothing is visible before its time, and everything due is visible.
          for (let index = 0; index < selected.length; index += 1) {
            expect(index < state.cursor).toBe(dueAt(index) <= elapsed)
          }
          if (state.cursor === selected.length) {
            expect(pending).toBeNull()
            expect(nextDelayMs(model, state)).toBeNull()
          } else {
            expect(state.status).toBe('playing')
            expect(pending!.at).toBe(dueAt(state.cursor))
          }
        }
        expect(presented).toEqual(selected.slice(0, state.cursor))

        // At the last presentation time everything has been presented, each record once.
        elapsed = Math.max(elapsed, selected.length === 0 ? 0 : dueAt(selected.length - 1))
        runDue()
        expect(presented).toEqual(selected)
        expect(state.cursor).toBe(selected.length)
        if (selected.length > 0) expect(state.status).toBe('complete')
        expect(pending).toBeNull()
      }),
      { numRuns: 200 },
    )
  })
})
