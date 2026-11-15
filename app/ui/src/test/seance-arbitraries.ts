// Test support for the Spec 2 property tests (Properties 8, 9 and 11):
// fast-check generators for canonical App_Events and an independent reference
// model of selection and the six-state fold. The reference model is written
// from design.md "Event selection and Ghost state", not from core/ghost-state.ts,
// so agreement between the two is evidence rather than a tautology.
import fc from 'fast-check'
import type { GhostSnapshot, GhostState } from '../core/ghost-state'
import {
  calculateEventId,
  calculateRecordId,
  canonicalJson,
  type AppEvent,
  type AppEventCandidate,
  type EventId,
  type EventScope,
  type EventType,
  type JsonValue,
} from '../core/seance-event'

export const MANSIONS = ['manor-a', 'manor-b'] as const
// Includes two identifiers whose UTF-16 order differs from their code-point
// order, so sorting by code units instead of code points is caught.
export const GHOSTS = ['archivist', 'draughtsman', 'ghost-～', 'ghost-\u{1f47b}'] as const
const RUN_IDS = ['run-a', 'run-b'] as const
const MIDS = ['mid-1', 'mid-2', 'mid-3'] as const
const TOOLS = ['tool-1', 'tool-2', 'tool-3'] as const
const REASONS = ['locked_door', 'stalled', 'validation_failed', 'ready', 'owner input'] as const
const IDENTITIES = ['i0', 'i1', 'i2'] as const

/** Deterministically build the persisted record a writer would produce for a candidate. */
export function makeEvent(candidate: AppEventCandidate, sequence: number): AppEvent {
  return {
    ...candidate,
    event_id: calculateEventId(candidate),
    record_id: calculateRecordId(candidate),
    sequence,
    persisted_at_ms: 1_000_000 + sequence,
  }
}

export interface CandidateOptions {
  readonly mansions?: readonly string[]
  readonly ghosts?: readonly string[]
}

const optionalReason = fc.option(fc.constantFrom(...REASONS), { nil: undefined })

function withReason(base: Record<string, JsonValue>, reason: string | undefined): JsonValue {
  return reason === undefined ? base : { ...base, reason }
}

/** A payload for `eventType`: usually the fields the fold reads, sometimes a shape it must ignore. */
function payloadArb(eventType: EventType): fc.Arbitrary<JsonValue> {
  const odd: fc.Arbitrary<JsonValue> = fc.constantFrom<JsonValue>(null, [], 'text', 7, {}, { mid: '' }, {
    mid: 3,
    tool_call_id: false,
    final: 'true',
    reason: 9,
  })
  let usual: fc.Arbitrary<JsonValue>
  switch (eventType) {
    case 'approval_requested':
      usual = fc.tuple(fc.constantFrom(...MIDS), optionalReason).map(([mid, reason]) => withReason({ mid }, reason))
      break
    case 'approval_decided':
      usual = fc
        .tuple(fc.constantFrom(...MIDS), fc.constantFrom('approved', 'denied'))
        .map(([mid, outcome]) => ({ mid, outcome }))
      break
    case 'tool_started':
    case 'tool_updated':
      usual = fc.constantFrom(...TOOLS).map((tool) => ({ tool_call_id: tool }))
      break
    case 'tool_finished':
      usual = fc
        .tuple(fc.constantFrom(...TOOLS), fc.option(fc.boolean(), { nil: undefined }))
        .map(([tool, final]): JsonValue => (final === undefined ? { tool_call_id: tool } : { tool_call_id: tool, final }))
      break
    case 'crew_turn_ended':
      usual = fc.tuple(fc.boolean(), fc.boolean(), optionalReason).map(([continuing, needsInput, reason]) =>
        withReason({ continuing, needs_input: needsInput }, reason),
      )
      break
    case 'crew_error_observed':
      usual = optionalReason.map((reason) => withReason({ category: 'transport' }, reason))
      break
    case 'domain_event_recorded':
      // The canonical parser requires the Domain_Event_Payload envelope.
      return fc
        .tuple(fc.constantFrom('door_approved', 'approval_requested'), fc.constantFrom(...MIDS))
        .map(([kind, mid]) => ({ domain: 'doors', kind, entity_id: 'design-door', data: { mid, reason: 'stalled' } }))
    default:
      usual = optionalReason.map((reason) => withReason({}, reason))
  }
  return fc.oneof({ weight: 9, arbitrary: usual }, { weight: 1, arbitrary: odd })
}

