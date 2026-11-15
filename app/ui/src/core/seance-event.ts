// Pure canonical séance event model and unknown-value parser.
// No Crew frame interpretation, SDK, React, network, filesystem, or clock access.

export const SCHEMA_VERSION = 1 as const
export const EVENT_SCHEMA_VERSION = SCHEMA_VERSION

export const EVENT_TYPES = [
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
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export const ALLOWED_EVENT_TYPES: ReadonlySet<EventType> = new Set(EVENT_TYPES)

export const EVENT_ORIGINS = ['crew', 'house'] as const
export type EventOrigin = (typeof EVENT_ORIGINS)[number]

export const DIAGNOSTIC_CODES = [
  'invalid_envelope',
  'unknown_session',
  'invalid_candidate',
  'invalid_record',
  'unsupported_schema',
  'duplicate_sequence',
  'missing_sequence',
  'hash_mismatch',
  'hash_link_broken',
  'mixed_integrity_mode',
  'missing_predecessor',
  'conflicting_variant',
  'approval_unmatched',
  'history_partial',
  'persistence_failed',
] as const

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number]

export const MANSION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MAX_MANSION_ID_LENGTH = 40
export const MAX_MANSION_ID_CHARACTERS = MAX_MANSION_ID_LENGTH
export const MAX_IDENTIFIER_BYTES = 160
export const MAX_IDENTITY_PARTS = 8
export const MAX_IDENTITY_PART_BYTES = 512
export const MAX_CAUSAL_PREDECESSORS = 32
export const MAX_PAYLOAD_BYTES = 256 * 1024
export const MAX_INGEST_BATCH_SIZE = 100
export const MAX_INGEST_REQUEST_BYTES = 1024 * 1024
export const HASH_PREFIX = 'h1:'

export type JsonPrimitive = null | boolean | number | string
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export type EventId = `e1:${string}`
export type RecordId = `r1:${string}`
export type EventHash = `h1:${string}`

export interface EventScope {
  readonly mansion_id: string
  readonly ghost_id: string
  readonly session_slot: string
  readonly run_id: string
  readonly run_sequence: number
}

export interface EventIdentitySource {
  readonly origin: EventOrigin
  readonly source_type: string
  readonly identity_parts: readonly string[]
}

export interface EventSource extends EventIdentitySource {
  readonly revision: number
  readonly generation: string
  readonly source_sequence: number
}

/** A causal predecessor is always the Event_ID of an existing logical event. */
export type EventRef = EventId

export interface DomainEventPayload {
  readonly [key: string]: JsonValue
  readonly domain: string
  readonly kind: string
  readonly entity_id: string
  readonly data: JsonValue
}

export interface AppEventCandidate {
  readonly schema_version: typeof EVENT_SCHEMA_VERSION
  readonly event_type: EventType
  readonly scope: EventScope
  readonly source: EventSource
  readonly caused_by: readonly EventRef[]
  readonly occurred_at_ms: number | null
  readonly payload: JsonValue
}

export interface AppEvent {
  readonly schema_version: typeof EVENT_SCHEMA_VERSION
  readonly event_id: EventId
  readonly record_id: RecordId
  readonly sequence: number
  readonly event_type: EventType
  readonly scope: EventScope
  readonly source: EventSource
  readonly caused_by: readonly EventId[]
  readonly occurred_at_ms: number | null
  readonly persisted_at_ms: number
  readonly payload: JsonValue
  readonly prev_hash?: EventHash
  readonly hash?: EventHash
}

export interface EventDiagnostic {
  readonly code: DiagnosticCode
  /** A schema path only. It never contains an input value or a payload key. */
  readonly path?: string
  /** Static, bounded text safe to persist or display. */
  readonly safe_detail: string
  /** One-based source line when parsing JSONL. */
  readonly line?: number
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostic: EventDiagnostic }

const EVENT_ORIGIN_SET = new Set<string>(EVENT_ORIGINS)
const UTF8 = new TextEncoder()
const DIGEST_PATTERN = /^[0-9a-f]{64}$/

class InvalidValue extends Error {
  constructor(
    readonly path: string,
    readonly safeDetail: string,
  ) {
    super(safeDetail)
  }
}

