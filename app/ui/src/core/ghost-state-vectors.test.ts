// Focused shared-vector examples for Spec 2 selection and ghost reduction.
// Numbered Properties 8 and 9 remain owned by tasks 5.2 and 5.3.
// **Validates: Requirements 5.2, 5.4, 5.9, 5.10, 6.1–6.13, 8.1–8.3**
import { describe, expect, it } from 'vitest'
import vectorJson from '../../../../fixtures/seance/projection-vectors.json'
import {
  deriveGhostTransitions,
  foldGhostEvents,
  ghostTransitionId,
  reduceGhostSnapshot,
  selectEvents,
  semanticCompleteness,
} from './ghost-state'
import {
  calculateEventId,
  calculateRecordId,
  canonicalJson,
  sha256Hex,
  type AppEvent,
  type AppEventCandidate,
  type EventId,
  type EventType,
  type JsonValue,
} from './seance-event'

type SeedEvent = {
  readonly name: string
  readonly ghost_id: string
  readonly run_id: string
  readonly run_sequence: number
  readonly event_type: EventType
  readonly sequence: number
  readonly identity: string
  readonly revision?: number
  readonly source_sequence?: number
  readonly payload: JsonValue
  readonly caused_by?: readonly string[]
  readonly repeat?: number
}

type ExpectedSnapshot = {
  readonly ghost_id: string
  readonly run_id: string | null
  readonly run_sequence: number | null
  readonly state: string
  readonly pending_approvals: readonly string[]
  readonly open_tools: readonly string[]
  readonly latest_event: string | null
  readonly latest_sequence: number
  readonly reason: string | null
}

type ProjectionVector = {
  readonly name: string
  readonly mansion_id: string
  readonly events: readonly SeedEvent[]
  readonly expected: {
    readonly parity: {
      readonly projection_sha256: string
      readonly selected_count: number
      readonly transition_count: number
      readonly document_keys: readonly string[]
    }
    readonly unique_record_count: number
    readonly selected_event_count: number
    readonly revision_winner: string
    readonly completeness_winner: string
    readonly lexicographic_candidates: readonly string[]
    readonly diagnostic_counts: Readonly<Record<string, number>>
    readonly snapshots: readonly ExpectedSnapshot[]
    readonly state_changes: readonly (readonly [string, string, string])[]
  }
}

const vector = (vectorJson as unknown as { readonly vectors: readonly ProjectionVector[] }).vectors[0]

function candidate(seed: SeedEvent, causedBy: readonly EventId[]): AppEventCandidate {
  return {
    schema_version: 1,
    event_type: seed.event_type,
    scope: {
      mansion_id: vector.mansion_id,
      ghost_id: seed.ghost_id,
      session_slot: `${seed.ghost_id}-slot`,
      run_id: seed.run_id,
      run_sequence: seed.run_sequence,
    },
    source: {
      origin: 'house',
      source_type: seed.event_type,
      identity_parts: [seed.identity],
      revision: seed.revision ?? 0,
      generation: 'g1',
      source_sequence: seed.source_sequence ?? seed.sequence,
    },
    caused_by: causedBy,
    occurred_at_ms: seed.sequence,
    payload: seed.payload,
  }
}

function materialize(): { readonly events: readonly AppEvent[]; readonly named: ReadonlyMap<string, AppEvent> } {
  const provisional = new Map(vector.events.map((seed) => [seed.name, candidate(seed, [])] as const))
  const eventIds = new Map(Array.from(provisional, ([name, value]) => [name, calculateEventId(value)] as const))
  const named = new Map<string, AppEvent>()
  const events: AppEvent[] = []

  for (const seed of vector.events) {
    const references = (seed.caused_by ?? []).map((reference) => {
      if (reference.startsWith('e1:')) return reference as EventId
      const eventId = eventIds.get(reference)
      if (eventId === undefined) throw new Error(`Unknown projection-vector event: ${reference}`)
      return eventId
    })
    const value = candidate(seed, references)
    const event: AppEvent = {
      ...value,
      event_id: calculateEventId(value),
      record_id: calculateRecordId(value),
      sequence: seed.sequence,
      persisted_at_ms: 1_000 + seed.sequence,
    }
    named.set(seed.name, event)
    for (let copy = 0; copy < (seed.repeat ?? 1); copy += 1) events.push(event)
  }
  return { events, named }
}