const eventTypeArb: fc.Arbitrary<EventType> = fc.oneof(
  { weight: 6, arbitrary: fc.constant<EventType>('run_started') },
  { weight: 4, arbitrary: fc.constantFrom<EventType>('approval_requested', 'approval_decided') },
  { weight: 4, arbitrary: fc.constantFrom<EventType>('tool_started', 'tool_finished', 'tool_updated') },
  { weight: 3, arbitrary: fc.constantFrom<EventType>('run_completed', 'run_blocked', 'run_failed') },
  { weight: 3, arbitrary: fc.constantFrom<EventType>('crew_turn_ended', 'crew_error_observed') },
  {
    weight: 3,
    arbitrary: fc.constantFrom<EventType>(
      'ghost_progressed',
      'message_recorded',
      'message_updated',
      'response_segment_started',
      'response_chunk_recorded',
      'decision_recorded',
      'domain_event_recorded',
      'source_event_observed',
    ),
  },
)

/** A Run scope. A log draws most of its events from a few of these, so facts accumulate on one Run. */
const scopeArb = (options: CandidateOptions): fc.Arbitrary<EventScope> =>
  fc
    .record({
      mansion: fc.constantFrom(...(options.mansions ?? MANSIONS)),
      ghost: fc.constantFrom(...(options.ghosts ?? GHOSTS)),
      // A run occasionally reports under another session slot.
      altSlot: fc.oneof({ weight: 9, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
      runId: fc.constantFrom(...RUN_IDS),
      runSequence: fc.integer({ min: 0, max: 2 }),
    })
    .map((spec) => ({
      mansion_id: spec.mansion,
      ghost_id: spec.ghost,
      session_slot: spec.altSlot ? 'alt-slot' : `${spec.ghost}-slot`,
      run_id: spec.runId,
      run_sequence: spec.runSequence,
    }))

/**
 * One valid App_Event_Candidate. Identity parts come from a small pool, so the
 * same Event_ID recurs with other revisions and payloads (variants), and the
 * same candidate recurs exactly (Record_ID retries). With `scopes`, nine in ten
 * candidates belong to one of those Runs.
 */
export function candidateArb(
  options: CandidateOptions & { scopes?: readonly EventScope[] } = {},
): fc.Arbitrary<AppEventCandidate> {
  const anyScope = scopeArb(options)
  const scope =
    options.scopes === undefined || options.scopes.length === 0
      ? anyScope
      : fc.oneof({ weight: 9, arbitrary: fc.constantFrom(...options.scopes) }, { weight: 1, arbitrary: anyScope })
  return eventTypeArb.chain((eventType) =>
    fc
      .record({
        scope,
        identity: fc.constantFrom(...IDENTITIES),
        revision: fc.integer({ min: 0, max: 2 }),
        generation: fc.constantFrom('', 'g1'),
        sourceSequence: fc.integer({ min: 0, max: 1 }),
        occurred: fc.option(fc.integer({ min: 0, max: 5_000 }), { nil: null }),
        payload: payloadArb(eventType),
      })
      .map(
        (spec): AppEventCandidate => ({
          schema_version: 1,
          event_type: eventType,
          scope: spec.scope,
          source: {
            origin: 'house',
            source_type: eventType,
            identity_parts: [spec.identity],
            revision: spec.revision,
            generation: spec.generation,
            source_sequence: spec.sourceSequence,
          },
          caused_by: [],
          occurred_at_ms: spec.occurred,
          payload: spec.payload,
        }),
      ),
  )
}

/** Adds causal references: to earlier events, later events, itself, or an event that never arrives. */
function withCausalLinks(candidates: readonly AppEventCandidate[], picks: readonly number[]): AppEventCandidate[] {
  const ids = candidates.map((candidate) => calculateEventId(candidate))
  const missing: EventId = `e1:${'a'.repeat(64)}`
  return candidates.map((candidate, index) => {
    const pick = picks[index] ?? 0
    if (pick === 0 || ids.length === 0) return candidate
    const reference = pick === 1 ? missing : ids[(index + pick) % ids.length]
    return { ...candidate, caused_by: [reference] }
  })
}

/**
 * A physical log as one writer would produce it: Sequence 1..n in array order.
 * The same candidate may appear at several Sequences (the fold must collapse
 * such records), and several records may share an Event_ID.
 */
export function eventLogArb(options: CandidateOptions & { maxLength?: number } = {}): fc.Arbitrary<AppEvent[]> {
  const maxLength = options.maxLength ?? 40
  const causalPick = fc.oneof(
    { weight: 7, arbitrary: fc.constant(0) },
    { weight: 3, arbitrary: fc.integer({ min: 1, max: 9 }) },
  )
  return fc
    .array(scopeArb(options), { minLength: 1, maxLength: 4 })
    .chain((scopes) =>
      fc.tuple(
        fc.array(candidateArb({ ...options, scopes }), { maxLength }),
        fc.array(causalPick, { maxLength }),
        // Positions whose candidate is submitted again later: an exact Record_ID retry.
        fc.array(fc.nat(), { maxLength: 4 }),
      ),
    )
    .map(([candidates, picks, retries]) => {
      const linked = withCausalLinks(candidates, picks)
      const repeated = linked.length === 0 ? [] : retries.map((at) => linked[at % linked.length])
      return [...linked, ...repeated].map((candidate, index) => makeEvent(candidate, index + 1))
    })
}

/**
 * A log the canonical writer could have produced: contiguous Sequence and one
 * physical record per Record_ID (an exact retry appends nothing).
 */
export function writerLogArb(options: CandidateOptions & { maxLength?: number } = {}): fc.Arbitrary<AppEvent[]> {
  return eventLogArb(options).map((events) => {
    const seen = new Set<string>()
    const unique: AppEvent[] = []
    for (const event of events) {
      if (seen.has(event.record_id)) continue
      seen.add(event.record_id)
      unique.push({ ...event, sequence: unique.length + 1, persisted_at_ms: 1_000_001 + unique.length })
    }
    return unique
  })
}

/** Reorders `items` by generated sort keys: a uniform in-memory permutation that shrinks well. */
export function permutationArb<T>(items: readonly T[]): fc.Arbitrary<T[]> {
  return fc
    .array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: items.length, maxLength: items.length })
    .map((keys) =>
      items
        .map((item, index) => ({ item, key: keys[index], index }))
        .sort((left, right) => left.key - right.key || left.index - right.index)
        .map(({ item }) => item),
    )
}

