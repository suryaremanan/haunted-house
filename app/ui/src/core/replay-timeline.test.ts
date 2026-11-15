// Replay Model examples and boundaries (replay-and-submission task 2.7).
// **Validates: Requirements 1.1, 1.3, 1.4, 1.5, 3.2, 5.3**
import { describe, expect, it } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import demoExpected from '../../../../fixtures/replay/demo.expected.json'
import demoWorkflow from '../../../../fixtures/replay/demo.workflow.json'
import { makeEvent } from '../test/seance-arbitraries'
import { selectEvents } from './ghost-state'
import type { AppEvent, AppEventCandidate, EventType, JsonValue } from './seance-event'
import { parseEventLog, projectEvents } from './seance-log'
import {
  CANONICAL_REPLAY_PORT,
  DEFAULT_STEP_INTERVAL_MS,
  MAX_STEP_INTERVAL_MS,
  MAX_TIMELINE_TEXT,
  MIN_STEP_INTERVAL_MS,
  RECORDED_EVENT_TEXT,
  REPLAY_DIAGNOSTIC_TEXT,
  buildReplayModel,
  foldLive,
  foldReplay,
  parseCanonicalLog,
  presentationOffsets,
  replayFoldFor,
  safeTimelineEntry,
  selectCanonical,
  stepIntervalMs,
  unavailableReplayModel,
  workflowOf,
} from './replay-timeline'
import { workflowProjectionToJson } from './workflow-projection'

function event(
  sequence: number,
  eventType: EventType,
  payload: JsonValue = {},
  overrides: { occurred?: number | null; ghost?: string; origin?: 'crew' | 'house'; sourceType?: string } = {},
): AppEvent {
  const candidate: AppEventCandidate = {
    schema_version: 1,
    event_type: eventType,
    scope: {
      mansion_id: 'demo-mansion',
      ghost_id: overrides.ghost ?? 'archivist',
      session_slot: 'slot-1',
      run_id: 'run-1',
      run_sequence: 0,
    },
    source: {
      origin: overrides.origin ?? 'house',
      source_type: overrides.sourceType ?? eventType,
      identity_parts: [`id-${sequence}`],
      revision: 0,
      generation: '',
      source_sequence: 0,
    },
    caused_by: [],
    occurred_at_ms: overrides.occurred === undefined ? null : overrides.occurred,
    payload,
  }
  return makeEvent(candidate, sequence)
}

const timed = (sequence: number, occurred: number | null) => event(sequence, 'ghost_progressed', {}, { occurred })
const summary = (record: AppEvent) => safeTimelineEntry(record, 0).summary

