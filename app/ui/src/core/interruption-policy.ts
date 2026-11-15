// The Interruption Policy of the house (Spec 6, Requirements 4.5 to 4.7, 8.1
// to 8.6, 8.11; steering "Interruption budget"). A pure state machine that
// decides which canonical ghost transitions may interrupt the Operator and
// merges a burst of them into one bounded summary. That one summary feeds both
// the host toast and the page's one polite live region, so the two can never
// say different things.
//
// Rules:
// 1. Only a state change INTO waiting, blocked or failed is eligible. Entering
//    idle, working or done, a transition that leaves the state as it was, and
//    routine activity (progress, streaming text, tool calls) are rejected and
//    change nothing at all: their ids are not even remembered.
// 2. An eligible event id is remembered once accepted. The same id offered
//    again during the mounted session is ignored (reconnects, redelivery).
// 3. Trailing window. A burst opens at its first accepted event and accepts
//    another eligible event observed LESS than 10,000 ms after its latest
//    accepted event. Boundary: a gap of exactly 10,000 ms or more closes the
//    burst, the same test `flushInterruption` uses
//    (`nowMs - lastAcceptedAtMs >= 10_000`). So a burst that may be flushed
//    never grows, and reduce and flush cannot disagree about one instant.
// 4. An eligible event arriving once the burst is closable emits the old
//    burst's summary and opens a new burst with that event.
// 5. `flushInterruption` emits a burst's summary exactly once and clears it.
//    Flushing early, or with no burst, emits nothing.
// 6. Time never runs backwards inside a burst: an observation older than the
//    burst's latest accepted event counts as made at that event's time.
//
// The adapter owns the clock and one timer (`nextInterruptionFlushAtMs`).
// Nothing here reads a clock, starts a timer, calls a host hook, or touches
// the DOM. The input types carry no tool input, artifact content, path or
// model text, so none can reach a summary; sound is not part of this module.

import type { GhostState, GhostTransition } from './ghost-state'
import { HOUSE_OPERATOR_GHOST_ID, INTERRUPTING_STATES } from './ghost-status'
import { roomOrder, type RoomId } from './house-registry'

/** The states a ghost may interrupt for. The one list of them in the UI. */
export const INTERRUPT_STATES = ['waiting', 'blocked', 'failed'] as const
export type InterruptState = (typeof INTERRUPT_STATES)[number]

/** Length of the trailing burst window. The one place the 10 seconds are written. */
export const INTERRUPTION_BURST_MS = 10_000

/** No summary is longer than this many Unicode code points. */
export const MAX_SUMMARY_CODE_POINTS = 240

/** A ghost name in a summary is cut to this many code points. */
export const MAX_SUMMARY_NAME_CODE_POINTS = 60

export function isInterruptState(state: GhostState | string): state is InterruptState {
  return (INTERRUPT_STATES as readonly string[]).includes(state)
}

/** One canonical fact offered to the policy. */
export type CanonicalGhostTransition =
  | {
      readonly kind: 'transition'
      /** Canonical id of the transition. The same id is never accepted twice. */
      readonly eventId: string
      readonly ghostId: string
      readonly ghostName: string
      readonly roomId: RoomId
      readonly fromState: GhostState
      readonly toState: GhostState
      /** When the page observed it. Injected; this module reads no clock. */
      readonly observedAtMs: number
    }
  | {
      /** Progress, streaming text or tool activity. Never interrupts. */
      readonly kind: 'routine'
      readonly eventId: string
      readonly observedAtMs: number
    }

export interface InterruptionEvent {
  readonly eventId: string
  readonly ghostId: string
  readonly ghostName: string
  readonly roomId: RoomId
  readonly state: InterruptState
  readonly observedAtMs: number
}

export interface InterruptionBurst {
  readonly openedAtMs: number
  readonly lastAcceptedAtMs: number
  /** Accepted events, oldest first. */
  readonly events: readonly InterruptionEvent[]
}

export interface InterruptionPolicyState {
  /** Ids accepted during the mounted session. Never persisted. */
  readonly seenEventIds: ReadonlySet<string>
  readonly burst: InterruptionBurst | null
}

export const EMPTY_INTERRUPTION_STATE: InterruptionPolicyState = { seenEventIds: new Set(), burst: null }

/** The one text a toast and the live region both show, with the event ids behind it. */
export interface HostSummary {
  readonly text: string
  readonly eventIds: readonly string[]
}

export type InterruptionEffect =
  | { readonly kind: 'none' }
  | { readonly kind: 'summary'; readonly text: string; readonly eventIds: readonly string[] }

export interface InterruptionStep {
  readonly state: InterruptionPolicyState
  /** Zero or one summary. Empty when nothing is to be shown. */
  readonly effects: readonly InterruptionEffect[]
}

const NO_EFFECTS: readonly InterruptionEffect[] = []

function codePoints(text: string): number {
  return Array.from(text).length
}

/** One bounded line: control characters and runs of whitespace become single spaces. */
function summaryName(name: string): string {
  const flat = name.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim()
  if (flat === '') return 'A ghost'
  const characters = Array.from(flat)
  if (characters.length <= MAX_SUMMARY_NAME_CODE_POINTS) return flat
  return `${characters.slice(0, MAX_SUMMARY_NAME_CODE_POINTS - 1).join('').trimEnd()}…`
}

