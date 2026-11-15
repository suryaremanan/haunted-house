// Feature: crew-app-foundation, Property 11: Replay delivers each frame once, in order, to the right subscribers
//
// For any list of frames with non-decreasing timestamps and any set of
// subscribed event types, the replay stand-in calls each subscriber exactly
// once per frame of its type, in file order, with that frame's `data`, and
// never for a frame of another type.
//
// **Validates: Requirements 7.2, 7.3**
//
// Time comes from a fake clock injected as the player's `schedule`. It runs
// timers the way setTimeout does (earliest due first, ties in the order they
// were set), so the checks hold whether the player keeps one timer pending or
// many.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createPlayer, type ReplayFrame, type Schedule } from './replay-player'

/** Event types that frames are drawn from. Small, so types repeat often. */
const FRAME_TYPES = ['approval', 'subagent_chunk', 'notification', 'session_update', '__proto__'] as const
/** Types a subscriber may listen on that no frame ever has. */
const UNPLAYED_TYPES = ['never_recorded', 'constructor'] as const
const ANY_TYPE = [...FRAME_TYPES, ...UNPLAYED_TYPES]

/** What every generated frame carries: its file position, plus arbitrary JSON. */
interface MarkedData {
  readonly index: number
  readonly payload: unknown
}

/** Seconds between a frame and the one before it: often zero, sometimes a long gap. */
const deltaArb = fc.oneof(
  { weight: 3, arbitrary: fc.constant(0) },
  { weight: 4, arbitrary: fc.double({ min: 0, max: 5, noNaN: true }) },
  { weight: 1, arbitrary: fc.double({ min: 3_600, max: 1_000_000, noNaN: true }) },
)

/** 0 to 60 frames whose times are a start time plus cumulative non-negative deltas. */
const framesArb: fc.Arbitrary<ReplayFrame[]> = fc
  .record({
    start: fc.double({ min: 0, max: 2e9, noNaN: true }),
    steps: fc.array(
      fc.record({
        delta: deltaArb,
        type: fc.constantFrom(...FRAME_TYPES),
        payload: fc.jsonValue({ maxDepth: 2 }),
      }),
      { maxLength: 60 },
    ),
  })
  .map(({ start, steps }) => {
    let t = start
    return steps.map(({ delta, type, payload }, index): ReplayFrame => {
      t += delta
      const data: MarkedData = { index, payload }
      return { t, frame: { type, data } }
    })
  })

/** A multiset of subscribed types: duplicates and never-played types included. */
const subscriptionsArb = fc.array(fc.constantFrom(...ANY_TYPE), { maxLength: 12 })

/** Any positive finite speed, weighted towards realistic ones. */
const speedArb = fc.oneof(
  fc.constantFrom(1, 2, 0.5),
  fc.double({ min: 1e-3, max: 1e3, noNaN: true }),
  fc.double({ min: Number.MIN_VALUE, max: Number.MAX_VALUE, noNaN: true }),
)

/** A fake setTimeout: runs the earliest-due timer first, ties in the order they were set. */
function fakeClock() {
  let now = 0
  let order = 0
  const timers: { due: number; order: number; fn: () => void }[] = []
  const schedule: Schedule = (fn, delayMs) => {
    // Like setTimeout, a negative or NaN delay means "as soon as possible".
    timers.push({ due: now + (delayMs > 0 ? delayMs : 0), order: order++, fn })
  }
  /** Runs timers until none remain. `limit` stops a player that never stops scheduling. */
  const runAll = (limit: number) => {
    for (let ran = 0; timers.length > 0; ran += 1) {
      if (ran >= limit) throw new Error(`Timers still pending after ${limit} ran`)
      // `||` also breaks ties between two timers due at Infinity, whose difference is NaN.
      timers.sort((a, b) => a.due - b.due || a.order - b.order)
      const timer = timers.shift()!
      now = timer.due
      timer.fn()
    }
  }
  return { schedule, runAll, pending: () => timers.length }
}

const indexOf = (data: unknown) => (data as MarkedData).index

