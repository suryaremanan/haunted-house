// Pure Spec 2 canonical Event_Log handling shared by live and replay:
// JSONL parsing with integrity verification (Requirements 7.4 to 7.6), the
// at-most-once Record_ID merge of acknowledged events (Requirement 10.2), and
// the one projection both modes fold through (Requirements 8.1 to 8.3).
// No Crew mapping, SDK, React, network, filesystem, clock, or input mutation.

import { foldGhostEvents, type GhostSnapshot, type GhostTransition, type SelectionDiagnostic } from './ghost-state'
import {
  appEventToJson,
  canonicalJson,
  parseAppEventLine,
  sha256Hex,
  type AppEvent,
  type EventDiagnostic,
  type EventHash,
  type JsonValue,
  type RecordId,
} from './seance-event'

/** `prev_hash` of the first record of a hash-linked log. */
export const GENESIS_HASH: EventHash = `h1:${'0'.repeat(64)}`

/** The linked-record hash: SHA-256 over the canonical record without its own `hash`. */
export function calculateEventHash(event: AppEvent): EventHash {
  const record: Record<string, JsonValue> = { ...appEventToJson(event) }
  delete record.hash
  return `h1:${sha256Hex(canonicalJson(record))}`
}

export interface ParsedEventLog {
  /** The authoritative valid prefix, in physical order. Sequence runs 1..n without gaps. */
  readonly events: readonly AppEvent[]
  /** Sequence of the last valid-prefix record; zero for an empty log. */
  readonly highestSequence: number
  /** Number of physical lines before the first integrity failure, or all lines. */
  readonly validPrefixLines: number
  /** False once a Sequence or hash-chain failure ended the valid prefix. */
  readonly integrityOk: boolean
  /** Line diagnostics in file order. They carry categories and line numbers only. */
  readonly diagnostics: readonly EventDiagnostic[]
}

/**
 * Parses a canonical Event_Log. A malformed or unsupported line is reported
 * with its one-based line number and skipped. The first Sequence or hash-chain
 * failure ends the valid prefix: it and every later line are excluded and
 * nothing is repaired.
 */
export function parseEventLog(text: string): ParsedEventLog {
  const lines = text.split('\n')
  // A final newline leaves one empty piece that is not a line of the log.
  if (lines.at(-1) === '') lines.pop()

  const events: AppEvent[] = []
  const diagnostics: EventDiagnostic[] = []
  const recordIds = new Set<RecordId>()
  let linked: boolean | null = null
  let lastHash: EventHash = GENESIS_HASH

  for (let index = 0; index < lines.length; index += 1) {
    const line = index + 1
    const raw = lines[index].endsWith('\r') ? lines[index].slice(0, -1) : lines[index]
    if (raw.trim() === '') continue

    const parsed = parseAppEventLine(raw, line)
    if (!parsed.ok) {
      diagnostics.push(parsed.diagnostic)
      continue
    }
    const event = parsed.value

    const failure = integrityFailure(event, events.length + 1, linked, lastHash, recordIds)
    if (failure !== null) {
      diagnostics.push({ ...failure, line })
      return {
        events,
        highestSequence: events.length,
        validPrefixLines: index,
        integrityOk: false,
        diagnostics,
      }
    }

    linked = event.hash !== undefined
    if (event.hash !== undefined) lastHash = event.hash
    recordIds.add(event.record_id)
    events.push(event)
  }

  return {
    events,
    highestSequence: events.length,
    validPrefixLines: lines.length,
    integrityOk: true,
    diagnostics,
  }
}

