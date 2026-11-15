// Shared canonical-event examples consumed by Python and TypeScript.
// The fixture is normative: identifiers, validation, and bytes must agree.
// **Validates: Requirements 1.1–1.10, 7.1–7.6**
import { describe, expect, it } from 'vitest'
import vectorDocumentJson from '../../../../fixtures/seance/canonical-vectors.json'
import {
  calculateEventId,
  calculateRecordId,
  candidateToJson,
  canonicalJson,
  parseAppEvent,
  parseAppEventCandidate,
  parseAppEventLine,
  parseDomainEventPayload,
  serializeAppEvent,
  type JsonValue,
} from './seance-event'

type Mutation = {
  readonly operation: 'replace' | 'delete'
  readonly path: readonly string[]
  readonly value?: unknown
}

type CanonicalVector = {
  readonly name: string
  readonly candidate: unknown
  readonly redacted_event: unknown
  readonly expected: {
    readonly event_id: string
    readonly record_id: string
    readonly sequence: number
    readonly integrity: { readonly prev_hash: string; readonly hash: string } | null
    readonly domain_payload: unknown | null
    readonly canonical_jsonl_utf8_hex: string
  }
}

type ValidationVector = {
  readonly name: string
  readonly target: 'candidate' | 'event'
  readonly base: string
  readonly mutation: Mutation
  readonly expected: {
    readonly typescript: {
      readonly code: string
      readonly path: string
      readonly safe_detail: string
    }
  }
}

type CanonicalJsonVector = {
  readonly name: string
  readonly value: JsonValue
  readonly expected: string
}

type VectorDocument = {
  readonly format_version: number
  readonly canonical_vectors: readonly CanonicalVector[]
  readonly validation_errors: readonly ValidationVector[]
  readonly canonical_json_vectors: readonly CanonicalJsonVector[]
  readonly parity_disagreements: readonly unknown[]
}

const vectorDocument = vectorDocumentJson as unknown as VectorDocument

function canonicalVector(name: string): CanonicalVector {
  const vector = vectorDocument.canonical_vectors.find((candidate) => candidate.name === name)
  if (vector === undefined) throw new Error(`Missing canonical vector: ${name}`)
  return vector
}

function mutate(base: unknown, mutation: Mutation): unknown {
  const value = structuredClone(base)
  let parent = value as Record<string, unknown>
  for (const segment of mutation.path.slice(0, -1)) {
    parent = parent[segment] as Record<string, unknown>
  }
  const finalSegment = mutation.path.at(-1)
  if (finalSegment === undefined) throw new Error('Mutation path must not be empty')
  if (mutation.operation === 'delete') delete parent[finalSegment]
  else parent[finalSegment] = structuredClone(mutation.value)
  return value
}

function baseValue(vector: ValidationVector): unknown {
  const base = canonicalVector(vector.base)
  return vector.target === 'candidate' ? base.candidate : base.redacted_event
}

function utf8Hex(value: string): string {
  return Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('shared cross-language canonical vectors', () => {
  it('contains only scrubbed fixture values and no unfinished fields', () => {
    const raw = JSON.stringify(vectorDocument)
    const forbiddenHomePrefixes = ['/' + 'Users' + '/', '/' + 'home' + '/', 'C:' + '\\' + 'Users' + '\\']

    expect(vectorDocument.format_version).toBe(1)
    expect(raw).toContain('[redacted]')
    expect(raw).toContain('[home]/')
    expect(raw).not.toContain('__')
    for (const prefix of forbiddenHomePrefixes) expect(raw).not.toContain(prefix)
  })

  for (const vector of vectorDocument.canonical_vectors) {
    it(`parses ${vector.name} with shared identities, metadata, and bytes`, () => {
      const candidateResult = parseAppEventCandidate(vector.candidate)
      expect(candidateResult.ok).toBe(true)
      if (!candidateResult.ok) return

      expect(candidateResult.value).toEqual(vector.candidate)
      expect(calculateEventId(candidateResult.value)).toBe(vector.expected.event_id)
      expect(calculateRecordId(candidateResult.value)).toBe(vector.expected.record_id)

      const eventResult = parseAppEvent(vector.redacted_event)
      expect(eventResult.ok).toBe(true)
      if (!eventResult.ok) return
      const event = eventResult.value

      expect(candidateToJson(event)).toEqual(vector.candidate)
      expect(event.event_id).toBe(vector.expected.event_id)
      expect(event.record_id).toBe(vector.expected.record_id)
      expect(event.sequence).toBe(vector.expected.sequence)

      if (vector.expected.integrity === null) {
        expect(event.prev_hash).toBeUndefined()
        expect(event.hash).toBeUndefined()
      } else {
        expect(event.prev_hash).toBe(vector.expected.integrity.prev_hash)
        expect(event.hash).toBe(vector.expected.integrity.hash)
      }

      if (vector.expected.domain_payload !== null) {
        expect(parseDomainEventPayload(event.payload)).toEqual({
          ok: true,
          value: vector.expected.domain_payload,
        })
      }

      const serialized = serializeAppEvent(event)
      expect(utf8Hex(serialized)).toBe(vector.expected.canonical_jsonl_utf8_hex)
      expect(serialized.endsWith('\n')).toBe(true)
      const reparsed = parseAppEventLine(serialized, 1)
      expect(reparsed).toEqual(eventResult)
      if (reparsed.ok) expect(serializeAppEvent(reparsed.value)).toBe(serialized)
    })
  }
})

describe('shared validation-error vectors', () => {
  for (const vector of vectorDocument.validation_errors) {
    it(`returns the TypeScript diagnostic for ${vector.name}`, () => {
      const input = mutate(baseValue(vector), vector.mutation)
      const result = vector.target === 'candidate' ? parseAppEventCandidate(input) : parseAppEvent(input)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.diagnostic).toEqual(vector.expected.typescript)
    })
  }
})

describe('resolved cross-language parity', () => {
  for (const vector of vectorDocument.canonical_json_vectors) {
    it(`uses canonical number spelling for ${vector.name}`, () => {
      expect(canonicalJson(vector.value)).toBe(vector.expected)
    })
  }

  it('records no known cross-language disagreement', () => {
    expect(vectorDocument.parity_disagreements).toEqual([])
  })
})
