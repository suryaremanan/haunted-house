// Pure view model for the Ghost_Status_View (Spec 2, Requirements 10.4 to 10.8):
// row text, safe reason and diagnostic copy, and which derived transitions pass
// the interruption budget. Reads Ghost_Snapshots and Ghost_Transitions only.
// No Crew data, SDK, React, network, or clock.

import type { GhostSnapshot, GhostState, GhostTransition, GhostTransitionId } from './ghost-state'
import type { EventDiagnostic } from './seance-event'

/** The exact text shown for each state. Always rendered next to the state icon. */
export const GHOST_STATE_LABELS: Readonly<Record<GhostState, string>> = {
  idle: 'Idle',
  working: 'Working',
  waiting: 'Waiting',
  blocked: 'Blocked',
  failed: 'Failed',
  done: 'Done',
}

/** States a ghost may interrupt for (theme-and-accessibility steering, interruption budget 1 to 3). */
export const INTERRUPTING_STATES: ReadonlySet<GhostState> = new Set<GhostState>(['waiting', 'blocked', 'failed'])

/** Plain copy for the `run_blocked` reasons design.md lists, and the failure reasons the house writes. */
export const REASON_COPY: Readonly<Record<string, string>> = {
  locked_door: 'A door upstream is still sealed.',
  missing_input: 'An input it needs is missing.',
  stalled: 'The run stalled.',
  history_partial: 'Part of its history could not be recovered.',
  cancelled: 'The run was cancelled.',
  cancel_unconfirmed: 'Cancelling was not confirmed.',
  capacity_unavailable: 'No ghost is free to take this.',
  claim_conflict: 'Another ghost holds this task.',
  contract_unavailable: 'Its room contract is unavailable.',
  confinement_unavailable: 'Its room limits could not be applied.',
}

const MAX_REASON_CHARACTERS = 120

/** One line of bounded text: control characters and runs of whitespace become single spaces. */
function oneLine(value: string, limit: number): string {
  const flat = value.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim()
  const characters = Array.from(flat)
  return characters.length <= limit ? flat : `${characters.slice(0, limit - 1).join('').trimEnd()}…`
}

/**
 * The short reason to show for a snapshot, or null. The value was redacted by
 * the backend before persistence; here it is only mapped to copy or bounded.
 */
export function ghostReasonText(reason: string | null): string | null {
  if (reason === null) return null
  const known = Object.hasOwn(REASON_COPY, reason) ? REASON_COPY[reason] : undefined
  if (known !== undefined) return known
  // A bare code such as `artifact_invalid` reads better as words.
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(reason)) {
    const words = oneLine(reason.replace(/_/g, ' '), MAX_REASON_CHARACTERS)
    return words.charAt(0).toUpperCase() + words.slice(1)
  }
  const text = oneLine(reason, MAX_REASON_CHARACTERS)
  return text === '' ? null : text
}

/** `tinker-1` reads as "Tinker 1" until a later spec supplies character names. */
export function defaultGhostName(ghostId: string): string {
  const text = oneLine(ghostId.replace(/[-_]+/g, ' '), 60)
  if (text === '') return 'Ghost'
  return text.replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toUpperCase())
}

export interface GhostRow {
  readonly key: string
  readonly ghostId: string
  readonly name: string
  readonly state: GhostState
  /** `GHOST_STATE_LABELS[state]`. */
  readonly stateText: string
  readonly pendingCount: number
  /** "1 approval pending", or null when nothing is pending. */
  readonly pendingText: string | null
  readonly reason: string | null
}

export function pendingText(count: number): string | null {
  if (count <= 0) return null
  return count === 1 ? '1 approval pending' : `${count} approvals pending`
}

/**
 * The scope the house uses for operator and workflow facts that belong to no
 * ghost session. It is not a ghost and never gets a row or an announcement.
 */
export const HOUSE_OPERATOR_GHOST_ID = 'house-operator'

