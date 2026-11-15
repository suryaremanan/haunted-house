// Replay presentation timing over a canonical Event_Log (task 8.3).
// Migrated from the `{t, frame}` player tests when task 8.1 replaced that
// contract: parsing moved to seance-log.test.ts, delivery by event type no
// longer exists, and timing now applies to canonical records in Sequence order.
// **Validates: Requirements 8.3, 8.6**
import { describe, expect, it } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import { makeEvent } from '../test/seance-arbitraries'
import { createTimeline, inCanonicalOrder, presentationDelays, presentationTimeMs } from './replay-player'
import type { AppEvent } from './seance-event'
import { parseEventLog } from './seance-log'

/** A record at `sequence` that occurred at `occurred` (null: no source time) and was persisted at `persisted`. */
function record(sequence: number, occurred: number | null, persisted = 0): AppEvent {
  return {
    ...makeEvent(
      {
        schema_version: 1,
        event_type: 'ghost_progressed',
        scope: { mansion_id: 'demo-mansion', ghost_id: 'archivist', session_slot: 's', run_id: 'r', run_sequence: 0 },
        source: {
          origin: 'house',
          source_type: 'ghost_progressed',
          identity_parts: [`p-${sequence}`],
          revision: 0,
          generation: '',
          source_sequence: 0,
        },
        caused_by: [],
        occurred_at_ms: occurred,
        payload: {},
      },
      sequence,
    ),
    persisted_at_ms: persisted,
  }
}

describe('presentationDelays', () => {
  it('measures from the first record and divides by speed', () => {
    const events = [record(1, 100_000), record(2, 100_500), record(3, 102_000)]
    expect(presentationDelays(events)).toEqual([0, 500, 2000])
    expect(presentationDelays(events, { speed: 2 })).toEqual([0, 250, 1000])
  })

  it('presents a record stamped earlier than the one before it together with that one', () => {
    expect(presentationDelays([record(1, 10_000), record(2, 9_000), record(3, 12_000)])).toEqual([0, 0, 2000])
  })

  it('uses the persistence time for a fact that carries no occurrence time', () => {
    const events = [record(1, 1_000, 1_004), record(2, null, 1_300), record(3, 1_900, 1_904)]
    expect(events.map(presentationTimeMs)).toEqual([1_000, 1_300, 1_900])
    expect(presentationDelays(events)).toEqual([0, 300, 900])
  })

  it('caps a long silence at maxGapMs without moving later records closer than recorded', () => {
    const events = [record(1, 0), record(2, 1_000), record(3, 3_600_000), record(4, 3_600_400)]
    expect(presentationDelays(events, { maxGapMs: 4_000 })).toEqual([0, 1_000, 5_000, 5_400])
  })

  it('handles an empty recording', () => {
    expect(presentationDelays([])).toEqual([])
    const timeline = createTimeline([])
    expect(timeline.visibleCount(0)).toBe(0)
    expect(timeline.nextInMs(0)).toBeNull()
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects speed %s', (speed) => {
    expect(() => presentationDelays([record(1, 0)], { speed })).toThrow(RangeError)
    expect(() => createTimeline([record(1, 0)], { speed })).toThrow(RangeError)
  })

  it.each([-1, Number.NaN])('rejects maxGapMs %s', (maxGapMs) => {
    expect(() => presentationDelays([record(1, 0)], { maxGapMs })).toThrow(RangeError)
  })
})

describe('createTimeline', () => {
  it('presents in Sequence order whatever order the records were given in', () => {
    const events = [record(3, 300), record(1, 100), record(2, 200)]
    const before = [...events]
    const timeline = createTimeline(events)

    expect(timeline.events.map((event) => event.sequence)).toEqual([1, 2, 3])
    expect(timeline.delays).toEqual([0, 100, 200])
    // The input array is not reordered.
    expect(events).toEqual(before)
    expect(inCanonicalOrder(events).map((event) => event.sequence)).toEqual([1, 2, 3])
  })

  it('reveals records that share an instant together, and waits the recorded time divided by speed', () => {
    const timeline = createTimeline([record(1, 10_000), record(2, 10_000), record(3, 11_000), record(4, 13_000)], {
      speed: 2,
    })
    expect(timeline.visibleCount(-1)).toBe(0)
    expect(timeline.visibleCount(0)).toBe(2)
    expect(timeline.nextInMs(0)).toBe(500)
    expect(timeline.visibleCount(499)).toBe(2)
    expect(timeline.visibleCount(500)).toBe(3)
    expect(timeline.nextInMs(600)).toBe(900)
    expect(timeline.visibleCount(1_500)).toBe(4)
    expect(timeline.nextInMs(1_500)).toBeNull()
    expect(timeline.visibleCount(Number.POSITIVE_INFINITY)).toBe(4)
  })

  it('schedules the committed demo recording in Sequence order with delays that never decrease', () => {
    const { events } = parseEventLog(demo)
    expect(events.length).toBeGreaterThan(0)
    const timeline = createTimeline([...events].reverse(), { maxGapMs: 4_000 })

    expect(timeline.events).toEqual(events)
    expect(timeline.delays).toEqual([...timeline.delays].sort((a, b) => a - b))
    expect(timeline.delays[0]).toBe(0)
    // The whole story fits a short demo.
    expect(timeline.delays.at(-1)).toBeLessThan(90_000)
    expect(timeline.visibleCount(timeline.delays.at(-1)!)).toBe(events.length)
  })
})
