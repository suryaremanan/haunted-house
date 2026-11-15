// Pure Spec 2 canonical selection and six-state ghost projection.
// No Crew mapping, SDK, React, network, filesystem, clock, or input mutation.

import {
  canonicalJson,
  serializeAppEvent,
  sha256Hex,
  type AppEvent,
  type EventId,
  type JsonValue,
  type RecordId,
} from './seance-event'

export const GHOST_STATES = ['idle', 'working', 'waiting', 'blocked', 'failed', 'done'] as const
export type GhostState = (typeof GHOST_STATES)[number]

export interface SelectionDiagnostic {
  readonly code: 'conflicting_variant' | 'missing_predecessor'
  readonly event_id: EventId
  readonly related_event_id: EventId | null
  readonly kind: 'conflict' | 'missing' | 'forward'
  readonly record_ids: readonly RecordId[]
}

export interface SelectionResult {
  readonly events: readonly AppEvent[]
  readonly diagnostics: readonly SelectionDiagnostic[]
}

export interface GhostSnapshot {
  readonly mansion_id: string
  readonly ghost_id: string
  readonly run_id: string | null
  readonly run_sequence: number | null
  readonly state: GhostState
  readonly pending_approvals: readonly string[]
  readonly open_tools: readonly string[]
  readonly latest_event_id: EventId | null
  readonly latest_sequence: number
  readonly reason: string | null
}

export type GhostTransitionId = `t1:${string}`

export interface GhostTransition {
  readonly transition_id: GhostTransitionId
  readonly causing_event_id: EventId
  readonly causing_sequence: number
  readonly mansion_id: string
  readonly ghost_id: string
  readonly from_state: GhostState
  readonly to_state: GhostState
}

export interface ProjectionResult {
  readonly selection: SelectionResult
  readonly snapshots: readonly GhostSnapshot[]
  readonly transitions: readonly GhostTransition[]
}

/**
 * Ranks usable candidate information after source revision and before
 * Record_ID. Writer metadata is excluded from this semantic rank.
 */
export function semanticCompleteness(event: AppEvent): number {
  return (
    event.caused_by.length +
    (event.occurred_at_ms === null ? 0 : 1) +
    (event.source.generation.length === 0 ? 0 : 1) +
    (event.source.source_sequence > 0 ? 1 : 0) +
    jsonInformationUnits(event.payload)
  )
}

/** Collapse Record_ID retries, choose one Event_ID variant, and order by Sequence. */
export function selectEvents(events: readonly AppEvent[]): SelectionResult {
  const byRecordId = new Map<RecordId, AppEvent>()
  for (const event of events) {
    const current = byRecordId.get(event.record_id)
    if (current === undefined || compareDuplicateChoice(event, current) < 0) {
      byRecordId.set(event.record_id, event)
    }
  }

  const variantsByEventId = new Map<EventId, AppEvent[]>()
  for (const event of byRecordId.values()) {
    const variants = variantsByEventId.get(event.event_id)
    if (variants === undefined) variantsByEventId.set(event.event_id, [event])
    else variants.push(event)
  }

  const selected: AppEvent[] = []
  const diagnostics = new Map<string, SelectionDiagnostic>()
  for (const [eventId, variants] of variantsByEventId) {
    let winner = variants[0]
    for (const event of variants.slice(1)) {
      if (compareVariantRank(event, winner) > 0) winner = event
    }
    selected.push(winner)

    const recordIds = variants.map((event) => event.record_id).sort(compareCodePoints)
    if (recordIds.length > 1) {
      addDiagnostic(diagnostics, {
        code: 'conflicting_variant',
        event_id: eventId,
        related_event_id: null,
        kind: 'conflict',
        record_ids: recordIds,
      })
    }
  }

  selected.sort(compareCanonicalOrder)
  const positions = new Map(selected.map((event, index) => [event.event_id, index] as const))
  selected.forEach((event, position) => {
    for (const predecessor of new Set(event.caused_by)) {
      const predecessorPosition = positions.get(predecessor)
      if (predecessorPosition === undefined) {
        addDiagnostic(diagnostics, {
          code: 'missing_predecessor',
          event_id: event.event_id,
          related_event_id: predecessor,
          kind: 'missing',
          record_ids: [],
        })
      } else if (predecessorPosition >= position) {
        addDiagnostic(diagnostics, {
          code: 'missing_predecessor',
          event_id: event.event_id,
          related_event_id: predecessor,
          kind: 'forward',
          record_ids: [],
        })
      }
    }
  })

  return {
    events: selected,
    diagnostics: Array.from(diagnostics.values()).sort(compareDiagnostics),
  }
}

