// Pure replay command reducer (replay-and-submission task 2.2; Requirements
// 2.1 to 2.11).
//
// Cursor `n` is a prefix length: the projection of a state is always the
// supplied fold of `model.records.slice(0, n)`, recomputed on every Cursor
// change. The reducer keeps no incremental domain state and can approve,
// start, retry or mutate nothing.
//
// `generation` invalidates scheduled steps. Every transition that makes a
// pending timer wrong (play, pause, seek, speed change while playing, restart,
// a step itself, a failure) increases it, and a step that names any other
// generation is a no-op. One scheduled callback therefore advances the Cursor
// at most once, and never after it was superseded.
//
// No React, DOM, SDK, timer, network, filesystem or clock. Inputs are never
// mutated; a command that changes nothing returns the same state object.

import type { ReplayFold, ReplayModel, ReplayProjection } from './replay-timeline'

export const REPLAY_SPEEDS = [0.5, 1, 2] as const
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number]
export const DEFAULT_REPLAY_SPEED: ReplaySpeed = 1

export type PlaybackStatus = 'paused' | 'playing' | 'complete'

export type ReplayCommandErrorCode = 'invalid_cursor' | 'invalid_speed' | 'invalid_command' | 'contract_unavailable'

/** A refused command or a failed fold, as fixed code and copy. */
export interface ReplayCommandError {
  readonly code: ReplayCommandErrorCode
  readonly safeDetail: string
}

export const REPLAY_COMMAND_ERROR_TEXT: Readonly<Record<ReplayCommandErrorCode, string>> = {
  invalid_cursor: 'That position is not an event of this replay.',
  invalid_speed: 'Playback speed must be 0.5×, 1× or 2×.',
  invalid_command: 'That replay command is not supported.',
  contract_unavailable: 'The replay could not show that position. The last valid state is kept.',
}

export interface ReplayState<P = ReplayProjection> {
  readonly status: PlaybackStatus
  /** Number of records in the current prefix: 0 to `model.records.length`. */
  readonly cursor: number
  readonly speed: ReplaySpeed
  /** Scheduling epoch. A step applies only when it names this value. */
  readonly generation: number
  /** The fold of `model.records.slice(0, cursor)`. */
  readonly projection: P
  /** The refusal of the last command, or null when it was accepted. */
  readonly commandError: ReplayCommandError | null
}

export type ReplayCommand =
  | { readonly kind: 'play' | 'pause' | 'resume' | 'restart' }
  | { readonly kind: 'set_speed'; readonly speed: number }
  | { readonly kind: 'seek'; readonly cursor: number }
  | { readonly kind: 'step'; readonly generation: number }

export function isReplaySpeed(value: unknown): value is ReplaySpeed {
  return (REPLAY_SPEEDS as readonly unknown[]).includes(value)
}

/** True for an integer from zero through the selected record count. */
export function isValidCursor(model: Pick<ReplayModel, 'records'>, cursor: unknown): cursor is number {
  return typeof cursor === 'number' && Number.isInteger(cursor) && cursor >= 0 && cursor <= model.records.length
}

function commandError(code: ReplayCommandErrorCode): ReplayCommandError {
  return { code, safeDetail: REPLAY_COMMAND_ERROR_TEXT[code] }
}

/** Paused at Cursor zero, speed 1: a loaded replay never starts by itself. */
export function initialReplayState<P>(model: ReplayModel, fold: ReplayFold<P>): ReplayState<P> {
  return {
    status: 'paused',
    cursor: 0,
    speed: DEFAULT_REPLAY_SPEED,
    generation: 0,
    projection: fold(model.records.slice(0, 0)),
    commandError: null,
  }
}

/** Keeps Cursor, status and projection; records why the command was refused. */
function refuse<P>(state: ReplayState<P>, code: ReplayCommandErrorCode): ReplayState<P> {
  return state.commandError?.code === code ? state : { ...state, commandError: commandError(code) }
}

