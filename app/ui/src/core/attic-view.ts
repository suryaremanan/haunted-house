// What the Attic shows for one Replay State (replay-and-submission task 4.1;
// Requirements 3.1 to 3.4, 3.6, 3.8, 3.9): fixed, bounded copy derived from
// the Replay Model, the Cursor and the upstream projection of its prefix.
//
// Nothing here reads a record payload. Every string is fixed copy, a count, a
// position, a Timeline entry the model already made safe, or a state label
// the house already uses. No React, DOM, SDK, timer, network or clock.

import type { GhostState } from './ghost-state'
import { GHOST_STATE_LABELS, HOUSE_OPERATOR_GHOST_ID, defaultGhostName } from './ghost-status'
import { DOOR_STATUS_TEXT, PHASE_NAMES, PHASE_STATUS_TEXT } from './house-view'
import { REPLAY_SPEEDS, cursorText, type PlaybackStatus, type ReplaySpeed, type ReplayState } from './replay-reducer'
import { workflowOf, type ReplayDiagnostic, type ReplayModel, type ReplayProjection } from './replay-timeline'
import type { DoorStatus, Phase, PhaseStatus } from './workflow-projection'

// ---------------------------------------------------------------------------
// Fixed copy

export const READ_ONLY_REPLAY_TEXT =
  'This is a recording. It is read-only: nothing here starts, approves, rejects, retries or opens a Crew session.'
export const LIVE_REPLAY_TEXT =
  'The Attic replays this mansion’s séance log. Replaying changes nothing: the rooms keep showing the live house.'
export const LOADING_LOG_TEXT = 'Reading the séance log…'
export const EMPTY_LOG_TEXT = 'This log has no events yet. There is nothing to replay.'
export const NO_DIAGNOSTICS_TEXT = 'No problems were found in this log.'
export const START_OF_REPLAY_TEXT = 'Start of replay. No event has been shown yet.'
export const CURRENT_ENTRY_TEXT = 'Now showing'

export function eventCountText(total: number): string {
  return total === 0 ? 'No events recorded' : total === 1 ? '1 event recorded' : `${total} events recorded`
}

/** `0.5×`, `1×`, `2×`. */
export function speedText(speed: ReplaySpeed): string {
  return `${speed}×`
}

export const SPEED_OPTIONS: readonly { readonly speed: ReplaySpeed; readonly text: string }[] = REPLAY_SPEEDS.map((speed) => ({
  speed,
  text: speedText(speed),
}))

/** The playback status in words. Always shown as text, next to its icon. */
export function playbackStatusText(status: PlaybackStatus, cursor: number, total: number): string {
  if (status === 'playing') return 'Playing'
  if (status === 'complete') return total === 0 ? 'Nothing to replay' : 'Replay complete'
  return cursor === 0 ? 'Paused at the start' : 'Paused'
}

// ---------------------------------------------------------------------------
// Transport

export type PlayAction = 'play' | 'pause' | 'resume'

export interface TransportControl {
  /** False: the control stays focusable, does nothing, and shows `reason`. */
  readonly enabled: boolean
  /** Why the control is off, in plain words, or null. */
  readonly reason: string | null
}

export interface TransportView {
  /** The one play control changes its name with the state: Play, Pause or Resume. */
  readonly playAction: PlayAction
  readonly playLabel: string
  readonly play: TransportControl
  readonly restart: TransportControl
  readonly previous: TransportControl
  readonly next: TransportControl
  readonly seek: TransportControl
  /** Cursor after Previous and Next, clamped to the log. */
  readonly previousCursor: number
  readonly nextCursor: number
}

const ON: TransportControl = { enabled: true, reason: null }
const off = (reason: string): TransportControl => ({ enabled: false, reason })

export const NOTHING_TO_REPLAY_REASON = 'There are no events to replay.'
export const AT_END_REASON = 'The replay is at its end. Restart to play it again.'
export const AT_START_REASON = 'The replay is at its start.'
export const AT_LAST_EVENT_REASON = 'This is the last event.'

/** Which transport controls act right now, and why the others do not. */
export function transportView(model: Pick<ReplayModel, 'records'>, state: Pick<ReplayState, 'status' | 'cursor'>): TransportView {
  const total = model.records.length
  const empty = total === 0
  const atEnd = state.cursor >= total
  const atStart = state.cursor === 0
  const playAction: PlayAction = state.status === 'playing' ? 'pause' : atStart || atEnd ? 'play' : 'resume'
  return {
    playAction,
    playLabel: playAction === 'pause' ? 'Pause' : playAction === 'resume' ? 'Resume' : 'Play',
    // At the end, Play starts the replay again from the beginning.
    play: playAction === 'pause' ? ON : empty ? off(NOTHING_TO_REPLAY_REASON) : ON,
    restart: empty ? off(NOTHING_TO_REPLAY_REASON) : atStart && state.status !== 'playing' ? off(AT_START_REASON) : ON,
    previous: empty ? off(NOTHING_TO_REPLAY_REASON) : atStart ? off(AT_START_REASON) : ON,
    next: empty ? off(NOTHING_TO_REPLAY_REASON) : atEnd ? off(AT_LAST_EVENT_REASON) : ON,
    seek: empty ? off(NOTHING_TO_REPLAY_REASON) : ON,
    previousCursor: Math.max(state.cursor - 1, 0),
    nextCursor: Math.min(state.cursor + 1, total),
  }
}

// ---------------------------------------------------------------------------
// Timeline

export interface TimelineRow {
  /** Stable key: the Record_ID. */
  readonly key: string
  /** One-based position in Canonical_Order. */
  readonly position: number
  readonly actor: string
  readonly summary: string
  /** The record the Cursor last presented. */
  readonly current: boolean
  /** Inside the current prefix. */
  readonly played: boolean
}

