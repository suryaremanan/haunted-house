// Strict WorkflowProjection parsing (Spec 4 task 13.1; Requirements 8.1, 9.1 to 9.4, 9.7).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  MANSION,
  SHA_A,
  decision,
  descriptor,
  doorProposal,
  projection,
  projectionArb,
  riskyProposal,
} from '../test/workflow-arbitraries'
import {
  actionDescriptorToJson,
  initialWorkflowProjection,
  parseActionDescriptor,
  parseWorkflowProjection,
  workflowProjectionToJson,
  type WorkflowProjection,
} from './workflow-projection'

type Json = Record<string, unknown>

function wire(value: WorkflowProjection): Json {
  return JSON.parse(JSON.stringify(workflowProjectionToJson(value))) as Json
}

function refused(body: unknown, mansion?: string): string {
  const parsed = parseWorkflowProjection(body, mansion)
  if (parsed.ok) throw new Error('expected the projection to be refused')
  return parsed.path
}

const busy = projection({
  version: 40,
  waitingCount: 2,
  phaseOverrides: {
    requirements: {
      status: 'approved',
      ghostIds: ['archivist'],
      door: { status: 'open', proposal: doorProposal('requirements', { status: 'approved', createdSequence: 5, decision: decision('approved', 6) }) },
    },
    design: {
      status: 'waiting',
      ghostIds: ['draughtsman'],
      door: { status: 'waiting', proposal: doorProposal('design', { createdSequence: 20 }) },
    },
  },
  riskyProposals: [
    riskyProposal({ createdSequence: 30 }),
    riskyProposal({ proposalId: 'risky-2', status: 'rejected', createdSequence: 31, decision: decision('rejected', 33, 'crew') }),
    riskyProposal({ proposalId: 'risky-3', descriptor: null, createdSequence: 34 }),
  ],
  pendingPermissions: [{ slot: 'hh-tinker-2-task-2', mid: 'mid-1', requestedSequence: 9, toolName: 'execute_approved_action', actionDigest: SHA_A, proposalId: 'risky-1' }],
})

