// Replay command reducer examples and boundaries (replay-and-submission task 2.7).
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9**
import { describe, expect, it } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import { deepFreeze } from '../test/seance-arbitraries'
import {
  REPLAY_COMMAND_ERROR_TEXT,
  REPLAY_SPEEDS,
  cursorText,
  initialReplayState,
  isReplaySpeed,
  isValidCursor,
  nextDelayMs,
  reduceReplayCommand,
  type ReplayCommand,
  type ReplayState,
} from './replay-reducer'
import {
  buildReplayModel,
  foldReplay,
  parseCanonicalLog,
  replayFoldFor,
  type ReplayFold,
  type ReplayModel,
  type ReplayProjection,
} from './replay-timeline'

const MODEL = deepFreeze(buildReplayModel(parseCanonicalLog(demo)))
const TOTAL = MODEL.records.length
const FOLD = replayFoldFor(MODEL)
const EMPTY = buildReplayModel(parseCanonicalLog(''))

function run(
  commands: readonly ReplayCommand[],
  model: ReplayModel = MODEL,
  fold: ReplayFold = FOLD,
  from: ReplayState = initialReplayState(model, fold),
): ReplayState {
  return commands.reduce((state, command) => reduceReplayCommand(model, deepFreeze(state), command, fold), from)
}

const prefix = (cursor: number): ReplayProjection => foldReplay(MODEL.records.slice(0, cursor))

describe('initial state', () => {
  it('is paused at the start at speed 1 with the empty projection', () => {
    expect(initialReplayState(MODEL, FOLD)).toEqual({
      status: 'paused',
      cursor: 0,
      speed: 1,
      generation: 0,
      projection: prefix(0),
      commandError: null,
    })
    expect(nextDelayMs(MODEL, initialReplayState(MODEL, FOLD))).toBeNull()
  })

  it('is paused with an empty projection for an empty log', () => {
    const state = initialReplayState(EMPTY, FOLD)
    expect(state).toMatchObject({ status: 'paused', cursor: 0, speed: 1 })
    expect(state.projection).toMatchObject({ ghosts: [], workflows: [], validRecordCount: 0 })
  })
})

