// Feature: replay-and-submission, Property 2: Every cursor is exactly a canonical prefix fold
//
// For all Replay_Model values, valid Replay_State values, and integer target
// Cursors from zero through the selected record count, seeking or stepping to
// Cursor `n` produces a projection equal to a fresh Replay_Fold of exactly
// `records.slice(0, n)`; restart is an idempotent return to paused Cursor zero,
// the final Cursor is complete, and every non-integer or out-of-range seek
// leaves the prior state unchanged except for a typed command error.
//
// **Validates: Requirements 2.3, 2.6, 2.7, 2.8, 2.9**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { canonicalRecordsArb } from '../test/replay-arbitraries'
import { deepFreeze } from '../test/seance-arbitraries'
import {
  REPLAY_SPEEDS,
  initialReplayState,
  reduceReplayCommand,
  type ReplayCommand,
  type ReplayState,
} from './replay-reducer'
import { buildReplayModel, foldReplay, selectCanonical, type ReplayModel } from './replay-timeline'

const RUNS = 200
// Each run folds many prefixes; the whole suite may run beside it.
const TIMEOUT_MS = 60_000

/** Seek targets that are not an integer from zero through `total`. */
const invalidCursorArb = (total: number): fc.Arbitrary<number> =>
  fc.oneof(
    fc.integer({ min: -1_000_000, max: -1 }),
    fc.integer({ min: total + 1, max: total + 1_000_000 }),
    fc.double({ noNaN: true, noDefaultInfinity: true }).filter((value) => !Number.isInteger(value)),
    fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_VALUE, -0.5),
  )

// Stepping to the target folds every prefix on the way, so logs are kept short.
const scenarioArb = canonicalRecordsArb({ maxSynthetic: 16, maxReal: 24 }).chain((records) => {
  const model = buildReplayModel(selectCanonical(records))
  const total = model.records.length
  const cursor = fc.nat({ max: total })
  return fc.record({
    model: fc.constant(model),
    // Any valid state: a position, a status and a speed reached by commands.
    origin: cursor,
    playing: fc.boolean(),
    speed: fc.constantFrom(...REPLAY_SPEEDS),
    target: cursor,
    invalid: invalidCursorArb(total),
    // Generations of step commands that are not the current one.
    staleOffset: fc.integer({ min: 1, max: 5 }),
    restarts: fc.integer({ min: 1, max: 4 }),
  })
})

function apply(model: ReplayModel, state: ReplayState, ...commands: ReplayCommand[]): ReplayState {
  return commands.reduce((current, command) => reduceReplayCommand(model, deepFreeze(current), command, foldReplay), state)
}

describe('Property 2: Every cursor is exactly a canonical prefix fold', () => {
  it('shows at Cursor n the fresh fold of the first n records, by seek and by step', () => {
    fc.assert(
      fc.property(scenarioArb, ({ model, origin, playing, speed, target, invalid, staleOffset, restarts }) => {
        deepFreeze(model)
        const total = model.records.length
        const fresh = (cursor: number) => foldReplay(model.records.slice(0, cursor))

        let state = apply(model, initialReplayState(model, foldReplay), { kind: 'set_speed', speed }, { kind: 'seek', cursor: origin })
        if (playing) state = apply(model, state, { kind: 'play' })
        expect(state.cursor).toBe(origin)
        expect(state.projection).toEqual(fresh(origin))

        // Seek: the projection is the fresh prefix fold, and only the final Cursor is complete.
        const sought = apply(model, state, { kind: 'seek', cursor: target })
        expect(sought.cursor).toBe(target)
        expect(sought.projection).toEqual(fresh(target))
        expect(sought.projection.validRecordCount).toBe(target)
        expect(sought.status === 'complete').toBe(target === total)
        expect(sought.speed).toBe(speed)
        expect(sought.commandError).toBeNull()

        // Step: each current step adds exactly the next record of Canonical_Order.
        let stepped = apply(model, initialReplayState(model, foldReplay), { kind: 'play' })
        for (let cursor = 1; cursor <= target; cursor += 1) {
          const stale = apply(model, stepped, { kind: 'step', generation: stepped.generation - staleOffset })
          expect(stale).toBe(stepped)
          stepped = apply(model, stepped, { kind: 'step', generation: stepped.generation })
          expect(stepped.cursor).toBe(cursor)
        }
        expect(stepped.cursor).toBe(target)
        expect(stepped.projection).toEqual(sought.projection)
        expect(stepped.status).toBe(target === total ? 'complete' : 'playing')

        // An invalid seek keeps everything but the typed error.
        const refused = apply(model, sought, { kind: 'seek', cursor: invalid })
        expect(refused).toEqual({ ...sought, commandError: refused.commandError })
        expect(refused.commandError?.code).toBe('invalid_cursor')
        expect(refused.projection).toBe(sought.projection)

        // Restart returns to paused Cursor zero, however often it is repeated.
        const once = apply(model, refused, { kind: 'restart' })
        expect(once).toMatchObject({ status: 'paused', cursor: 0, speed, commandError: null })
        expect(once.projection).toEqual(fresh(0))
        const again = apply(model, once, ...Array.from({ length: restarts }, (): ReplayCommand => ({ kind: 'restart' })))
        expect(again).toBe(once)
      }),
      { numRuns: RUNS },
    )
  }, TIMEOUT_MS)
})
