// fast-check generators and builders for WorkflowProjection values (Spec 4 UI tests).
import fc from 'fast-check'
import type { EventId } from '../core/seance-event'
import {
  ACTION_KINDS,
  DECISION_ACTORS,
  PHASES,
  PHASE_STATUSES,
  RISKY_STATUSES,
  type ActionDescriptor,
  type DecisionRef,
  type DoorProposal,
  type DoorView,
  type Phase,
  type PhaseView,
  type RiskyProposal,
  type RiskyStatus,
  type WorkflowProjection,
} from '../core/workflow-projection'

export const MANSION = 'demo-mansion'
export const SHA_A = 'a'.repeat(64)
export const SHA_B = 'b'.repeat(64)

export function eventId(seed: number): EventId {
  return `e1:${seed.toString(16).padStart(64, '0')}`
}

export function decision(outcome: DecisionRef['outcome'], sequence: number, actor: DecisionRef['actor'] = 'operator'): DecisionRef {
  return { outcome, actor, eventId: eventId(sequence), sequence }
}

export function doorProposal(phase: Phase, overrides: Partial<DoorProposal> = {}): DoorProposal {
  return {
    proposalId: `door-${phase}-1`,
    phase,
    documentPath: `.kiro/specs/demo/${phase === 'implementation' ? 'tasks' : phase}.md`,
    artifactRevision: { revision: 1, sha256: SHA_A, sizeBytes: 1200 },
    status: 'pending',
    createdSequence: 1,
    decision: null,
    ...overrides,
  }
}

export function descriptor(overrides: Partial<ActionDescriptor> = {}): ActionDescriptor {
  return {
    schemaVersion: 1,
    mansionId: MANSION,
    sessionSlot: 'hh-tinker-2-task-2',
    room: 'workshop',
    kind: 'run_command',
    workingDirectory: '',
    arguments: { argv: ['bun', 'test'], timeout_seconds: 120 },
    pathIntents: [
      { path: 'src', access: 'command_read' },
      { path: 'coverage', access: 'command_write' },
    ],
    ...overrides,
  }
}

export function riskyProposal(overrides: Partial<RiskyProposal> = {}): RiskyProposal {
  const base = descriptor()
  return {
    proposalId: 'risky-1',
    ghostId: 'tinker-2',
    sessionSlot: base.sessionSlot,
    room: base.room,
    status: 'pending',
    actionDigest: SHA_B,
    descriptor: base,
    createdSequence: 1,
    decision: null,
    ...overrides,
  }
}

export function phaseView(phase: Phase, overrides: Partial<PhaseView> = {}): PhaseView {
  return {
    phase,
    status: phase === 'requirements' ? 'ready' : 'not_started',
    ghostIds: [],
    door: { status: 'sealed', proposal: null },
    ...overrides,
  }
}

export function projection(overrides: Partial<WorkflowProjection> & { phaseOverrides?: Partial<Record<Phase, Partial<PhaseView>>> } = {}): WorkflowProjection {
  const { phaseOverrides = {}, ...rest } = overrides
  return {
    mansionId: MANSION,
    version: 10,
    integrity: 'valid',
    waitingCount: 0,
    phases: PHASES.map((phase) => phaseView(phase, phaseOverrides[phase])) as unknown as WorkflowProjection['phases'],
    riskyProposals: [],
    pendingPermissions: [],
    readOnly: false,
    ...rest,
  }
}

const sha = fc.stringMatching(/^[0-9a-f]{64}$/)
const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/)
const sequence = fc.integer({ min: 1, max: 500 })

function decisionFor(status: string, created: number, risky = false): fc.Arbitrary<DecisionRef | null> {
  const made = (outcome: DecisionRef['outcome']) =>
    fc
      .tuple(fc.integer({ min: 1, max: 20 }), fc.constantFrom(...DECISION_ACTORS))
      .map(([gap, actor]) => decision(outcome, created + gap, actor))
  switch (status) {
    case 'pending':
      return fc.constant(null)
    case 'superseded':
      return risky ? fc.oneof(fc.constant(null), made('approved')) : fc.constant(null)
    case 'rejected':
      return made('rejected')
    default:
      return made('approved')
  }
}

