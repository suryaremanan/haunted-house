// Pure canonical Replay Model for the Attic (replay-and-submission, tasks 1.1
// and 2.1; Requirements 1.1 to 1.6, 2.11, 3.2, 5.3).
//
// This file adds no event log, parser, selector, order or reducer. It composes
// the Spec 2 seams that live mode already runs:
//   parseEventLog   core/seance-log.ts    Canonical_Parser and integrity check
//   selectEvents    core/ghost-state.ts   Event_Selector and Canonical_Order
//   projectEvents   core/seance-log.ts    the one ghost fold of live and replay
//   foldWorkflow    core/workflow-fold.ts the Spec 4 workflow fold
// and adds presentation only: one safe Timeline entry and one deterministic
// Presentation_Time per selected record.
//
// A Timeline entry never carries text taken from a record payload. It shows
// fixed copy, chosen by event type and by values that are members of a closed
// allowlist (room, phase, outcome and reason codes). Anything else reads
// "Recorded event". No React, DOM, SDK, timer, network, filesystem or clock.

import { selectEvents, type GhostSnapshot, type GhostTransition, type SelectionDiagnostic } from './ghost-state'
import { HOUSE_OPERATOR_GHOST_ID, REASON_COPY, defaultGhostName } from './ghost-status'
import { PHASE_NAMES, ROOMS } from './house-view'
import type { AppEvent, EventDiagnostic, EventId, JsonValue, RecordId } from './seance-event'
import { EMPTY_LOG, mergeAcknowledged, parseEventLog, projectEvents, projectLog, type LogProjection } from './seance-log'
import { foldWorkflow, readDomainRecord, type GuardrailKind } from './workflow-fold'
import { PHASES, type Phase, type WorkflowProjection } from './workflow-projection'

// ---------------------------------------------------------------------------
// Diagnostics

export const REPLAY_DIAGNOSTIC_CODES = [
  'fixture_unavailable',
  'invalid_record',
  'unsupported_schema',
  'integrity_failed',
  'invalid_transition',
  'missing_predecessor',
  'causal_cycle',
  'conflicting_variant',
  'contract_unavailable',
] as const
export type ReplayDiagnosticCode = (typeof REPLAY_DIAGNOSTIC_CODES)[number]

/** A replay problem as fixed code and copy. Never a value from a record, a path or an error body. */
export interface ReplayDiagnostic {
  readonly code: ReplayDiagnosticCode
  /** One-based line of the Event_Log, for parser diagnostics. */
  readonly line?: number
  readonly recordId?: RecordId
  readonly safeDetail: string
}

/** The fixed copy of each code. `safeDetail` is always one of these strings. */
export const REPLAY_DIAGNOSTIC_TEXT: Readonly<Record<ReplayDiagnosticCode, string>> = {
  fixture_unavailable: 'The replay recording could not be loaded.',
  invalid_record: 'A record could not be read and was left out.',
  unsupported_schema: 'A record uses an unsupported schema and was left out.',
  integrity_failed: 'The log failed its integrity check. Only the records before the failure are replayed.',
  invalid_transition: 'A workflow record was not a valid step and changed nothing.',
  missing_predecessor: 'A record names a predecessor that is not in the log.',
  causal_cycle: 'A record names a predecessor that does not come before it.',
  conflicting_variant: 'Several records describe one event. One was chosen by the canonical rule.',
  contract_unavailable: 'The replay contract is unavailable. The last valid state is kept.',
}

/** Builds a diagnostic with the fixed copy of its code. */
export function replayDiagnostic(
  code: ReplayDiagnosticCode,
  at: { readonly line?: number; readonly recordId?: RecordId } = {},
): ReplayDiagnostic {
  return {
    code,
    ...(at.line === undefined ? {} : { line: at.line }),
    ...(at.recordId === undefined ? {} : { recordId: at.recordId }),
    safeDetail: REPLAY_DIAGNOSTIC_TEXT[code],
  }
}