/** The data of every frame of `type`, in file order. */
const dataOfType = (frames: readonly ReplayFrame[], type: string) =>
  frames.filter((f) => f.frame.type === type).map((f) => f.frame.data)

/** Checks one subscription got exactly `expected`, by identity and in order, and nothing of another type. */
function expectStream(frames: readonly ReplayFrame[], type: string, got: readonly unknown[], expected: readonly unknown[]) {
  for (const data of got) expect(frames[indexOf(data)].frame.type).toBe(type)
  expect(got.map(indexOf)).toEqual(expected.map(indexOf))
  expect(got).toHaveLength(expected.length)
  got.forEach((data, i) => {
    expect(data).toBe(expected[i])
    expect(data).toEqual(expected[i])
  })
}

describe('Property 11: replay delivers each frame once, in order, to the right subscribers', () => {
  it('calls each subscription once per frame of its type, in file order, with that frame\'s data', () => {
    fc.assert(
      fc.property(framesArb, subscriptionsArb, speedArb, (frames, subscriptions, speed) => {
        const clock = fakeClock()
        const errors: unknown[] = []
        const player = createPlayer({ speed, schedule: clock.schedule, onError: (err) => errors.push(err) })
        /** Every call, in the order calls happened, across all subscriptions. */
        const calls: { subscription: number; data: unknown }[] = []
        const received = subscriptions.map((type, subscription) => {
          const got: unknown[] = []
          player.subscribe(type, (data) => {
            got.push(data)
            calls.push({ subscription, data })
          })
          return got
        })

        player.play(frames)
        clock.runAll(10 * frames.length + 10)

        expect(clock.pending()).toBe(0)
        expect(errors).toEqual([])
        subscriptions.forEach((type, s) => expectStream(frames, type, received[s], dataOfType(frames, type)))
        const frameIndices = calls.map((call) => indexOf(call.data))
        expect(frameIndices).toEqual([...frameIndices].sort((a, b) => a - b))
        const expectedTotal = subscriptions.reduce((sum, type) => sum + dataOfType(frames, type).length, 0)
        expect(calls).toHaveLength(expectedTotal)
      }),
      { numRuns: 200 },
    )
  })

  // Companion check, asked for alongside Property 11: unsubscribing ends one
  // subscription's stream after its k-th frame and leaves the others whole.
  it('gives a subscription that unsubscribes after its k-th call exactly min(k, n) frames', () => {
    const specArb = fc.record({
      type: fc.constantFrom(...ANY_TYPE),
      // Small k often lands below a type's frame count, larger k often above it.
      quitAfter: fc.option(fc.oneof(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 1, max: 70 })), {
        nil: undefined,
      }),
    })
    const specsArb = fc
      .array(specArb, { minLength: 1, maxLength: 12 })
      .filter((specs) => specs.some((spec) => spec.quitAfter !== undefined))

    fc.assert(
      fc.property(framesArb, specsArb, speedArb, (frames, specs, speed) => {
        const clock = fakeClock()
        const errors: unknown[] = []
        const player = createPlayer({ speed, schedule: clock.schedule, onError: (err) => errors.push(err) })
        let total = 0
        const received = specs.map(({ type, quitAfter }) => {
          const got: unknown[] = []
          let unsubscribe = () => {}
          unsubscribe = player.subscribe(type, (data) => {
            got.push(data)
            total += 1
            if (got.length === quitAfter) unsubscribe()
          })
          return got
        })

        player.play(frames)
        clock.runAll(10 * frames.length + 10)

        expect(clock.pending()).toBe(0)
        expect(errors).toEqual([])
        let expectedTotal = 0
        specs.forEach(({ type, quitAfter }, s) => {
          const all = dataOfType(frames, type)
          const expected = quitAfter === undefined ? all : all.slice(0, Math.min(quitAfter, all.length))
          expectStream(frames, type, received[s], expected)
          expectedTotal += expected.length
        })
        expect(total).toBe(expectedTotal)
      }),
      { numRuns: 200 },
    )
  })
})
