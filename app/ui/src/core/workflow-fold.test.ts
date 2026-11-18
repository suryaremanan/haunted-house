// Replay_Projection parity with the backend (Spec 4 tasks 15.1 and 15.2).
//
// The expected projections in both fixtures were written by the backend fold
// (`fold_workflow`) and serializer (`workflow_projection_to_json`) through
// scripts/build_replay_fixture.py. This file folds the same canonical records
// in TypeScript and compares the wire form step by step.
// **Validates: Requirements 10.2, 10.4, 10.5, 10.6, 10.8**
import { describe, expect, it } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import { HELD_MOMENT_RECORDS } from '../test/held-moment'
import demoWorkflow from '../../../../fixtures/replay/demo.workflow.json'
import vectors from '../../../../fixtures/seance/workflow-vectors.json'
import { needsYou } from './house-view'
import { parseAppEvent, type AppEvent } from './seance-event'
import { parseEventLog } from './seance-log'
import {
  GUARDRAIL_DOMAIN,
  GUARDRAIL_KINDS,
  foldWorkflow,
  isCleanRelativePath,
  readDomainRecord,
  recordedActionDigest,
  specDocumentPhase,
} from './workflow-fold'
import { initialWorkflowProjection, parseWorkflowProjection, workflowProjectionToJson } from './workflow-projection'

interface Step {
  readonly sequence: number
  readonly workflow: unknown
}

const DEMO = parseEventLog(demo)
const VECTOR_EVENTS: AppEvent[] = (vectors.events as unknown[]).map((raw) => {
  const parsed = parseAppEvent(raw)
  if (!parsed.ok) throw new Error(`vector record refused: ${parsed.diagnostic.code}`)
  return parsed.value
})

const wire = (events: readonly AppEvent[], mansionId: string) =>
  JSON.parse(JSON.stringify(workflowProjectionToJson(foldWorkflow(events, { mansionId }).projection))) as unknown

/** Folds every prefix and returns the steps where the state (ignoring the version) changed. */
function steps(events: readonly AppEvent[], mansionId: string): Step[] {
  const result: Step[] = [{ sequence: 0, workflow: wire([], mansionId) }]
  let previous = ''
  events.forEach((event, index) => {
    const workflow = wire(events.slice(0, index + 1), mansionId) as Record<string, unknown>
    const state = JSON.stringify({ ...workflow, version: undefined })
    if (state !== previous || index === events.length - 1) result.push({ sequence: event.sequence, workflow })
    previous = state
  })
  return result
}

describe('backend and TypeScript projections agree', () => {
  it('reads the canonical replay fixture through the Spec 2 parser with no diagnostic', () => {
    expect(DEMO.integrityOk).toBe(true)
    expect(DEMO.diagnostics).toEqual([])
    expect(DEMO.events.length).toBe(DEMO.highestSequence)
  })

  it('folds the replay fixture to the backend projection after every record', () => {
    const expected = demoWorkflow.steps as Step[]
    const actual = steps(DEMO.events, demoWorkflow.mansion_id)
    expect(actual.map((step) => step.sequence)).toEqual(expected.map((step) => step.sequence))
    actual.forEach((step, index) => expect(step.workflow, `after Sequence ${step.sequence}`).toEqual(expected[index].workflow))
  })

  it('folds the transition vectors, valid and invalid, to the backend projection after every record', () => {
    const expected = vectors.steps as Step[]
    const actual = steps(VECTOR_EVENTS, vectors.mansion_id)
    expect(actual.map((step) => step.sequence)).toEqual(expected.map((step) => step.sequence))
    actual.forEach((step, index) => expect(step.workflow, `after Sequence ${step.sequence}`).toEqual(expected[index].workflow))
    // The vectors exercise most kinds, so agreement is not an accident of a short story.
    const kinds = new Set(VECTOR_EVENTS.map((event) => readDomainRecord(event)).flatMap((record) => (record !== null && typeof record !== 'string' ? [record.kind] : [])))
    expect(GUARDRAIL_KINDS.filter((kind) => !kinds.has(kind))).toEqual(['phase_start_denied'])
  })

  it('produces projections the strict UI parser accepts at every step', () => {
    for (const [expected, mansion] of [
      [demoWorkflow.steps as Step[], demoWorkflow.mansion_id],
      [vectors.steps as Step[], vectors.mansion_id],
    ] as const) {
      for (const step of expected) {
        const parsed = parseWorkflowProjection(step.workflow, mansion)
        expect(parsed.ok, `backend projection after Sequence ${step.sequence}`).toBe(true)
      }
    }
  })

  it('is deterministic and equals incremental folding of the same prefix', () => {
    const whole = foldWorkflow(VECTOR_EVENTS, { mansionId: vectors.mansion_id })
    const again = foldWorkflow([...VECTOR_EVENTS].reverse(), { mansionId: vectors.mansion_id })
    expect(again).toEqual(whole)
    expect(whole.projection.version).toBe(VECTOR_EVENTS.at(-1)!.sequence)
  })
})