/** Select and reduce one ghost while ignoring every foreign scope. */
export function reduceGhostSnapshot(
  events: readonly AppEvent[],
  mansionId: string,
  ghostId: string,
): GhostSnapshot {
  return reduceSelectedSnapshot(selectEvents(events).events, mansionId, ghostId)
}

/** Select and reduce every mansion/ghost identity represented by the events. */
export function reduceGhostSnapshots(events: readonly AppEvent[]): readonly GhostSnapshot[] {
  const selected = selectEvents(events).events
  return reduceSelectedSnapshots(selected)
}

/** Derive non-persisted snapshot changes in canonical order. */
export function deriveGhostTransitions(events: readonly AppEvent[]): readonly GhostTransition[] {
  return deriveSelectedTransitions(selectEvents(events).events)
}

/** Transition identity depends only on cause, ghost identity, and destination. */
export function ghostTransitionId(
  causingEventId: EventId,
  mansionId: string,
  ghostId: string,
  destinationState: GhostState,
): GhostTransitionId {
  const identity: JsonValue = [causingEventId, mansionId, ghostId, destinationState]
  return `t1:${sha256Hex(canonicalJson(identity))}`
}

/** Return canonical selection, snapshots, and transitions through one seam. */
export function foldGhostEvents(events: readonly AppEvent[]): ProjectionResult {
  const selection = selectEvents(events)
  return {
    selection,
    snapshots: reduceSelectedSnapshots(selection.events),
    transitions: deriveSelectedTransitions(selection.events),
  }
}

function reduceSelectedSnapshots(selected: readonly AppEvent[]): readonly GhostSnapshot[] {
  const identities = new Map<string, readonly [string, string]>()
  for (const event of selected) {
    const pair = [event.scope.mansion_id, event.scope.ghost_id] as const
    identities.set(canonicalJson(pair), pair)
  }
  return Array.from(identities.values())
    .sort(compareIdentityPairs)
    .map(([mansionId, ghostId]) => reduceSelectedSnapshot(selected, mansionId, ghostId))
}

/** Facts of one Run, accumulated in Canonical_Order. Mirrors what `reduceSelectedSnapshot` reads. */
interface RunFacts {
  readonly requests: AppEvent[]
  readonly decided: Set<string>
  readonly startedTools: Set<string>
  readonly finishedTools: Set<string>
  failed?: AppEvent
  blocked?: AppEvent
  completed?: AppEvent
  /** Latest `ghost_progressed` or `run_started`. */
  progress?: AppEvent
  latest: AppEvent
}

interface GhostFacts {
  readonly runs: Map<string, RunFacts>
  selectedStart: AppEvent | null
  snapshot: GhostSnapshot
}

function runKey(scope: AppEvent['scope']): string {
  return canonicalJson([scope.run_sequence, scope.run_id, scope.session_slot])
}

function recordRunFact(facts: RunFacts, event: AppEvent): void {
  facts.latest = event
  switch (event.event_type) {
    case 'approval_requested':
      if (payloadString(event, 'mid') !== null) facts.requests.push(event)
      break
    case 'approval_decided': {
      const mid = payloadString(event, 'mid')
      if (mid !== null) facts.decided.add(mid)
      break
    }
    case 'tool_started': {
      const toolId = payloadString(event, 'tool_call_id')
      if (toolId !== null) facts.startedTools.add(toolId)
      break
    }
    case 'tool_finished': {
      const toolId = payloadString(event, 'tool_call_id')
      if (toolId !== null && payloadBoolean(event, 'final') === true) facts.finishedTools.add(toolId)
      break
    }
    case 'run_failed':
      facts.failed = event
      break
    case 'run_blocked':
      facts.blocked = event
      break
    case 'run_completed':
      facts.completed = event
      break
    case 'ghost_progressed':
    case 'run_started':
      facts.progress = event
      break
    default:
      break
  }
}

