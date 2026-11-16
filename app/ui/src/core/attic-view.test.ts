// The Attic's view model (replay-and-submission tasks 4.1 and 4.3).
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.9**
import { describe, expect, it } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import {
  AT_LAST_EVENT_REASON,
  AT_START_REASON,
  MAX_DIAGNOSTICS_SHOWN,
  NOTHING_TO_REPLAY_REASON,
  SPEED_OPTIONS,
  START_OF_REPLAY_TEXT,
  atticSummary,
  completeAnnouncement,
  diagnosticsView,
  eventCountText,
  playbackStatusText,
  positionAnnouncement,
  timelineRows,
  transportView,
} from './attic-view'
import { GHOST_STATE_LABELS } from './ghost-status'
import { DOOR_STATUS_TEXT, PHASE_STATUS_TEXT } from './house-view'
import { initialReplayState, reduceReplayCommand, type ReplayCommand, type ReplayState } from './replay-reducer'
import {
  MAX_TIMELINE_TEXT,
  buildReplayModel,
  parseCanonicalLog,
  replayDiagnostic,
  replayFoldFor,
  unavailableReplayModel,
} from './replay-timeline'

const MANSION = 'demo-mansion'
const MODEL = buildReplayModel(parseCanonicalLog(demo))
const FOLD = replayFoldFor(MODEL)
const TOTAL = MODEL.records.length
const EMPTY = buildReplayModel(parseCanonicalLog(''))

function at(...commands: ReplayCommand[]): ReplayState {
  return commands.reduce((state, command) => reduceReplayCommand(MODEL, state, command, FOLD), initialReplayState(MODEL, FOLD))
}

describe('transport', () => {
  it('offers Play at the start and nothing that goes back', () => {
    const view = transportView(MODEL, at())
    expect(view).toMatchObject({ playAction: 'play', playLabel: 'Play', play: { enabled: true }, next: { enabled: true }, seek: { enabled: true } })
    expect(view.previous).toEqual({ enabled: false, reason: AT_START_REASON })
    expect(view.restart).toEqual({ enabled: false, reason: AT_START_REASON })
    expect([view.previousCursor, view.nextCursor]).toEqual([0, 1])
  })

  it('offers Pause while playing, and Restart even at the start', () => {
    const view = transportView(MODEL, at({ kind: 'play' }))
    expect(view).toMatchObject({ playAction: 'pause', playLabel: 'Pause', play: { enabled: true }, restart: { enabled: true } })
  })

  it('offers Resume when paused in the middle', () => {
    const view = transportView(MODEL, at({ kind: 'seek', cursor: 5 }))
    expect(view).toMatchObject({
      playAction: 'resume',
      playLabel: 'Resume',
      play: { enabled: true },
      previous: { enabled: true },
      next: { enabled: true },
      restart: { enabled: true },
      previousCursor: 4,
      nextCursor: 6,
    })
  })

  it('keeps Play on at the end (it starts again from the beginning), turns Next off with the reason, and keeps Restart', () => {
    const view = transportView(MODEL, at({ kind: 'seek', cursor: TOTAL }))
    expect(view.play).toEqual({ enabled: true, reason: null })
    expect(view.next).toEqual({ enabled: false, reason: AT_LAST_EVENT_REASON })
    expect(view).toMatchObject({ playLabel: 'Play', restart: { enabled: true }, previous: { enabled: true }, nextCursor: TOTAL })
  })

  it('turns every control off for an empty log, with one reason', () => {
    const view = transportView(EMPTY, initialReplayState(EMPTY, FOLD))
    for (const control of [view.play, view.restart, view.previous, view.next, view.seek]) {
      expect(control).toEqual({ enabled: false, reason: NOTHING_TO_REPLAY_REASON })
    }
  })
})

describe('status and counts', () => {
  it('says the playback status in words', () => {
    expect(playbackStatusText('paused', 0, 5)).toBe('Paused at the start')
    expect(playbackStatusText('paused', 2, 5)).toBe('Paused')
    expect(playbackStatusText('playing', 2, 5)).toBe('Playing')
    expect(playbackStatusText('complete', 5, 5)).toBe('Replay complete')
    expect(playbackStatusText('complete', 0, 0)).toBe('Nothing to replay')
  })

  it('counts events in plain words', () => {
    expect([0, 1, 64].map(eventCountText)).toEqual(['No events recorded', '1 event recorded', '64 events recorded'])
  })

  it('offers exactly the three speeds', () => {
    expect(SPEED_OPTIONS).toEqual([
      { speed: 0.5, text: '0.5×' },
      { speed: 1, text: '1×' },
      { speed: 2, text: '2×' },
    ])
  })
})