describe('parseWorkflowProjection', () => {
  it('parses a complete projection with every kind of entry', () => {
    const parsed = parseWorkflowProjection(wire(busy), MANSION)
    expect(parsed).toEqual({ ok: true, projection: busy })
  })

  it('parses the initial projection: requirements ready, later phases not started, every Door sealed', () => {
    const initial = initialWorkflowProjection(MANSION)
    expect(initial.phases.map((phase) => phase.status)).toEqual(['ready', 'not_started', 'not_started', 'not_started'])
    expect(initial.phases.every((phase) => phase.door.status === 'sealed' && phase.door.proposal === null)).toBe(true)
    expect(parseWorkflowProjection(wire(initial))).toEqual({ ok: true, projection: initial })
  })

  it('round-trips every projection the generator can build', () => {
    fc.assert(
      fc.property(projectionArb(), (value) => {
        expect(parseWorkflowProjection(wire(value), MANSION)).toEqual({ ok: true, projection: value })
      }),
      { numRuns: 200 },
    )
  })

  it.each([
    ['a non-object', () => 'nope', '$'],
    ['null', () => null, '$'],
    ['an array', () => [], '$'],
    ['a missing field', () => { const body = wire(busy); delete body.integrity; return body }, '$.integrity'],
    ['an unknown top-level field', () => ({ ...wire(busy), approved: true }), '$'],
    ['another schema version', () => ({ ...wire(busy), schema_version: 2 }), '$.schema_version'],
    ['an unknown integrity', () => ({ ...wire(busy), integrity: 'fine' }), '$.integrity'],
    ['a negative version', () => ({ ...wire(busy), version: -1 }), '$.version'],
    ['a fractional version', () => ({ ...wire(busy), version: 1.5 }), '$.version'],
    ['three phases', () => { const body = wire(busy); (body.phases as unknown[]).pop(); return body }, '$.phases'],
    ['phases out of order', () => { const body = wire(busy); (body.phases as unknown[]).reverse(); return body }, '$.phases[0].phase'],
    ['an unknown phase status', () => { const body = wire(busy); ((body.phases as Json[])[0]).status = 'finished'; return body }, '$.phases[0].status'],
    ['an unknown door status', () => { const body = wire(busy); (((body.phases as Json[])[2]).door as Json).status = 'ajar'; return body }, '$.phases[2].door.status'],
    ['a version older than a record it lists', () => ({ ...wire(busy), version: 3 }), '$.version'],
  ])('refuses %s', (_name, build, path) => {
    expect(refused(build())).toBe(path)
  })

  it('reads the replay-only read_only flag and refuses a non-boolean one', () => {
    const replay = parseWorkflowProjection({ ...wire(busy), read_only: true })
    expect(replay.ok && replay.projection.readOnly).toBe(true)
    expect(wire({ ...busy, readOnly: true }).read_only).toBe(true)
    expect(refused({ ...wire(busy), read_only: 'yes' })).toBe('$.read_only')
  })

  it('refuses a projection of another Mansion', () => {
    expect(refused(wire(busy), 'other-mansion')).toBe('$.mansion_id')
  })

  it('refuses a Door whose status and proposal disagree', () => {
    const open = wire(busy)
    ;(((open.phases as Json[])[1]).door as Json).status = 'open'
    expect(refused(open)).toBe('$.phases[1].door')
    const waitingWithoutProposal = wire(busy)
    ;(((waitingWithoutProposal.phases as Json[])[1]).door as Json).proposal = null
    expect(refused(waitingWithoutProposal)).toBe('$.phases[1].door')
  })

  it('refuses a decided proposal without its decision, and a pending one with a decision', () => {
    const undecided = wire(busy)
    ;((undecided.risky_proposals as Json[])[1]).decision = null
    expect(refused(undecided)).toBe('$.risky_proposals[1].decision')
    const decided = wire(busy)
    ;((decided.risky_proposals as Json[])[0]).decision = { outcome: 'approved', actor: 'operator', event_id: `e1:${'0'.repeat(64)}`, sequence: 35 }
    expect(refused(decided)).toBe('$.risky_proposals[0].decision')
    const wrongOutcome = wire(busy)
    ;(((wrongOutcome.risky_proposals as Json[])[1]).decision as Json).outcome = 'approved'
    expect(refused(wrongOutcome)).toBe('$.risky_proposals[1].decision')
  })

  it('refuses malformed digests, revisions, paths and identifiers', () => {
    const digest = wire(busy)
    ;((digest.risky_proposals as Json[])[0]).action_digest = 'ABC'
    expect(refused(digest)).toBe('$.risky_proposals[0].action_digest')

    const revision = wire(busy)
    ;(((((revision.phases as Json[])[1]).door as Json).proposal as Json).artifact_revision as Json).revision = 0
    expect(refused(revision)).toBe('$.phases[1].door.proposal.artifact_revision.revision')

    for (const path of ['/etc/passwd', '../outside.md', 'a//b', 'a\\b', 'a/./b', '']) {
      const body = wire(busy)
      ;((((body.phases as Json[])[1]).door as Json).proposal as Json).document_path = path
      expect(refused(body)).toBe('$.phases[1].door.proposal.document_path')
    }

    const control = wire(busy)
    ;((control.risky_proposals as Json[])[0]).ghost_id = 'tinker\n2'
    expect(refused(control)).toBe('$.risky_proposals[0].ghost_id')
  })

  it('refuses duplicate proposals and duplicate (slot, mid) permissions', () => {
    const proposals = wire(busy)
    ;((proposals.risky_proposals as Json[])[1]).proposal_id = 'risky-1'
    expect(refused(proposals)).toBe('$.risky_proposals')
    const permissions = wire(busy)
    ;(permissions.pending_permissions as Json[]).push({ ...(permissions.pending_permissions as Json[])[0] })
    expect(refused(permissions)).toBe('$.pending_permissions')
  })

  it('keeps a proposal whose descriptor is withheld or unreadable, with a null descriptor', () => {
    const body = wire(busy)
    ;((body.risky_proposals as Json[])[0]).descriptor = { kind: 'run_command' }
    const parsed = parseWorkflowProjection(body)
    expect(parsed.ok && parsed.projection.riskyProposals[0].descriptor).toBeNull()
    expect(parsed.ok && parsed.projection.riskyProposals[0].status).toBe('pending')
  })

  it('drops a descriptor that names another Mansion, session or Room', () => {
    for (const change of [{ mansion_id: 'other-mansion' }, { session_slot: 'hh-other' }, { room: 'study' }]) {
      const body = wire(busy)
      Object.assign((body.risky_proposals as Json[])[0].descriptor as Json, change)
      const parsed = parseWorkflowProjection(body)
      expect(parsed.ok && parsed.projection.riskyProposals[0].descriptor).toBeNull()
    }
  })
})

describe('parseActionDescriptor', () => {
  const complete = actionDescriptorToJson(descriptor()) as Json

  it('accepts the complete descriptor', () => {
    expect(parseActionDescriptor(complete)).toEqual(descriptor())
  })

  it.each([
    ['a redacted argument', { arguments: { argv: ['deploy', '[redacted]'] } }],
    ['a redacted home path', { arguments: { file: '[home]/notes.txt' } }],
    ['a redacted argument key', { arguments: { '[redacted]': 1 } }],
    ['a float argument', { arguments: { ratio: 0.5 } }],
    ['a control character', { arguments: { argv: ['a\u0000b'] } }],
    ['a non-object arguments value', { arguments: ['rm'] }],
    ['an unknown action kind', { kind: 'push' }],
    ['another schema version', { schema_version: 2 }],
    ['an unknown field', { env: { PATH: '/bin' } }],
    ['a traversal path intent', { path_intents: [{ path: '../x', access: 'read' }] }],
    ['an unknown access kind', { path_intents: [{ path: 'x', access: 'chmod' }] }],
    ['an absolute working directory', { working_directory: '/tmp' }],
    ['a redacted working directory', { working_directory: '[home]/x' }],
  ])('returns null for %s', (_name, change) => {
    expect(parseActionDescriptor({ ...complete, ...change })).toBeNull()
  })

  it('returns null when a field is missing', () => {
    for (const key of Object.keys(complete)) {
      const partial = { ...complete }
      delete partial[key]
      expect(parseActionDescriptor(partial)).toBeNull()
    }
    expect(parseActionDescriptor(null)).toBeNull()
    expect(parseActionDescriptor('rm -rf')).toBeNull()
  })
})