describe('play, pause and resume', () => {
  it('enters playing without changing Cursor or projection', () => {
    const initial = initialReplayState(MODEL, FOLD)
    const playing = run([{ kind: 'play' }], MODEL, FOLD, initial)
    expect(playing).toMatchObject({ status: 'playing', cursor: 0, generation: 1, commandError: null })
    expect(playing.projection).toBe(initial.projection)
  })

  it('advances exactly one record for each current step', () => {
    let state = run([{ kind: 'play' }])
    for (let cursor = 1; cursor <= 3; cursor += 1) {
      state = run([{ kind: 'step', generation: state.generation }], MODEL, FOLD, state)
      expect(state.cursor).toBe(cursor)
      expect(state.projection).toEqual(prefix(cursor))
      expect(state.status).toBe('playing')
    }
  })

  it('ignores a step when paused, stale, repeated or from the future', () => {
    const paused = initialReplayState(MODEL, FOLD)
    expect(run([{ kind: 'step', generation: 0 }], MODEL, FOLD, paused)).toBe(paused)

    const playing = run([{ kind: 'play' }])
    for (const generation of [0, 2, -1, 1.5, Number.NaN]) {
      expect(reduceReplayCommand(MODEL, playing, { kind: 'step', generation }, FOLD)).toBe(playing)
    }
    const stepped = reduceReplayCommand(MODEL, playing, { kind: 'step', generation: 1 }, FOLD)
    // The same callback firing twice advances once.
    expect(reduceReplayCommand(MODEL, stepped, { kind: 'step', generation: 1 }, FOLD)).toBe(stepped)
  })

  it('holds Cursor and projection while paused', () => {
    const playing = run([{ kind: 'play' }, { kind: 'step', generation: 1 }])
    const paused = run([{ kind: 'pause' }], MODEL, FOLD, playing)
    expect(paused).toMatchObject({ status: 'paused', cursor: 1 })
    expect(paused.projection).toBe(playing.projection)
    expect(paused.generation).toBeGreaterThan(playing.generation)
    // The step scheduled before the pause arrives late and does nothing.
    expect(reduceReplayCommand(MODEL, paused, { kind: 'step', generation: playing.generation }, FOLD)).toBe(paused)
    expect(reduceReplayCommand(MODEL, paused, { kind: 'pause' }, FOLD)).toBe(paused)

    const resumed = run([{ kind: 'resume' }], MODEL, FOLD, paused)
    expect(resumed).toMatchObject({ status: 'playing', cursor: 1 })
    expect(resumed.projection).toBe(paused.projection)
    expect(run([{ kind: 'play' }], MODEL, FOLD, resumed)).toBe(resumed)
  })

  it('completes at the last record with the full fold', () => {
    let state = run([{ kind: 'seek', cursor: TOTAL - 1 }, { kind: 'play' }])
    expect(state.status).toBe('playing')
    state = run([{ kind: 'step', generation: state.generation }], MODEL, FOLD, state)
    expect(state).toMatchObject({ status: 'complete', cursor: TOTAL })
    expect(state.projection).toEqual(prefix(TOTAL))
    expect(nextDelayMs(MODEL, state)).toBeNull()
    expect(run([{ kind: 'step', generation: state.generation }], MODEL, FOLD, state)).toBe(state)
    expect(run([{ kind: 'play' }], MODEL, FOLD, state)).toBe(state)
    expect(run([{ kind: 'pause' }], MODEL, FOLD, state)).toBe(state)
  })

  it('completes an empty replay on play instead of playing nothing', () => {
    const state = run([{ kind: 'play' }], EMPTY)
    expect(state).toMatchObject({ status: 'complete', cursor: 0, commandError: null })
    expect(nextDelayMs(EMPTY, state)).toBeNull()
    expect(run([{ kind: 'restart' }], EMPTY, FOLD, state)).toMatchObject({ status: 'paused', cursor: 0 })
  })
})

describe('speed', () => {
  it('accepts exactly 0.5, 1 and 2 and keeps the projection', () => {
    expect(REPLAY_SPEEDS).toEqual([0.5, 1, 2])
    const start = run([{ kind: 'seek', cursor: 7 }])
    for (const speed of REPLAY_SPEEDS) {
      const state = run([{ kind: 'set_speed', speed }], MODEL, FOLD, start)
      expect(state).toMatchObject({ speed, cursor: 7, status: 'paused', commandError: null })
      expect(state.projection).toBe(start.projection)
    }
  })

  it('refuses any other speed and keeps the state', () => {
    const start = run([{ kind: 'seek', cursor: 7 }, { kind: 'set_speed', speed: 2 }])
    for (const speed of [0, -1, 0.25, 1.5, 3, Number.NaN, Number.POSITIVE_INFINITY, '2' as unknown as number]) {
      expect(isReplaySpeed(speed)).toBe(false)
      const state = run([{ kind: 'set_speed', speed }], MODEL, FOLD, start)
      expect(state).toEqual({
        ...start,
        commandError: { code: 'invalid_speed', safeDetail: REPLAY_COMMAND_ERROR_TEXT.invalid_speed },
      })
      expect(state.projection).toBe(start.projection)
    }
  })

  it('scales the next delay and reschedules only while playing', () => {
    const playing = run([{ kind: 'seek', cursor: 1 }, { kind: 'play' }])
    const gap = MODEL.timeline[1].presentationOffsetMs - MODEL.timeline[0].presentationOffsetMs
    expect(gap).toBeGreaterThanOrEqual(250)
    expect(nextDelayMs(MODEL, playing)).toBe(gap)

    const fast = run([{ kind: 'set_speed', speed: 2 }], MODEL, FOLD, playing)
    expect(nextDelayMs(MODEL, fast)).toBe(gap / 2)
    expect(fast.generation).toBe(playing.generation + 1)
    expect(reduceReplayCommand(MODEL, fast, { kind: 'step', generation: playing.generation }, FOLD)).toBe(fast)

    const slow = run([{ kind: 'set_speed', speed: 0.5 }], MODEL, FOLD, fast)
    expect(nextDelayMs(MODEL, slow)).toBe(gap * 2)
    expect(run([{ kind: 'set_speed', speed: 0.5 }], MODEL, FOLD, slow)).toBe(slow)

    const paused = run([{ kind: 'pause' }], MODEL, FOLD, slow)
    expect(run([{ kind: 'set_speed', speed: 1 }], MODEL, FOLD, paused).generation).toBe(paused.generation)
    expect(nextDelayMs(MODEL, paused)).toBeNull()
  })

  it('presents the first record at once and every later one after 250 to 4,000 ms at speed 1', () => {
    let state = run([{ kind: 'play' }])
    expect(nextDelayMs(MODEL, state)).toBe(0)
    for (let cursor = 1; cursor < TOTAL; cursor += 1) {
      state = run([{ kind: 'step', generation: state.generation }], MODEL, FOLD, state)
      const delay = nextDelayMs(MODEL, state)!
      expect(delay).toBeGreaterThanOrEqual(250)
      expect(delay).toBeLessThanOrEqual(4_000)
    }
  })
})

