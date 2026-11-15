// Feature: replay-and-submission, Property 4: Timeline construction is deterministic, ordered, and disclosure-safe
//
// For all finite selected Canonical_Record sequences and arbitrary
// JSON-compatible payload strings, repeated Replay_Model construction returns
// one Timeline entry per selected record in Canonical_Order with the same
// Record_ID order, non-decreasing Presentation_Time beginning at zero, adjacent
// intervals from 250 through 4,000 milliseconds, and actor/summary text bounded
// to 160 Unicode code points; Timeline text contains only allowlisted identity
// and outcome fields and contains no planted raw payload-only string,
// credential, Home_Path, document body, tool input/output, or exception body.
//
// **Validates: Requirements 1.3, 3.2, 5.3**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { deepFreeze, makeEvent, permutationArb } from '../test/seance-arbitraries'
import { selectEvents } from './ghost-state'
import { REASON_COPY } from './ghost-status'
import { ROOM_IDS } from './house-view'
import { EVENT_TYPES, type AppEvent, type AppEventCandidate, type EventType, type JsonValue } from './seance-event'
import { MAX_TIMELINE_TEXT, buildReplayModel, selectCanonical } from './replay-timeline'
import { GUARDRAIL_KINDS } from './workflow-fold'
import { PHASES } from './workflow-projection'

const RUNS = 200
// Each run folds many prefixes; the whole suite may run beside it.
const TIMEOUT_MS = 60_000

// Sensitive shapes, assembled at run time so this file holds none of them.
const HOME_PATHS = [
  ['', 'Users', 'alice', 'notes', 'plan.md'].join('/'),
  ['', 'home', 'bob', '.ssh', 'id_ed25519'].join('/'),
  ['C:', 'Users', 'carol', 'Desktop'].join('\\'),
]
const CREDENTIALS = [`${'sk'}-${'ant'}-${'a1B2c3D4'.repeat(4)}`, `Bearer ${'eyJhbGciOi'}${'x'.repeat(24)}`]

/** Text that exists only in a payload. `tag` makes each planted string findable in the output. */
const plantedArb = (tag: string): fc.Arbitrary<string> =>
  fc
    .tuple(
      fc.constantFrom(...HOME_PATHS, ...CREDENTIALS, 'document body', 'tool output', 'Traceback (most recent call last)'),
      fc.string({ unit: 'grapheme', maxLength: 300 }),
    )
    .map(([shape, noise]) => `${tag} ${shape} ${noise}`)

/** A payload template: `fill` supplies the string for each hole. */
type Template = (fill: (hole: number) => string) => JsonValue

const allowlisted: fc.Arbitrary<JsonValue> = fc.constantFrom<JsonValue>(
  ...ROOM_IDS,
  ...Object.keys(REASON_COPY),
  ...PHASES,
  ...GUARDRAIL_KINDS,
  'approved',
  'rejected',
  'denied',
  'doors_and_guardrails',
  true,
  false,
  null,
  7,
)

const FIELD_NAMES = [
  'room', 'reason', 'outcome', 'tool', 'kind', 'phase', 'content', 'mid', 'status', 'category', 'is_shell',
  'needs_input', 'domain', 'entity_id', 'data', 'tool_call_id', 'input', 'output', 'error', 'path', 'text',
] as const

/** A field value: an allowlisted constant, a hole for planted text, or a nested object of the same. */
const valueArb: fc.Arbitrary<Template> = fc.letrec<{ value: Template }>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small' },
    { weight: 3, arbitrary: allowlisted.map((constant): Template => () => constant) },
    { weight: 4, arbitrary: fc.nat({ max: 7 }).map((hole): Template => (fill) => fill(hole)) },
    {
      weight: 2,
      arbitrary: fc
        .dictionary(fc.constantFrom(...FIELD_NAMES), tie('value'), { maxKeys: 6 })
        .map((fields): Template => (fill) => Object.fromEntries(Object.entries(fields).map(([key, make]) => [key, make(fill)]))),
    },
    { weight: 1, arbitrary: fc.array(tie('value'), { maxLength: 3 }).map((items): Template => (fill) => items.map((make) => make(fill))) },
  ),
})).value