/** The snapshot `reduceSelectedSnapshot` returns for the events accumulated so far. */
function snapshotFromFacts(ghost: GhostFacts, mansionId: string, ghostId: string): GhostSnapshot {
  const start = ghost.selectedStart
  if (start === null) return idleSnapshot(mansionId, ghostId)
  const facts = ghost.runs.get(runKey(start.scope))!

  const pending = new Set<string>()
  for (const request of facts.requests) {
    const mid = payloadString(request, 'mid')!
    if (!facts.decided.has(mid)) pending.add(mid)
  }
  const pendingApprovals = Array.from(pending).sort(compareCodePoints)
  const openTools = Array.from(facts.startedTools)
    .filter((toolId) => !facts.finishedTools.has(toolId))
    .sort(compareCodePoints)

  let state: GhostState
  let reasonEvent: AppEvent | undefined
  if (facts.failed !== undefined) {
    state = 'failed'
    reasonEvent = facts.failed
  } else if (facts.blocked !== undefined) {
    state = 'blocked'
    reasonEvent = facts.blocked
  } else if (facts.completed !== undefined) {
    state = 'done'
    reasonEvent = facts.completed
  } else if (pendingApprovals.length > 0) {
    state = 'waiting'
    reasonEvent = findLastEvent(facts.requests, (event) => pending.has(payloadString(event, 'mid')!))
  } else {
    state = 'working'
    reasonEvent = facts.progress
  }

  return {
    mansion_id: mansionId,
    ghost_id: ghostId,
    run_id: start.scope.run_id,
    run_sequence: start.scope.run_sequence,
    state,
    pending_approvals: pendingApprovals,
    open_tools: openTools,
    latest_event_id: facts.latest.event_id,
    latest_sequence: facts.latest.sequence,
    reason: reasonEvent === undefined ? null : payloadString(reasonEvent, 'reason'),
  }
}

/**
 * Compares, for each selected event, its ghost's snapshot before and after.
 * The result equals reducing every prefix with `reduceSelectedSnapshot`, but
 * each event is applied once, so a long log folds in near-linear time.
 */
function deriveSelectedTransitions(selected: readonly AppEvent[]): readonly GhostTransition[] {
  const ghosts = new Map<string, GhostFacts>()
  const transitions: GhostTransition[] = []
  for (const event of selected) {
    const mansionId = event.scope.mansion_id
    const ghostId = event.scope.ghost_id
    const ghostKey = canonicalJson([mansionId, ghostId])
    let ghost = ghosts.get(ghostKey)
    if (ghost === undefined) {
      ghost = { runs: new Map(), selectedStart: null, snapshot: idleSnapshot(mansionId, ghostId) }
      ghosts.set(ghostKey, ghost)
    }

    const key = runKey(event.scope)
    let facts = ghost.runs.get(key)
    if (facts === undefined) {
      facts = {
        requests: [],
        decided: new Set(),
        startedTools: new Set(),
        finishedTools: new Set(),
        latest: event,
      }
      ghost.runs.set(key, facts)
    }
    recordRunFact(facts, event)
    if (
      event.event_type === 'run_started' &&
      (ghost.selectedStart === null || compareRunStart(event, ghost.selectedStart) > 0)
    ) {
      ghost.selectedStart = event
    }

    const before = ghost.snapshot
    const after = snapshotFromFacts(ghost, mansionId, ghostId)
    ghost.snapshot = after
    if (snapshotsEqual(before, after)) continue
    transitions.push({
      transition_id: ghostTransitionId(event.event_id, mansionId, ghostId, after.state),
      causing_event_id: event.event_id,
      causing_sequence: event.sequence,
      mansion_id: mansionId,
      ghost_id: ghostId,
      from_state: before.state,
      to_state: after.state,
    })
  }
  return transitions
}

