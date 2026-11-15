// Pure replay presentation timing for a canonical Event_Log (Spec 2,
// Requirements 8.3, 8.6). It replaces the earlier `{t, frame}` player: replay
// no longer plays raw gateway frames to subscribers. The recording is the
// canonical App_Event log itself, parsed by core/seance-log.ts and folded by
// core/ghost-state.ts exactly as in live mode.
//
// Time decides only WHEN a record becomes visible. Which records are visible,
// and in what order, is always a prefix of Canonical_Order (Sequence, then
// Event_ID), never file arrival order. No SDK, React, network or clock: the
// caller supplies elapsed milliseconds.

import type { AppEvent } from './seance-event'

export interface PresentationOptions {
  /** Playback speed: 2 presents twice as fast as recorded. Default 1. */
  readonly speed?: number
  /** Longest wait between two records, in playback milliseconds. Default: no limit. */
  readonly maxGapMs?: number
}

function checkOptions({ speed = 1, maxGapMs = Number.POSITIVE_INFINITY }: PresentationOptions): {
  speed: number
  maxGapMs: number
} {
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new RangeError(`Replay speed must be a positive number, got ${speed}`)
  }
  if (Number.isNaN(maxGapMs) || maxGapMs < 0) {
    throw new RangeError(`Replay maxGapMs must be zero or more, got ${maxGapMs}`)
  }
  return { speed, maxGapMs }
}

/** Sequence order, with Event_ID as the tie-breaker for invalid external input. Does not mutate. */
export function inCanonicalOrder(events: readonly AppEvent[]): AppEvent[] {
  return [...events].sort(
    (left, right) =>
      left.sequence - right.sequence ||
      (left.event_id < right.event_id ? -1 : left.event_id > right.event_id ? 1 : 0),
  )
}

/**
 * The instant a record is presented at: when the fact occurred, or, for the
 * many Crew facts that carry no timestamp, when the writer persisted it.
 */
export function presentationTimeMs(event: AppEvent): number {
  return event.occurred_at_ms ?? event.persisted_at_ms
}

/**
 * When each record becomes visible, in milliseconds after playback starts.
 * `events` must be in Canonical_Order; the result is parallel to it and never
 * decreases, so a record stamped earlier than its predecessor appears together
 * with that predecessor rather than before it.
 */
export function presentationDelays(events: readonly AppEvent[], options: PresentationOptions = {}): number[] {
  const { speed, maxGapMs } = checkOptions(options)
  const delays: number[] = []
  let previousTime = events.length === 0 ? 0 : presentationTimeMs(events[0])
  let previousDelay = 0
  for (const event of events) {
    const time = presentationTimeMs(event)
    const gap = Math.min(Math.max(time - previousTime, 0) / speed, maxGapMs)
    previousDelay += gap
    previousTime = Math.max(previousTime, time)
    delays.push(previousDelay)
  }
  return delays
}

export interface ReplayTimeline {
  /** Every record of the recording in Canonical_Order. */
  readonly events: readonly AppEvent[]
  /** Parallel to `events`: when each becomes visible. */
  readonly delays: readonly number[]
  /** How many records are visible `elapsedMs` after playback started: always a prefix of `events`. */
  visibleCount(elapsedMs: number): number
  /** Milliseconds from `elapsedMs` until the next record becomes visible, or null when all are. */
  nextInMs(elapsedMs: number): number | null
}

/** Orders `events` canonically and schedules their presentation. */
export function createTimeline(events: readonly AppEvent[], options: PresentationOptions = {}): ReplayTimeline {
  const ordered = inCanonicalOrder(events)
  const delays = presentationDelays(ordered, options)

  function visibleCount(elapsedMs: number): number {
    // Binary search for the first delay greater than elapsedMs.
    let low = 0
    let high = delays.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (delays[middle] <= elapsedMs) low = middle + 1
      else high = middle
    }
    return low
  }

  return {
    events: ordered,
    delays,
    visibleCount,
    nextInMs(elapsedMs) {
      const count = visibleCount(elapsedMs)
      return count >= delays.length ? null : delays[count] - elapsedMs
    },
  }
}