describe('seek and restart', () => {
  it('seeks to the start, the middle and the end', () => {
    const middle = Math.floor(TOTAL / 2)
    expect(run([{ kind: 'seek', cursor: middle }])).toMatchObject({ status: 'paused', cursor: middle })
    expect(run([{ kind: 'seek', cursor: middle }]).projection).toEqual(prefix(middle))
    expect(run([{ kind: 'seek', cursor: TOTAL }])).toMatchObject({ status: 'complete', cursor: TOTAL })
    expect(run([{ kind: 'seek', cursor: TOTAL }]).projection).toEqual(prefix(TOTAL))
    expect(run([{ kind: 'seek', cursor: TOTAL }, { kind: 'seek', cursor: 0 }])).toMatchObject({
      status: 'paused',
      cursor: 0,
      projection: prefix(0),
    })
  })

  it('keeps playing through a seek unless it lands on the end', () => {
    const playing = run([{ kind: 'play' }, { kind: 'seek', cursor: 5 }])
    expect(playing).toMatchObject({ status: 'playing', cursor: 5, generation: 2 })
    // The step scheduled before the seek is stale.
    expect(reduceReplayCommand(MODEL, playing, { kind: 'step', generation: 1 }, FOLD)).toBe(playing)
    expect(run([{ kind: 'seek', cursor: TOTAL }], MODEL, FOLD, playing).status).toBe('complete')
  })

  it('pauses when seeking back from complete', () => {
    expect(run([{ kind: 'seek', cursor: TOTAL }, { kind: 'seek', cursor: TOTAL - 1 }])).toMatchObject({
      status: 'paused',
      cursor: TOTAL - 1,
    })
  })

  it('refuses a Cursor that is not an integer from 0 to the record count', () => {
    const start = run([{ kind: 'play' }, { kind: 'seek', cursor: 4 }])
    for (const cursor of [-1, TOTAL + 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, -0.1, '3' as unknown as number]) {
      expect(isValidCursor(MODEL, cursor)).toBe(false)
      const state = run([{ kind: 'seek', cursor }], MODEL, FOLD, start)
      expect(state).toEqual({
        ...start,
        commandError: { code: 'invalid_cursor', safeDetail: REPLAY_COMMAND_ERROR_TEXT.invalid_cursor },
      })
      expect(state.projection).toBe(start.projection)
    }
    // The next accepted command clears the refusal.
    const refused = run([{ kind: 'seek', cursor: -1 }], MODEL, FOLD, start)
    expect(run([{ kind: 'pause' }], MODEL, FOLD, refused).commandError).toBeNull()
    expect(run([{ kind: 'play' }], MODEL, FOLD, refused)).toEqual(start)
  })

  it('restarts to paused Cursor zero, twice with the same result', () => {
    const far = run([{ kind: 'play' }, { kind: 'seek', cursor: 9 }, { kind: 'set_speed', speed: 2 }])
    const once = run([{ kind: 'restart' }], MODEL, FOLD, far)
    expect(once).toMatchObject({ status: 'paused', cursor: 0, speed: 2, commandError: null })
    expect(once.projection).toEqual(prefix(0))
    expect(run([{ kind: 'restart' }], MODEL, FOLD, once)).toBe(once)
    expect(reduceReplayCommand(MODEL, once, { kind: 'step', generation: far.generation }, FOLD)).toBe(once)
    expect(run([{ kind: 'restart' }], MODEL, FOLD, run([{ kind: 'seek', cursor: TOTAL }]))).toMatchObject({
      status: 'paused',
      cursor: 0,
    })
  })

  it('moves one event with previous and next as seeks', () => {
    const at = run([{ kind: 'seek', cursor: 3 }])
    expect(run([{ kind: 'seek', cursor: at.cursor + 1 }], MODEL, FOLD, at).cursor).toBe(4)
    expect(run([{ kind: 'seek', cursor: at.cursor - 1 }], MODEL, FOLD, at).cursor).toBe(2)
    expect(run([{ kind: 'seek', cursor: -1 }]).commandError?.code).toBe('invalid_cursor')
  })
})