// ---------------------------------------------------------------------------
// Reference model
// ---------------------------------------------------------------------------

/** Code-point order, as Python compares `str` and UTF-8 bytes compare. */
export function byCodePoint(left: string, right: string): number {
  const a = [...left]
  const b = [...right]
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index].codePointAt(0)! - b[index].codePointAt(0)!
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

function informationUnits(value: JsonValue): number {
  if (value === null || value === '') return 0
  if (typeof value !== 'object') return 1
  const members: readonly JsonValue[] = Array.isArray(value)
    ? (value as readonly JsonValue[])
    : Object.values(value as { readonly [key: string]: JsonValue })
  let total = 0
  for (const member of members) total += informationUnits(member)
  return total
}

function completenessRank(event: AppEvent): number {
  let rank = event.caused_by.length + informationUnits(event.payload)
  if (event.occurred_at_ms !== null) rank += 1
  if (event.source.generation !== '') rank += 1
  if (event.source.source_sequence > 0) rank += 1
  return rank
}

export interface ReferenceSelection {
  /** Selected physical records in Canonical_Order. */
  readonly events: readonly AppEvent[]
  /** Event_ID to the Record_ID of its selected variant. */
  readonly winners: ReadonlyMap<string, string>
  /** One canonical string per diagnostic. */
  readonly diagnostics: ReadonlySet<string>
}