/** A payload object with the fields a summary could be tempted to read, most of them present. */
const readFieldsArb: fc.Arbitrary<Template> = fc
  .record(
    Object.fromEntries(
      ['room', 'reason', 'outcome', 'tool', 'content', 'status', 'category', 'is_shell', 'needs_input', 'mid'].map(
        (name) => [name, fc.option(valueArb, { nil: undefined, freq: 4 })] as const,
      ),
    ),
  )
  .map(
    (fields): Template =>
      (fill) =>
        Object.fromEntries(
          Object.entries(fields)
            .filter((entry): entry is [string, Template] => entry[1] !== undefined)
            .map(([key, make]) => [key, make(fill)]),
        ),
  )

const payloadArb = (eventType: EventType): fc.Arbitrary<Template> =>
  eventType === 'domain_event_recorded'
    ? // The canonical parser requires the Domain_Event_Payload envelope.
      fc
        .record({
          // Mostly a record that claims to be a Spec 4 fact, so the refusal path is exercised.
          domain: fc.oneof({ weight: 3, arbitrary: fc.constant<Template>(() => 'doors_and_guardrails') }, { weight: 1, arbitrary: valueArb }),
          kind: valueArb,
          entity_id: valueArb,
          data: valueArb,
        })
        .map(
          (fields): Template =>
            (fill) => ({
              domain: String(fields.domain(fill)),
              kind: String(fields.kind(fill)),
              entity_id: String(fields.entity_id(fill)),
              data: fields.data(fill),
            }),
        )
    : fc.oneof({ weight: 1, arbitrary: valueArb }, { weight: 4, arbitrary: readFieldsArb })

/** Occurrence times the builder must tolerate: absent, backward, equal, extreme and unusable. */
const occurredArb: fc.Arbitrary<number | null> = fc.oneof(
  { weight: 2, arbitrary: fc.constant(null) },
  { weight: 5, arbitrary: fc.integer({ min: 0, max: 20_000 }) },
  { weight: 1, arbitrary: fc.constantFrom(0, 5_000, 5_000, -1, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 2 ** 60, 0.5, Number.NaN, Number.POSITIVE_INFINITY) },
)

interface RecordSpec {
  readonly eventType: EventType
  readonly ghost: string
  readonly origin: 'crew' | 'house'
  readonly occurred: number | null
  readonly payload: Template
}

/** Every event type, weighted to those whose summary carries an outcome. */
const eventTypeArb: fc.Arbitrary<EventType> = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom(...EVENT_TYPES) },
  {
    weight: 2,
    arbitrary: fc.constantFrom<EventType>(
      'run_started', 'run_blocked', 'run_failed', 'run_completed', 'tool_started', 'approval_decided', 'crew_turn_ended',
      'crew_error_observed', 'domain_event_recorded',
    ),
  },
)

const recordArb: fc.Arbitrary<RecordSpec> = eventTypeArb.chain((eventType) =>
  fc.record({
    eventType: fc.constant(eventType),
    ghost: fc.constantFrom('archivist', 'tinker-2', 'house-operator', 'ghost-\u{1f47b}', `long-${'ghost-'.repeat(60)}`),
    origin: fc.constantFrom<'crew' | 'house'>('crew', 'house'),
    occurred: occurredArb,
    payload: payloadArb(eventType),
  }),
)

function build(specs: readonly RecordSpec[], fill: (hole: number) => string): AppEvent[] {
  return specs.map((spec, index) => {
    const candidate: AppEventCandidate = {
      schema_version: 1,
      event_type: spec.eventType,
      scope: { mansion_id: 'demo-mansion', ghost_id: spec.ghost, session_slot: `hh-${index % 3}`, run_id: 'run-1', run_sequence: 0 },
      // Identity is independent of the payload, so both fillings yield the same events with other text.
      source: {
        origin: spec.origin,
        source_type: spec.origin === 'house' ? 'haunted_house.guardrail' : spec.eventType,
        identity_parts: [`record-${index}`],
        revision: 0,
        generation: '',
        source_sequence: 0,
      },
      caused_by: [],
      occurred_at_ms: spec.occurred,
      payload: spec.payload(fill),
    }
    // The Record_ID covers the payload, so it is fixed here to compare two fillings entry by entry.
    return { ...makeEvent(candidate, index + 1), record_id: `r1:${index.toString(16).padStart(64, '0')}` }
  })
}

