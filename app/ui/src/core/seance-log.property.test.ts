// Feature: seance-log-and-ghost-state, Property 11: Live and replay folding agree
//
// For all finite valid multi-ghost Event_Logs, applying acknowledged pages
// incrementally or parsing the complete log in replay produces equal selected
// events, Ghost_Snapshots, and derived Ghost_Transitions without external state.
//
// **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 10.2, 10.7**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { deepFreeze, permutationArb, referenceSelect, referenceSnapshots, writerLogArb } from '../test/seance-arbitraries'
import { ghostRows } from './ghost-status'
import { serializeAppEvent, type AppEvent } from './seance-event'
import {
  EMPTY_LOG,
  GENESIS_HASH,
  calculateEventHash,
  mergeAcknowledged,
  parseEventLog,
  projectEvents,
  projectLog,
  type CanonicalLog,
} from './seance-log'

const RUNS = 200

/** Adds the writer's tamper-evidence pair to every record of a log. */
function hashLinked(events: readonly AppEvent[]): AppEvent[] {
  let previous = GENESIS_HASH
  return events.map((event) => {
    const pending: AppEvent = { ...event, prev_hash: previous, hash: GENESIS_HASH }
    const linked: AppEvent = { ...pending, hash: calculateEventHash(pending) }
    previous = linked.hash!
    return linked
  })
}

/** Cuts `events` into consecutive pages at the given positions, as the read route pages a log. */
function paginate(events: readonly AppEvent[], cuts: readonly number[]): AppEvent[][] {
  const bounds = [...new Set(cuts.map((cut) => cut % (events.length + 1)))].sort((a, b) => a - b)
  const pages: AppEvent[][] = []
  let start = 0
  for (const bound of [...bounds, events.length]) {
    if (bound > start) pages.push(events.slice(start, bound))
    start = Math.max(start, bound)
  }
  return pages
}

/** One Mansion's log (Sequence is per Mansion) with several ghosts, optionally hash-linked. */
const logArb = fc
  .tuple(writerLogArb({ mansions: ['manor-a'], maxLength: 40 }), fc.boolean())
  .map(([events, linked]) => (linked ? hashLinked(events) : events))

const scenarioArb = logArb.chain((events) =>
  fc
    .record({
      cuts: fc.array(fc.nat(), { maxLength: 6 }),
      // Pages delivered again, as a retry or an overlapping catch-up read returns them.
      repeats: fc.array(fc.nat(), { maxLength: 4 }),
      seed: fc.nat(),
    })
    .chain(({ cuts, repeats, seed }) => {
      const pages = paginate(events, cuts)
      const delivered = pages.length === 0 ? [] : [...pages, ...repeats.map((at) => pages[at % pages.length])]
      return fc.record({
        events: fc.constant(events),
        // Half the time acknowledgments arrive in Sequence order, half the time in any order.
        delivery: seed % 2 === 0 ? fc.constant(delivered) : permutationArb(delivered),
      })
    }),
)

function applyPages(pages: readonly (readonly AppEvent[])[]): { log: CanonicalLog; appliedRecords: number } {
  let log = EMPTY_LOG
  let appliedRecords = 0
  for (const page of pages) {
    const merged = mergeAcknowledged(log, page)
    appliedRecords += merged.applied.length
    log = merged.log
  }
  return { log, appliedRecords }
}

