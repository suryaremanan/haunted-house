// Canonical schema/parser examples.
// **Validates: Requirements 1.1–1.7, 7.1–7.6**
import { describe, expect, it } from 'vitest'
import {
  DIAGNOSTIC_CODES,
  EVENT_SCHEMA_VERSION,
  EVENT_TYPES,
  MAX_CAUSAL_PREDECESSORS,
  MAX_IDENTIFIER_BYTES,
  MAX_IDENTITY_PART_BYTES,
  MAX_IDENTITY_PARTS,
  MAX_PAYLOAD_BYTES,
  calculateEventId,
  calculateRecordId,
  canonicalJson,
  parseAppEvent,
  parseAppEventCandidate,
  parseAppEventLine,
  parseDomainEventPayload,
  parseEventScope,
  parseJsonValue,
  serializeAppEvent,
} from './seance-event'

const EVENT_ID = `e1:${'a'.repeat(64)}`
const RECORD_ID = `r1:${'b'.repeat(64)}`
const PREVIOUS_HASH = `h1:${'0'.repeat(64)}`
const HASH = `h1:${'c'.repeat(64)}`
const PYTHON_EVENT_ID = 'e1:907a575d5c4c5f3b6a3b6b18c6f4d9efdf0fa41b1713c06f83ed2beaa402e0a4'
const PYTHON_RECORD_ID = 'r1:19c40a8b1fe45660a8aa8798d39bdb6bdebdcb09923f854ad4b192e672fcbb5b'

function validEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const value: Record<string, unknown> = {
    schema_version: 1,
    event_id: EVENT_ID,
    record_id: RECORD_ID,
    sequence: 1,
    event_type: 'run_started',
    scope: {
      mansion_id: 'demo-mansion',
      ghost_id: 'archivist',
      session_slot: 'study-slot',
      run_id: 'run-1',
      run_sequence: 0,
    },
    source: {
      origin: 'house',
      source_type: 'assignment',
      identity_parts: ['run-1'],
      revision: 0,
      generation: 'generation-1',
      source_sequence: 0,
    },
    caused_by: [],
    occurred_at_ms: null,
    persisted_at_ms: 1_794_741_379_413,
    payload: { reason: 'assigned' },
    ...overrides,
  }
  const candidate = {
    schema_version: value.schema_version,
    event_type: value.event_type,
    scope: value.scope,
    source: value.source,
    caused_by: value.caused_by,
    occurred_at_ms: value.occurred_at_ms,
    payload: value.payload,
  }
  try {
    if (!Object.hasOwn(overrides, 'event_id')) value.event_id = calculateEventId(candidate as never)
    if (!Object.hasOwn(overrides, 'record_id')) value.record_id = calculateRecordId(candidate as never)
  } catch {
    // Invalid-value examples are expected to fail before identifier comparison.
  }
  return value
}

function expectDiagnostic(
  value: ReturnType<typeof parseAppEvent>,
  code: 'invalid_record' | 'unsupported_schema',
  path?: string,
): void {
  expect(value.ok).toBe(false)
  if (value.ok) return
  expect(value.diagnostic.code).toBe(code)
  if (path !== undefined) expect(value.diagnostic.path).toBe(path)
}

describe('canonical event constants', () => {
  it('shares the complete v1 event and diagnostic vocabularies', () => {
    expect(EVENT_SCHEMA_VERSION).toBe(1)
    expect(EVENT_TYPES).toEqual([
      'run_started',
      'ghost_progressed',
      'message_recorded',
      'message_updated',
      'response_segment_started',
      'response_chunk_recorded',
      'crew_turn_ended',
      'crew_error_observed',
      'run_completed',
      'run_blocked',
      'run_failed',
      'tool_started',
      'tool_updated',
      'tool_finished',
      'approval_requested',
      'approval_decided',
      'decision_recorded',
      'domain_event_recorded',
      'source_event_observed',
    ])
    expect(DIAGNOSTIC_CODES).toContain('invalid_record')
    expect(DIAGNOSTIC_CODES).toContain('hash_link_broken')
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length)
  })
})

