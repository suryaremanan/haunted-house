// The Replay Controller (replay-and-submission task 3.3; Requirements 2.2 to
// 2.5, 2.8, 2.10, 3.6, 3.7): the browser effects around the pure Replay Engine.
//
// It holds the ReplayState, hands every command to `reduceReplayCommand`, and
// keeps at most one pending timeout: the next step, `nextDelayMs` away. Every
// transition that makes that timeout wrong (pause, seek, speed, restart, a
// step, a new model, unmount) cancels it; a callback that fires anyway names
// an old generation and the reducer ignores it.
//
// It does nothing else. No announcement, toast, badge, sound, storage or
// request: playback progress is ambient, and no preference outlives the page.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  initialReplayState,
  nextDelayMs,
  reduceReplayCommand,
  type ReplayCommand,
  type ReplayState,
} from '../core/replay-reducer'
import type { ReplayFold, ReplayModel, ReplayProjection } from '../core/replay-timeline'

export interface ReplayScheduler {
  /** Calls `step` once after `delayMs`. Returns the cancel function. `generation` names the state it was timed for. */
  schedule(delayMs: number, generation: number, step: () => void): () => void
}

/** One `setTimeout` per scheduled step. */
export const TIMEOUT_SCHEDULER: ReplayScheduler = {
  schedule(delayMs, _generation, step) {
    const handle = setTimeout(step, delayMs)
    return () => clearTimeout(handle)
  },
}

export interface ReplayController<P = ReplayProjection> {
  readonly model: ReplayModel
  readonly state: ReplayState<P>
  /** Applies one command through the pure reducer. Stable across renders. */
  readonly command: (command: ReplayCommand) => void
}

interface Held<P> {
  readonly model: ReplayModel
  readonly fold: ReplayFold<P>
  readonly state: ReplayState<P>
}

/** True when `next` starts with every record of `previous`, in the same order. */
function extendsModel(previous: ReplayModel, next: ReplayModel): boolean {
  return (
    previous.records.length <= next.records.length &&
    previous.records.every((record, index) => record.record_id === next.records[index].record_id)
  )
}

/**
 * The state for a new model. A log that only grew (a live Mansion read again)
 * keeps its Cursor and speed, paused; any other log starts over, paused at
 * Cursor zero. Either way the generation moves on, so no earlier callback applies.
 */
export function rebaseReplayState<P>(
  previous: { readonly model: ReplayModel; readonly state: ReplayState<P> },
  model: ReplayModel,
  fold: ReplayFold<P>,
): ReplayState<P> {
  const generation = previous.state.generation + 1
  const fresh = initialReplayState(model, fold)
  if (previous.state.cursor === 0 || !extendsModel(previous.model, model)) return { ...fresh, generation }
  const cursor = previous.state.cursor
  try {
    return {
      status: cursor === model.records.length && previous.state.status === 'complete' ? 'complete' : 'paused',
      cursor,
      speed: previous.state.speed,
      generation,
      projection: fold(model.records.slice(0, cursor)),
      commandError: null,
    }
  } catch {
    return { ...fresh, generation }
  }
}

/**
 * Playback of one Replay Model. Starts paused at Cursor zero and never starts
 * by itself. `model` and `fold` must be stable while the log is the same.
 */
export function useReplayController<P = ReplayProjection>(
  model: ReplayModel,
  fold: ReplayFold<P>,
  scheduler: ReplayScheduler = TIMEOUT_SCHEDULER,
): ReplayController<P> {
  const [held, setHeld] = useState<Held<P>>(() => ({ model, fold, state: initialReplayState(model, fold) }))
  let current = held
  if (held.model !== model || held.fold !== fold) {
    // A new log: adopt it during this render, so no frame shows the old state on the new model.
    current = { model, fold, state: rebaseReplayState(held, model, fold) }
    setHeld(current)
  }

  const command = useCallback((next: ReplayCommand) => {
    setHeld((before) => {
      const state = reduceReplayCommand(before.model, before.state, next, before.fold)
      return state === before.state ? before : { ...before, state }
    })
  }, [])

  const schedulerRef = useRef(scheduler)
  schedulerRef.current = scheduler
  const { state } = current
  const heldModel = current.model
  useEffect(() => {
    const delay = nextDelayMs(heldModel, state)
    if (delay === null) return undefined
    const generation = state.generation
    // The cleanup runs before the next schedule and on unmount: one timeout at most.
    return schedulerRef.current.schedule(delay, generation, () => command({ kind: 'step', generation }))
    // `generation` changes with every transition that re-times or cancels the step.
  }, [heldModel, state.generation, state.status, command])

  return { model: current.model, state, command }
}