function parserDiagnostic(diagnostic: EventDiagnostic): ReplayDiagnostic {
  const at = { line: diagnostic.line }
  switch (diagnostic.code) {
    case 'unsupported_schema':
      return replayDiagnostic('unsupported_schema', at)
    case 'duplicate_sequence':
    case 'missing_sequence':
    case 'hash_mismatch':
    case 'hash_link_broken':
    case 'mixed_integrity_mode':
      return replayDiagnostic('integrity_failed', at)
    default:
      return replayDiagnostic('invalid_record', at)
  }
}

function selectionDiagnostic(
  diagnostic: SelectionDiagnostic,
  recordIds: ReadonlyMap<EventId, RecordId>,
): ReplayDiagnostic {
  const at = { recordId: recordIds.get(diagnostic.event_id) }
  if (diagnostic.code === 'conflicting_variant') return replayDiagnostic('conflicting_variant', at)
  return replayDiagnostic(diagnostic.kind === 'forward' ? 'causal_cycle' : 'missing_predecessor', at)
}

function recordIdsByEventId(records: readonly AppEvent[]): Map<EventId, RecordId> {
  return new Map(records.map((record) => [record.event_id, record.record_id] as const))
}

// ---------------------------------------------------------------------------
// Canonical selection: the only way records enter a Replay Model.

export interface CanonicalSelection {
  /** Selected records in Canonical_Order. */
  readonly records: readonly AppEvent[]
  /** Parser diagnostics in file order, then selection diagnostics in the selector's order. */
  readonly diagnostics: readonly ReplayDiagnostic[]
  /** False when the Spec 2 parser ended the valid prefix at an integrity failure. */
  readonly integrityOk: boolean
}

/**
 * Selects acknowledged or parsed canonical records with the Spec 2
 * Event_Selector. Exact Record_ID duplicates collapse, one variant per Event_ID
 * is chosen, and the result is in Canonical_Order whatever order was given.
 */
export function selectCanonical(
  records: Iterable<AppEvent>,
  source: { readonly diagnostics?: readonly ReplayDiagnostic[]; readonly integrityOk?: boolean } = {},
): CanonicalSelection {
  const selection = selectEvents(Array.from(records))
  const recordIds = recordIdsByEventId(selection.events)
  return {
    records: selection.events,
    diagnostics: [
      ...(source.diagnostics ?? []),
      ...selection.diagnostics.map((diagnostic) => selectionDiagnostic(diagnostic, recordIds)),
    ],
    integrityOk: source.integrityOk !== false,
  }
}

/** Parses Event_Log text with the Spec 2 Canonical_Parser, then selects its valid prefix. */
export function parseCanonicalLog(text: string): CanonicalSelection {
  const parsed = parseEventLog(text)
  return selectCanonical(parsed.events, {
    diagnostics: parsed.diagnostics.map(parserDiagnostic),
    integrityOk: parsed.integrityOk,
  })
}

// ---------------------------------------------------------------------------
// Replay Projection: the upstream folds over one canonical prefix.

export type ReplayIntegrity = 'valid' | 'diagnostic' | 'incompatible'

/**
 * Everything the house shows for one canonical prefix. Every field is the
 * output of an upstream fold; replay adds no state of its own.
 */
export interface ReplayProjection {
  /** One snapshot per (mansion, ghost) with a selected record, sorted by mansion then ghost. */
  readonly ghosts: readonly GhostSnapshot[]
  /** Every derived ghost transition of the prefix in Canonical_Order. */
  readonly transitions: readonly GhostTransition[]
  /** One read-only workflow projection per Mansion with a selected record, sorted by Mansion id. */
  readonly workflows: readonly WorkflowProjection[]
  /** `incompatible`: the source log failed integrity. `diagnostic`: a record of the prefix was refused. */
  readonly integrity: ReplayIntegrity
  /** Number of records folded: the Cursor of this projection. */
  readonly validRecordCount: number
  /**
   * Records of this prefix the workflow fold refused. Parser and selection
   * diagnostics describe the whole log and stay on the Replay Model.
   */
  readonly diagnostics: readonly ReplayDiagnostic[]
}

export interface ReplayFoldContext {
  /** The parser's integrity verdict for the source log. Default true. */
  readonly integrityOk?: boolean
}