function integrityFailure(
  event: AppEvent,
  expectedSequence: number,
  linked: boolean | null,
  lastHash: EventHash,
  recordIds: ReadonlySet<RecordId>,
): EventDiagnostic | null {
  if (event.sequence !== expectedSequence) {
    return event.sequence < expectedSequence
      ? { code: 'duplicate_sequence', path: '$.sequence', safe_detail: 'Sequence repeats an earlier record.' }
      : { code: 'missing_sequence', path: '$.sequence', safe_detail: 'Sequence skips a record.' }
  }
  const eventLinked = event.hash !== undefined
  if (linked !== null && linked !== eventLinked) {
    return { code: 'mixed_integrity_mode', safe_detail: 'Log switches between linked and unlinked records.' }
  }
  if (eventLinked) {
    if (event.prev_hash !== lastHash) {
      return { code: 'hash_link_broken', path: '$.prev_hash', safe_detail: 'Record does not link to its predecessor.' }
    }
    if (event.hash !== calculateEventHash(event)) {
      return { code: 'hash_mismatch', path: '$.hash', safe_detail: 'Record hash does not match its content.' }
    }
  }
  if (recordIds.has(event.record_id)) {
    return { code: 'invalid_record', path: '$.record_id', safe_detail: 'Record_ID repeats an earlier record.' }
  }
  return null
}

/** Canonical records held in memory, keyed by Record_ID. Immutable: every merge returns a new value. */
export interface CanonicalLog {
  readonly records: ReadonlyMap<RecordId, AppEvent>
  /** Greatest Sequence held. */
  readonly highestSequence: number
  /** Greatest N such that every Sequence 1..N is held. Catch-up reads start after it. */
  readonly contiguousSequence: number
}

export const EMPTY_LOG: CanonicalLog = {
  records: new Map(),
  highestSequence: 0,
  contiguousSequence: 0,
}

export interface MergeResult {
  readonly log: CanonicalLog
  /** The records this merge added, in the order given. Empty when all were already held. */
  readonly applied: readonly AppEvent[]
}

/**
 * Adds acknowledged canonical records. A Record_ID already held is ignored, so
 * redelivered acknowledgments and overlapping pages apply at most once.
 */
export function mergeAcknowledged(log: CanonicalLog, events: readonly AppEvent[]): MergeResult {
  const applied: AppEvent[] = []
  let records: Map<RecordId, AppEvent> | null = null
  for (const event of events) {
    if ((records ?? log.records).has(event.record_id)) continue
    records ??= new Map(log.records)
    records.set(event.record_id, event)
    applied.push(event)
  }
  if (records === null) return { log, applied }

  let highestSequence = log.highestSequence
  for (const event of applied) highestSequence = Math.max(highestSequence, event.sequence)
  const held = new Set<number>()
  for (const event of records.values()) held.add(event.sequence)
  let contiguousSequence = log.contiguousSequence
  while (held.has(contiguousSequence + 1)) contiguousSequence += 1
  return { log: { records, highestSequence, contiguousSequence }, applied }
}

export interface LogProjection {
  /** Selected events in Canonical_Order. */
  readonly events: readonly AppEvent[]
  readonly selectionDiagnostics: readonly SelectionDiagnostic[]
  /** One snapshot per (mansion, ghost) with a selected event, sorted by mansion then ghost. */
  readonly snapshots: readonly GhostSnapshot[]
  /** Every derived transition in Canonical_Order. Never persisted. */
  readonly transitions: readonly GhostTransition[]
}

/** The one fold live acknowledgments and replay files both go through. */
export function projectEvents(events: Iterable<AppEvent>): LogProjection {
  const folded = foldGhostEvents(Array.from(events))
  return {
    events: folded.selection.events,
    selectionDiagnostics: folded.selection.diagnostics,
    snapshots: folded.snapshots,
    transitions: folded.transitions,
  }
}

export function projectLog(log: CanonicalLog): LogProjection {
  return projectEvents(log.records.values())
}

/** Stable key for a ghost within the app: mansions may reuse ghost names. */
export function ghostKey(snapshot: { readonly mansion_id: string; readonly ghost_id: string }): string {
  return JSON.stringify([snapshot.mansion_id, snapshot.ghost_id])
}