function invalid(path: string, safeDetail: string): never {
  throw new InvalidValue(path, safeDetail)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function recordAt(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainRecord(value)) invalid(path, 'must be a JSON object')
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') invalid(path, 'must contain only JSON object members')
    const descriptor = descriptors[key]
    if (!descriptor.enumerable || !('value' in descriptor)) {
      invalid(path, 'must contain only JSON object members')
    }
  }
  return value
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
  path = '$',
): void {
  const allowed = new Set([...required, ...optional])
  const keys = Object.keys(value)
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key))) {
    invalid(path, 'has missing or unexpected fields')
  }
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true
    }
  }
  return false
}

function utf8Length(value: string): number {
  return UTF8.encode(value).byteLength
}

function stringAt(
  value: unknown,
  path: string,
  { maxBytes = MAX_IDENTIFIER_BYTES, allowEmpty = false }: { maxBytes?: number; allowEmpty?: boolean } = {},
): string {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
    invalid(path, 'must be a valid Unicode string')
  }
  const bytes = utf8Length(value)
  if ((!allowEmpty && bytes === 0) || bytes > maxBytes) {
    invalid(path, `must be ${allowEmpty ? 'at most' : 'between 1 and'} ${maxBytes} UTF-8 bytes`)
  }
  return value
}

function integerAt(value: unknown, path: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    invalid(path, `must be an integer greater than or equal to ${minimum}`)
  }
  return value
}

function timestampAt(value: unknown, path: string, nullable: boolean): number | null {
  if (nullable && value === null) return null
  return integerAt(value, path, 0)
}

function mansionIdAt(value: unknown, path: string): string {
  const mansionId = stringAt(value, path, { maxBytes: MAX_MANSION_ID_CHARACTERS })
  if (mansionId.length > MAX_MANSION_ID_CHARACTERS || !MANSION_ID_PATTERN.test(mansionId)) {
    invalid(path, 'must be a kebab-case Mansion_ID of at most 40 characters')
  }
  return mansionId
}

function eventTypeAt(value: unknown, path: string): EventType {
  if (typeof value !== 'string' || !ALLOWED_EVENT_TYPES.has(value as EventType)) {
    invalid(path, 'must be a supported Event_Type')
  }
  return value as EventType
}

function eventOriginAt(value: unknown, path: string): EventOrigin {
  if (typeof value !== 'string' || !EVENT_ORIGIN_SET.has(value)) {
    invalid(path, 'must be a supported event origin')
  }
  return value as EventOrigin
}

function prefixedDigestAt<Prefix extends 'e1:' | 'r1:' | 'h1:'>(
  value: unknown,
  prefix: Prefix,
  path: string,
): `${Prefix}${string}` {
  if (typeof value !== 'string' || !value.startsWith(prefix) || !DIGEST_PATTERN.test(value.slice(prefix.length))) {
    invalid(path, `must be a lowercase ${prefix.slice(0, -1)} SHA-256 identifier`)
  }
  return value as `${Prefix}${string}`
}

function parseScopeValue(value: unknown, path: string): EventScope {
  const record = recordAt(value, path)
  exactKeys(record, ['mansion_id', 'ghost_id', 'session_slot', 'run_id', 'run_sequence'], [], path)
  return {
    mansion_id: mansionIdAt(record.mansion_id, `${path}.mansion_id`),
    ghost_id: stringAt(record.ghost_id, `${path}.ghost_id`),
    session_slot: stringAt(record.session_slot, `${path}.session_slot`),
    run_id: stringAt(record.run_id, `${path}.run_id`),
    run_sequence: integerAt(record.run_sequence, `${path}.run_sequence`, 0),
  }
}

function parseIdentityParts(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_IDENTITY_PARTS) {
    invalid(path, `must contain between 1 and ${MAX_IDENTITY_PARTS} identity parts`)
  }
  return value.map((part, index) =>
    stringAt(part, `${path}[${index}]`, { maxBytes: MAX_IDENTITY_PART_BYTES, allowEmpty: true }),
  )
}