/** One row per selected record, in Canonical_Order. Text comes from the safe Timeline entries only. */
export function timelineRows(model: Pick<ReplayModel, 'timeline'>, cursor: number): TimelineRow[] {
  return model.timeline.map((entry, index) => ({
    key: entry.recordId,
    position: index + 1,
    actor: entry.actorLabel,
    summary: entry.summary,
    current: index === cursor - 1,
    played: index < cursor,
  }))
}

/** The position and safe summary of the record at a Cursor: what a step control says after it moved. */
export function positionAnnouncement(model: Pick<ReplayModel, 'records' | 'timeline'>, cursor: number): string {
  const entry = model.timeline[cursor - 1]
  if (cursor <= 0 || entry === undefined) return START_OF_REPLAY_TEXT
  return `${cursorText(model, cursor)}. ${entry.actorLabel}: ${entry.summary}.`
}

export function completeAnnouncement(model: Pick<ReplayModel, 'records'>): string {
  return `Replay complete. ${cursorText(model, model.records.length)}.`
}

// ---------------------------------------------------------------------------
// Projection summary

export interface PhaseSummary {
  readonly phase: Phase
  readonly status: PhaseStatus
  readonly door: DoorStatus
  /** "Requirements: Working. Sealed door." */
  readonly text: string
}

export interface GhostSummary {
  readonly ghostId: string
  readonly state: GhostState
  /** "Archivist: Working" */
  readonly text: string
}

export interface AtticSummary {
  readonly statusText: string
  /** `Event n of N`, or `Start of replay`. */
  readonly positionText: string
  readonly totalText: string
  /** Actor and summary of the record the Cursor last presented, or the start copy. */
  readonly currentText: string
  /** The four phases with their Doors, or empty before the Mansion has a record. */
  readonly phases: readonly PhaseSummary[]
  readonly ghosts: readonly GhostSummary[]
  /** "2 decisions waiting at this point", or null when none were. */
  readonly waitingText: string | null
}

function waitingText(count: number): string | null {
  if (count <= 0) return null
  return count === 1 ? '1 decision waiting at this point' : `${count} decisions waiting at this point`
}

/** The summary of the projection at the Cursor. State labels are the ones the house rooms use. */
export function atticSummary(
  model: Pick<ReplayModel, 'records' | 'timeline'>,
  state: Pick<ReplayState, 'status' | 'cursor' | 'projection'>,
  mansionId: string,
): AtticSummary {
  const total = model.records.length
  const projection: ReplayProjection = state.projection
  const workflow = workflowOf(projection, mansionId)
  const entry = model.timeline[state.cursor - 1]
  return {
    statusText: playbackStatusText(state.status, state.cursor, total),
    positionText: cursorText(model, state.cursor),
    totalText: eventCountText(total),
    currentText: state.cursor <= 0 || entry === undefined ? START_OF_REPLAY_TEXT : `${entry.actorLabel}: ${entry.summary}`,
    phases:
      workflow === null
        ? []
        : workflow.phases.map((phase) => ({
            phase: phase.phase,
            status: phase.status,
            door: phase.door.status,
            text: `${PHASE_NAMES[phase.phase]}: ${PHASE_STATUS_TEXT[phase.status]}. ${DOOR_STATUS_TEXT[phase.door.status]}.`,
          })),
    ghosts: projection.ghosts
      // The Operator's own decisions are recorded under a house identity; it is not a ghost of a room.
      .filter((ghost) => ghost.mansion_id === mansionId && ghost.ghost_id !== HOUSE_OPERATOR_GHOST_ID)
      .map((ghost) => ({
        ghostId: ghost.ghost_id,
        state: ghost.state,
        text: `${defaultGhostName(ghost.ghost_id)}: ${GHOST_STATE_LABELS[ghost.state]}`,
      })),
    waitingText: waitingText(workflow?.waitingCount ?? 0),
  }
}

// ---------------------------------------------------------------------------
// Diagnostics

/** Most diagnostic lines the Attic lists. The rest are counted. */
export const MAX_DIAGNOSTICS_SHOWN = 20

export interface DiagnosticRow {
  readonly key: string
  /** "Line 4: A record could not be read and was left out." */
  readonly text: string
}

export interface DiagnosticsView {
  readonly rows: readonly DiagnosticRow[]
  /** "and 3 more", or null. */
  readonly moreText: string | null
  /** Rows plus those not shown. */
  readonly total: number
}

function diagnosticText(diagnostic: ReplayDiagnostic): string {
  // The line is the parser's own one-based number; the detail is the fixed copy of the code.
  return diagnostic.line === undefined ? diagnostic.safeDetail : `Line ${diagnostic.line}: ${diagnostic.safeDetail}`
}

/**
 * Every problem to show, in a fixed order: a refused command first, then the
 * log's parser and selection diagnostics, then records the fold of the current
 * prefix refused. Bounded; never a payload, path or error body.
 */
export function diagnosticsView(
  model: Pick<ReplayModel, 'diagnostics'>,
  state: Pick<ReplayState, 'commandError' | 'projection'>,
): DiagnosticsView {
  const texts = [
    ...(state.commandError === null ? [] : [state.commandError.safeDetail]),
    ...model.diagnostics.map(diagnosticText),
    ...state.projection.diagnostics.map(diagnosticText),
  ]
  // The same sentence for the same line says nothing new the second time.
  const unique = Array.from(new Set(texts))
  const shown = unique.slice(0, MAX_DIAGNOSTICS_SHOWN)
  const hidden = unique.length - shown.length
  return {
    rows: shown.map((text, index) => ({ key: `${index}:${text}`, text })),
    moreText: hidden > 0 ? `and ${hidden} more` : null,
    total: unique.length,
  }
}