describe('canonical composition', () => {
  const parsed = parseEventLog(demo)
  const selection = parseCanonicalLog(demo)
  const model = buildReplayModel(selection)

  it('reads the fixture through the Spec 2 parser and selector only', () => {
    expect(selection.diagnostics).toEqual([])
    expect(selection.integrityOk).toBe(true)
    expect(selection.records).toEqual(selectEvents(parsed.events).events)
    expect(model.records).toBe(selection.records)
    expect(model.timeline.map((entry) => entry.recordId)).toEqual(parsed.events.map((record) => record.record_id))
  })

  it('folds a prefix with the upstream ghost and workflow folds', () => {
    const projection = foldReplay(model.records)
    const upstream = projectEvents(parsed.events)
    expect(projection.ghosts).toEqual(upstream.snapshots)
    expect(projection.transitions).toEqual(upstream.transitions)
    expect(projection.validRecordCount).toBe(parsed.events.length)
    expect(projection.integrity).toBe('valid')
    expect(projection.workflows.map((workflow) => workflow.mansionId)).toEqual(['demo-mansion'])
    expect(workflowOf(projection, 'demo-mansion')?.readOnly).toBe(true)
    expect(workflowOf(projection, 'no-such-mansion')).toBeNull()
  })

  it('agrees with the backend workflow projection at every recorded step', () => {
    // demo.workflow.json was written by the Python fold; `read_only` is replay-only presentation.
    for (const step of demoWorkflow.steps as readonly { sequence: number; workflow: unknown }[]) {
      const workflow = workflowOf(foldReplay(model.records.slice(0, step.sequence)), 'demo-mansion')
      if (step.sequence === 0) {
        expect(workflow).toBeNull()
        continue
      }
      const wire = JSON.parse(JSON.stringify(workflowProjectionToJson({ ...workflow!, readOnly: false })))
      expect(wire).toEqual(step.workflow)
    }
  })

  it('reaches the final projection the backend recorded for the fixture', () => {
    // demo.expected.json is test-only evidence written by the Python folds; replay never loads it.
    expect(model.records.map((record) => record.record_id)).toEqual(demoExpected.selected_record_ids)
    expect(model.records).toHaveLength(demoExpected.record_count)
    const final = foldReplay(model.records)
    const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown
    expect(plain(final.ghosts)).toEqual(demoExpected.projection.ghosts)
    expect(plain(final.transitions)).toEqual(demoExpected.projection.transitions)
    expect(plain(workflowProjectionToJson({ ...workflowOf(final, demoExpected.mansion_id)!, readOnly: false }))).toEqual(
      demoExpected.projection.workflow,
    )
    expect(final.diagnostics).toHaveLength(demoExpected.selection_diagnostics)
  })

  it('tells the judge narrative: two ghosts, a tool call, an approval, a Door decision, a completion, a failure', () => {
    const types = model.timeline.map((entry) => entry.eventType)
    const summaries = model.timeline.map((entry) => entry.summary)
    expect(new Set(model.timeline.map((entry) => entry.actorLabel)).size).toBeGreaterThanOrEqual(2)
    for (const type of ['tool_started', 'tool_finished', 'approval_requested', 'approval_decided', 'run_completed']) {
      expect(types).toContain(type)
    }
    expect(types.some((type) => type === 'run_blocked' || type === 'run_failed')).toBe(true)
    expect(summaries.some((text) => text.startsWith('Door approved') || text.startsWith('Door rejected'))).toBe(true)
    const narrative = demoExpected.narrative
    expect(types.filter((type) => type === 'tool_started')).toHaveLength(narrative.tool_started)
    expect(types.filter((type) => type === 'approval_decided')).toHaveLength(narrative.approval_decided)
    expect(summaries.filter((text) => /^Door (approved|rejected)/.test(text))).toHaveLength(narrative.door_decisions)
  })

  it('gives live and replay folding the same projection', () => {
    expect(foldLive([...model.records].reverse())).toEqual(foldReplay(model.records))
    expect(CANONICAL_REPLAY_PORT.foldLive(model.records)).toEqual(CANONICAL_REPLAY_PORT.fold(model.records))
    expect(CANONICAL_REPLAY_PORT.parse(demo)).toEqual(selection)
    expect(CANONICAL_REPLAY_PORT.select(parsed.events).records).toEqual(selection.records)
  })

  it('builds an equal model each time', () => {
    expect(buildReplayModel(parseCanonicalLog(demo))).toEqual(model)
  })
})