describe('failures and unknown commands', () => {
  it('keeps the last valid state and pauses when the fold throws', () => {
    const failing: ReplayFold = (records) => {
      if (records.length === 3) throw new Error('PLANTED fold failure /Users/someone')
      return FOLD(records)
    }
    const playing = run([{ kind: 'seek', cursor: 2 }, { kind: 'play' }], MODEL, failing)
    const failed = reduceReplayCommand(MODEL, playing, { kind: 'step', generation: playing.generation }, failing)
    expect(failed).toMatchObject({ status: 'paused', cursor: 2 })
    expect(failed.projection).toBe(playing.projection)
    expect(failed.generation).toBeGreaterThan(playing.generation)
    expect(failed.commandError).toEqual({
      code: 'contract_unavailable',
      safeDetail: REPLAY_COMMAND_ERROR_TEXT.contract_unavailable,
    })
    expect(JSON.stringify(failed)).not.toContain('PLANTED')
    // Restart stays valid, and positions that fold are still reachable.
    expect(run([{ kind: 'restart' }], MODEL, failing, failed)).toMatchObject({ cursor: 0, commandError: null })
    expect(run([{ kind: 'seek', cursor: 4 }], MODEL, failing, failed)).toMatchObject({ cursor: 4, commandError: null })
    expect(run([{ kind: 'seek', cursor: 3 }], MODEL, failing, failed)).toMatchObject({ cursor: 2, status: 'paused' })
  })

  it('refuses a command it does not know and changes nothing else', () => {
    const start = run([{ kind: 'seek', cursor: 2 }])
    for (const command of [{ kind: 'approve' }, { kind: 'toString' }, {}] as unknown as ReplayCommand[]) {
      expect(run([command], MODEL, FOLD, start)).toEqual({
        ...start,
        commandError: { code: 'invalid_command', safeDetail: REPLAY_COMMAND_ERROR_TEXT.invalid_command },
      })
    }
  })
})

describe('cursor text', () => {
  it('names the start and each event position', () => {
    expect(cursorText(MODEL, 0)).toBe('Start of replay')
    expect(cursorText(MODEL, 1)).toBe(`Event 1 of ${TOTAL}`)
    expect(cursorText(MODEL, TOTAL)).toBe(`Event ${TOTAL} of ${TOTAL}`)
    expect(cursorText(EMPTY, 0)).toBe('Start of replay')
  })
})