describe('parseAppEvent', () => {
  it('parses the complete canonical envelope without mutating its input', () => {
    const input = validEvent({
      caused_by: [EVENT_ID],
      prev_hash: PREVIOUS_HASH,
      hash: HASH,
      payload: { nested: { z: 2, a: [true, null, 1.5] } },
    })
    const before = structuredClone(input)

    const result = parseAppEvent(input)

    expect(result).toEqual({ ok: true, value: input })
    expect(input).toEqual(before)
    expect(result.ok && result.value).not.toBe(input)
  })

  it.each(EVENT_TYPES)('accepts the supported Event_Type %s', (eventType) => {
    const payload =
      eventType === 'domain_event_recorded'
        ? { domain: 'doors', kind: 'door_opened', entity_id: 'study-door', data: { approved: true } }
        : {}
    const result = parseAppEvent(validEvent({ event_type: eventType, payload }))
    expect(result.ok).toBe(true)
  })

  it('matches the Python canonical identifier vectors', () => {
    const input = validEvent()
    expect(input.event_id).toBe(PYTHON_EVENT_ID)
    expect(input.record_id).toBe(PYTHON_RECORD_ID)
  })

  it('accepts empty generation and identity-part strings like the Python model', () => {
    const input = validEvent()
    const source = input.source as Record<string, unknown>
    expect(
      parseAppEvent(validEvent({ source: { ...source, generation: '', identity_parts: [''] } })).ok,
    ).toBe(true)
  })

  it('accepts the integrity fields only as a valid pair', () => {
    expect(parseAppEvent(validEvent()).ok).toBe(true)
    expect(parseAppEvent(validEvent({ prev_hash: PREVIOUS_HASH, hash: HASH })).ok).toBe(true)
    expectDiagnostic(parseAppEvent(validEvent({ prev_hash: PREVIOUS_HASH })), 'invalid_record', '$')
    expectDiagnostic(parseAppEvent(validEvent({ hash: HASH })), 'invalid_record', '$')
    expectDiagnostic(
      parseAppEvent(validEvent({ prev_hash: `h1:${'A'.repeat(64)}`, hash: HASH })),
      'invalid_record',
      '$.prev_hash',
    )
  })

  it('distinguishes unsupported schemas from malformed records', () => {
    expectDiagnostic(parseAppEvent(validEvent({ schema_version: 2 })), 'unsupported_schema', '$.schema_version')
    expectDiagnostic(parseAppEvent(validEvent({ schema_version: '1' })), 'unsupported_schema', '$.schema_version')
    const missingSchema = validEvent()
    delete missingSchema.schema_version
    expectDiagnostic(parseAppEvent(missingSchema), 'invalid_record', '$')
  })

  it.each([
    ['unknown event type', { event_type: 'ghost_started' }, '$.event_type'],
    ['zero sequence', { sequence: 0 }, '$.sequence'],
    ['fractional sequence', { sequence: 1.5 }, '$.sequence'],
    ['negative occurrence time', { occurred_at_ms: -1 }, '$.occurred_at_ms'],
    ['non-finite persistence time', { persisted_at_ms: Number.POSITIVE_INFINITY }, '$.persisted_at_ms'],
    ['malformed Event_ID', { event_id: 'e1:not-a-digest' }, '$.event_id'],
    ['malformed Record_ID', { record_id: `r1:${'B'.repeat(64)}` }, '$.record_id'],
    ['non-event causal predecessor', { caused_by: [`r1:${'a'.repeat(64)}`] }, '$.caused_by[0]'],
  ])('rejects %s', (_label, replacement, path) => {
    expectDiagnostic(parseAppEvent(validEvent(replacement)), 'invalid_record', path)
  })

  it('validates scope, source, and causal bounds', () => {
    const base = validEvent()
    const scope = base.scope as Record<string, unknown>
    const source = base.source as Record<string, unknown>

    expectDiagnostic(
      parseAppEvent(validEvent({ scope: { ...scope, mansion_id: 'Not-Kebab' } })),
      'invalid_record',
      '$.scope.mansion_id',
    )
    expectDiagnostic(
      parseAppEvent(validEvent({ scope: { ...scope, ghost_id: '' } })),
      'invalid_record',
      '$.scope.ghost_id',
    )
    expectDiagnostic(
      parseAppEvent(validEvent({ scope: { ...scope, run_sequence: -1 } })),
      'invalid_record',
      '$.scope.run_sequence',
    )
    expectDiagnostic(
      parseAppEvent(validEvent({ source: { ...source, origin: 'browser' } })),
      'invalid_record',
      '$.source.origin',
    )
    expectDiagnostic(
      parseAppEvent(validEvent({ source: { ...source, identity_parts: [] } })),
      'invalid_record',
      '$.source.identity_parts',
    )
    expectDiagnostic(
      parseAppEvent(
        validEvent({ source: { ...source, identity_parts: Array(MAX_IDENTITY_PARTS + 1).fill('part') } }),
      ),
      'invalid_record',
      '$.source.identity_parts',
    )
    expectDiagnostic(
      parseAppEvent(
        validEvent({ source: { ...source, identity_parts: ['é'.repeat(MAX_IDENTITY_PART_BYTES / 2 + 1)] } }),
      ),
      'invalid_record',
      '$.source.identity_parts[0]',
    )
    expectDiagnostic(
      parseAppEvent(validEvent({ caused_by: Array(MAX_CAUSAL_PREDECESSORS + 1).fill(EVENT_ID) })),
      'invalid_record',
      '$.caused_by',
    )
  })

  it('counts identifier bounds as UTF-8 bytes', () => {
    const base = validEvent()
    const scope = base.scope as Record<string, unknown>
    expect(parseAppEvent(validEvent({ scope: { ...scope, ghost_id: 'é'.repeat(MAX_IDENTIFIER_BYTES / 2) } })).ok).toBe(
      true,
    )
    expectDiagnostic(
      parseAppEvent(validEvent({ scope: { ...scope, ghost_id: 'é'.repeat(MAX_IDENTIFIER_BYTES / 2 + 1) } })),
      'invalid_record',
      '$.scope.ghost_id',
    )
  })

  it('requires exact envelope and nested-object fields', () => {
    expectDiagnostic(parseAppEvent(validEvent({ surprise: true })), 'invalid_record', '$')
    const base = validEvent()
    expectDiagnostic(
      parseAppEvent(validEvent({ scope: { ...(base.scope as object), extra: 'no' } })),
      'invalid_record',
      '$.scope',
    )
    expectDiagnostic(
      parseAppEvent(validEvent({ source: { ...(base.source as object), extra: 'no' } })),
      'invalid_record',
      '$.source',
    )
  })

  it.each([
    ['undefined', undefined],
    ['a bigint', 1n],
    ['a function', () => undefined],
    ['NaN', Number.NaN],
    ['positive infinity', Number.POSITIVE_INFINITY],
    ['a Date', new Date(0)],
  ])('rejects non-JSON payload value %s', (_label, payload) => {
    expectDiagnostic(parseAppEvent(validEvent({ payload })), 'invalid_record', '$.payload')
  })

  it('rejects cycles but accepts the same JSON object at independent paths', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expectDiagnostic(parseAppEvent(validEvent({ payload: cyclic })), 'invalid_record', '$.payload')

    const shared = { value: 1 }
    const result = parseAppEvent(validEvent({ payload: [shared, shared] }))
    expect(result.ok).toBe(true)
  })

  it('enforces the canonical payload byte bound', () => {
    expect(parseAppEvent(validEvent({ payload: 'x'.repeat(MAX_PAYLOAD_BYTES - 2) })).ok).toBe(true)
    expectDiagnostic(
      parseAppEvent(validEvent({ payload: 'x'.repeat(MAX_PAYLOAD_BYTES - 1) })),
      'invalid_record',
      '$.payload',
    )
  })

  it('returns bounded diagnostics without echoing rejected values', () => {
    const privateMarker = 'private-value-marker'
    const result = parseAppEvent(validEvent({ event_type: privateMarker, payload: { private: privateMarker } }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    const diagnostic = JSON.stringify(result.diagnostic)
    expect(diagnostic).not.toContain(privateMarker)
    expect(diagnostic).not.toContain('/Users/')
    expect(diagnostic.length).toBeLessThan(300)
  })

  it('turns hostile unknown objects into a typed diagnostic instead of throwing', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('hostile input detail')
        },
      },
    )
    expect(() => parseAppEvent(hostile)).not.toThrow()
    const result = parseAppEvent(hostile)
    expect(result).toEqual({
      ok: false,
      diagnostic: { code: 'invalid_record', safe_detail: 'Value could not be inspected safely.' },
    })
  })
})

