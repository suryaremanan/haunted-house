// Feature: replay-and-submission, Property 3: Playback command sequences converge without spontaneous progress
//
// For all finite Replay_Model values and Replay_Command sequences, play or
// resume changes no projection before a current-generation step, pause prevents
// every later timer step from changing Cursor until a new play/resume command,
// speed accepts exactly `0.5`, `1`, or `2` without changing projection,
// stale-generation steps are no-ops, and every sequence constrained to end at
// the final Cursor yields the same full Replay_Projection regardless of
// intermediate pauses, valid speed changes, restarts, or seeks.
//
// **Validates: Requirements 2.2, 2.4, 2.5, 2.10**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { canonicalRecordsArb } from '../test/replay-arbitraries'
import { deepFreeze } from '../test/seance-arbitraries'
import {
  initialReplayState,
  nextDelayMs,
  reduceReplayCommand,
  type PlaybackStatus,
  type ReplayCommand,
  type ReplaySpeed,
} from './replay-reducer'
import { buildReplayModel, foldReplay, selectCanonical, type ReplayProjection } from './replay-timeline'

const RUNS = 200
// Each run folds many prefixes; the whole suite may run beside it.
const TIMEOUT_MS = 60_000

/** A command as generated: steps and seeks are resolved against the state when they are applied. */
type Action =
  | { readonly kind: 'play' | 'pause' | 'resume' | 'restart' | 'current_step' }
  | { readonly kind: 'stale_step'; readonly offset: number }
  | { readonly kind: 'set_speed'; readonly speed: number }
  | { readonly kind: 'seek'; readonly at: number }
  | { readonly kind: 'bad_seek'; readonly cursor: number }

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom<Action>({ kind: 'play' }, { kind: 'pause' }, { kind: 'resume' }) },
  { weight: 6, arbitrary: fc.constant<Action>({ kind: 'current_step' }) },
  { weight: 2, arbitrary: fc.integer({ min: -3, max: 3 }).filter((offset) => offset !== 0).map((offset): Action => ({ kind: 'stale_step', offset })) },
  { weight: 2, arbitrary: fc.constantFrom(0.5, 1, 2).map((speed): Action => ({ kind: 'set_speed', speed })) },
  { weight: 1, arbitrary: fc.constantFrom(0, -1, 0.25, 1.5, 4, Number.NaN, Number.POSITIVE_INFINITY).map((speed): Action => ({ kind: 'set_speed', speed })) },
  { weight: 2, arbitrary: fc.nat().map((at): Action => ({ kind: 'seek', at })) },
  { weight: 1, arbitrary: fc.constantFrom(-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER).map((cursor): Action => ({ kind: 'bad_seek', cursor })) },
  { weight: 1, arbitrary: fc.constant<Action>({ kind: 'restart' }) },
)

const scenarioArb = fc.record({
  // Short logs: the table is checked after every command, so each run folds many prefixes.
  records: canonicalRecordsArb({ maxSynthetic: 8, maxReal: 14 }),
  actions: fc.array(actionArb, { maxLength: 40 }),
  // How a sequence is brought to the final Cursor: one seek, or playing to the end.
  finishBySeek: fc.boolean(),
})

/** The table model: three values and the rules of Requirement 2. */
interface Reference {
  status: PlaybackStatus
  cursor: number
  speed: ReplaySpeed
}