/** A fold of a canonical prefix. The engine is generic in it, so tests can supply a reference fold. */
export type ReplayFold<P = ReplayProjection> = (records: readonly AppEvent[]) => P

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left)
  const b = Array.from(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index].codePointAt(0)! - b[index].codePointAt(0)!
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

function composeProjection(ghostFold: LogProjection, context: ReplayFoldContext): ReplayProjection {
  const integrityOk = context.integrityOk !== false
  const selected = ghostFold.events
  const recordIds = recordIdsByEventId(selected)
  const diagnostics: ReplayDiagnostic[] = []

  const mansionIds = Array.from(new Set(selected.map((record) => record.scope.mansion_id))).sort(compareCodePoints)
  const workflows = mansionIds.map((mansionId) => {
    const folded = foldWorkflow(selected, { mansionId, integrity: integrityOk ? 'valid' : 'corrupt', readOnly: true })
    for (const refused of folded.diagnostics) {
      diagnostics.push(replayDiagnostic('invalid_transition', { recordId: recordIds.get(refused.eventId) }))
    }
    return folded.projection
  })

  return {
    ghosts: ghostFold.snapshots,
    transitions: ghostFold.transitions,
    workflows,
    integrity: !integrityOk ? 'incompatible' : diagnostics.length > 0 ? 'diagnostic' : 'valid',
    validRecordCount: selected.length,
    diagnostics,
  }
}

/** Replay_Fold: the projection of records read from an Event_Log, with no external state. */
export function foldReplay(records: readonly AppEvent[], context: ReplayFoldContext = {}): ReplayProjection {
  return composeProjection(projectEvents(records), context)
}

/**
 * Live_Fold: the same projection reached the way the live page reaches it, by
 * merging acknowledged records at most once per Record_ID and projecting the
 * held log. Used by parity tests and by the live Attic composition.
 */
export function foldLive(records: readonly AppEvent[], context: ReplayFoldContext = {}): ReplayProjection {
  return composeProjection(projectLog(mergeAcknowledged(EMPTY_LOG, records).log), context)
}

/** The Replay_Fold of one source log, carrying that log's integrity verdict. */
export function replayFoldFor(source: { readonly integrityOk: boolean }): ReplayFold {
  return (records) => foldReplay(records, { integrityOk: source.integrityOk })
}

/** The workflow of one Mansion in a projection, or null when the prefix has no record of it. */
export function workflowOf(projection: ReplayProjection, mansionId: string): WorkflowProjection | null {
  return projection.workflows.find((workflow) => workflow.mansionId === mansionId) ?? null
}

/**
 * The RS-S0 composition port: every upstream seam replay uses, and nothing
 * else. No method takes a raw Crew frame, snapshot, session history, path or
 * network client.
 */
export interface CanonicalReplayPort {
  parse(text: string): CanonicalSelection
  select(records: Iterable<AppEvent>): CanonicalSelection
  fold(records: readonly AppEvent[], context?: ReplayFoldContext): ReplayProjection
  foldLive(records: readonly AppEvent[], context?: ReplayFoldContext): ReplayProjection
}

export const CANONICAL_REPLAY_PORT: CanonicalReplayPort = {
  parse: parseCanonicalLog,
  select: (records) => selectCanonical(records),
  fold: foldReplay,
  foldLive,
}

// ---------------------------------------------------------------------------
// Safe Timeline entries

/** Longest actor label or summary, in Unicode code points. */
export const MAX_TIMELINE_TEXT = 160
/** The copy of a record with no allowlisted detail. A raw payload is never the fallback. */
export const RECORDED_EVENT_TEXT = 'Recorded event'
export const OPERATOR_ACTOR_LABEL = 'Operator'

export interface TimelineEntry {
  readonly recordId: RecordId
  readonly eventId: EventId
  readonly eventType: string
  /** The ghost or system actor, as bounded display text. */
  readonly actorLabel: string
  /** Fixed copy for the event and its allowlisted outcome. */
  readonly summary: string
  /** Milliseconds after the start of playback, at speed 1. Never decreases. */
  readonly presentationOffsetMs: number
}

