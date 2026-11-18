// Canonical Event_Log parsing, integrity and merge examples (task 8.3).
// **Validates: Requirements 7.4, 7.5, 7.6, 8.1, 8.5, 10.2**
import { describe, expect, it } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import { heldMoment } from '../test/held-moment'
import { foldGhostEvents } from './ghost-state'
import { serializeAppEvent, type AppEvent } from './seance-event'
import {
  EMPTY_LOG,
  GENESIS_HASH,
  calculateEventHash,
  mergeAcknowledged,
  parseEventLog,
  projectEvents,
  projectLog,
} from './seance-log'

const demoLines = demo.split('\n').filter((line) => line !== '')

/** The demo log with line `line` (one-based) replaced, removed (null) or duplicated. */
function withLine(line: number, replacement: string | null | 'duplicate'): string {
  const lines = [...demoLines]
  if (replacement === null) lines.splice(line - 1, 1)
  else if (replacement === 'duplicate') lines.splice(line - 1, 0, lines[line - 1])
  else lines[line - 1] = replacement
  return `${lines.join('\n')}\n`
}

function edited(line: number, edit: (record: Record<string, unknown>) => void): string {
  const record = JSON.parse(demoLines[line - 1]) as Record<string, unknown>
  edit(record)
  return JSON.stringify(record)
}