export function diagnosticKey(diagnostic: {
  readonly code: string
  readonly event_id: string
  readonly related_event_id: string | null
  readonly kind: string
  readonly record_ids: readonly string[]
}): string {
  return JSON.stringify([
    diagnostic.code,
    diagnostic.kind,
    diagnostic.event_id,
    diagnostic.related_event_id,
    [...diagnostic.record_ids],
  ])
}

/** design.md selection rules 1 to 5, by sorting rather than by incremental maps. */
export function referenceSelect(input: readonly AppEvent[]): ReferenceSelection {
  // Rule 1: one physical record per Record_ID. Among in-memory copies that
  // disagree on writer metadata, the earliest accepted one stands.
  const copies = [...input].sort(
    (left, right) =>
      left.sequence - right.sequence ||
      byCodePoint(left.event_id, right.event_id) ||
      byCodePoint(canonicalJson(left as unknown as JsonValue), canonicalJson(right as unknown as JsonValue)),
  )
  const records: AppEvent[] = []
  const seenRecords = new Set<string>()
  for (const event of copies) {
    if (seenRecords.has(event.record_id)) continue
    seenRecords.add(event.record_id)
    records.push(event)
  }

  // Rules 2 and 3: best (revision, completeness, record_id) per Event_ID.
  const ranked = [...records].sort(
    (left, right) =>
      right.source.revision - left.source.revision ||
      completenessRank(right) - completenessRank(left) ||
      byCodePoint(right.record_id, left.record_id),
  )
  const winners = new Map<string, string>()
  const chosen: AppEvent[] = []
  for (const event of ranked) {
    if (winners.has(event.event_id)) continue
    winners.set(event.event_id, event.record_id)
    chosen.push(event)
  }

  // Rule 4.
  chosen.sort((left, right) => left.sequence - right.sequence || byCodePoint(left.event_id, right.event_id))

  // Rule 5, plus one conflict diagnostic per Event_ID with several records.
  const diagnostics = new Set<string>()
  for (const eventId of winners.keys()) {
    const recordIds = records
      .filter((event) => event.event_id === eventId)
      .map((event) => event.record_id)
      .sort(byCodePoint)
    if (recordIds.length > 1) {
      diagnostics.add(
        diagnosticKey({
          code: 'conflicting_variant',
          event_id: eventId,
          related_event_id: null,
          kind: 'conflict',
          record_ids: recordIds,
        }),
      )
    }
  }
  chosen.forEach((event, position) => {
    for (const predecessor of event.caused_by) {
      const at = chosen.findIndex((candidate) => candidate.event_id === predecessor)
      if (at >= 0 && at < position) continue
      diagnostics.add(
        diagnosticKey({
          code: 'missing_predecessor',
          event_id: event.event_id,
          related_event_id: predecessor,
          kind: at < 0 ? 'missing' : 'forward',
          record_ids: [],
        }),
      )
    }
  })
  return { events: chosen, winners, diagnostics }
}

function field(event: AppEvent, name: string): JsonValue | undefined {
  const payload = event.payload
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  return (payload as { readonly [key: string]: JsonValue })[name]
}