/** The timing rule of design.md, written as a plain loop. */
function referenceOffsets(records: readonly AppEvent[]): number[] {
  const offsets: number[] = []
  for (let index = 0; index < records.length; index += 1) {
    if (index === 0) {
      offsets.push(0)
      continue
    }
    const from = records[index - 1].occurred_at_ms
    const to = records[index].occurred_at_ms
    let interval = 1_000
    if (Number.isSafeInteger(from) && Number.isSafeInteger(to) && to! - from! > 0) interval = to! - from!
    offsets.push(offsets[index - 1] + Math.min(4_000, Math.max(250, interval)))
  }
  return offsets
}

const scenarioArb = fc.array(recordArb, { maxLength: 30 }).chain((specs) =>
  fc.record({
    specs: fc.constant(specs),
    planted: fc.array(plantedArb('PLANTED-A'), { minLength: 8, maxLength: 8 }),
    other: fc.array(plantedArb('PLANTED-B'), { minLength: 8, maxLength: 8 }),
    order: permutationArb(specs.map((_, index) => index)),
  }),
)

describe('Property 4: Timeline construction is deterministic, ordered, and disclosure-safe', () => {
  it('builds the same bounded, payload-free Timeline in Canonical_Order every time', () => {
    fc.assert(
      fc.property(scenarioArb, ({ specs, planted, other, order }) => {
        const records = deepFreeze(build(specs, (hole) => planted[hole]))
        const selected = selectEvents(records).events
        const model = buildReplayModel(selectCanonical(records))

        // One entry per selected record, in Canonical_Order.
        expect(model.records).toEqual(selected)
        expect(model.timeline).toHaveLength(selected.length)
        expect(model.timeline.map((entry) => entry.recordId)).toEqual(selected.map((record) => record.record_id))
        expect(model.timeline.map((entry) => entry.eventId)).toEqual(selected.map((record) => record.event_id))

        // Deterministic: again, and from any delivery order.
        expect(buildReplayModel(selectCanonical(records))).toEqual(model)
        expect(buildReplayModel(selectCanonical(order.map((index) => records[index])))).toEqual(model)

        // Presentation_Time: zero first, never decreasing, 250 to 4,000 ms apart.
        const offsets = model.timeline.map((entry) => entry.presentationOffsetMs)
        expect(offsets).toEqual(referenceOffsets(selected))
        offsets.forEach((offset, index) => {
          const interval = index === 0 ? null : offset - offsets[index - 1]
          if (interval === null) expect(offset).toBe(0)
          else expect(interval >= 250 && interval <= 4_000).toBe(true)
        })

        // Bounded entries of exactly the allowed fields.
        for (const entry of model.timeline) {
          expect(Object.keys(entry).sort()).toEqual(['actorLabel', 'eventId', 'eventType', 'presentationOffsetMs', 'recordId', 'summary'])
          expect(Array.from(entry.actorLabel).length).toBeLessThanOrEqual(MAX_TIMELINE_TEXT)
          expect(Array.from(entry.summary).length).toBeLessThanOrEqual(MAX_TIMELINE_TEXT)
          expect(entry.summary.length).toBeGreaterThan(0)
          expect([...EVENT_TYPES, 'unknown']).toContain(entry.eventType)
        }

        // No planted payload text reaches the Timeline or a diagnostic.
        const shown = JSON.stringify([model.timeline, model.diagnostics])
        expect(shown).not.toContain('PLANTED')
        for (const value of planted) {
          for (const piece of value.split(' ').filter((part) => part.length >= 8)) expect(shown).not.toContain(piece)
        }

        // Non-interference: other payload text gives the very same Timeline text.
        const twin = buildReplayModel(selectCanonical(build(specs, (hole) => other[hole])))
        const text = (entries: typeof model.timeline) =>
          entries.map((entry) => [entry.recordId, entry.eventType, entry.actorLabel, entry.summary, entry.presentationOffsetMs])
        expect(text(twin.timeline)).toEqual(text(model.timeline))
      }),
      { numRuns: RUNS },
    )
  }, TIMEOUT_MS)
})