describe('empty and damaged logs', () => {
  it('gives an empty model and projection for an empty log', () => {
    for (const text of ['', '\n', '   \n\n']) {
      const model = buildReplayModel(parseCanonicalLog(text))
      expect(model).toEqual({ records: [], timeline: [], diagnostics: [], integrityOk: true })
      expect(foldReplay(model.records)).toEqual({
        ghosts: [],
        transitions: [],
        workflows: [],
        integrity: 'valid',
        validRecordCount: 0,
        diagnostics: [],
      })
    }
  })

  it('reports a malformed line by number and replays every valid record', () => {
    const lines = demo.split('\n')
    const text = [lines[0], '{"not":"a record"}', 'not json', ...lines.slice(1)].join('\n')
    const selection = parseCanonicalLog(text)
    expect(selection.records).toHaveLength(parseEventLog(demo).events.length)
    expect(selection.integrityOk).toBe(true)
    expect(selection.diagnostics).toEqual([
      { code: 'invalid_record', line: 2, safeDetail: REPLAY_DIAGNOSTIC_TEXT.invalid_record },
      { code: 'invalid_record', line: 3, safeDetail: REPLAY_DIAGNOSTIC_TEXT.invalid_record },
    ])
  })

  it('reports an unsupported schema line and keeps no text from it', () => {
    const first = JSON.parse(demo.split('\n')[0]) as Record<string, unknown>
    const text = `${JSON.stringify({ ...first, schema_version: 99, payload: { secret: 'hunter2-planted' } })}\n`
    const selection = parseCanonicalLog(text)
    expect(selection.records).toEqual([])
    expect(selection.diagnostics).toEqual([
      { code: 'unsupported_schema', line: 1, safeDetail: REPLAY_DIAGNOSTIC_TEXT.unsupported_schema },
    ])
    expect(JSON.stringify(selection)).not.toContain('hunter2')
  })

  it('keeps only the valid prefix after an integrity failure and marks the projection', () => {
    const lines = demo.split('\n').filter((line) => line !== '')
    const text = [...lines.slice(0, 5), ...lines.slice(6)].join('\n')
    const selection = parseCanonicalLog(text)
    expect(selection.records).toHaveLength(5)
    expect(selection.integrityOk).toBe(false)
    expect(selection.diagnostics).toEqual([
      { code: 'integrity_failed', line: 6, safeDetail: REPLAY_DIAGNOSTIC_TEXT.integrity_failed },
    ])
    const model = buildReplayModel(selection)
    const projection = replayFoldFor(model)(model.records)
    expect(projection.integrity).toBe('incompatible')
    expect(projection.workflows[0].integrity).toBe('corrupt')
    expect(foldReplay(model.records).integrity).toBe('valid')
  })

  it('reports variants and broken causal links with the record they concern', () => {
    const first = event(1, 'run_started')
    const variant: AppEvent = { ...first, record_id: `r1:${'b'.repeat(64)}`, source: { ...first.source, revision: 2 } }
    const orphan: AppEvent = { ...event(2, 'ghost_progressed'), caused_by: [`e1:${'a'.repeat(64)}`] }
    const selfish = event(3, 'ghost_progressed')
    const cyclic: AppEvent = { ...selfish, caused_by: [selfish.event_id] }
    const selection = selectCanonical([cyclic, orphan, variant, first])
    expect(selection.records.map((record) => record.record_id)).toEqual([
      variant.record_id,
      orphan.record_id,
      cyclic.record_id,
    ])
    expect(new Set(selection.diagnostics)).toEqual(
      new Set([
        { code: 'conflicting_variant', recordId: variant.record_id, safeDetail: REPLAY_DIAGNOSTIC_TEXT.conflicting_variant },
        { code: 'missing_predecessor', recordId: orphan.record_id, safeDetail: REPLAY_DIAGNOSTIC_TEXT.missing_predecessor },
        { code: 'causal_cycle', recordId: cyclic.record_id, safeDetail: REPLAY_DIAGNOSTIC_TEXT.causal_cycle },
      ]),
    )
    // Selection diagnostics belong to the model; the projection reports only refused workflow records.
    expect(foldReplay(selection.records)).toMatchObject({ integrity: 'valid', diagnostics: [] })
  })

  it('marks a prefix whose workflow record was refused', () => {
    const records = parseEventLog(demo).events
    const approval = records.findIndex(
      (record) => (record.payload as { kind?: string }).kind === 'door_approved' && record.source.source_type !== 'domain_event_recorded',
    )
    expect(approval).toBeGreaterThan(0)
    // The same approval again, without the proposal it decides: not a valid step.
    const projection = foldReplay([records[approval]])
    expect(projection.integrity).toBe('diagnostic')
    expect(projection.diagnostics).toEqual([
      { code: 'invalid_transition', recordId: records[approval].record_id, safeDetail: REPLAY_DIAGNOSTIC_TEXT.invalid_transition },
    ])
  })

  it('has a fixed empty model for a recording that could not be loaded', () => {
    expect(unavailableReplayModel('fixture_unavailable')).toEqual({
      records: [],
      timeline: [],
      diagnostics: [{ code: 'fixture_unavailable', safeDetail: REPLAY_DIAGNOSTIC_TEXT.fixture_unavailable }],
      integrityOk: true,
    })
  })
})

