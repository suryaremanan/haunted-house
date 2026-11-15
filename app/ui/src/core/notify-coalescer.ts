// Interruption budget for toasts (Spec 4, Requirements 9.5, 9.6; steering
// "Interruption budget"). Only a ghost that is waiting, blocked or failed may
// interrupt, and one ghost raises at most one toast per 10-second window:
// the first interruption shows at once, later ones inside the window are held
// and shown together as one summary when the window ends.
//
// Pure: time arrives as an argument. No SDK, React, timers, or clock reads.

import type { GhostSnapshot, GhostState, GhostTransition } from './ghost-state'
import { GHOST_STATE_LABELS, HOUSE_OPERATOR_GHOST_ID, INTERRUPTING_STATES, defaultGhostName } from './ghost-status'
import type { NeedsYouItem } from './house-view'
import { INTERRUPT_STATES, INTERRUPTION_BURST_MS, isInterruptState, type InterruptState } from './interruption-policy'

// The 10 seconds and the three interrupting states are written once, in the
// Spec 6 Interruption Policy. These names remain for this module's callers.
export const COALESCE_WINDOW_MS = INTERRUPTION_BURST_MS

export const INTERRUPTION_KINDS = INTERRUPT_STATES
export type InterruptionKind = InterruptState

export interface Interruption {
  /** Stable id of the fact behind it; the same fact is never offered twice. */
  readonly id: string
  /** Mansion and ghost: the unit the window applies to. */
  readonly ghostKey: string
  readonly ghostName: string
  readonly kind: InterruptionKind
  /** One sentence saying what happened. */
  readonly text: string
}

export interface Toast {
  readonly ghostKey: string
  readonly text: string
  /** How many interruptions this toast stands for. */
  readonly count: number
  readonly atMs: number
}

interface GhostWindow {
  /** When this ghost last raised a toast. */
  readonly openedAtMs: number
  /** Interruptions held since then, oldest first. */
  readonly held: readonly Interruption[]
}

export interface CoalescerState {
  readonly windows: ReadonlyMap<string, GhostWindow>
  /** The latest time seen, so a clock that steps back cannot shorten a window. */
  readonly nowMs: number
}

export const EMPTY_COALESCER: CoalescerState = { windows: new Map(), nowMs: Number.NEGATIVE_INFINITY }

export interface CoalescerStep {
  readonly state: CoalescerState
  /** Toasts to show now, in ghost order of first appearance. */
  readonly toasts: readonly Toast[]
}

function summary(held: readonly Interruption[], atMs: number): Toast {
  const last = held[held.length - 1]
  if (held.length === 1) return { ghostKey: last.ghostKey, text: last.text, count: 1, atMs }
  const kinds = INTERRUPTION_KINDS.filter((kind) => held.some((item) => item.kind === kind)).map((kind) => GHOST_STATE_LABELS[kind].toLowerCase())
  return {
    ghostKey: last.ghostKey,
    text: `${last.ghostName}: ${held.length} more updates (${kinds.join(', ')}). Latest: ${last.text}`,
    count: held.length,
    atMs,
  }
}

/**
 * Ends every window that has run its 10 seconds. A window that held something
 * raises one summary and starts the next window; an empty one just closes.
 */
export function flushCoalescer(state: CoalescerState, nowMs: number): CoalescerStep {
  const now = Math.max(nowMs, state.nowMs)
  let windows: Map<string, GhostWindow> | null = null
  const toasts: Toast[] = []
  for (const [ghostKey, window] of state.windows) {
    if (now - window.openedAtMs < COALESCE_WINDOW_MS) continue
    windows ??= new Map(state.windows)
    if (window.held.length === 0) {
      windows.delete(ghostKey)
    } else {
      toasts.push(summary(window.held, now))
      windows.set(ghostKey, { openedAtMs: now, held: [] })
    }
  }
  return { state: { windows: windows ?? state.windows, nowMs: now }, toasts }
}