function reduceSelectedSnapshot(
  selected: readonly AppEvent[],
  mansionId: string,
  ghostId: string,
): GhostSnapshot {
  const scoped = selected.filter(
    (event) => event.scope.mansion_id === mansionId && event.scope.ghost_id === ghostId,
  )
  const starts = scoped.filter((event) => event.event_type === 'run_started')
  if (starts.length === 0) return idleSnapshot(mansionId, ghostId)

  let selectedStart = starts[0]
  for (const event of starts.slice(1)) {
    if (compareRunStart(event, selectedStart) > 0) selectedStart = event
  }
  const runEvents = scoped.filter(
    (event) =>
      event.scope.run_sequence === selectedStart.scope.run_sequence &&
      event.scope.run_id === selectedStart.scope.run_id &&
      event.scope.session_slot === selectedStart.scope.session_slot,
  )

  const requested = new Set(
    runEvents
      .filter((event) => event.event_type === 'approval_requested')
      .map((event) => payloadString(event, 'mid'))
      .filter((value): value is string => value !== null),
  )
  const decided = new Set(
    runEvents
      .filter((event) => event.event_type === 'approval_decided')
      .map((event) => payloadString(event, 'mid'))
      .filter((value): value is string => value !== null),
  )
  const pendingApprovals = Array.from(requested)
    .filter((mid) => !decided.has(mid))
    .sort(compareCodePoints)

  const startedTools = new Set(
    runEvents
      .filter((event) => event.event_type === 'tool_started')
      .map((event) => payloadString(event, 'tool_call_id'))
      .filter((value): value is string => value !== null),
  )
  const finishedTools = new Set(
    runEvents
      .filter((event) => event.event_type === 'tool_finished' && payloadBoolean(event, 'final') === true)
      .map((event) => payloadString(event, 'tool_call_id'))
      .filter((value): value is string => value !== null),
  )
  const openTools = Array.from(startedTools)
    .filter((toolId) => !finishedTools.has(toolId))
    .sort(compareCodePoints)

  const failed = runEvents.filter((event) => event.event_type === 'run_failed')
  const blocked = runEvents.filter((event) => event.event_type === 'run_blocked')
  const completed = runEvents.filter((event) => event.event_type === 'run_completed')

  let state: GhostState
  let reasonEvent: AppEvent | undefined
  if (failed.length > 0) {
    state = 'failed'
    reasonEvent = failed.at(-1)
  } else if (blocked.length > 0) {
    state = 'blocked'
    reasonEvent = blocked.at(-1)
  } else if (completed.length > 0) {
    state = 'done'
    reasonEvent = completed.at(-1)
  } else if (pendingApprovals.length > 0) {
    state = 'waiting'
    reasonEvent = findLastEvent(
      runEvents,
      (event) => event.event_type === 'approval_requested' && pendingApprovals.includes(payloadString(event, 'mid') ?? ''),
    )
  } else {
    state = 'working'
    reasonEvent = findLastEvent(
      runEvents,
      (event) => event.event_type === 'ghost_progressed' || event.event_type === 'run_started',
    )
  }

  const latest = runEvents.at(-1)!
  return {
    mansion_id: mansionId,
    ghost_id: ghostId,
    run_id: selectedStart.scope.run_id,
    run_sequence: selectedStart.scope.run_sequence,
    state,
    pending_approvals: pendingApprovals,
    open_tools: openTools,
    latest_event_id: latest.event_id,
    latest_sequence: latest.sequence,
    reason: reasonEvent === undefined ? null : payloadString(reasonEvent, 'reason'),
  }
}

function idleSnapshot(mansionId: string, ghostId: string): GhostSnapshot {
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

function findLastEvent(
  events: readonly AppEvent[],
  predicate: (event: AppEvent) => boolean,
): AppEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (predicate(event)) return event
  }
  return undefined
}