describe('presentation time', () => {
  it('uses the recorded gap between two occurrence times', () => {
    expect(stepIntervalMs(timed(1, 1_000), timed(2, 1_300))).toBe(300)
    expect(stepIntervalMs(timed(1, 1_000), timed(2, 3_500))).toBe(2_500)
  })

  it('clamps a gap to 250 and 4,000 milliseconds', () => {
    expect(stepIntervalMs(timed(1, 1_000), timed(2, 1_001))).toBe(MIN_STEP_INTERVAL_MS)
    expect(stepIntervalMs(timed(1, 1_000), timed(2, 1_249))).toBe(250)
    expect(stepIntervalMs(timed(1, 1_000), timed(2, 1_250))).toBe(250)
    expect(stepIntervalMs(timed(1, 1_000), timed(2, 1_251))).toBe(251)
    expect(stepIntervalMs(timed(1, 1_000), timed(2, 4_999))).toBe(3_999)
    expect(stepIntervalMs(timed(1, 1_000), timed(2, 5_000))).toBe(MAX_STEP_INTERVAL_MS)
    expect(stepIntervalMs(timed(1, 1_000), timed(2, 5_001))).toBe(4_000)
    expect(stepIntervalMs(timed(1, -Number.MAX_SAFE_INTEGER), timed(2, Number.MAX_SAFE_INTEGER))).toBe(4_000)
  })

  it('uses 1,000 milliseconds for absent, equal, backward and unusable times', () => {
    expect(stepIntervalMs(timed(1, null), timed(2, 2_000))).toBe(DEFAULT_STEP_INTERVAL_MS)
    expect(stepIntervalMs(timed(1, 2_000), timed(2, null))).toBe(1_000)
    expect(stepIntervalMs(timed(1, null), timed(2, null))).toBe(1_000)
    expect(stepIntervalMs(timed(1, 2_000), timed(2, 2_000))).toBe(1_000)
    expect(stepIntervalMs(timed(1, 2_000), timed(2, 1_000))).toBe(1_000)
    expect(stepIntervalMs(timed(1, 0.5), timed(2, 900.5))).toBe(1_000)
    expect(stepIntervalMs(timed(1, Number.NaN), timed(2, Number.POSITIVE_INFINITY))).toBe(1_000)
    expect(stepIntervalMs(timed(1, 2 ** 60), timed(2, 2 ** 61))).toBe(1_000)
  })

  it('starts at zero and accumulates the intervals', () => {
    expect(presentationOffsets([])).toEqual([])
    expect(presentationOffsets([timed(1, 9_000)])).toEqual([0])
    expect(presentationOffsets([timed(1, 1_000), timed(2, 1_300), timed(3, null), timed(4, 500), timed(5, 90_000)])).toEqual([
      0, 300, 1_300, 2_300, 6_300,
    ])
  })

  it('ignores the persistence time of the writer', () => {
    const early = { ...timed(1, null), persisted_at_ms: 5 }
    const late = { ...timed(2, null), persisted_at_ms: 500_000 }
    expect(stepIntervalMs(early, late)).toBe(1_000)
  })
})