describe('parseEventLog', () => {
  it('accepts the committed replay fixture: contiguous Sequence and a verified hash chain', () => {
    const parsed = parseEventLog(demo)

    expect(parsed.diagnostics).toEqual([])
    expect(parsed.integrityOk).toBe(true)
    expect(parsed.events).toHaveLength(demoLines.length)
    expect(parsed.highestSequence).toBe(demoLines.length)
    expect(parsed.validPrefixLines).toBe(demoLines.length)
    expect(parsed.events.map((event) => event.sequence)).toEqual(demoLines.map((_, index) => index + 1))

    // The fixture was written by the Python writer pipeline. Recomputing every
    // link here checks the hash rule across the two languages.
    let previous = GENESIS_HASH
    for (const event of parsed.events) {
      expect(event.prev_hash).toBe(previous)
      expect(event.hash).toBe(calculateEventHash(event))
      previous = event.hash!
    }
    // Canonical serialization round-trips to the Python writer's bytes.
    expect(parsed.events.map(serializeAppEvent).join('')).toBe(demo)
  })

  it('returns an empty collection, Sequence zero and no diagnostic for an empty log', () => {
    for (const text of ['', '\n', '\n\n  \n']) {
      expect(parseEventLog(text)).toMatchObject({
        events: [],
        highestSequence: 0,
        integrityOk: true,
        diagnostics: [],
      })
    }
  })

  it('reports malformed and unsupported lines by one-based line number and keeps reading', () => {
    const lines = [...demoLines.slice(0, 3), '{"not": "an event"', '[1, 2]', ...demoLines.slice(3, 5), 'trailing junk']
    const parsed = parseEventLog(`${lines.join('\r\n')}\r\n`)

    expect(parsed.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5])
    expect(parsed.integrityOk).toBe(true)
    expect(parsed.diagnostics.map(({ code, line }) => ({ code, line }))).toEqual([
      { code: 'invalid_record', line: 4 },
      { code: 'invalid_record', line: 5 },
      { code: 'invalid_record', line: 8 },
    ])
    // Diagnostics are fixed categories: nothing from the rejected line leaks.
    for (const diagnostic of parsed.diagnostics) {
      expect(JSON.stringify(diagnostic)).not.toMatch(/junk|an event/)
    }

    const unsupported = parseEventLog(withLine(demoLines.length, edited(demoLines.length, (r) => (r.schema_version = 2))))
    expect(unsupported.diagnostics).toEqual([
      expect.objectContaining({ code: 'unsupported_schema', line: demoLines.length }),
    ])
    expect(unsupported.events).toHaveLength(demoLines.length - 1)
  })

  it.each([
    ['a removed record', withLine(7, null), 'missing_sequence', 7],
    ['changed writer metadata', withLine(7, edited(7, (r) => (r.persisted_at_ms = 5))), 'hash_mismatch', 7],
    [
      'a record without its integrity pair',
      withLine(
        7,
        edited(7, (r) => {
          delete r.prev_hash
          delete r.hash
        }),
      ),
      'mixed_integrity_mode',
      7,
    ],
  ] as const)('ends the valid prefix at %s', (_, text, code, line) => {
    const parsed = parseEventLog(text)

    expect(parsed.integrityOk).toBe(false)
    expect(parsed.diagnostics).toEqual([expect.objectContaining({ code, line })])
    expect(parsed.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6])
    expect(parsed.highestSequence).toBe(6)
    expect(parsed.validPrefixLines).toBe(line - 1)
    // The valid prefix is returned unchanged, not repaired.
    expect(parsed.events.map(serializeAppEvent).join('')).toBe(`${demoLines.slice(0, 6).join('\n')}\n`)
  })

  it('ends the valid prefix at a repeated record, keeping its first copy', () => {
    const parsed = parseEventLog(withLine(7, 'duplicate'))

    expect(parsed.integrityOk).toBe(false)
    expect(parsed.diagnostics).toEqual([expect.objectContaining({ code: 'duplicate_sequence', line: 8 })])
    expect(parsed.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(parsed.validPrefixLines).toBe(7)
  })

  it('detects a record that is internally consistent but linked to the wrong predecessor', () => {
    const original = parseEventLog(demo).events[6]
    const relinked: AppEvent = { ...original, prev_hash: `h1:${'1'.repeat(64)}` }
    const forged = serializeAppEvent({ ...relinked, hash: calculateEventHash(relinked) }).trimEnd()

    const parsed = parseEventLog(withLine(7, forged))
    expect(parsed.diagnostics).toEqual([expect.objectContaining({ code: 'hash_link_broken', line: 7 })])
    expect(parsed.highestSequence).toBe(6)
  })

  it('skips a record whose content was edited and stops at the Sequence gap it leaves', () => {
    const text = withLine(
      7,
      edited(7, (r) => (r.payload = { tampered: true })),
    )
    const parsed = parseEventLog(text)
    expect(parsed.diagnostics.map(({ code, line }) => ({ code, line }))).toEqual([
      { code: 'invalid_record', line: 7 },
      { code: 'missing_sequence', line: 8 },
    ])
    expect(parsed.highestSequence).toBe(6)
  })

  it('folds only the valid prefix', () => {
    const full = projectEvents(parseEventLog(demo).events)
    const cut = parseEventLog(withLine(20, null))
    const prefix = projectEvents(cut.events)

    expect(prefix.events).toEqual(full.events.filter((event) => event.sequence < 20))
    expect(prefix).toEqual(projectEvents(parseEventLog(demo).events.slice(0, 19)))
  })
})