function jsonInformationUnits(value: JsonValue): number {
  if (value === null) return 0
  if (typeof value === 'string') return value.length === 0 ? 0 : 1
  if (typeof value === 'boolean' || typeof value === 'number') return 1
  if (Array.isArray(value)) {
    return (value as readonly JsonValue[]).reduce<number>(
      (total, entry) => total + jsonInformationUnits(entry),
      0,
    )
  }
  const record = value as { readonly [key: string]: JsonValue }
  return Object.values(record).reduce<number>((total, entry) => total + jsonInformationUnits(entry), 0)
}

function payloadRecord(event: AppEvent): { readonly [key: string]: JsonValue } | null {
  if (event.payload === null || Array.isArray(event.payload) || typeof event.payload !== 'object') return null
  return event.payload as { readonly [key: string]: JsonValue }
}

function payloadString(event: AppEvent, field: string): string | null {
  const value = payloadRecord(event)?.[field]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function payloadBoolean(event: AppEvent, field: string): boolean | null {
  const value = payloadRecord(event)?.[field]
  return typeof value === 'boolean' ? value : null
}

function compareVariantRank(left: AppEvent, right: AppEvent): number {
  if (left.source.revision !== right.source.revision) return left.source.revision - right.source.revision
  const completeness = semanticCompleteness(left) - semanticCompleteness(right)
  if (completeness !== 0) return completeness
  return compareCodePoints(left.record_id, right.record_id)
}

function compareDuplicateChoice(left: AppEvent, right: AppEvent): number {
  if (left.sequence !== right.sequence) return left.sequence - right.sequence
  const eventIdOrder = compareCodePoints(left.event_id, right.event_id)
  if (eventIdOrder !== 0) return eventIdOrder
  return compareCodePoints(serializeAppEvent(left), serializeAppEvent(right))
}

function compareCanonicalOrder(left: AppEvent, right: AppEvent): number {
  if (left.sequence !== right.sequence) return left.sequence - right.sequence
  return compareCodePoints(left.event_id, right.event_id)
}

function compareRunStart(left: AppEvent, right: AppEvent): number {
  if (left.scope.run_sequence !== right.scope.run_sequence) {
    return left.scope.run_sequence - right.scope.run_sequence
  }
  const runIdOrder = compareCodePoints(left.scope.run_id, right.scope.run_id)
  if (runIdOrder !== 0) return runIdOrder
  if (left.sequence !== right.sequence) return left.sequence - right.sequence
  return compareCodePoints(left.event_id, right.event_id)
}

function compareIdentityPairs(left: readonly [string, string], right: readonly [string, string]): number {
  const mansionOrder = compareCodePoints(left[0], right[0])
  return mansionOrder === 0 ? compareCodePoints(left[1], right[1]) : mansionOrder
}

function compareDiagnostics(left: SelectionDiagnostic, right: SelectionDiagnostic): number {
  const fields = [
    compareCodePoints(left.code, right.code),
    compareCodePoints(left.event_id, right.event_id),
    compareCodePoints(left.related_event_id ?? '', right.related_event_id ?? ''),
    compareCodePoints(left.kind, right.kind),
    compareCodePoints(left.record_ids.join(','), right.record_ids.join(',')),
  ]
  return fields.find((value) => value !== 0) ?? 0
}

function addDiagnostic(
  diagnostics: Map<string, SelectionDiagnostic>,
  diagnostic: SelectionDiagnostic,
): void {
  diagnostics.set(canonicalJson(diagnostic as unknown as JsonValue), diagnostic)
}

function snapshotsEqual(left: GhostSnapshot, right: GhostSnapshot): boolean {
  return canonicalJson(left as unknown as JsonValue) === canonicalJson(right as unknown as JsonValue)
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!)
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!)
  const length = Math.min(leftPoints.length, rightPoints.length)
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index]
  }
  return leftPoints.length - rightPoints.length
}