const STATE_SENTENCE: Readonly<Record<InterruptState, (name: string) => string>> = {
  waiting: (name) => `${name} is waiting for your approval.`,
  blocked: (name) => `${name} is blocked.`,
  failed: (name) => `${name} failed.`,
}

/**
 * The summary of one burst: one sentence per ghost with its latest state,
 * ghosts in Room order and then in order of first appearance, followed by the
 * number of events when there was more than one. Text over 240 code points
 * becomes the fixed overflow sentence. `eventIds` holds every accepted id of
 * the burst once, in the order accepted.
 */
export function summarizeBurst(burst: InterruptionBurst): HostSummary {
  const latest = new Map<string, InterruptionEvent>()
  for (const event of burst.events) latest.set(event.ghostId, event)
  // A Map keeps first-insertion order, and the sort is stable: ties stay in order of first appearance.
  const ghosts = Array.from(latest.values()).sort((left, right) => roomOrder(left.roomId) - roomOrder(right.roomId))
  const sentences = ghosts.map((event) => STATE_SENTENCE[event.state](summaryName(event.ghostName)))
  if (burst.events.length > 1) sentences.push(`${burst.events.length} events.`)
  let text = sentences.join(' ')
  if (codePoints(text) > MAX_SUMMARY_CODE_POINTS) {
    text =
      ghosts.length === 1
        ? '1 ghost needs attention. Open Needs you for details.'
        : `${ghosts.length} ghosts need attention. Open Needs you for details.`
  }
  return { text, eventIds: burst.events.map((event) => event.eventId) }
}

function summaryEffect(burst: InterruptionBurst): InterruptionEffect {
  return { kind: 'summary', ...summarizeBurst(burst) }
}

/**
 * Offers one canonical fact. Rejected input returns the same state and no
 * effect. An accepted event joins the open burst, or closes a burst that has
 * run out (emitting its summary) and opens the next one.
 */
export function reduceInterruption(state: InterruptionPolicyState, event: CanonicalGhostTransition): InterruptionStep {
  if (event.kind !== 'transition') return { state, effects: NO_EFFECTS }
  if (event.fromState === event.toState) return { state, effects: NO_EFFECTS }
  if (!INTERRUPTING_STATES.has(event.toState) || !isInterruptState(event.toState)) return { state, effects: NO_EFFECTS }
  if (state.seenEventIds.has(event.eventId)) return { state, effects: NO_EFFECTS }

  const open = state.burst
  const atMs = open === null ? event.observedAtMs : Math.max(event.observedAtMs, open.lastAcceptedAtMs)
  const accepted: InterruptionEvent = {
    eventId: event.eventId,
    ghostId: event.ghostId,
    ghostName: event.ghostName,
    roomId: event.roomId,
    state: event.toState,
    observedAtMs: atMs,
  }
  const seenEventIds = new Set(state.seenEventIds).add(event.eventId)

  if (open !== null && atMs - open.lastAcceptedAtMs < INTERRUPTION_BURST_MS) {
    return {
      state: { seenEventIds, burst: { openedAtMs: open.openedAtMs, lastAcceptedAtMs: atMs, events: [...open.events, accepted] } },
      effects: NO_EFFECTS,
    }
  }
  return {
    state: { seenEventIds, burst: { openedAtMs: atMs, lastAcceptedAtMs: atMs, events: [accepted] } },
    effects: open === null ? NO_EFFECTS : [summaryEffect(open)],
  }
}

/** Closes the burst when its 10 seconds have passed at `nowMs`: one summary, once. */
export function flushInterruption(state: InterruptionPolicyState, nowMs: number): InterruptionStep {
  const open = state.burst
  if (open === null || nowMs - open.lastAcceptedAtMs < INTERRUPTION_BURST_MS) return { state, effects: NO_EFFECTS }
  return { state: { seenEventIds: state.seenEventIds, burst: null }, effects: [summaryEffect(open)] }
}

/** When the open burst may be flushed, or null with no burst. The adapter resets its one timer to this. */
export function nextInterruptionFlushAtMs(state: InterruptionPolicyState): number | null {
  return state.burst === null ? null : state.burst.lastAcceptedAtMs + INTERRUPTION_BURST_MS
}

export interface CanonicalTransitionOptions {
  /** The room the ghost lives in, or null when it has none. */
  readonly roomId: RoomId | null
  readonly ghostName: string
  readonly observedAtMs: number
}

/**
 * A Spec 2 Ghost_Transition as policy input; its `transition_id` is the event
 * id. Null for the house operator's own scope and for a ghost with no room:
 * neither is a ghost the Operator can be pointed to.
 */
export function canonicalTransitionOf(transition: GhostTransition, options: CanonicalTransitionOptions): CanonicalGhostTransition | null {
  if (transition.ghost_id === HOUSE_OPERATOR_GHOST_ID || options.roomId === null) return null
  return {
    kind: 'transition',
    eventId: transition.transition_id,
    ghostId: transition.ghost_id,
    ghostName: options.ghostName,
    roomId: options.roomId,
    fromState: transition.from_state,
    toState: transition.to_state,
    observedAtMs: options.observedAtMs,
  }
}