const doorArb = (phase: Phase): fc.Arbitrary<DoorView> =>
  fc.oneof(
    fc.constant<DoorView>({ status: 'sealed', proposal: null }),
    fc
      .tuple(
        fc.constantFrom('waiting', 'open', 'rejected', 'sealed') as fc.Arbitrary<DoorView['status']>,
        identifier,
        sha,
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 0, max: 100_000 }),
        sequence,
      )
      .chain(([status, id, digest, revision, sizeBytes, created]) => {
        const proposalStatus =
          status === 'waiting' ? 'pending' : status === 'open' ? 'approved' : status === 'rejected' ? 'rejected' : 'superseded'
        return decisionFor(proposalStatus, created).map(
          (made): DoorView => ({
            status,
            proposal: {
              proposalId: `door-${id}`,
              phase,
              documentPath: `.kiro/specs/demo/${phase === 'implementation' ? 'tasks' : phase}.md`,
              artifactRevision: { revision, sha256: digest, sizeBytes },
              status: proposalStatus,
              createdSequence: created,
              decision: made,
            },
          }),
        )
      }),
  )

const descriptorArb: fc.Arbitrary<ActionDescriptor> = fc
  .tuple(
    fc.constantFrom(...ACTION_KINDS),
    fc.array(fc.stringMatching(/^[a-z0-9._-]{1,12}$/), { minLength: 1, maxLength: 4 }),
    fc.array(
      fc.record({
        path: fc.stringMatching(/^[a-z]{1,8}(\/[a-z]{1,8}){0,2}$/),
        access: fc.constantFrom('read', 'write', 'delete', 'command_read', 'command_write', 'git_write') as fc.Arbitrary<
          ActionDescriptor['pathIntents'][number]['access']
        >,
      }),
      { maxLength: 3 },
    ),
  )
  .map(([kind, argv, pathIntents]) => descriptor({ kind, arguments: { argv }, pathIntents }))

export const riskyArb = (statuses: readonly RiskyStatus[] = RISKY_STATUSES): fc.Arbitrary<RiskyProposal> =>
  fc
    .tuple(fc.constantFrom(...statuses), identifier, sha, sequence, fc.option(descriptorArb, { nil: null, freq: 5 }), fc.constantFrom('tinker-1', 'tinker-2', 'tinker-3'))
    .chain(([status, id, digest, created, shown, ghostId]) =>
      decisionFor(status, created, true).map(
        (made): RiskyProposal => ({
          proposalId: `risky-${id}`,
          ghostId,
          sessionSlot: descriptor().sessionSlot,
          room: 'workshop',
          status,
          actionDigest: digest,
          descriptor: shown,
          createdSequence: created,
          decision: made,
        }),
      ),
    )

/** Any projection the strict parser accepts. */
export function projectionArb(options: { riskyStatuses?: readonly RiskyStatus[] } = {}): fc.Arbitrary<WorkflowProjection> {
  return fc
    .tuple(
      fc.tuple(...PHASES.map((phase) => fc.tuple(fc.constantFrom(...PHASE_STATUSES), doorArb(phase), fc.subarray(['ghost-a', 'ghost-b'])))),
      fc.uniqueArray(riskyArb(options.riskyStatuses), { maxLength: 4, selector: (proposal) => proposal.proposalId }),
      fc.constantFrom('valid', 'valid', 'valid', 'corrupt', 'uncertain') as fc.Arbitrary<WorkflowProjection['integrity']>,
      fc.integer({ min: 0, max: 50 }),
    )
    .map(([phases, riskyProposals, integrity, extra]) => {
      const views = phases.map(([status, door, ghostIds], index): PhaseView => ({ phase: PHASES[index], status, ghostIds, door }))
      const highest = Math.max(
        0,
        ...riskyProposals.flatMap((proposal) => [proposal.createdSequence, proposal.decision?.sequence ?? 0]),
        ...views.flatMap((view) => [view.door.proposal?.createdSequence ?? 0, view.door.proposal?.decision?.sequence ?? 0]),
      )
      return {
        mansionId: MANSION,
        version: highest + extra,
        integrity,
        waitingCount: riskyProposals.filter((proposal) => proposal.status === 'pending').length,
        phases: views as unknown as WorkflowProjection['phases'],
        riskyProposals,
        pendingPermissions: [],
        readOnly: false,
      }
    })
}