function parseSourceValue(value: unknown, path: string): EventSource {
  const record = recordAt(value, path)
  exactKeys(
    record,
    ['origin', 'source_type', 'identity_parts', 'revision', 'generation', 'source_sequence'],
    [],
    path,
  )
  return {
    origin: eventOriginAt(record.origin, `${path}.origin`),
    source_type: stringAt(record.source_type, `${path}.source_type`),
    identity_parts: parseIdentityParts(record.identity_parts, `${path}.identity_parts`),
    revision: integerAt(record.revision, `${path}.revision`, 0),
    generation: stringAt(record.generation, `${path}.generation`, { allowEmpty: true }),
    source_sequence: integerAt(record.source_sequence, `${path}.source_sequence`, 0),
  }
}

function parseEventRefValue(value: unknown, path: string): EventRef {
  return prefixedDigestAt(value, 'e1:', path)
}

function parseCausedBy<T>(
  value: unknown,
  path: string,
  parseEntry: (entry: unknown, entryPath: string) => T,
): T[] {
  if (!Array.isArray(value) || value.length > MAX_CAUSAL_PREDECESSORS) {
    invalid(path, `must contain at most ${MAX_CAUSAL_PREDECESSORS} causal predecessors`)
  }
  return value.map((entry, index) => parseEntry(entry, `${path}[${index}]`))
}

function parseJsonValueInternal(value: unknown, path: string, ancestors: Set<object>): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string' && hasUnpairedSurrogate(value)) {
      invalid(path, 'must contain valid Unicode strings')
    }
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(path, 'must contain only finite numbers')
    return Object.is(value, -0) ? 0 : value
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) invalid(path, 'must not contain a cycle')
    ancestors.add(value)
    try {
      return value.map((entry) => parseJsonValueInternal(entry, path, ancestors))
    } finally {
      ancestors.delete(value)
    }
  }
  if (isPlainRecord(value)) {
    if (ancestors.has(value)) invalid(path, 'must not contain a cycle')
    ancestors.add(value)
    try {
      const record = recordAt(value, path)
      const result: Record<string, JsonValue> = {}
      for (const key of Object.keys(record)) {
        if (hasUnpairedSurrogate(key)) invalid(path, 'must contain valid Unicode object keys')
        Object.defineProperty(result, key, {
          value: parseJsonValueInternal(record[key], path, ancestors),
          enumerable: true,
          configurable: true,
          writable: true,
        })
      }
      return result
    } finally {
      ancestors.delete(value)
    }
  }
  invalid(path, 'must be JSON-compatible')
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