/** The same state with any earlier refusal cleared. */
function accepted<P>(state: ReplayState<P>): ReplayState<P> {
  return state.commandError === null ? state : { ...state, commandError: null }
}

/**
 * Moves to `cursor` by folding its prefix afresh. If the fold throws, the last
 * valid Cursor and projection are kept, playback pauses and pending steps are
 * invalidated.
 */
function moveTo<P>(
  model: ReplayModel,
  state: ReplayState<P>,
  cursor: number,
  status: PlaybackStatus,
  fold: ReplayFold<P>,
): ReplayState<P> {
  let projection: P
  try {
    projection = fold(model.records.slice(0, cursor))
  } catch {
    return {
      ...state,
      status: state.status === 'playing' ? 'paused' : state.status,
      generation: state.generation + 1,
      commandError: commandError('contract_unavailable'),
    }
  }
  return { ...state, status, cursor, projection, generation: state.generation + 1, commandError: null }
}

/**
 * Applies one command. Total: every input returns a valid state, and an
 * invalid command changes nothing but `commandError`.
 */
export function reduceReplayCommand<P>(
  model: ReplayModel,
  state: ReplayState<P>,
  command: ReplayCommand,
  fold: ReplayFold<P>,
): ReplayState<P> {
  const total = model.records.length
  switch (command.kind) {
    case 'play':
    case 'resume':
      if (state.status === 'playing') return accepted(state)
      // Nothing is left to play: an empty or finished replay is complete.
      if (state.cursor >= total) {
        return state.status === 'complete' ? accepted(state) : { ...state, status: 'complete', commandError: null }
      }
      return { ...state, status: 'playing', generation: state.generation + 1, commandError: null }

    case 'pause':
      if (state.status !== 'playing') return accepted(state)
      return { ...state, status: 'paused', generation: state.generation + 1, commandError: null }

    case 'restart':
      if (state.status === 'paused' && state.cursor === 0) return accepted(state)
      return moveTo(model, state, 0, 'paused', fold)

    case 'set_speed':
      if (!isReplaySpeed(command.speed)) return refuse(state, 'invalid_speed')
      if (command.speed === state.speed) return accepted(state)
      return {
        ...state,
        speed: command.speed,
        // A pending step was timed at the old speed.
        generation: state.status === 'playing' ? state.generation + 1 : state.generation,
        commandError: null,
      }

    case 'seek': {
      if (!isValidCursor(model, command.cursor)) return refuse(state, 'invalid_cursor')
      const status: PlaybackStatus =
        command.cursor === total ? 'complete' : state.status === 'playing' ? 'playing' : 'paused'
      return moveTo(model, state, command.cursor, status, fold)
    }

    case 'step': {
      // A step is a timer callback, not a user command: when it is stale it changes nothing at all.
      if (state.status !== 'playing' || command.generation !== state.generation || state.cursor >= total) return state
      const cursor = state.cursor + 1
      return moveTo(model, state, cursor, cursor === total ? 'complete' : 'playing', fold)
    }

    default:
      return refuse(state, 'invalid_command')
  }
}

/**
 * The wait before the next step, in milliseconds, or null when nothing is
 * scheduled. It is the gap between the adjacent Presentation_Times divided by
 * the speed; the first record of a replay follows the start at once.
 */
export function nextDelayMs<P>(model: ReplayModel, state: ReplayState<P>): number | null {
  if (state.status !== 'playing' || state.cursor >= model.timeline.length) return null
  const next = model.timeline[state.cursor].presentationOffsetMs
  const previous = state.cursor === 0 ? 0 : model.timeline[state.cursor - 1].presentationOffsetMs
  return Math.max(next - previous, 0) / state.speed
}

/** `Event n of N`, or `Start of replay` at Cursor zero: the seek control's value text. */
export function cursorText(model: Pick<ReplayModel, 'records'>, cursor: number): string {
  return cursor <= 0 ? 'Start of replay' : `Event ${cursor} of ${model.records.length}`
}