/** One row per ghost snapshot, in the order given. The house operator's own scope is left out. */
export function ghostRows(
  snapshots: Iterable<GhostSnapshot>,
  names: Readonly<Record<string, string>> = {},
): GhostRow[] {
  const ghosts = Array.from(snapshots).filter((snapshot) => snapshot.ghost_id !== HOUSE_OPERATOR_GHOST_ID)
  return ghosts.map((snapshot) => {
    const given = Object.hasOwn(names, snapshot.ghost_id) ? names[snapshot.ghost_id] : undefined
    return {
      key: JSON.stringify([snapshot.mansion_id, snapshot.ghost_id]),
      ghostId: snapshot.ghost_id,
      name: given === undefined || given.trim() === '' ? defaultGhostName(snapshot.ghost_id) : given,
      state: snapshot.state,
      stateText: GHOST_STATE_LABELS[snapshot.state],
      pendingCount: snapshot.pending_approvals.length,
      pendingText: pendingText(snapshot.pending_approvals.length),
      reason: ghostReasonText(snapshot.reason),
    }
  })
}

function announcementFor(row: GhostRow): string {
  switch (row.state) {
    case 'waiting':
      return `${row.name} is waiting for your approval.`
    case 'blocked':
      return row.reason === null ? `${row.name} is blocked.` : `${row.name} is blocked: ${row.reason}`
    case 'failed':
      return row.reason === null ? `${row.name} failed.` : `${row.name} failed: ${row.reason}`
    default:
      return ''
  }
}

export interface Interruptions {
  /** Every transition considered in this pass. Add them to the announced set. */
  readonly seen: readonly GhostTransitionId[]
  /** One concise polite announcement, or null when nothing passes the budget. */
  readonly message: string | null
}

/**
 * Chooses what to announce from derived transitions not announced before.
 * A transition is announced when it changed a ghost's state to waiting,
 * blocked or failed and the ghost is still in that state because of it.
 * Entering working, done or idle is ambient and never announced, and history
 * the ghost has already moved past is not read out. Several ghosts merge into
 * one message.
 */
export function interruptionsFor(
  transitions: readonly GhostTransition[],
  snapshots: Iterable<GhostSnapshot>,
  announced: ReadonlySet<GhostTransitionId>,
  names: Readonly<Record<string, string>> = {},
): Interruptions {
  const rows = new Map(ghostRows(snapshots, names).map((row) => [row.key, row]))
  // The last state-changing transition of each ghost is the one that explains its current state.
  const latestChange = new Map<string, GhostTransition>()
  for (const transition of transitions) {
    if (transition.from_state === transition.to_state) continue
    latestChange.set(JSON.stringify([transition.mansion_id, transition.ghost_id]), transition)
  }

  const seen: GhostTransitionId[] = []
  const sentences: string[] = []
  for (const [key, transition] of latestChange) {
    if (announced.has(transition.transition_id)) continue
    seen.push(transition.transition_id)
    const row = rows.get(key)
    if (row === undefined || row.state !== transition.to_state || !INTERRUPTING_STATES.has(row.state)) continue
    sentences.push(announcementFor(row))
  }
  for (const transition of transitions) {
    if (!announced.has(transition.transition_id) && !seen.includes(transition.transition_id)) {
      seen.push(transition.transition_id)
    }
  }

  if (sentences.length === 0) return { seen, message: null }
  if (sentences.length === 1) return { seen, message: sentences[0] }
  return { seen, message: `${sentences.length} ghosts need you. ${sentences.join(' ')}` }
}

const INTEGRITY_CODES: ReadonlySet<string> = new Set([
  'hash_mismatch',
  'hash_link_broken',
  'mixed_integrity_mode',
  'duplicate_sequence',
  'missing_sequence',
])

/** Fixed, plain copy for a diagnostic. Backend detail codes are never shown raw. */
export function diagnosticText(diagnostic: EventDiagnostic): string {
  const at = diagnostic.line === undefined ? '' : ` at line ${diagnostic.line}`
  if (INTEGRITY_CODES.has(diagnostic.code)) {
    return `The séance log failed its integrity check${at}. Showing only the records before it.`
  }
  switch (diagnostic.code) {
    case 'invalid_record':
    case 'unsupported_schema':
      return `A séance log record${at} could not be read and was left out.`
    case 'history_partial':
      return 'Some activity could not be recovered from Crew history.'
    case 'invalid_envelope':
    case 'unknown_session':
    case 'approval_unmatched':
      return 'A Crew event was refused and not recorded.'
    case 'persistence_failed':
      // Our own adapters write full sentences; a bare backend code gets fixed copy.
      return /\s/.test(diagnostic.safe_detail)
        ? oneLine(diagnostic.safe_detail, 160)
        : 'The séance log could not be saved or read. Showing the last confirmed state.'
    default:
      return 'The séance log reported a problem. Showing the last confirmed state.'
  }
}