/** At most `MAX_TIMELINE_TEXT` code points on one line. */
function bounded(text: string): string {
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim()
  const characters = Array.from(flat)
  return characters.length <= MAX_TIMELINE_TEXT ? flat : `${characters.slice(0, MAX_TIMELINE_TEXT - 1).join('')}…`
}

type Fields = { readonly [key: string]: JsonValue }

function fieldsOf(payload: JsonValue): Fields {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload) ? (payload as Fields) : {}
}

/** `fields[name]` when it is an own key of `table`, the closed allowlist; null otherwise. */
function allowed<T>(table: Readonly<Record<string, T>>, fields: Fields, name: string): T | null {
  const value = fields[name]
  return typeof value === 'string' && Object.hasOwn(table, value) ? table[value] : null
}

const ROOM_NAMES: Readonly<Record<string, string>> = Object.fromEntries(ROOMS.map((room) => [room.id, room.name]))
const APPROVAL_OUTCOMES: Readonly<Record<string, string>> = {
  approved: 'approved',
  rejected: 'rejected',
  denied: 'rejected',
}

const EVENT_COPY: Readonly<Record<string, string>> = {
  run_started: 'Run started',
  ghost_progressed: 'Progress reported',
  message_recorded: 'Message recorded',
  message_updated: 'Message updated',
  response_segment_started: 'Response started',
  response_chunk_recorded: 'Response text recorded',
  crew_turn_ended: 'Crew turn ended',
  crew_error_observed: 'Crew error observed',
  run_completed: 'Run completed',
  run_blocked: 'Run blocked',
  run_failed: 'Run failed',
  tool_started: 'Tool call started',
  tool_updated: 'Tool call updated',
  tool_finished: 'Tool call finished',
  approval_requested: 'Approval requested',
  approval_decided: 'Approval decided',
  decision_recorded: 'Decision recorded',
  domain_event_recorded: 'House event recorded',
  source_event_observed: 'Source event observed',
}

const GUARDRAIL_COPY: Readonly<Record<GuardrailKind, string>> = {
  phase_start_reserved: 'Phase start reserved',
  phase_started: 'Phase started',
  phase_start_failed: 'Phase start failed',
  phase_start_denied: 'Phase start denied',
  phase_output_ready: 'Phase output ready for the Door',
  revision_started: 'Revision started',
  door_superseded: 'Door proposal superseded',
  door_approved: 'Door approved',
  door_rejected: 'Door rejected',
  risky_action_proposed: 'Risky action proposed',
  risky_action_approved: 'Risky action approved',
  risky_action_rejected: 'Risky action rejected',
  risky_action_superseded: 'Risky action superseded',
  risky_action_consumed: 'Approved action claimed',
  risky_action_denied: 'Risky action denied',
  risky_action_succeeded: 'Approved action succeeded',
  risky_action_failed: 'Approved action failed',
  approval_resolution_ignored: 'Approval resolution ignored',
  path_denied: 'Path access denied',
  spec_write_prepared: 'Spec document write prepared',
  spec_document_written: 'Spec document written',
  spec_write_recovered: 'Spec document write recovered',
  spec_write_uncertain: 'Spec document write uncertain',
}

function guardrailSummary(event: AppEvent): string {
  const record = readDomainRecord(event)
  if (record === null) return EVENT_COPY.domain_event_recorded
  if (typeof record === 'string') return 'Workflow record refused'
  const copy = GUARDRAIL_COPY[record.kind]
  const phase = record.data.phase
  return typeof phase === 'string' && (PHASES as readonly string[]).includes(phase)
    ? `${copy}: ${PHASE_NAMES[phase as Phase]}`
    : copy
}