/** Offers one interruption at `nowMs`: shown at once, or held for its ghost's summary. */
export function offerInterruption(state: CoalescerState, interruption: Interruption, nowMs: number): CoalescerStep {
  const flushed = flushCoalescer(state, nowMs)
  const now = flushed.state.nowMs
  const windows = new Map(flushed.state.windows)
  const open = windows.get(interruption.ghostKey)
  if (open === undefined) {
    windows.set(interruption.ghostKey, { openedAtMs: now, held: [] })
    return {
      state: { windows, nowMs: now },
      toasts: [...flushed.toasts, { ghostKey: interruption.ghostKey, text: interruption.text, count: 1, atMs: now }],
    }
  }
  windows.set(interruption.ghostKey, { openedAtMs: open.openedAtMs, held: [...open.held, interruption] })
  return { state: { windows, nowMs: now }, toasts: flushed.toasts }
}

/** When the next window ends, or null when no window is open. The adapter sets one timer for it. */
export function nextFlushAtMs(state: CoalescerState): number | null {
  let next: number | null = null
  for (const window of state.windows.values()) {
    const end = window.openedAtMs + COALESCE_WINDOW_MS
    if (next === null || end < next) next = end
  }
  return next
}

export function isInterruptionKind(state: GhostState | string): state is InterruptionKind {
  return isInterruptState(state)
}

function ghostKeyOf(mansionId: string, ghostId: string): string {
  return JSON.stringify([mansionId, ghostId])
}

function nameOf(ghostId: string, names: Readonly<Record<string, string>>): string {
  const given = Object.hasOwn(names, ghostId) ? names[ghostId] : undefined
  return given === undefined || given.trim() === '' ? defaultGhostName(ghostId) : given
}

const KIND_SENTENCE: Readonly<Record<InterruptionKind, (name: string) => string>> = {
  waiting: (name) => `${name} is waiting for your approval.`,
  blocked: (name) => `${name} is blocked.`,
  failed: (name) => `${name} failed.`,
}

export interface CollectInput {
  readonly mansionId: string
  /** Derived Spec 2 transitions in Canonical_Order. */
  readonly transitions: readonly GhostTransition[]
  readonly snapshots: Iterable<GhostSnapshot>
  /** Current Needs You items. */
  readonly items: readonly NeedsYouItem[]
  /** Ids already offered. */
  readonly seen: ReadonlySet<string>
  readonly names?: Readonly<Record<string, string>>
}

export interface Collected {
  /** Every id looked at in this pass. Add them to the seen set. */
  readonly seen: readonly string[]
  readonly interruptions: readonly Interruption[]
}

/**
 * What may interrupt, from facts not offered before: a ghost whose latest
 * state change put it into waiting, blocked or failed and that is still
 * there, and a Door or risky proposal that newly needs the Operator.
 * Working, done, idle, progress and tool activity never qualify.
 */
export function collectInterruptions(input: CollectInput): Collected {
  const names = input.names ?? {}
  const current = new Map<string, GhostSnapshot>()
  for (const snapshot of input.snapshots) current.set(ghostKeyOf(snapshot.mansion_id, snapshot.ghost_id), snapshot)

  const latestChange = new Map<string, GhostTransition>()
  for (const transition of input.transitions) {
    if (transition.from_state === transition.to_state) continue
    latestChange.set(ghostKeyOf(transition.mansion_id, transition.ghost_id), transition)
  }

  const seen: string[] = []
  const interruptions: Interruption[] = []
  for (const transition of input.transitions) {
    if (input.seen.has(transition.transition_id)) continue
    seen.push(transition.transition_id)
    const key = ghostKeyOf(transition.mansion_id, transition.ghost_id)
    if (latestChange.get(key) !== transition || transition.ghost_id === HOUSE_OPERATOR_GHOST_ID) continue
    const snapshot = current.get(key)
    if (snapshot === undefined || snapshot.state !== transition.to_state) continue
    if (!INTERRUPTING_STATES.has(transition.to_state) || !isInterruptionKind(transition.to_state)) continue
    const name = nameOf(transition.ghost_id, names)
    interruptions.push({
      id: transition.transition_id,
      ghostKey: key,
      ghostName: name,
      kind: transition.to_state,
      text: KIND_SENTENCE[transition.to_state](name),
    })
  }
  for (const item of input.items) {
    if (input.seen.has(item.id)) continue
    seen.push(item.id)
    // A prompt no ghost can be named for has no window to merge into; Needs You still counts it.
    if (item.ghostId === null) continue
    interruptions.push({
      id: item.id,
      ghostKey: ghostKeyOf(input.mansionId, item.ghostId),
      ghostName: nameOf(item.ghostId, names),
      kind: 'waiting',
      text: item.text,
    })
  }
  return { seen, interruptions }
}