/** Deterministic JSON with recursively sorted object keys and no insignificant whitespace. */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as { readonly [key: string]: JsonValue }
  return `{${Object.keys(record)
    .sort(compareCodePoints)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
] as const

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count))
}

/** Synchronous SHA-256 for deterministic pure-core derived identities. */
export function sha256Hex(value: string): string {
  const input = UTF8.encode(value)
  const bitLength = input.length * 8
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64
  const message = new Uint8Array(paddedLength)
  message.set(input)
  message[input.length] = 0x80
  const view = new DataView(message.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const words = new Uint32Array(64)

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false)
    for (let index = 16; index < 64; index += 1) {
      const before15 = words[index - 15]
      const before2 = words[index - 2]
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3)
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choose = (e & f) ^ (~e & g)
      const temporary1 = (h + sum1 + choose + SHA256_CONSTANTS[index] + words[index]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temporary2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temporary1) >>> 0
      d = c
      c = b
      b = a
      a = (temporary1 + temporary2) >>> 0
    }

    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }

  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('')
}

function scopeToJson(scope: EventScope): { readonly [key: string]: JsonValue } {
  return {
    mansion_id: scope.mansion_id,
    ghost_id: scope.ghost_id,
    session_slot: scope.session_slot,
    run_id: scope.run_id,
    run_sequence: scope.run_sequence,
  }
}

function sourceToJson(source: EventSource): { readonly [key: string]: JsonValue } {
  return {
    origin: source.origin,
    source_type: source.source_type,
    identity_parts: source.identity_parts,
    revision: source.revision,
    generation: source.generation,
    source_sequence: source.source_sequence,
  }
}

/** Returns exactly the fields included in Record_ID input. */
export function candidateToJson(value: AppEventCandidate | AppEvent): { readonly [key: string]: JsonValue } {
  return {
    schema_version: value.schema_version,
    event_type: value.event_type,
    scope: scopeToJson(value.scope),
    source: sourceToJson(value.source),
    caused_by: value.caused_by,
    occurred_at_ms: value.occurred_at_ms,
    payload: value.payload,
  }
}

/** Calculates Event_ID from only stable source identity, scope, and Event_Type. */
export function calculateEventId(value: AppEventCandidate | AppEvent): EventId {
  const identity: JsonValue = [
    value.schema_version,
    value.event_type,
    scopeToJson(value.scope),
    {
      origin: value.source.origin,
      source_type: value.source.source_type,
      identity_parts: value.source.identity_parts,
    },
  ]
  return `e1:${sha256Hex(canonicalJson(identity))}`
}

/** Calculates Record_ID from the candidate fields, excluding all writer metadata. */
export function calculateRecordId(value: AppEventCandidate | AppEvent): RecordId {
  return `r1:${sha256Hex(canonicalJson(candidateToJson(value)))}`
}

/** Returns the exact JSON-compatible persisted envelope. */
export function appEventToJson(event: AppEvent): { readonly [key: string]: JsonValue } {
  const value: Record<string, JsonValue> = {
    ...candidateToJson(event),
    event_id: event.event_id,
    record_id: event.record_id,
    sequence: event.sequence,
    persisted_at_ms: event.persisted_at_ms,
  }
  if (event.prev_hash !== undefined && event.hash !== undefined) {
    value.prev_hash = event.prev_hash
    value.hash = event.hash
  }
  return value
}

function parsePayload(value: unknown, eventType: EventType, path: string): JsonValue {
  const payload = parseJsonValueInternal(value, path, new Set())
  if (utf8Length(canonicalJson(payload)) > MAX_PAYLOAD_BYTES) {
    invalid(path, `must encode to at most ${MAX_PAYLOAD_BYTES} UTF-8 bytes`)
  }
  if (eventType === 'domain_event_recorded') return parseDomainPayloadValue(payload, path)
  return payload
}

function parseDomainPayloadValue(value: unknown, path: string): DomainEventPayload {
  const record = recordAt(value, path)
  exactKeys(record, ['domain', 'kind', 'entity_id', 'data'], [], path)
  return {
    domain: stringAt(record.domain, `${path}.domain`),
    kind: stringAt(record.kind, `${path}.kind`),
    entity_id: stringAt(record.entity_id, `${path}.entity_id`),
    data: parseJsonValueInternal(record.data, `${path}.data`, new Set()),
  }
}

function schemaVersionAt(record: Record<string, unknown>, path: string): typeof EVENT_SCHEMA_VERSION {
  if (record.schema_version !== EVENT_SCHEMA_VERSION) {
    throw new UnsupportedSchema(path)
  }
  return EVENT_SCHEMA_VERSION
}

class UnsupportedSchema extends Error {
  constructor(readonly path: string) {
    super('schema version is not supported')
  }
}

function diagnosticResult<T>(
  code: 'invalid_candidate' | 'invalid_record',
  parse: () => T,
): ParseResult<T> {
  try {
    return { ok: true, value: parse() }
  } catch (error) {
    if (error instanceof UnsupportedSchema) {
      return {
        ok: false,
        diagnostic: {
          code: 'unsupported_schema',
          path: error.path,
          safe_detail: 'Schema version is not supported.',
        },
      }
    }
    if (error instanceof InvalidValue) {
      return {
        ok: false,
        diagnostic: { code, path: error.path, safe_detail: error.safeDetail },
      }
    }
    return {
      ok: false,
      diagnostic: { code, safe_detail: 'Value could not be inspected safely.' },
    }
  }
}

export function parseJsonValue(value: unknown): ParseResult<JsonValue> {
  return diagnosticResult('invalid_record', () => parseJsonValueInternal(value, '$', new Set()))
}

export function parseEventScope(value: unknown): ParseResult<EventScope> {
  return diagnosticResult('invalid_record', () => parseScopeValue(value, '$.scope'))
}

export function parseDomainEventPayload(value: unknown): ParseResult<DomainEventPayload> {
  return diagnosticResult('invalid_record', () => parseDomainPayloadValue(value, '$.payload'))
}

export function parseAppEventCandidate(value: unknown): ParseResult<AppEventCandidate> {
  return diagnosticResult('invalid_candidate', () => {
    const record = recordAt(value, '$')
    exactKeys(
      record,
      ['schema_version', 'event_type', 'scope', 'source', 'caused_by', 'occurred_at_ms', 'payload'],
    )
    const schemaVersion = schemaVersionAt(record, '$.schema_version')
    const eventType = eventTypeAt(record.event_type, '$.event_type')
    return {
      schema_version: schemaVersion,
      event_type: eventType,
      scope: parseScopeValue(record.scope, '$.scope'),
      source: parseSourceValue(record.source, '$.source'),
      caused_by: parseCausedBy(record.caused_by, '$.caused_by', parseEventRefValue),
      occurred_at_ms: timestampAt(record.occurred_at_ms, '$.occurred_at_ms', true),
      payload: parsePayload(record.payload, eventType, '$.payload'),
    }
  })
}

export function parseAppEvent(value: unknown): ParseResult<AppEvent> {
  return diagnosticResult('invalid_record', () => {
    const record = recordAt(value, '$')
    exactKeys(
      record,
      [
        'schema_version',
        'event_id',
        'record_id',
        'sequence',
        'event_type',
        'scope',
        'source',
        'caused_by',
        'occurred_at_ms',
        'persisted_at_ms',
        'payload',
      ],
      ['prev_hash', 'hash'],
    )
    const schemaVersion = schemaVersionAt(record, '$.schema_version')
    const eventType = eventTypeAt(record.event_type, '$.event_type')
    const candidate: AppEventCandidate = {
      schema_version: schemaVersion,
      event_type: eventType,
      scope: parseScopeValue(record.scope, '$.scope'),
      source: parseSourceValue(record.source, '$.source'),
      caused_by: parseCausedBy(record.caused_by, '$.caused_by', parseEventRefValue),
      occurred_at_ms: timestampAt(record.occurred_at_ms, '$.occurred_at_ms', true),
      payload: parsePayload(record.payload, eventType, '$.payload'),
    }
    const eventId = prefixedDigestAt(record.event_id, 'e1:', '$.event_id')
    const recordId = prefixedDigestAt(record.record_id, 'r1:', '$.record_id')
    if (eventId !== calculateEventId(candidate)) {
      invalid('$.event_id', 'does not match canonical event content')
    }
    if (recordId !== calculateRecordId(candidate)) {
      invalid('$.record_id', 'does not match canonical event content')
    }

    const hasPreviousHash = Object.hasOwn(record, 'prev_hash')
    const hasHash = Object.hasOwn(record, 'hash')
    if (hasPreviousHash !== hasHash) invalid('$', 'prev_hash and hash must be present together')

    const event: AppEvent = {
      ...candidate,
      event_id: eventId,
      record_id: recordId,
      sequence: integerAt(record.sequence, '$.sequence', 1),
      persisted_at_ms: timestampAt(record.persisted_at_ms, '$.persisted_at_ms', false)!,
    }
    if (hasPreviousHash && hasHash) {
      return {
        ...event,
        prev_hash: prefixedDigestAt(record.prev_hash, 'h1:', '$.prev_hash'),
        hash: prefixedDigestAt(record.hash, 'h1:', '$.hash'),
      }
    }
    return event
  })
}

/** Serializes an already validated event as one canonical UTF-8 JSONL record. */
export function serializeAppEvent(event: AppEvent): string {
  return `${canonicalJson(appEventToJson(event))}\n`
}

/** Parses one JSONL record without exposing JSON parser messages or record content. */
export function parseAppEventLine(raw: string, line: number): ParseResult<AppEvent> {
  if (!Number.isSafeInteger(line) || line < 1) {
    return {
      ok: false,
      diagnostic: {
        code: 'invalid_record',
        safe_detail: 'Line number must be a positive integer.',
      },
    }
  }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return {
      ok: false,
      diagnostic: { code: 'invalid_record', line, safe_detail: 'Line is not valid JSON.' },
    }
  }

  const result = parseAppEvent(value)
  if (result.ok) return result
  return { ok: false, diagnostic: { ...result.diagnostic, line } }
}