function summaryOf(event: AppEvent): string {
  const copy = Object.hasOwn(EVENT_COPY, event.event_type) ? EVENT_COPY[event.event_type] : undefined
  if (copy === undefined) return RECORDED_EVENT_TEXT
  const fields = fieldsOf(event.payload)
  switch (event.event_type) {
    case 'run_started': {
      const room = allowed(ROOM_NAMES, fields, 'room')
      return room === null ? copy : `${copy} in the ${room}`
    }
    case 'run_blocked':
    case 'run_failed': {
      const reason = allowed(REASON_COPY, fields, 'reason')
      return reason === null ? copy : `${copy}: ${reason}`
    }
    case 'tool_started':
      return fields.is_shell === true ? 'Shell tool call started' : copy
    case 'approval_decided': {
      const outcome = allowed(APPROVAL_OUTCOMES, fields, 'outcome')
      return outcome === null ? copy : `${copy}: ${outcome}`
    }
    case 'crew_turn_ended':
      return fields.needs_input === true ? `${copy}: needs input` : copy
    case 'domain_event_recorded':
      return guardrailSummary(event)
    default:
      return copy
  }
}

function actorOf(event: AppEvent): string {
  const ghostId = event.scope.ghost_id
  return ghostId === HOUSE_OPERATOR_GHOST_ID ? OPERATOR_ACTOR_LABEL : bounded(defaultGhostName(ghostId))
}

/** The safe Timeline entry of one selected record. Reads identity, type and allowlisted outcomes only. */
export function safeTimelineEntry(event: AppEvent, presentationOffsetMs: number): TimelineEntry {
  return {
    recordId: event.record_id,
    eventId: event.event_id,
    eventType: Object.hasOwn(EVENT_COPY, event.event_type) ? event.event_type : 'unknown',
    actorLabel: actorOf(event),
    summary: bounded(summaryOf(event)),
    presentationOffsetMs,
  }
}

// ---------------------------------------------------------------------------
// Deterministic Presentation_Time

export const MIN_STEP_INTERVAL_MS = 250
export const MAX_STEP_INTERVAL_MS = 4_000
/** Used when either occurrence time is absent or the pair does not move forward. */
export const DEFAULT_STEP_INTERVAL_MS = 1_000

/** The wait between two adjacent records at speed 1. Reads only the two recorded occurrence times. */
export function stepIntervalMs(previous: AppEvent, next: AppEvent): number {
  const from = previous.occurred_at_ms
  const to = next.occurred_at_ms
  const difference = Number.isSafeInteger(from) && Number.isSafeInteger(to) ? (to as number) - (from as number) : 0
  const interval = difference > 0 ? difference : DEFAULT_STEP_INTERVAL_MS
  return Math.min(Math.max(interval, MIN_STEP_INTERVAL_MS), MAX_STEP_INTERVAL_MS)
}

/** Offsets parallel to `records`: zero for the first, then the running sum of the step intervals. */
export function presentationOffsets(records: readonly AppEvent[]): number[] {
  const offsets: number[] = []
  let offset = 0
  records.forEach((record, index) => {
    if (index > 0) offset += stepIntervalMs(records[index - 1], record)
    offsets.push(offset)
  })
  return offsets
}

// ---------------------------------------------------------------------------
// Replay Model

export interface ReplayModel {
  /** Selected records in Canonical_Order. Cursor `n` means the prefix `records.slice(0, n)`. */
  readonly records: readonly AppEvent[]
  /** One entry per record, in the same order. */
  readonly timeline: readonly TimelineEntry[]
  /** Parser and selection diagnostics of the whole log. */
  readonly diagnostics: readonly ReplayDiagnostic[]
  /** The parser's integrity verdict, for `replayFoldFor`. */
  readonly integrityOk: boolean
}

/** Builds the model of one canonical selection. The same selection always yields an equal model. */
export function buildReplayModel(selection: CanonicalSelection): ReplayModel {
  const offsets = presentationOffsets(selection.records)
  return {
    records: selection.records,
    timeline: selection.records.map((record, index) => safeTimelineEntry(record, offsets[index])),
    diagnostics: selection.diagnostics,
    integrityOk: selection.integrityOk,
  }
}

/** The model shown when no Event_Log could be loaded: empty, with one fixed diagnostic. */
export function unavailableReplayModel(code: 'fixture_unavailable' | 'contract_unavailable'): ReplayModel {
  return { records: [], timeline: [], diagnostics: [replayDiagnostic(code)], integrityOk: true }
}
