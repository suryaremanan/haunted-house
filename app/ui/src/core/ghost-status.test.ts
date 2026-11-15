// Ghost_Status_View view model: row text, safe reasons, interruption budget.
// **Validates: Requirements 10.4, 10.5, 10.6**
import { describe, expect, it } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import { GHOST_STATES, type GhostSnapshot, type GhostTransitionId } from './ghost-state'
import {
  GHOST_STATE_LABELS,
  defaultGhostName,
  diagnosticText,
  ghostReasonText,
  HOUSE_OPERATOR_GHOST_ID,
  ghostRows,
  interruptionsFor,
  pendingText,
} from './ghost-status'
import { parseEventLog, projectEvents } from './seance-log'

const LOG = parseEventLog(demo).events
const at = (count: number) => projectEvents(LOG.slice(0, count))

describe('ghost rows', () => {
  it('has a distinct, non-empty label for each of the six states', () => {
    const labels = GHOST_STATES.map((state) => GHOST_STATE_LABELS[state])
    expect(labels).toEqual(['Idle', 'Working', 'Waiting', 'Blocked', 'Failed', 'Done'])
    expect(new Set(labels).size).toBe(6)
  })

  it('builds one row per snapshot with name, state text, pending count and reason', () => {
    const rows = ghostRows(at(LOG.length).snapshots, { archivist: 'The Archivist' })
    expect(rows.map(({ name, stateText, pendingText: pending, reason }) => ({ name, stateText, pending, reason }))).toEqual([
      { name: 'The Archivist', stateText: 'Done', pending: null, reason: 'requirements.md is ready for review' },
      { name: 'Draughtsman', stateText: 'Done', pending: null, reason: 'design.md is ready for review' },
      { name: 'Foreman', stateText: 'Working', pending: null, reason: null },
      { name: 'Medium', stateText: 'Idle', pending: null, reason: null },
      { name: 'Tinker 1', stateText: 'Blocked', pending: null, reason: 'A door upstream is still sealed.' },
      { name: 'Tinker 2', stateText: 'Waiting', pending: '1 approval pending', reason: null },
      { name: 'Tinker 3', stateText: 'Failed', pending: null, reason: 'Crew error' },
    ])
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })

  it('words the pending count', () => {
    expect([0, 1, 2, 11].map(pendingText)).toEqual([null, '1 approval pending', '2 approvals pending', '11 approvals pending'])
  })

  it('names a ghost after its id unless a usable name is given', () => {
    expect(defaultGhostName('tinker-1')).toBe('Tinker 1')
    expect(defaultGhostName('the_medium')).toBe('The Medium')
    expect(defaultGhostName('---')).toBe('Ghost')
    const snapshot = at(3).snapshots.find((entry) => entry.ghost_id === 'archivist')!
    expect(ghostRows([snapshot], { archivist: '   ' })[0].name).toBe('Archivist')
    // The house operator's scope is not a ghost: no row, whatever state its records left.
    expect(HOUSE_OPERATOR_GHOST_ID).toBe('house-operator')
    expect(ghostRows([{ ...snapshot, ghost_id: HOUSE_OPERATOR_GHOST_ID }, snapshot]).map((row) => row.ghostId)).toEqual(['archivist'])
    expect(ghostRows([{ ...snapshot, ghost_id: HOUSE_OPERATOR_GHOST_ID, state: 'failed' }])).toEqual([])
    // A ghost id that is also an Object.prototype key is still just an id.
    expect(ghostRows([{ ...snapshot, ghost_id: 'constructor' }])[0].name).toBe('Constructor')
  })
})

describe('ghostReasonText', () => {
  it('maps the supported block reasons to plain copy', () => {
    for (const code of [
      'locked_door',
      'missing_input',
      'stalled',
      'history_partial',
      'cancelled',
      'cancel_unconfirmed',
      'capacity_unavailable',
      'claim_conflict',
      'contract_unavailable',
      'confinement_unavailable',
    ]) {
      const text = ghostReasonText(code)
      expect(text).toMatch(/\.$/)
      expect(text).not.toContain('_')
    }
  })

  it('bounds free text to one short line', () => {
    expect(ghostReasonText(null)).toBeNull()
    expect(ghostReasonText('   ')).toBeNull()
    expect(ghostReasonText('artifact_invalid')).toBe('Artifact invalid')
    expect(ghostReasonText('line one\n\tline\u0000two')).toBe('line one line two')
    const long = ghostReasonText('x'.repeat(500))!
    expect(Array.from(long)).toHaveLength(120)
    expect(long.endsWith('…')).toBe(true)
    expect(ghostReasonText('toString')).toBe('toString')
  })
})