describe('the replay fixture tells the guarded workflow', () => {
  const final = foldWorkflow(DEMO.events, { mansionId: 'demo-mansion', readOnly: true }).projection
  const held = foldWorkflow(DEMO.events.slice(0, HELD_MOMENT_RECORDS), { mansionId: 'demo-mansion', readOnly: true }).projection

  it('holds, at record 64, two open Doors, the tasks phase working behind a sealed Door, and one exact proposal waiting', () => {
    const final = held
    expect(final.phases.map((phase) => [phase.phase, phase.status, phase.door.status, phase.ghostIds])).toEqual([
      ['requirements', 'approved', 'open', ['archivist']],
      ['design', 'approved', 'open', ['draughtsman']],
      ['tasks', 'working', 'sealed', ['foreman']],
      ['implementation', 'not_started', 'sealed', []],
    ])
    expect(final.riskyProposals).toHaveLength(1)
    expect(final.riskyProposals[0]).toMatchObject({ proposalId: 'risky-run-tests-1', ghostId: 'tinker-2', status: 'pending', room: 'workshop' })
    expect(final.riskyProposals[0].descriptor?.arguments).toEqual({ argv: ['bun', 'test'], timeout_seconds: 120 })
    expect(final.readOnly).toBe(true)
    // The Crew prompt of that proposal's session is the same thing waiting, not a second one.
    expect(final.pendingPermissions).toHaveLength(1)
    expect(needsYou(final).map((item) => item.id)).toEqual(['risky:risky-run-tests-1'])
  })

  it('ends with every Door open, the whole-project run refused and the narrower run released and passed', () => {
    expect(final.phases.map((phase) => [phase.phase, phase.status, phase.door.status])).toEqual([
      ['requirements', 'approved', 'open'],
      ['design', 'approved', 'open'],
      ['tasks', 'approved', 'open'],
      ['implementation', 'approved', 'open'],
    ])
    expect(final.riskyProposals.map((proposal) => [proposal.proposalId, proposal.status])).toEqual([
      ['risky-run-tests-1', 'rejected'],
      ['risky-run-tests-2', 'succeeded'],
    ])
    expect(final.riskyProposals[1].descriptor).toMatchObject({ workingDirectory: 'src', arguments: { argv: ['bun', 'test', 'lantern.test.ts'], timeout_seconds: 60 } })
    expect(final.pendingPermissions).toEqual([])
    expect(needsYou(final)).toEqual([])
  })

  it('never advances a phase without its own start record, and holds no approval without a decision record', () => {
    const kinds = DEMO.events.map((event) => readDomainRecord(event)).flatMap((record) => (record !== null && typeof record !== 'string' ? [record.kind] : []))
    // Remove both Door decisions: nothing downstream may have happened.
    const undecided = DEMO.events.filter((event) => {
      const record = readDomainRecord(event)
      return record === null || typeof record === 'string' || record.kind !== 'door_approved'
    })
    const projection = foldWorkflow(undecided, { mansionId: 'demo-mansion' })
    expect(projection.projection.phases.map((phase) => [phase.status, phase.door.status])).toEqual([
      ['waiting', 'waiting'],
      ['not_started', 'sealed'],
      ['not_started', 'sealed'],
      ['not_started', 'sealed'],
    ])
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toContain('predecessor_door_sealed')
    expect(kinds.filter((kind) => kind === 'door_approved')).toHaveLength(4)
  })

  it('holds no document body, secret or home path in any Spec 4 payload', () => {
    for (const event of DEMO.events) {
      const record = readDomainRecord(event)
      if (record === null || typeof record === 'string') continue
      const text = JSON.stringify(record.data)
      expect(text).not.toMatch(/\/Users\/|\/home\/|~\/|\[redacted\]|password|secret|token|BEGIN [A-Z ]*KEY/i)
      expect(text.length).toBeLessThan(1_000)
    }
  })
})