describe('domain payload and candidate parsing', () => {
  it('parses the domain payload envelope and keeps its data JSON-compatible', () => {
    expect(
      parseDomainEventPayload({
        domain: 'doors',
        kind: 'door_approved',
        entity_id: 'study-door',
        data: { approved_by: 'owner', attempts: 1 },
      }),
    ).toEqual({
      ok: true,
      value: {
        domain: 'doors',
        kind: 'door_approved',
        entity_id: 'study-door',
        data: { approved_by: 'owner', attempts: 1 },
      },
    })
  })

  it.each([
    ['a missing field', { domain: 'doors', kind: 'opened', entity_id: 'door' }, '$.payload'],
    [
      'an extra field',
      { domain: 'doors', kind: 'opened', entity_id: 'door', data: null, extra: true },
      '$.payload',
    ],
    ['an empty identifier', { domain: '', kind: 'opened', entity_id: 'door', data: null }, '$.payload.domain'],
    [
      'non-JSON data',
      { domain: 'doors', kind: 'opened', entity_id: 'door', data: undefined },
      '$.payload',
    ],
  ])('rejects %s in a domain payload', (_label, payload, path) => {
    expect(parseDomainEventPayload(payload).ok).toBe(false)
    expectDiagnostic(
      parseAppEvent(validEvent({ event_type: 'domain_event_recorded', payload })),
      'invalid_record',
      path,
    )
  })

  it('parses candidate causal references as Event_ID values only', () => {
    const persisted = validEvent()
    const candidate = {
      schema_version: persisted.schema_version,
      event_type: persisted.event_type,
      scope: persisted.scope,
      source: persisted.source,
      caused_by: [EVENT_ID],
      occurred_at_ms: persisted.occurred_at_ms,
      payload: persisted.payload,
    }

    expect(parseAppEventCandidate(candidate)).toEqual({ ok: true, value: candidate })
    expect(
      parseAppEventCandidate({
        ...candidate,
        caused_by: [{ event_type: 'run_started', scope: persisted.scope, source: persisted.source }],
      }).ok,
    ).toBe(false)
  })

  it('uses candidate-specific diagnostics', () => {
    const persisted = validEvent()
    const result = parseAppEventCandidate({
      schema_version: 1,
      event_type: persisted.event_type,
      scope: persisted.scope,
      source: persisted.source,
      caused_by: [],
      occurred_at_ms: null,
      payload: undefined,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.diagnostic.code).toBe('invalid_candidate')
  })
})

describe('JSON and line parsing', () => {
  it('parses standalone JSON and scope values strictly', () => {
    expect(parseJsonValue({ ok: [1, true, null] })).toEqual({
      ok: true,
      value: { ok: [1, true, null] },
    })
    expect(parseJsonValue({ bad: undefined }).ok).toBe(false)
    expect(
      parseEventScope({
        mansion_id: 'demo',
        ghost_id: 'medium',
        session_slot: 'slot',
        run_id: 'run',
        run_sequence: 3,
      }).ok,
    ).toBe(true)
  })

  it('sorts keys recursively by Unicode code point and writes one newline', () => {
    const privateUse = '\ue000'
    const astral = '😀'
    expect(canonicalJson({ z: 0, a: { [astral]: 2, [privateUse]: 1, b: 3 } })).toBe(
      `{"a":{"b":3,"${privateUse}":1,"${astral}":2},"z":0}`,
    )

    const parsed = parseAppEvent(validEvent({ payload: { z: 2, a: { y: 1, b: true } } }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const serialized = serializeAppEvent(parsed.value)
    expect(serialized.endsWith('\n')).toBe(true)
    expect(serialized.slice(0, -1)).toBe(canonicalJson(parsed.value as unknown as never))
  })

  it('round-trips a serialized canonical event', () => {
    const parsed = parseAppEvent(validEvent({ payload: { b: 2, a: 1 } }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const serialized = serializeAppEvent(parsed.value)
    const reparsed = parseAppEventLine(serialized, 7)

    expect(reparsed).toEqual(parsed)
    if (reparsed.ok) expect(serializeAppEvent(reparsed.value)).toBe(serialized)
  })

  it('reports one-based safe line diagnostics', () => {
    expect(parseAppEventLine('{not json', 4)).toEqual({
      ok: false,
      diagnostic: { code: 'invalid_record', line: 4, safe_detail: 'Line is not valid JSON.' },
    })
    const invalid = parseAppEventLine(JSON.stringify(validEvent({ sequence: 0 })), 5)
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) {
      expect(invalid.diagnostic.line).toBe(5)
      expect(invalid.diagnostic.path).toBe('$.sequence')
    }
    expect(parseAppEventLine('{}', 0)).toEqual({
      ok: false,
      diagnostic: { code: 'invalid_record', safe_detail: 'Line number must be a positive integer.' },
    })
  })
})