function namedEvent(named: ReadonlyMap<string, AppEvent>, name: string): AppEvent {
  const event = named.get(name)
  if (event === undefined) throw new Error(`Missing projection-vector event: ${name}`)
  return event
}

function selectedNames(
  selected: readonly AppEvent[],
  named: ReadonlyMap<string, AppEvent>,
): ReadonlyMap<EventId, string> {
  const byRecordId = new Map(Array.from(named, ([name, event]) => [event.record_id, name] as const))
  return new Map(
    selected.map((event) => {
      const name = byRecordId.get(event.record_id)
      if (name === undefined) throw new Error(`Unmapped selected record: ${event.record_id}`)
      return [event.event_id, name] as const
    }),
  )
}

describe('shared Spec 2 projection vectors', () => {
  it('collapses exact records, ranks variants, orders Sequence, and diagnoses causality', () => {
    const { events, named } = materialize()
    const before = structuredClone(events)

    const result = selectEvents([...events].reverse())

    expect(events).toEqual(before)
    expect(new Set(events.map((event) => event.record_id)).size).toBe(vector.expected.unique_record_count)
    expect(result.events).toHaveLength(vector.expected.selected_event_count)
    expect(result.events.map((event) => event.sequence)).toEqual(
      [...result.events].sort((left, right) => left.sequence - right.sequence || left.event_id.localeCompare(right.event_id))
        .map((event) => event.sequence),
    )

    const selectedRecords = new Set(result.events.map((event) => event.record_id))
    expect(selectedRecords).toContain(namedEvent(named, vector.expected.revision_winner).record_id)
    expect(selectedRecords).not.toContain(namedEvent(named, 'working-progress-old').record_id)
    expect(selectedRecords).toContain(namedEvent(named, vector.expected.completeness_winner).record_id)
    expect(selectedRecords).not.toContain(namedEvent(named, 'working-detail-sparse').record_id)

    const lexEvents = vector.expected.lexicographic_candidates.map((name) => namedEvent(named, name))
    const lexWinner = [...lexEvents].sort((left, right) => left.record_id.localeCompare(right.record_id)).at(-1)!
    expect(selectedRecords).toContain(lexWinner.record_id)
    expect(semanticCompleteness(lexEvents[0])).toBe(semanticCompleteness(lexEvents[1]))

    const diagnosticCounts = Object.fromEntries(
      Array.from(new Set(result.diagnostics.map((diagnostic) => diagnostic.code))).map((code) => [
        code,
        result.diagnostics.filter((diagnostic) => diagnostic.code === code).length,
      ]),
    )
    expect(diagnosticCounts).toEqual(vector.expected.diagnostic_counts)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        kind: 'forward',
        event_id: namedEvent(named, 'working-start').event_id,
        related_event_id: namedEvent(named, 'working-turn').event_id,
      }),
    )
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        kind: 'missing',
        event_id: namedEvent(named, 'working-turn').event_id,
      }),
    )
  })

  it('reduces all six states with precedence, approval subtraction, and final-tool subtraction', () => {
    const { events, named } = materialize()
    const folded = foldGhostEvents(events)
    const actual = new Map(folded.snapshots.map((snapshot) => [snapshot.ghost_id, snapshot] as const))

    expect(new Set(folded.snapshots.map((snapshot) => snapshot.state))).toEqual(
      new Set(['idle', 'working', 'waiting', 'blocked', 'failed', 'done']),
    )
    for (const expected of vector.expected.snapshots) {
      expect(actual.get(expected.ghost_id)).toEqual({
        mansion_id: vector.mansion_id,
        ghost_id: expected.ghost_id,
        run_id: expected.run_id,
        run_sequence: expected.run_sequence,
        state: expected.state,
        pending_approvals: expected.pending_approvals,
        open_tools: expected.open_tools,
        latest_event_id:
          expected.latest_event === null ? null : namedEvent(named, expected.latest_event).event_id,
        latest_sequence: expected.latest_sequence,
        reason: expected.reason,
      })
    }

    expect(actual.get('waiting-ghost')?.pending_approvals).toEqual(['zeta'])
    expect(actual.get('waiting-ghost')?.open_tools).toEqual(['tool-a'])
    expect(actual.get('working-ghost')?.state).toBe('working')
    expect(actual.get('higher-ghost')).toEqual(expect.objectContaining({ run_sequence: 1, latest_sequence: 30 }))

    const waiting = reduceGhostSnapshot(events, vector.mansion_id, 'waiting-ghost')
    const foreignOnly = events.filter((event) => event.scope.ghost_id !== 'waiting-ghost')
    expect(reduceGhostSnapshot(foreignOnly, vector.mansion_id, 'waiting-ghost')).toEqual({
      mansion_id: vector.mansion_id,
      ghost_id: 'waiting-ghost',
      run_id: null,
      run_sequence: null,
      state: 'idle',
      pending_approvals: [],
      open_tools: [],
      latest_event_id: null,
      latest_sequence: 0,
      reason: null,
    })
    expect(waiting).toEqual(actual.get('waiting-ghost'))
  })

  it('derives deterministic transitions without creating persisted events', () => {
    const { events, named } = materialize()
    const transitions = deriveGhostTransitions(events)
    const names = selectedNames(selectEvents(events).events, named)

    for (const transition of transitions) {
      expect(transition.transition_id).toBe(
        ghostTransitionId(
          transition.causing_event_id,
          transition.mansion_id,
          transition.ghost_id,
          transition.to_state,
        ),
      )
      expect(transition.transition_id).toMatch(/^t1:[0-9a-f]{64}$/)
      expect(transition).not.toHaveProperty('schema_version')
      expect(transition).not.toHaveProperty('record_id')
    }

    const stateChanges = transitions
      .filter((transition) => transition.from_state !== transition.to_state)
      .map((transition) => [
        names.get(transition.causing_event_id),
        transition.from_state,
        transition.to_state,
      ])
    expect(stateChanges).toEqual(vector.expected.state_changes)
  })

  // Task 5.4, TypeScript side. `parity.projection_sha256` is asserted by the
  // Python fold in app/backend/tests/unit/test_ghost_state_parity.py over the
  // same language-neutral document. Matching it here compares the complete
  // selection, snapshots, transitions and diagnostics across the two languages.
  it('produces the same projection document as the Python fold, byte for byte', () => {
    const { events } = materialize()
    const folded = foldGhostEvents(events)
    const parity = vector.expected.parity
    const byCanonicalJson = (left: JsonValue, right: JsonValue) => {
      const a = Array.from(canonicalJson(left), (c) => c.codePointAt(0)!)
      const b = Array.from(canonicalJson(right), (c) => c.codePointAt(0)!)
      for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
        if (a[index] !== b[index]) return a[index] - b[index]
      }
      return a.length - b.length
    }
    const document: Record<string, JsonValue> = {
      selected: folded.selection.events.map((event) => [event.event_id, event.record_id, event.sequence]),
      // foldGhostEvents already sorts snapshots by (mansion_id, ghost_id).
      snapshots: folded.snapshots as unknown as JsonValue,
      transitions: folded.transitions as unknown as JsonValue,
      diagnostics: folded.selection.diagnostics
        .map((d): JsonValue => [d.code, d.kind, d.event_id, d.related_event_id, [...d.record_ids]])
        .sort(byCanonicalJson),
    }

    expect(Object.keys(document).sort()).toEqual(parity.document_keys)
    expect(folded.selection.events).toHaveLength(parity.selected_count)
    expect(folded.transitions).toHaveLength(parity.transition_count)
    expect(sha256Hex(canonicalJson(document))).toBe(parity.projection_sha256)
  })

  it('keeps Crew turn and error observations nonterminal in the shared vector', () => {
    const { events, named } = materialize()
    const working = reduceGhostSnapshot(events, vector.mansion_id, 'working-ghost')
    // The Run's latest facts are crew_turn_ended then crew_error_observed.
    expect(namedEvent(named, 'working-turn').event_type).toBe('crew_turn_ended')
    expect(namedEvent(named, 'working-error').event_type).toBe('crew_error_observed')
    expect(working.latest_event_id).toBe(namedEvent(named, 'working-error').event_id)
    expect(working.state).toBe('working')
    expect(
      deriveGhostTransitions(events)
        .filter((transition) => transition.ghost_id === 'working-ghost')
        .map((transition) => transition.to_state),
    ).not.toEqual(expect.arrayContaining(['done', 'blocked', 'failed']))
  })
})