describe('Property 11: live and replay folding agree', () => {
  it('folds acknowledged pages and the parsed log file to the same projection', () => {
    fc.assert(
      fc.property(scenarioArb, ({ events, delivery }) => {
        deepFreeze(events)
        deepFreeze(delivery)

        // Replay: the canonical file, parsed and verified, then folded.
        const text = events.map(serializeAppEvent).join('')
        const parsed = parseEventLog(text)
        expect(parsed.diagnostics).toEqual([])
        expect(parsed.integrityOk).toBe(true)
        expect(parsed.events).toEqual(events)
        expect(parsed.highestSequence).toBe(events.length)
        const replay = projectEvents(parsed.events)

        // Live: acknowledgments merged page by page, each Record_ID at most once.
        const { log, appliedRecords } = applyPages(delivery)
        expect(appliedRecords).toBe(events.length)
        expect(log.records.size).toBe(events.length)
        expect(log.highestSequence).toBe(events.length)
        expect(log.contiguousSequence).toBe(events.length)
        const live = projectLog(log)

        expect(live.events).toEqual(replay.events)
        expect(live.snapshots).toEqual(replay.snapshots)
        expect(live.transitions).toEqual(replay.transitions)
        expect(live.selectionDiagnostics).toEqual(replay.selectionDiagnostics)
        // What the Ghost_Status_View renders is therefore equal too.
        expect(ghostRows(live.snapshots)).toEqual(ghostRows(replay.snapshots))

        // Both agree with the reference model, and the fold keeps no state between calls.
        const reference = referenceSelect(events)
        expect(replay.events).toEqual(reference.events)
        expect(replay.snapshots).toEqual(referenceSnapshots(reference.events))
        expect(projectEvents(parseEventLog(text).events)).toEqual(replay)
        expect(projectLog(applyPages([...delivery].reverse()).log)).toEqual(live)

        // Canonical_Order is Sequence order, whatever order the pages arrived in.
        const sequences = live.events.map((event) => event.sequence)
        expect(sequences).toEqual([...sequences].sort((a, b) => a - b))
        // Every transition is derived from a selected record, once.
        const ids = live.transitions.map((transition) => transition.transition_id)
        expect(new Set(ids).size).toBe(ids.length)
        const selected = new Set(live.events.map((event) => event.event_id))
        for (const transition of live.transitions) expect(selected.has(transition.causing_event_id)).toBe(true)
      }),
      { numRuns: RUNS },
    )
  })

  it('folds only the valid prefix of a damaged file, equal to the live fold of the same records', () => {
    const damagedArb = logArb
      .filter((events) => events.length > 0)
      .chain((events) =>
        fc.record({
          events: fc.constant(events),
          at: fc.nat({ max: events.length - 1 }),
          damage: fc.constantFrom('drop', 'garbage', 'repeat', 'retime'),
        }),
      )
    fc.assert(
      fc.property(damagedArb, ({ events, at, damage }) => {
        const lines = events.map(serializeAppEvent)
        const linked = events[0].hash !== undefined
        if (damage === 'drop') lines.splice(at, 1)
        else if (damage === 'garbage') lines[at] = '{"truncated": \n'
        else if (damage === 'repeat') lines.splice(at, 0, lines[at])
        else lines[at] = lines[at].replace(/"persisted_at_ms":\d+/, '"persisted_at_ms":1')
        const parsed = parseEventLog(lines.join(''))

        // How many leading records survive each kind of damage.
        let valid: number
        if (damage === 'repeat') valid = at + 1
        else if (damage === 'retime') valid = linked ? at : events.length
        else valid = at === events.length - 1 && damage === 'drop' ? events.length - 1 : at
        if (damage === 'garbage' && at === events.length - 1) valid = events.length - 1

        // An unlinked log cannot notice changed writer metadata; nothing about the fold depends on it.
        const expected = damage === 'retime' && !linked ? parsed.events : events.slice(0, valid)
        expect(parsed.events.map((event) => event.record_id)).toEqual(expected.map((event) => event.record_id))
        expect(parsed.highestSequence).toBe(valid)

        const untouched = damage === 'retime' && !linked
        const cleanTail = damage === 'drop' && at === events.length - 1
        expect(parsed.integrityOk).toBe(untouched || cleanTail || (damage === 'garbage' && at === events.length - 1))
        if (!untouched && !cleanTail) {
          expect(parsed.diagnostics.length).toBeGreaterThan(0)
          // The first diagnostic names the first damaged or orphaned line.
          expect(parsed.diagnostics[0].line).toBe(at + 1 + (damage === 'repeat' ? 1 : 0))
        }

        const live = projectLog(mergeAcknowledged(EMPTY_LOG, events.slice(0, valid)).log)
        const replay = projectEvents(parsed.events)
        expect(replay.snapshots).toEqual(live.snapshots)
        expect(replay.transitions).toEqual(live.transitions)
        expect(replay.events.map((event) => event.record_id)).toEqual(live.events.map((event) => event.record_id))
      }),
      { numRuns: RUNS },
    )
  })
})
