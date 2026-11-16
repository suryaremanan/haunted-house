// Replay presentation timing over a canonical Event_Log, on the Replay Engine.
//
// These examples were the tests of `core/replay-player.ts`, the wall-clock
// player that replay-and-submission task 3.2 retired. Each behaviour it
// covered is asserted here against the engine that replaced it: Canonical_Order
// whatever the delivery order, waits measured between adjacent records and
// divided by speed, a bounded wait across a long silence, records presented
// once and in order, and refusal of an unusable speed. Two rules changed with
// the design and are asserted as they now are: a record without a usable
// forward time waits the default interval instead of appearing together with
// its predecessor, and the writer's persistence time is never read.
// **Validates: seance-log-and-ghost-state Requirements 8.3, 8.6; replay-and-submission Requirements 2.3, 2.5, 2.9**
import { describe, expect, it } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import { makeEvent } from '../test/seance-arbitraries'
import { initialReplayState, nextDelayMs, reduceReplayCommand, type ReplayState } from './replay-reducer'
import {
  DEFAULT_STEP_INTERVAL_MS,
  MAX_STEP_INTERVAL_MS,
  buildReplayModel,
  parseCanonicalLog,
  presentationOffsets,
  selectCanonical,
  type ReplayFold,
  type ReplayModel,
} from './replay-timeline'
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

const countFold: ReplayFold<number> = (records) => records.length
const modelOf = (events: readonly AppEvent[]) => buildReplayModel(selectCanonical(events))

/** The wait before each record when the recording plays from the start at `speed`. */
function waits(model: ReplayModel, speed: number): number[] {
  let state: ReplayState<number> = initialReplayState(model, countFold)
  state = reduceReplayCommand(model, state, { kind: 'set_speed', speed }, countFold)
  state = reduceReplayCommand(model, state, { kind: 'play' }, countFold)
  const delays: number[] = []
  for (let delay = nextDelayMs(model, state); delay !== null; delay = nextDelayMs(model, state)) {
    delays.push(delay)
    state = reduceReplayCommand(model, state, { kind: 'step', generation: state.generation }, countFold)
  }
  expect(state.cursor).toBe(model.records.length)
  return delays
}

describe('presentation waits', () => {
  it('measures between adjacent records and divides by speed', () => {
    const model = modelOf([record(1, 100_000), record(2, 100_500), record(3, 102_000)])
    expect(presentationOffsets(model.records)).toEqual([0, 500, 2000])
    // The first record follows Play at once.
    expect(waits(model, 1)).toEqual([0, 500, 1500])
    expect(waits(model, 2)).toEqual([0, 250, 750])
    expect(waits(model, 0.5)).toEqual([0, 1000, 3000])
  })

  it('gives a record stamped earlier than the one before it the default wait, never a negative one', () => {
    const model = modelOf([record(1, 10_000), record(2, 9_000), record(3, 12_000)])
    expect(presentationOffsets(model.records)).toEqual([0, DEFAULT_STEP_INTERVAL_MS, DEFAULT_STEP_INTERVAL_MS + 3_000])
  })

  it('never reads the persistence time: a fact without an occurrence time waits the default', () => {
    const events = [record(1, 1_000, 1_004), record(2, null, 1_300), record(3, 1_900, 1_904)]
    expect(presentationOffsets(modelOf(events).records)).toEqual([0, 1_000, 2_000])
    const repersisted = events.map((event) => ({ ...event, persisted_at_ms: event.persisted_at_ms + 777_777 }))
    expect(presentationOffsets(repersisted)).toEqual([0, 1_000, 2_000])
  })

  it('caps a long silence without moving later records closer than recorded', () => {
    const model = modelOf([record(1, 0), record(2, 1_000), record(3, 3_600_000), record(4, 3_600_400)])
    expect(presentationOffsets(model.records)).toEqual([0, 1_000, 1_000 + MAX_STEP_INTERVAL_MS, 1_400 + MAX_STEP_INTERVAL_MS])
  })

  it('handles an empty recording', () => {
    const model = modelOf([])
    expect(presentationOffsets([])).toEqual([])
    const state = reduceReplayCommand(model, initialReplayState(model, countFold), { kind: 'play' }, countFold)
    expect(state).toMatchObject({ cursor: 0, status: 'complete' })
    expect(nextDelayMs(model, state)).toBeNull()
  })

  it.each([0, -1, 3, Number.NaN, Number.POSITIVE_INFINITY])('refuses speed %s and keeps the state', (speed) => {
    const model = modelOf([record(1, 0), record(2, 500)])
    const before = reduceReplayCommand(model, initialReplayState(model, countFold), { kind: 'play' }, countFold)
    const after = reduceReplayCommand(model, before, { kind: 'set_speed', speed }, countFold)
    expect(after).toEqual({ ...before, commandError: expect.objectContaining({ code: 'invalid_speed' }) })
    expect(nextDelayMs(model, after)).toBe(nextDelayMs(model, before))
  })
})

describe('presentation order', () => {
  it('presents in Canonical_Order whatever order the records were given in', () => {
    const events = [record(3, 300), record(1, 100), record(2, 200)]
    const before = [...events]
    const model = modelOf(events)

    expect(model.records.map((event) => event.sequence)).toEqual([1, 2, 3])
    expect(model.timeline.map((entry) => entry.recordId)).toEqual(model.records.map((event) => event.record_id))
    // The input array is not reordered.
    expect(events).toEqual(before)
  })

  it('presents one record per step, each once, and nothing after a pause or a stale step', () => {
    const model = modelOf([record(1, 10_000), record(2, 10_000), record(3, 11_000), record(4, 13_000)])
    let state: ReplayState<number> = initialReplayState(model, countFold)
    // Before Play nothing is presented, and a step changes nothing.
    expect(reduceReplayCommand(model, state, { kind: 'step', generation: state.generation }, countFold)).toBe(state)
    state = reduceReplayCommand(model, state, { kind: 'play' }, countFold)
    expect(state.cursor).toBe(0)

    const first = state.generation
    state = reduceReplayCommand(model, state, { kind: 'step', generation: first }, countFold)
    expect(state.cursor).toBe(1)
    // The callback that already fired cannot present a second record.
    expect(reduceReplayCommand(model, state, { kind: 'step', generation: first }, countFold)).toBe(state)

    state = reduceReplayCommand(model, state, { kind: 'pause' }, countFold)
    expect(nextDelayMs(model, state)).toBeNull()
    expect(reduceReplayCommand(model, state, { kind: 'step', generation: state.generation }, countFold)).toBe(state)

    state = reduceReplayCommand(model, state, { kind: 'resume' }, countFold)
    for (let cursor = 2; cursor <= 4; cursor += 1) {
      state = reduceReplayCommand(model, state, { kind: 'step', generation: state.generation }, countFold)
      expect(state).toMatchObject({ cursor, projection: cursor })
    }
    expect(state.status).toBe('complete')
    expect(nextDelayMs(model, state)).toBeNull()
  })

  it('schedules the committed demo recording in Canonical_Order with times that never decrease', () => {
    const { events } = parseEventLog(demo)
    expect(events.length).toBeGreaterThan(0)
    const model = buildReplayModel(selectCanonical([...events].reverse()))

    expect(model.records).toEqual(events)
    expect(model).toEqual(buildReplayModel(parseCanonicalLog(demo)))
    const offsets = model.timeline.map((entry) => entry.presentationOffsetMs)
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b))
    expect(offsets[0]).toBe(0)
    // The whole story fits a short demo.
    expect(offsets.at(-1)).toBeLessThan(90_000)
    expect(waits(model, 1)).toHaveLength(events.length)
  })
})