describe('Property 3: Playback command sequences converge without spontaneous progress', () => {
  it('follows the playback table and always ends at the full projection', () => {
    fc.assert(
      fc.property(scenarioArb, ({ records, actions, finishBySeek }) => {
        const model = deepFreeze(buildReplayModel(selectCanonical(records)))
        const total = model.records.length
        const folded = new Map<number, ReplayProjection>()
        const prefix = (cursor: number): ReplayProjection => {
          if (!folded.has(cursor)) folded.set(cursor, foldReplay(model.records.slice(0, cursor)))
          return folded.get(cursor)!
        }

        let state = initialReplayState(model, foldReplay)
        const reference: Reference = { status: 'paused', cursor: 0, speed: 1 }
        const send = (command: ReplayCommand) => {
          const before = state
          state = reduceReplayCommand(model, deepFreeze(state), command, foldReplay)
          return before
        }

        for (const action of actions) {
          const stepsBefore = state.cursor
          switch (action.kind) {
            case 'play':
            case 'resume': {
              const before = send({ kind: action.kind })
              if (reference.status !== 'playing') reference.status = reference.cursor < total ? 'playing' : 'complete'
              // Playing starts nothing by itself: same position, same projection object.
              expect(state.cursor).toBe(before.cursor)
              expect(state.projection).toBe(before.projection)
              break
            }
            case 'pause': {
              const before = send({ kind: 'pause' })
              if (reference.status === 'playing') reference.status = 'paused'
              expect(state.projection).toBe(before.projection)
              // The step that was pending when the pause arrived no longer applies.
              const late = reduceReplayCommand(model, state, { kind: 'step', generation: before.generation }, foldReplay)
              expect(late).toBe(state)
              break
            }
            case 'restart':
              send({ kind: 'restart' })
              reference.status = 'paused'
              reference.cursor = 0
              break
            case 'set_speed': {
              const before = send({ kind: 'set_speed', speed: action.speed })
              const valid = action.speed === 0.5 || action.speed === 1 || action.speed === 2
              if (valid) reference.speed = action.speed as ReplaySpeed
              expect(state.commandError?.code ?? null).toBe(valid ? null : 'invalid_speed')
              expect(state.projection).toBe(before.projection)
              expect(state.cursor).toBe(before.cursor)
              break
            }
            case 'seek': {
              const cursor = action.at % (total + 1)
              send({ kind: 'seek', cursor })
              reference.cursor = cursor
              reference.status = cursor === total ? 'complete' : reference.status === 'playing' ? 'playing' : 'paused'
              break
            }
            case 'bad_seek': {
              if (Number.isInteger(action.cursor) && action.cursor >= 0 && action.cursor <= total) break
              const before = send({ kind: 'seek', cursor: action.cursor })
              expect(state).toEqual({ ...before, commandError: state.commandError })
              expect(state.commandError?.code).toBe('invalid_cursor')
              break
            }
            case 'stale_step': {
              const before = send({ kind: 'step', generation: state.generation + action.offset })
              expect(state).toBe(before)
              break
            }
            case 'current_step': {
              const before = send({ kind: 'step', generation: state.generation })
              if (reference.status === 'playing') {
                reference.cursor += 1
                if (reference.cursor === total) reference.status = 'complete'
                // The callback that just ran can never run again.
                expect(reduceReplayCommand(model, state, { kind: 'step', generation: before.generation }, foldReplay)).toBe(state)
              } else {
                // Paused or complete: a timer step changes nothing until a new play or resume.
                expect(state).toBe(before)
              }
              break
            }
          }

          expect({ status: state.status, cursor: state.cursor, speed: state.speed }).toEqual(reference)
          expect(state.projection).toEqual(prefix(state.cursor))
          expect(Math.abs(state.cursor - stepsBefore) <= 1 || action.kind === 'seek' || action.kind === 'restart').toBe(true)
          const delay = nextDelayMs(model, state)
          expect(delay === null).toBe(state.status !== 'playing')
        }

        // Whatever came before, reaching the final Cursor gives the one full projection.
        if (finishBySeek) {
          send({ kind: 'seek', cursor: total })
        } else {
          send({ kind: 'play' })
          for (let guard = 0; guard <= total && state.status === 'playing'; guard += 1) {
            send({ kind: 'step', generation: state.generation })
          }
        }
        expect(state.cursor).toBe(total)
        expect(state.status).toBe('complete')
        expect(state.projection).toEqual(foldReplay(model.records))
      }),
      { numRuns: RUNS },
    )
  }, TIMEOUT_MS)
})