describe('interruptionsFor', () => {
  const none = new Set<GhostTransitionId>()

  /** Announcements while the recording is applied one record at a time. */
  function narrate(): { sequence: number; message: string }[] {
    const announced = new Set<GhostTransitionId>()
    const spoken: { sequence: number; message: string }[] = []
    for (let count = 1; count <= LOG.length; count += 1) {
      const { transitions, snapshots } = at(count)
      const { seen, message } = interruptionsFor(transitions, snapshots, announced)
      for (const id of seen) announced.add(id)
      if (message !== null) spoken.push({ sequence: count, message })
    }
    return spoken
  }

  it('announces only transitions into waiting, blocked or failed, once each', () => {
    const spoken = narrate()
    expect(spoken.map((entry) => entry.message)).toEqual([
      'Archivist is waiting for your approval.',
      'Foreman failed: Artifact invalid',
      'Tinker 1 is blocked: A door upstream is still sealed.',
      'Tinker 2 is waiting for your approval.',
      'Tinker 3 failed: Crew error',
    ])
    // Each announcement happens at the record that caused the state change.
    for (const { sequence } of spoken) {
      const cause = LOG[sequence - 1]
      expect(['approval_requested', 'run_blocked', 'run_failed']).toContain(cause.event_type)
    }
  })

  it('stays silent for working, done and idle, and for re-rendering the same transitions', () => {
    // After 3 records the Archivist is working; the Medium is idle.
    const working = at(3)
    expect(interruptionsFor(working.transitions, working.snapshots, none).message).toBeNull()

    const full = at(LOG.length)
    const first = interruptionsFor(full.transitions, full.snapshots, none)
    const again = interruptionsFor(full.transitions, full.snapshots, new Set(first.seen))
    expect(again).toEqual({ seen: [], message: null })
  })

  it('merges ghosts that need the owner into one message and skips history they moved past', () => {
    const full = at(LOG.length)
    const { message, seen } = interruptionsFor(full.transitions, full.snapshots, none, { 'tinker-2': 'Second Tinker' })
    expect(message).toBe(
      '3 ghosts need you. Tinker 1 is blocked: A door upstream is still sealed. ' +
        'Second Tinker is waiting for your approval. Tinker 3 failed: Crew error',
    )
    // The Archivist waited and the Foreman failed earlier; both moved on, so neither is read out.
    expect(message).not.toMatch(/Archivist|Foreman/)
    expect(new Set(seen)).toEqual(new Set(full.transitions.map((transition) => transition.transition_id)))
  })

  it('does not announce a transition whose ghost has no matching snapshot', () => {
    const full = at(LOG.length)
    const others = full.snapshots.filter((snapshot: GhostSnapshot) => snapshot.ghost_id !== 'tinker-1')
    expect(interruptionsFor(full.transitions, others, none).message).not.toContain('Tinker 1')
  })
})

describe('diagnosticText', () => {
  it('uses fixed copy and never shows a backend detail code', () => {
    const integrity = diagnosticText({ code: 'hash_mismatch', safe_detail: 'record_hash_mismatch', line: 7 })
    expect(integrity).toBe('The séance log failed its integrity check at line 7. Showing only the records before it.')
    expect(diagnosticText({ code: 'missing_sequence', safe_detail: 'sequence_not_contiguous' })).not.toContain('_')
    expect(diagnosticText({ code: 'invalid_record', safe_detail: 'x', line: 3 })).toContain('line 3')
    expect(diagnosticText({ code: 'persistence_failed', safe_detail: 'stale_sequence' })).toBe(
      'The séance log could not be saved or read. Showing the last confirmed state.',
    )
    expect(diagnosticText({ code: 'persistence_failed', safe_detail: 'Could not read the séance log.' })).toBe(
      'Could not read the séance log.',
    )
    expect(diagnosticText({ code: 'history_partial', safe_detail: '' })).toMatch(/Crew history/)
    expect(diagnosticText({ code: 'invalid_envelope', safe_detail: '' })).toMatch(/refused/)
    expect(diagnosticText({ code: 'conflicting_variant', safe_detail: '' })).toMatch(/problem/)
  })
})