describe('foldWorkflow', () => {
  it('starts with requirements ready, later phases not started and every Door sealed', () => {
    expect(foldWorkflow([], { mansionId: 'demo-mansion' })).toEqual({
      projection: initialWorkflowProjection('demo-mansion'),
      diagnostics: [],
    })
  })

  it('ignores records of other Mansions and other domains but lets other domains advance the version', () => {
    const others = DEMO.events.filter((event) => readDomainRecord(event) === null)
    const folded = foldWorkflow(others, { mansionId: 'demo-mansion' })
    expect(folded.diagnostics).toEqual([])
    expect({ ...folded.projection, version: 0, pendingPermissions: [], waitingCount: 0 }).toEqual(initialWorkflowProjection('demo-mansion'))
    expect(folded.projection.version).toBe(others.at(-1)!.sequence)
    expect(foldWorkflow(DEMO.events, { mansionId: 'other-mansion' }).projection).toEqual(initialWorkflowProjection('other-mansion'))
  })

  it('propagates the integrity Spec 2 reported and verifies nothing itself', () => {
    expect(foldWorkflow(DEMO.events, { mansionId: 'demo-mansion', integrity: 'corrupt' }).projection.integrity).toBe('corrupt')
    // A valid prefix is folded as given: the fold has no opinion about what is missing after it.
    const prefix = DEMO.events.slice(0, 20)
    expect(foldWorkflow(prefix, { mansionId: 'demo-mansion' }).projection.version).toBe(20)
  })

  it('refuses a Spec 4 payload from an untrusted source or with a wrong shape, and keeps the preceding state', () => {
    const reserved = DEMO.events.find((event) => {
      const record = readDomainRecord(event)
      return record !== null && typeof record !== 'string' && record.kind === 'phase_start_reserved'
    })!
    const tamper = (change: (event: Record<string, any>) => void): AppEvent => {
      const copy = JSON.parse(JSON.stringify(reserved)) as Record<string, any>
      change(copy)
      return copy as unknown as AppEvent
    }
    const cases: [string, AppEvent][] = [
      ['untrusted_source', tamper((event) => (event.source.origin = 'crew'))],
      ['untrusted_source', tamper((event) => (event.source.source_type = 'chat'))],
      ['unsupported_value', tamper((event) => (event.payload.kind = 'door_opened'))],
      ['unknown_field', tamper((event) => (event.payload.data.approved = true))],
      ['missing_field', tamper((event) => delete event.payload.data.command_id)],
      ['invalid_value', tamper((event) => (event.payload.data.phase = 'review'))],
      ['invalid_value', tamper((event) => (event.payload.data.command_id = 'has space'))],
      ['mismatch', tamper((event) => (event.payload.entity_id = 'design'))],
      ['invalid_shape', tamper((event) => (event.payload.extra = 1))],
    ]
    for (const [code, event] of cases) {
      expect(readDomainRecord(event)).toBe(code)
      const folded = foldWorkflow([event], { mansionId: 'demo-mansion' })
      expect(folded.diagnostics).toEqual([{ sequence: event.sequence, eventId: event.event_id, kind: 'invalid_payload', code }])
      expect({ ...folded.projection, version: 0 }).toEqual(initialWorkflowProjection('demo-mansion'))
    }
    expect(readDomainRecord(tamper((event) => (event.payload.domain = 'doors')))).toBeNull()
    expect(GUARDRAIL_DOMAIN).toBe('doors_and_guardrails')
  })

  it('shows a proposal as blocked when its recorded descriptor no longer matches its digest', () => {
    const proposed = DEMO.events.find((event) => {
      const record = readDomainRecord(event)
      return record !== null && typeof record !== 'string' && record.kind === 'risky_action_proposed'
    })!
    const redacted = JSON.parse(JSON.stringify(proposed)) as Record<string, any>
    redacted.payload.data.descriptor.arguments.argv = ['bun', '[redacted]']
    const folded = foldWorkflow([redacted as unknown as AppEvent], { mansionId: 'demo-mansion' }).projection
    expect(folded.riskyProposals[0]).toMatchObject({ status: 'pending', descriptor: null, room: null })
    // A changed argument without a marker is caught by the digest.
    const altered = JSON.parse(JSON.stringify(proposed)) as Record<string, any>
    altered.payload.data.descriptor.arguments.argv = ['bun', 'publish']
    expect(foldWorkflow([altered as unknown as AppEvent], { mansionId: 'demo-mansion' }).projection.riskyProposals[0].descriptor).toBeNull()
    expect(recordedActionDigest((proposed.payload as any).data.descriptor)).toBe((proposed.payload as any).data.action_digest)
  })
})

describe('path helpers', () => {
  it('accepts only clean relative paths', () => {
    for (const path of ['a', 'src/app.ts', '.kiro/specs/demo/design.md']) expect(isCleanRelativePath(path)).toBe(true)
    for (const path of ['', '/a', 'a//b', 'a/./b', '../a', 'a/..', 'a\\b', 'a\u0000b', 'a/%2e%2e/b', 'a\u200bb', 5, null]) {
      expect(isCleanRelativePath(path)).toBe(false)
    }
  })

  it('names the phase of a Spec_Document path', () => {
    expect(specDocumentPhase('.kiro/specs/demo/requirements.md')).toBe('requirements')
    expect(specDocumentPhase('.kiro/specs/demo/tasks.md')).toBe('tasks')
    expect(specDocumentPhase('.kiro/specs/demo/implementation.md')).toBeNull()
    expect(specDocumentPhase('.kiro/specs/Demo/design.md')).toBeNull()
    expect(specDocumentPhase('.kiro/specs/demo/sub/design.md')).toBeNull()
    expect(specDocumentPhase('src/result.txt')).toBeNull()
  })
})