describe('mergeAcknowledged', () => {
  const events = parseEventLog(demo).events

  it('applies each Record_ID at most once and returns the same log when nothing is new', () => {
    const first = mergeAcknowledged(EMPTY_LOG, events.slice(0, 5))
    expect(first.applied).toEqual(events.slice(0, 5))
    expect(first.log.highestSequence).toBe(5)

    const again = mergeAcknowledged(first.log, [...events.slice(2, 5), ...events.slice(0, 2)])
    expect(again.applied).toEqual([])
    expect(again.log).toBe(first.log)

    const overlap = mergeAcknowledged(first.log, [events[4], events[5], events[5], events[6]])
    expect(overlap.applied).toEqual([events[5], events[6]])
    expect(overlap.log.records.size).toBe(7)
    // The earlier value is not mutated.
    expect(first.log.records.size).toBe(5)
    expect(EMPTY_LOG.records.size).toBe(0)
  })

  it('tracks the contiguous Sequence separately from the highest one', () => {
    const gap = mergeAcknowledged(EMPTY_LOG, [events[0], events[1], events[4]])
    expect(gap.log).toMatchObject({ highestSequence: 5, contiguousSequence: 2 })

    const filled = mergeAcknowledged(gap.log, [events[3], events[2]])
    expect(filled.log).toMatchObject({ highestSequence: 5, contiguousSequence: 5 })
  })

  it('projects the same snapshots whatever order the acknowledgments arrived in', () => {
    const reversed = mergeAcknowledged(EMPTY_LOG, [...events].reverse()).log
    const projection = projectLog(reversed)
    const folded = foldGhostEvents(events)

    expect(projection.snapshots).toEqual(folded.snapshots)
    expect(projection.transitions).toEqual(folded.transitions)
    expect(projection.events).toEqual(events)
  })
})

describe('the replay fixture story', () => {
  it('shows one ghost in each of the six states at record 64 and contains the evidence replay needs', () => {
    const { snapshots } = projectEvents(parseEventLog(heldMoment).events)
    const { events, transitions } = projectEvents(parseEventLog(demo).events)
    const states = Object.fromEntries(snapshots.map((snapshot) => [snapshot.ghost_id, snapshot.state]))

    expect(states).toEqual({
      archivist: 'done',
      draughtsman: 'done',
      foreman: 'working',
      medium: 'idle',
      'tinker-1': 'blocked',
      'tinker-2': 'waiting',
      'tinker-3': 'failed',
    })
    expect(new Set(snapshots.map((snapshot) => snapshot.mansion_id))).toEqual(new Set(['demo-mansion']))
    expect(snapshots.find((snapshot) => snapshot.ghost_id === 'foreman')).toMatchObject({ run_sequence: 1 })
    expect(snapshots.find((snapshot) => snapshot.ghost_id === 'tinker-2')).toMatchObject({
      pending_approvals: ['mid-tinker-2'],
      open_tools: ['tool-tinker-2'],
    })

    const types = new Set(events.map((event) => event.event_type))
    for (const type of [
      'run_started',
      'tool_started',
      'tool_finished',
      'approval_requested',
      'approval_decided',
      'crew_turn_ended',
      'crew_error_observed',
      'run_completed',
      'run_blocked',
      'run_failed',
      'domain_event_recorded',
    ]) {
      expect(types).toContain(type)
    }

    // A Crew turn end settles nothing: the Run completes only at the later house event.
    const archivist = transitions.filter((transition) => transition.ghost_id === 'archivist')
    const turnEnd = events.find(
      (event) => event.event_type === 'crew_turn_ended' && event.scope.ghost_id === 'archivist',
    )!
    expect(archivist.find((transition) => transition.causing_event_id === turnEnd.event_id)?.to_state).toBe('working')
    expect(
      archivist.filter((transition) => transition.from_state !== transition.to_state).map((t) => t.to_state),
    ).toEqual(['working', 'waiting', 'working', 'done'])
  })

  it('ends with every ghost that had work done, and Tinker 2 waiting twice on the owner before it finished', () => {
    const { snapshots, transitions } = projectEvents(parseEventLog(demo).events)
    expect(Object.fromEntries(snapshots.map((snapshot) => [snapshot.ghost_id, snapshot.state]))).toEqual({
      archivist: 'done',
      draughtsman: 'done',
      foreman: 'done',
      medium: 'idle',
      'tinker-1': 'done',
      'tinker-2': 'done',
      'tinker-3': 'done',
    })
    const tinker2 = transitions.filter((t) => t.ghost_id === 'tinker-2' && t.from_state !== t.to_state).map((t) => t.to_state)
    expect(tinker2.filter((state) => state === 'waiting')).toHaveLength(2)
    expect(tinker2.at(-1)).toBe('done')
  })
})
