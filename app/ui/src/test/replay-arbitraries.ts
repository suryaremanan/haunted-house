// Test support for the replay-and-submission property tests (Properties 1 to 4):
// generators of canonical records that carry real Spec 4 workflow facts as
// well as synthetic multi-Mansion, multi-Ghost Spec 2 events.
import fc from 'fast-check'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import vectors from '../../../../fixtures/seance/workflow-vectors.json'
import { parseAppEvent, type AppEvent } from '../core/seance-event'
import { parseEventLog } from '../core/seance-log'
import { permutationArb, writerLogArb } from './seance-arbitraries'

/** The replay fixture: one Mansion with Doors, approvals, a denied start and a pending risky action. */
export const DEMO_RECORDS: readonly AppEvent[] = parseEventLog(demo).events

/** The Spec 4 vector log: a second Mansion walking valid and invalid workflow transitions. */
export const VECTOR_RECORDS: readonly AppEvent[] = (vectors.events as unknown[]).map((raw) => {
  const parsed = parseAppEvent(raw)
  if (!parsed.ok) throw new Error(`vector record refused: ${parsed.diagnostic.code}`)
  return parsed.value
})

/** Usually a prefix of a real log (valid transitions), sometimes any subset (invalid ones). */
function partOf(records: readonly AppEvent[], maxLength: number): fc.Arbitrary<AppEvent[]> {
  const limit = Math.min(records.length, maxLength)
  return fc.oneof(
    { weight: 1, arbitrary: fc.constant<AppEvent[]>([]) },
    { weight: 3, arbitrary: fc.nat({ max: limit }).map((length) => records.slice(0, length)) },
    { weight: 1, arbitrary: fc.subarray([...records], { maxLength: limit }) },
  )
}

/**
 * Distinct canonical records of up to four Mansions, in no particular order:
 * synthetic writer logs with conflicting Event_ID variants, plus parts of the
 * two real logs. One physical record per Record_ID, as the canonical writer
 * guarantees; `deliveryArb` adds the exact duplicates. May be empty.
 */
export function canonicalRecordsArb(options: { maxSynthetic?: number; maxReal?: number } = {}): fc.Arbitrary<AppEvent[]> {
  const maxReal = options.maxReal ?? Number.POSITIVE_INFINITY
  return fc
    .tuple(writerLogArb({ maxLength: options.maxSynthetic ?? 24 }), partOf(DEMO_RECORDS, maxReal), partOf(VECTOR_RECORDS, maxReal))
    .map(([synthetic, fromDemo, fromVectors]) => [...synthetic, ...fromDemo, ...fromVectors])
}

/** The records as a client could receive them: any order, with some delivered again. */
export function deliveryArb(records: readonly AppEvent[]): fc.Arbitrary<AppEvent[]> {
  return fc
    .array(fc.nat(), { maxLength: 6 })
    .chain((repeats) =>
      permutationArb(records.length === 0 ? [] : [...records, ...repeats.map((at) => records[at % records.length])]),
    )
}