function textField(event: AppEvent, name: string): string | null {
  const value = field(event, name)
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * The six-state fact model of design.md for one ghost, over events already in
 * Canonical_Order. Facts are sets; only the reason and the latest event look
 * at order.
 */
export function referenceSnapshot(
  selected: readonly AppEvent[],
  mansionId: string,
  ghostId: string,
): GhostSnapshot {
  const mine = selected.filter((event) => event.scope.mansion_id === mansionId && event.scope.ghost_id === ghostId)

  // The selected Run: greatest (run_sequence, run_id) that has a run_started.
  let start: AppEvent | null = null
  for (const event of mine) {
    if (event.event_type !== 'run_started') continue
    if (
      start === null ||
      event.scope.run_sequence > start.scope.run_sequence ||
      (event.scope.run_sequence === start.scope.run_sequence &&
        byCodePoint(event.scope.run_id, start.scope.run_id) >= 0)
    ) {
      // `mine` is in Canonical_Order, so among equal runs the latest start stands.
      start = event
    }
  }
  if (start === null) {
    return {
      mansion_id: mansionId,
      ghost_id: ghostId,
      run_id: null,
      run_sequence: null,
      state: 'idle',
      pending_approvals: [],
      open_tools: [],
      latest_event_id: null,
      latest_sequence: 0,
      reason: null,
    }
  }
  const run = mine.filter(
    (event) =>
      event.scope.run_sequence === start.scope.run_sequence &&
      event.scope.run_id === start.scope.run_id &&
      event.scope.session_slot === start.scope.session_slot,
  )
  const has = (type: EventType) => run.some((event) => event.event_type === type)
  const facts = (type: EventType, name: string, keep: (event: AppEvent) => boolean = () => true) =>
    new Set(
      run
        .filter((event) => event.event_type === type && keep(event))
        .map((event) => textField(event, name))
        .filter((value): value is string => value !== null),
    )

  const decided = facts('approval_decided', 'mid')
  const pending = [...facts('approval_requested', 'mid')].filter((mid) => !decided.has(mid)).sort(byCodePoint)
  const closed = facts('tool_finished', 'tool_call_id', (event) => field(event, 'final') === true)
  const open = [...facts('tool_started', 'tool_call_id')].filter((tool) => !closed.has(tool)).sort(byCodePoint)

  let state: GhostState
  let reasonTypes: readonly EventType[]
  if (has('run_failed')) {
    state = 'failed'
    reasonTypes = ['run_failed']
  } else if (has('run_blocked')) {
    state = 'blocked'
    reasonTypes = ['run_blocked']
  } else if (has('run_completed')) {
    state = 'done'
    reasonTypes = ['run_completed']
  } else if (pending.length > 0) {
    state = 'waiting'
    reasonTypes = ['approval_requested']
  } else {
    state = 'working'
    reasonTypes = ['ghost_progressed', 'run_started']
  }
  const reasonEvent = [...run]
    .reverse()
    .find(
      (event) =>
        reasonTypes.includes(event.event_type) &&
        (state !== 'waiting' || pending.includes(textField(event, 'mid') ?? '')),
    )
  const latest = run[run.length - 1]
  return {
    mansion_id: mansionId,
    ghost_id: ghostId,
    run_id: start.scope.run_id,
    run_sequence: start.scope.run_sequence,
    state,
    pending_approvals: pending,
    open_tools: open,
    latest_event_id: latest.event_id,
    latest_sequence: latest.sequence,
    reason: reasonEvent === undefined ? null : textField(reasonEvent, 'reason'),
  }
}

/** Reference snapshots for every (mansion, ghost) pair that has a selected event, in code-point order. */
export function referenceSnapshots(selected: readonly AppEvent[]): GhostSnapshot[] {
  const pairs = new Map<string, readonly [string, string]>()
  for (const event of selected) {
    pairs.set(JSON.stringify([event.scope.mansion_id, event.scope.ghost_id]), [
      event.scope.mansion_id,
      event.scope.ghost_id,
    ])
  }
  return [...pairs.values()]
    .sort((left, right) => byCodePoint(left[0], right[0]) || byCodePoint(left[1], right[1]))
    .map(([mansionId, ghostId]) => referenceSnapshot(selected, mansionId, ghostId))
}

/** Recursively freezes a value, so any input mutation by the code under test throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const member of Object.values(value)) deepFreeze(member)
  }
  return value
}