describe('timeline rows', () => {
  it('has one row per record in Canonical_Order and marks only the record the Cursor presented', () => {
    for (const cursor of [0, 1, 17, TOTAL]) {
      const rows = timelineRows(MODEL, cursor)
      expect(rows.map((row) => row.key)).toEqual(MODEL.records.map((record) => record.record_id))
      expect(rows.map((row) => row.position)).toEqual(MODEL.records.map((_, index) => index + 1))
      expect(rows.filter((row) => row.current).map((row) => row.position)).toEqual(cursor === 0 ? [] : [cursor])
      expect(rows.filter((row) => row.played)).toHaveLength(cursor)
    }
  })

  it('shows only the safe Timeline text', () => {
    const rows = timelineRows(MODEL, 3)
    rows.forEach((row, index) => {
      expect(row.actor).toBe(MODEL.timeline[index].actorLabel)
      expect(row.summary).toBe(MODEL.timeline[index].summary)
      expect(Array.from(row.actor).length).toBeLessThanOrEqual(MAX_TIMELINE_TEXT)
      expect(Array.from(row.summary).length).toBeLessThanOrEqual(MAX_TIMELINE_TEXT)
    })
  })

  it('announces a position as its number, actor and summary', () => {
    expect(positionAnnouncement(MODEL, 0)).toBe(START_OF_REPLAY_TEXT)
    expect(positionAnnouncement(MODEL, TOTAL + 9)).toBe(START_OF_REPLAY_TEXT)
    const entry = MODEL.timeline[4]
    expect(positionAnnouncement(MODEL, 5)).toBe(`Event 5 of ${TOTAL}. ${entry.actorLabel}: ${entry.summary}.`)
    expect(completeAnnouncement(MODEL)).toBe(`Replay complete. Event ${TOTAL} of ${TOTAL}.`)
  })
})

describe('projection summary', () => {
  it('is empty at the start', () => {
    expect(atticSummary(MODEL, at(), MANSION)).toEqual({
      statusText: 'Paused at the start',
      positionText: 'Start of replay',
      totalText: `${TOTAL} events recorded`,
      currentText: START_OF_REPLAY_TEXT,
      phases: [],
      ghosts: [],
      waitingText: null,
    })
  })

  it('reads every line from the fold of the prefix, in the words the rooms use', () => {
    for (const cursor of [1, 9, 20, 41, TOTAL]) {
      const state = at({ kind: 'seek', cursor })
      const summary = atticSummary(MODEL, state, MANSION)
      const workflow = FOLD(MODEL.records.slice(0, cursor)).workflows[0]
      expect(summary.positionText).toBe(`Event ${cursor} of ${TOTAL}`)
      expect(summary.currentText).toBe(`${MODEL.timeline[cursor - 1].actorLabel}: ${MODEL.timeline[cursor - 1].summary}`)
      expect(summary.phases.map((phase) => [phase.phase, phase.status, phase.door])).toEqual(
        workflow.phases.map((phase) => [phase.phase, phase.status, phase.door.status]),
      )
      for (const phase of summary.phases) {
        expect(phase.text).toContain(PHASE_STATUS_TEXT[phase.status])
        expect(phase.text).toContain(DOOR_STATUS_TEXT[phase.door])
      }
      for (const ghost of summary.ghosts) expect(ghost.text.endsWith(`: ${GHOST_STATE_LABELS[ghost.state]}`)).toBe(true)
      expect(summary.ghosts.map((ghost) => ghost.ghostId)).not.toContain('house-operator')
      expect(summary.waitingText === null).toBe(workflow.waitingCount === 0)
    }
    expect(atticSummary(MODEL, at({ kind: 'seek', cursor: TOTAL }), MANSION).statusText).toBe('Replay complete')
  })

  it('shows nothing of another Mansion', () => {
    const summary = atticSummary(MODEL, at({ kind: 'seek', cursor: TOTAL }), 'other-mansion')
    expect(summary).toMatchObject({ phases: [], ghosts: [], waitingText: null })
  })

  it('carries no payload text of the log', () => {
    const state = at({ kind: 'seek', cursor: TOTAL })
    const text = JSON.stringify([atticSummary(MODEL, state, MANSION), timelineRows(MODEL, TOTAL)])
    // Payload-only strings of the committed fixture: document text, tool arguments, reasons.
    for (const planted of ['requirements.md is ready for review', 'tool-workshop-2', 'requirements-1']) {
      expect(demo).toContain(planted)
      expect(text).not.toContain(planted)
    }
  })
})

describe('diagnostics', () => {
  it('is empty for a clean log', () => {
    expect(diagnosticsView(MODEL, at())).toEqual({ rows: [], moreText: null, total: 0 })
  })

  it('lists a refused command first, then the log problems by line', () => {
    const lines = demo.split('\n')
    lines.splice(2, 0, 'not json')
    const model = buildReplayModel(parseCanonicalLog(lines.join('\n')))
    const fold = replayFoldFor(model)
    const state = reduceReplayCommand(model, initialReplayState(model, fold), { kind: 'seek', cursor: -1 }, fold)
    expect(diagnosticsView(model, state).rows.map((row) => row.text)).toEqual([
      'That position is not an event of this replay.',
      'Line 3: A record could not be read and was left out.',
    ])
  })

  it('shows the fixed copy of a recording that could not be loaded', () => {
    const model = unavailableReplayModel('fixture_unavailable')
    expect(diagnosticsView(model, initialReplayState(model, FOLD)).rows.map((row) => row.text)).toEqual([
      'The replay recording could not be loaded.',
    ])
  })

  it('bounds the list and counts the rest', () => {
    const diagnostics = Array.from({ length: MAX_DIAGNOSTICS_SHOWN + 7 }, (_, index) => replayDiagnostic('invalid_record', { line: index + 1 }))
    const view = diagnosticsView({ diagnostics: [...diagnostics, ...diagnostics] }, at())
    expect(view.rows).toHaveLength(MAX_DIAGNOSTICS_SHOWN)
    expect(view).toMatchObject({ moreText: 'and 7 more', total: MAX_DIAGNOSTICS_SHOWN + 7 })
    expect(new Set(view.rows.map((row) => row.key)).size).toBe(MAX_DIAGNOSTICS_SHOWN)
  })
})