describe('safe Timeline entries', () => {
  it('names the event, its actor and an allowlisted outcome', () => {
    expect(safeTimelineEntry(event(1, 'run_started', { room: 'study', reason: 'Writing requirements' }), 40)).toEqual({
      recordId: event(1, 'run_started', { room: 'study', reason: 'Writing requirements' }).record_id,
      eventId: event(1, 'run_started', { room: 'study', reason: 'Writing requirements' }).event_id,
      eventType: 'run_started',
      actorLabel: 'Archivist',
      summary: 'Run started in the Study',
      presentationOffsetMs: 40,
    })
    expect(summary(event(1, 'run_started', { room: 'drafting-room' }))).toBe('Run started in the Drafting Room')
    expect(summary(event(1, 'run_blocked', { reason: 'locked_door' }))).toBe('Run blocked: A door upstream is still sealed.')
    expect(summary(event(1, 'run_failed', { reason: 'stalled' }))).toBe('Run failed: The run stalled.')
    expect(summary(event(1, 'run_completed', { reason: 'requirements.md is ready' }))).toBe('Run completed')
    expect(summary(event(1, 'tool_started', { tool: 'run_tests', is_shell: true }))).toBe('Shell tool call started')
    expect(summary(event(1, 'tool_started', { tool: 'write_spec_document', is_shell: false }))).toBe('Tool call started')
    expect(summary(event(1, 'tool_finished', { tool_call_id: 't', final: true }))).toBe('Tool call finished')
    expect(summary(event(1, 'approval_requested', { mid: 'mid-1' }))).toBe('Approval requested')
    expect(summary(event(1, 'approval_decided', { mid: 'mid-1', outcome: 'approved' }))).toBe('Approval decided: approved')
    expect(summary(event(1, 'approval_decided', { mid: 'mid-1', outcome: 'denied' }))).toBe('Approval decided: rejected')
    expect(summary(event(1, 'crew_turn_ended', { needs_input: true }))).toBe('Crew turn ended: needs input')
    expect(summary(event(1, 'crew_error_observed', { category: 'provider_error' }))).toBe('Crew error observed')
  })

  it('names the actor from the ghost identity', () => {
    expect(safeTimelineEntry(event(1, 'run_started', {}, { ghost: 'tinker-2' }), 0).actorLabel).toBe('Tinker 2')
    expect(safeTimelineEntry(event(1, 'run_started', {}, { ghost: 'house-operator' }), 0).actorLabel).toBe('Operator')
  })

  it('describes Spec 4 facts by kind and phase', () => {
    const fact = (kind: string, data: JsonValue, entity: string) =>
      event(1, 'domain_event_recorded', { domain: 'doors_and_guardrails', kind, entity_id: entity, data }, { sourceType: 'haunted_house.guardrail' })
    const fixture = parseEventLog(demo).events
    const summaries = new Set(buildReplayModel(selectCanonical(fixture)).timeline.map((entry) => entry.summary))
    expect(summaries).toContain('Door approved: Requirements')
    expect(summaries).toContain('Phase started: Design')
    expect(summaries).toContain('Phase start denied: Implementation')
    expect(summaries).toContain('Risky action proposed')
    expect(summaries).toContain('Spec document written: Tasks')
    expect(summaries).toContain('House event recorded')
    // A record that claims to be a Spec 4 fact and is not valid shows fixed copy, not its content.
    expect(summary(fact('door_approved', { phase: 'requirements', note: 'planted-note-text' }, 'requirements'))).toBe(
      'Workflow record refused',
    )
  })

  it('never falls back to payload text', () => {
    const planted = 'PLANTED-payload-only-text /Users/someone/secret.txt sk-live-0123456789'
    const payloads: JsonValue[] = [
      planted,
      [planted],
      { room: planted, reason: planted, outcome: planted, tool: planted, content: planted, status: planted },
      { domain: planted, kind: planted, entity_id: planted, data: { phase: planted } },
      { domain: 'doors_and_guardrails', kind: planted, entity_id: planted, data: { phase: planted } },
    ]
    for (const eventType of [
      'run_started',
      'run_blocked',
      'run_failed',
      'approval_decided',
      'tool_started',
      'response_chunk_recorded',
      'message_recorded',
      'domain_event_recorded',
      'source_event_observed',
    ] as const) {
      for (const payload of payloads) {
        const entry = safeTimelineEntry(event(1, eventType, payload), 0)
        expect(JSON.stringify(entry)).not.toContain('PLANTED')
        expect(JSON.stringify(entry)).not.toContain('someone')
      }
    }
  })

  it('shows fixed copy for an unknown event type', () => {
    const unknown = { ...event(1, 'run_started', { room: 'study' }), event_type: 'PLANTED_new_type' as EventType }
    expect(safeTimelineEntry(unknown, 0)).toMatchObject({ eventType: 'unknown', summary: RECORDED_EVENT_TEXT })
    for (const inherited of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const odd = { ...event(1, 'run_started'), event_type: inherited as EventType }
      expect(safeTimelineEntry(odd, 0).summary).toBe(RECORDED_EVENT_TEXT)
      expect(summary(event(1, 'run_blocked', { reason: inherited }))).toBe('Run blocked')
      expect(summary(event(1, 'run_started', { room: inherited }))).toBe('Run started')
    }
  })

  it('bounds actor and summary text to 160 code points on one line', () => {
    const long = `ghost-${'\u{1f47b}'.repeat(400)}`
    const entry = safeTimelineEntry(event(1, 'run_started', { room: 'study' }, { ghost: long }), 0)
    expect(Array.from(entry.actorLabel).length).toBeLessThanOrEqual(MAX_TIMELINE_TEXT)
    expect(Array.from(entry.summary).length).toBeLessThanOrEqual(MAX_TIMELINE_TEXT)
    const spaced = safeTimelineEntry(event(1, 'run_started', {}, { ghost: 'tinker\n\t  3\u0007' }), 0)
    expect(spaced.actorLabel).toBe('Tinker 3')
  })
})
