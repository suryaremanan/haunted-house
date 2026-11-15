// Strict parsing of the backend WorkflowProjection (Spec 4, Requirements 8.1,
// 9.1 to 9.4, 9.7). The body of `GET /api/mansions/{mansion}/workflow` and of
// every mutation response is untrusted until it passes this parser. A value
// that does not match exactly is refused whole, so a malformed projection can
// never enable a decision control.
//
// This file parses a finished projection. It folds nothing from Crew data and
// holds no approval state of its own. No SDK, React, network, or clock.

import { MANSION_ID_PATTERN, MAX_MANSION_ID_LENGTH, type EventId, type JsonValue } from './seance-event'

export const WORKFLOW_SCHEMA_VERSION = 1 as const

export const PHASES = ['requirements', 'design', 'tasks', 'implementation'] as const
export type Phase = (typeof PHASES)[number]

export const PHASE_STATUSES = [
  'not_started',
  'ready',
  'starting',
  'working',
  'waiting',
  'revision_required',
  'approved',
  'failed',
  'done',
] as const
export type PhaseStatus = (typeof PHASE_STATUSES)[number]

export const DOOR_STATUSES = ['sealed', 'waiting', 'open', 'rejected'] as const
export type DoorStatus = (typeof DOOR_STATUSES)[number]

export const DOOR_PROPOSAL_STATUSES = ['pending', 'approved', 'rejected', 'superseded'] as const
export type DoorProposalStatus = (typeof DOOR_PROPOSAL_STATUSES)[number]

export const RISKY_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'consumed',
  'succeeded',
  'failed',
  'superseded',
] as const
export type RiskyStatus = (typeof RISKY_STATUSES)[number]

export const INTEGRITY_STATES = ['valid', 'corrupt', 'uncertain'] as const
export type Integrity = (typeof INTEGRITY_STATES)[number]

export const ACTION_KINDS = ['delete_path', 'run_command', 'git_write'] as const
export type ActionKind = (typeof ACTION_KINDS)[number]

export const PATH_ACCESS_KINDS = [
  'list',
  'read',
  'write',
  'delete',
  'command_read',
  'command_write',
  'git_write',
] as const
export type PathAccess = (typeof PATH_ACCESS_KINDS)[number]

export const DECISION_OUTCOMES = ['approved', 'rejected'] as const
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number]

/** Who decided: the Operator in this app, or Crew's own prompt answered elsewhere. */
export const DECISION_ACTORS = ['operator', 'crew'] as const
export type DecisionActor = (typeof DECISION_ACTORS)[number]

export const MAX_ID_LENGTH = 160
export const MAX_PATH_LENGTH = 1024
export const MAX_RISKY_PROPOSALS = 200
export const MAX_PENDING_PERMISSIONS = 200
export const MAX_GHOSTS_PER_PHASE = 16
export const MAX_PATH_INTENTS = 64
export const MAX_ARGUMENT_BYTES = 16 * 1024
/** The backend's redaction markers. A descriptor that contains one cannot be shown exactly. */
export const REDACTION_MARKERS = ['[redacted]', '[home]/'] as const

export interface ArtifactRevision {
  readonly revision: number
  readonly sha256: string
  readonly sizeBytes: number
}

export interface DecisionRef {
  readonly outcome: DecisionOutcome
  readonly actor: DecisionActor
  readonly eventId: EventId
  readonly sequence: number
}

export interface DoorProposal {
  readonly proposalId: string
  readonly phase: Phase
  readonly documentPath: string
  readonly artifactRevision: ArtifactRevision
  readonly status: DoorProposalStatus
  readonly createdSequence: number
  readonly decision: DecisionRef | null
}

export interface DoorView {
  readonly status: DoorStatus
  /** The current proposal of this Door, or null when none was ever made. */
  readonly proposal: DoorProposal | null
}

export interface PhaseView {
  readonly phase: Phase
  readonly status: PhaseStatus
  /** Ghosts the backend bound to this phase, in start order. */
  readonly ghostIds: readonly string[]
  readonly door: DoorView
}

export interface PathIntent {
  readonly path: string
  readonly access: PathAccess
}

export interface ActionDescriptor {
  readonly schemaVersion: 1
  readonly mansionId: string
  readonly sessionSlot: string
  readonly room: string
  readonly kind: ActionKind
  readonly workingDirectory: string
  readonly arguments: { readonly [key: string]: JsonValue }
  readonly pathIntents: readonly PathIntent[]
}

export interface RiskyProposal {
  readonly proposalId: string
  readonly ghostId: string
  readonly sessionSlot: string
  /** The Room of the descriptor, or null when the descriptor cannot be read. */
  readonly room: string | null
  readonly status: RiskyStatus
  /** Lowercase hex SHA-256 of the canonical Action_Descriptor. */
  readonly actionDigest: string
  /**
   * The descriptor exactly as the backend holds it, or null when it was
   * withheld, redacted, or did not parse. Approval needs a non-null descriptor.
   */
  readonly descriptor: ActionDescriptor | null
  readonly createdSequence: number
  readonly decision: DecisionRef | null
}

/** A Crew permission prompt Spec 2 acknowledged and nobody answered yet. Identity is (slot, mid). */
export interface PendingPermission {
  readonly slot: string
  readonly mid: string
  /** Canonical Sequence of the request. */
  readonly requestedSequence: number
  /** Filled once the backend correlated the prompt; null until then. */
  readonly toolName: string | null
  readonly actionDigest: string | null
  readonly proposalId: string | null
}

export interface WorkflowProjection {
  readonly mansionId: string
  /** Projection_Version: the highest canonical Sequence folded. */
  readonly version: number
  readonly integrity: Integrity
  readonly waitingCount: number
  /** Exactly the four phases, in workflow order. */
  readonly phases: readonly [PhaseView, PhaseView, PhaseView, PhaseView]
  readonly riskyProposals: readonly RiskyProposal[]
  readonly pendingPermissions: readonly PendingPermission[]
  /**
   * True only for a projection the replay stand-in folded from a recording
   * (wire field `read_only`, which the backend never sends). Nothing can be decided on it.
   */
  readonly readOnly: boolean
}

export type WorkflowParseResult =
  | { readonly ok: true; readonly projection: WorkflowProjection }
  | { readonly ok: false; readonly path: string }

class Refused extends Error {
  constructor(readonly path: string) {
    super('refused')
  }
}

function refuse(path: string): never {
  throw new Refused(path)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A record with exactly these keys; `optional` keys may be absent. */
function exact(value: unknown, path: string, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!isRecord(value)) refuse(path)
  for (const key of Object.keys(value)) {
    if (!keys.includes(key) && !optional.includes(key)) refuse(path)
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) refuse(`${path}.${key}`)
  }
  return value
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], path: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) refuse(path)
  return value as T
}

function count(value: unknown, path: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) refuse(path)
  return value
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/

/** Bounded, non-empty, single-line text with no control characters. */
function text(value: unknown, path: string, limit = MAX_ID_LENGTH): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > limit || CONTROL.test(value)) refuse(path)
  return value
}

function digest(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) refuse(path)
  return value
}

/** A Project_Path as the backend normalizes it: relative, slash-separated, no dot segments. */
function projectPath(value: unknown, path: string, allowRoot = false): string {
  // The empty string is the Mansion root, allowed only where a folder is named.
  if (allowRoot && value === '') return ''
  const raw = text(value, path, MAX_PATH_LENGTH)
  if (raw.startsWith('/') || raw.includes('\\')) refuse(path)
  for (const part of raw.split('/')) {
    if (part === '' || part === '.' || part === '..') refuse(path)
  }
  return raw
}

function mansionId(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > MAX_MANSION_ID_LENGTH || !MANSION_ID_PATTERN.test(value)) refuse(path)
  return value
}

function parseRevision(value: unknown, path: string): ArtifactRevision {
  const record = exact(value, path, ['revision', 'sha256', 'size_bytes'])
  return {
    revision: count(record.revision, `${path}.revision`, 1),
    sha256: digest(record.sha256, `${path}.sha256`),
    sizeBytes: count(record.size_bytes, `${path}.size_bytes`),
  }
}

function parseDecision(value: unknown, path: string): DecisionRef | null {
  if (value === null) return null
  const record = exact(value, path, ['outcome', 'actor', 'event_id', 'sequence'])
  const eventId = record.event_id
  if (typeof eventId !== 'string' || !/^e1:[0-9a-f]{64}$/.test(eventId)) refuse(`${path}.event_id`)
  return {
    outcome: oneOf(record.outcome, DECISION_OUTCOMES, `${path}.outcome`),
    actor: oneOf(record.actor, DECISION_ACTORS, `${path}.actor`),
    eventId: eventId as EventId,
    sequence: count(record.sequence, `${path}.sequence`, 1),
  }
}

/** A decision is present exactly when the status says one was made, and agrees with it. */
function decisionMatches(
  status: string,
  decision: DecisionRef | null,
  decided: Readonly<Record<string, DecisionOutcome>>,
  supersededAfterApproval: boolean,
): boolean {
  if (status === 'pending') return decision === null
  // A risky proposal can be superseded while pending or after it was approved; a Door only while pending.
  if (status === 'superseded') return decision === null || (supersededAfterApproval && decision.outcome === 'approved')
  const expected = Object.hasOwn(decided, status) ? decided[status] : undefined
  return expected !== undefined && decision !== null && decision.outcome === expected
}

const DOOR_DECIDED: Readonly<Record<string, DecisionOutcome>> = { approved: 'approved', rejected: 'rejected' }
const RISKY_DECIDED: Readonly<Record<string, DecisionOutcome>> = {
  approved: 'approved',
  rejected: 'rejected',
  consumed: 'approved',
  succeeded: 'approved',
  failed: 'approved',
}

function parseDoorProposal(value: unknown, path: string, phase: Phase): DoorProposal | null {
  if (value === null) return null
  const record = exact(value, path, [
    'proposal_id',
    'phase',
    'document_path',
    'artifact_revision',
    'status',
    'created_sequence',
    'decision',
  ])
  if (record.phase !== phase) refuse(`${path}.phase`)
  const status = oneOf(record.status, DOOR_PROPOSAL_STATUSES, `${path}.status`)
  const decision = parseDecision(record.decision, `${path}.decision`)
  if (!decisionMatches(status, decision, DOOR_DECIDED, false)) refuse(`${path}.decision`)
  return {
    proposalId: text(record.proposal_id, `${path}.proposal_id`),
    phase,
    documentPath: projectPath(record.document_path, `${path}.document_path`),
    artifactRevision: parseRevision(record.artifact_revision, `${path}.artifact_revision`),
    status,
    createdSequence: count(record.created_sequence, `${path}.created_sequence`, 1),
    decision,
  }
}

/** Door status and its proposal must tell the same story, or neither is trusted. */
function doorConsistent(status: DoorStatus, proposal: DoorProposal | null): boolean {
  switch (status) {
    case 'waiting':
      return proposal?.status === 'pending'
    case 'open':
      return proposal?.status === 'approved'
    case 'rejected':
      return proposal?.status === 'rejected'
    case 'sealed':
      return proposal === null || proposal.status === 'superseded' || proposal.status === 'rejected'
  }
}

function parsePhase(value: unknown, path: string, phase: Phase): PhaseView {
  const record = exact(value, path, ['phase', 'status', 'ghost_ids', 'door'])
  if (record.phase !== phase) refuse(`${path}.phase`)
  if (!Array.isArray(record.ghost_ids) || record.ghost_ids.length > MAX_GHOSTS_PER_PHASE) refuse(`${path}.ghost_ids`)
  const ghostIds = record.ghost_ids.map((ghost, index) => text(ghost, `${path}.ghost_ids[${index}]`))
  if (new Set(ghostIds).size !== ghostIds.length) refuse(`${path}.ghost_ids`)
  const door = exact(record.door, `${path}.door`, ['status', 'proposal'])
  const status = oneOf(door.status, DOOR_STATUSES, `${path}.door.status`)
  const proposal = parseDoorProposal(door.proposal, `${path}.door.proposal`, phase)
  if (!doorConsistent(status, proposal)) refuse(`${path}.door`)
  return {
    phase,
    status: oneOf(record.status, PHASE_STATUSES, `${path}.status`),
    ghostIds,
    door: { status, proposal },
  }
}

function hasMarker(value: string): boolean {
  return REDACTION_MARKERS.some((marker) => value.includes(marker))
}

/** A JSON value that can be shown exactly: no floats, no control characters, no redaction marker. */
function displayable(value: unknown, depth = 0): value is JsonValue {
  if (depth > 8) return false
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isSafeInteger(value)
  if (typeof value === 'string') return !CONTROL.test(value) && !hasMarker(value)
  if (Array.isArray(value)) return value.every((item) => displayable(item, depth + 1))
  if (!isRecord(value)) return false
  return Object.entries(value).every(
    ([key, item]) => key !== '' && !CONTROL.test(key) && !hasMarker(key) && displayable(item, depth + 1),
  )
}

/**
 * Parses an Action_Descriptor for display. Anything short of the complete,
 * exactly displayable descriptor yields null: the proposal stays visible but
 * cannot be approved (Requirement 9.4).
 */
export function parseActionDescriptor(value: unknown): ActionDescriptor | null {
  try {
    const path = '$'
    const record = exact(value, path, [
      'schema_version',
      'mansion_id',
      'session_slot',
      'room',
      'kind',
      'working_directory',
      'arguments',
      'path_intents',
    ])
    if (record.schema_version !== 1) return null
    if (!isRecord(record.arguments) || !displayable(record.arguments)) return null
    if (JSON.stringify(record.arguments).length > MAX_ARGUMENT_BYTES) return null
    if (!Array.isArray(record.path_intents) || record.path_intents.length > MAX_PATH_INTENTS) return null
    const strings = [record.session_slot, record.room, record.working_directory]
    if (strings.some((item) => typeof item === 'string' && hasMarker(item))) return null
    const pathIntents = record.path_intents.map((item, index) => {
      const intent = exact(item, `${path}[${index}]`, ['path', 'access'])
      if (typeof intent.path === 'string' && hasMarker(intent.path)) refuse(path)
      return {
        path: projectPath(intent.path, path),
        access: oneOf(intent.access, PATH_ACCESS_KINDS, path),
      }
    })
    return {
      schemaVersion: 1,
      mansionId: mansionId(record.mansion_id, path),
      sessionSlot: text(record.session_slot, path),
      room: text(record.room, path),
      kind: oneOf(record.kind, ACTION_KINDS, path),
      workingDirectory: projectPath(record.working_directory, path, true),
      arguments: record.arguments as { readonly [key: string]: JsonValue },
      pathIntents,
    }
  } catch (error) {
    if (error instanceof Refused) return null
    throw error
  }
}

function parseRisky(value: unknown, path: string, mansion: string): RiskyProposal {
  const record = exact(value, path, [
    'proposal_id',
    'ghost_id',
    'session_slot',
    'room',
    'status',
    'action_digest',
    'descriptor',
    'created_sequence',
    'decision',
  ])
  const status = oneOf(record.status, RISKY_STATUSES, `${path}.status`)
  const decision = parseDecision(record.decision, `${path}.decision`)
  if (!decisionMatches(status, decision, RISKY_DECIDED, true)) refuse(`${path}.decision`)
  const sessionSlot = text(record.session_slot, `${path}.session_slot`)
  const room = record.room === null ? null : text(record.room, `${path}.room`)
  let descriptor = record.descriptor === null ? null : parseActionDescriptor(record.descriptor)
  // A descriptor about another Mansion, session or Room is not this proposal's descriptor.
  if (
    descriptor !== null &&
    (descriptor.mansionId !== mansion || descriptor.sessionSlot !== sessionSlot || descriptor.room !== room)
  ) {
    descriptor = null
  }
  return {
    proposalId: text(record.proposal_id, `${path}.proposal_id`),
    ghostId: text(record.ghost_id, `${path}.ghost_id`),
    sessionSlot,
    room,
    status,
    actionDigest: digest(record.action_digest, `${path}.action_digest`),
    descriptor,
    createdSequence: count(record.created_sequence, `${path}.created_sequence`, 1),
    decision,
  }
}

function parsePermission(value: unknown, path: string): PendingPermission {
  const record = exact(value, path, ['slot', 'mid', 'requested_sequence', 'tool_name', 'action_digest', 'proposal_id'])
  return {
    slot: text(record.slot, `${path}.slot`),
    mid: text(record.mid, `${path}.mid`),
    requestedSequence: count(record.requested_sequence, `${path}.requested_sequence`, 1),
    toolName: record.tool_name === null ? null : text(record.tool_name, `${path}.tool_name`),
    actionDigest: record.action_digest === null ? null : digest(record.action_digest, `${path}.action_digest`),
    proposalId: record.proposal_id === null ? null : text(record.proposal_id, `${path}.proposal_id`),
  }
}

function unique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) refuse(path)
}

/**
 * Validates one workflow projection. `expectedMansionId`, when given, must be
 * the Mansion the request named: a projection of another Mansion is refused.
 */
export function parseWorkflowProjection(value: unknown, expectedMansionId?: string): WorkflowParseResult {
  try {
    const record = exact(
      value,
      '$',
      ['schema_version', 'mansion_id', 'version', 'integrity', 'waiting_count', 'phases', 'risky_proposals', 'pending_permissions'],
      ['read_only'],
    )
    if (record.read_only !== undefined && typeof record.read_only !== 'boolean') refuse('$.read_only')
    if (record.schema_version !== WORKFLOW_SCHEMA_VERSION) refuse('$.schema_version')
    const mansion = mansionId(record.mansion_id, '$.mansion_id')
    if (expectedMansionId !== undefined && mansion !== expectedMansionId) refuse('$.mansion_id')
    const version = count(record.version, '$.version')

    if (!Array.isArray(record.phases) || record.phases.length !== PHASES.length) refuse('$.phases')
    const phases = PHASES.map((phase, index) => parsePhase((record.phases as unknown[])[index], `$.phases[${index}]`, phase))

    if (!Array.isArray(record.risky_proposals) || record.risky_proposals.length > MAX_RISKY_PROPOSALS) {
      refuse('$.risky_proposals')
    }
    const riskyProposals = record.risky_proposals.map((item, index) =>
      parseRisky(item, `$.risky_proposals[${index}]`, mansion),
    )
    unique(riskyProposals.map((proposal) => proposal.proposalId), '$.risky_proposals')

    if (!Array.isArray(record.pending_permissions) || record.pending_permissions.length > MAX_PENDING_PERMISSIONS) {
      refuse('$.pending_permissions')
    }
    const pendingPermissions = record.pending_permissions.map((item, index) =>
      parsePermission(item, `$.pending_permissions[${index}]`),
    )
    // The identity of a permission is (slot, mid); approval_id is never part of it.
    unique(pendingPermissions.map((permission) => JSON.stringify([permission.slot, permission.mid])), '$.pending_permissions')

    // No record can be newer than the version that claims to include it.
    const sequences = [
      ...riskyProposals.flatMap((proposal) => [proposal.createdSequence, proposal.decision?.sequence ?? 0]),
      ...phases.flatMap((phase) => [phase.door.proposal?.createdSequence ?? 0, phase.door.proposal?.decision?.sequence ?? 0]),
      ...pendingPermissions.map((permission) => permission.requestedSequence),
    ]
    if (sequences.some((sequence) => sequence > version)) refuse('$.version')

    return {
      ok: true,
      projection: {
        mansionId: mansion,
        version,
        integrity: oneOf(record.integrity, INTEGRITY_STATES, '$.integrity'),
        waitingCount: count(record.waiting_count, '$.waiting_count'),
        phases: phases as unknown as WorkflowProjection['phases'],
        riskyProposals,
        pendingPermissions,
        readOnly: record.read_only === true,
      },
    }
  } catch (error) {
    if (error instanceof Refused) return { ok: false, path: error.path }
    throw error
  }
}

/** The projection before anything happened: requirements ready, every Door sealed. */
export function initialWorkflowProjection(mansion: string): WorkflowProjection {
  const phase = (name: Phase): PhaseView => ({
    phase: name,
    status: name === 'requirements' ? 'ready' : 'not_started',
    ghostIds: [],
    door: { status: 'sealed', proposal: null },
  })
  return {
    mansionId: mansion,
    version: 0,
    integrity: 'valid',
    waitingCount: 0,
    phases: [phase('requirements'), phase('design'), phase('tasks'), phase('implementation')],
    riskyProposals: [],
    pendingPermissions: [],
    readOnly: false,
  }
}

function decisionToJson(decision: DecisionRef | null): JsonValue {
  return decision === null
    ? null
    : { outcome: decision.outcome, actor: decision.actor, event_id: decision.eventId, sequence: decision.sequence }
}

export function artifactRevisionToJson(revision: ArtifactRevision): { readonly [key: string]: JsonValue } {
  return { revision: revision.revision, sha256: revision.sha256, size_bytes: revision.sizeBytes }
}

export function actionDescriptorToJson(descriptor: ActionDescriptor): { readonly [key: string]: JsonValue } {
  return {
    schema_version: descriptor.schemaVersion,
    mansion_id: descriptor.mansionId,
    session_slot: descriptor.sessionSlot,
    room: descriptor.room,
    kind: descriptor.kind,
    working_directory: descriptor.workingDirectory,
    arguments: descriptor.arguments,
    path_intents: descriptor.pathIntents.map((intent) => ({ path: intent.path, access: intent.access })),
  }
}

/** The wire form `parseWorkflowProjection` accepts. Used by the replay stand-in and by tests. */
export function workflowProjectionToJson(projection: WorkflowProjection): { readonly [key: string]: JsonValue } {
  return {
    schema_version: WORKFLOW_SCHEMA_VERSION,
    mansion_id: projection.mansionId,
    version: projection.version,
    integrity: projection.integrity,
    waiting_count: projection.waitingCount,
    phases: projection.phases.map((phase) => ({
      phase: phase.phase,
      status: phase.status,
      ghost_ids: [...phase.ghostIds],
      door: {
        status: phase.door.status,
        proposal:
          phase.door.proposal === null
            ? null
            : {
                proposal_id: phase.door.proposal.proposalId,
                phase: phase.door.proposal.phase,
                document_path: phase.door.proposal.documentPath,
                artifact_revision: artifactRevisionToJson(phase.door.proposal.artifactRevision),
                status: phase.door.proposal.status,
                created_sequence: phase.door.proposal.createdSequence,
                decision: decisionToJson(phase.door.proposal.decision),
              },
      },
    })),
    risky_proposals: projection.riskyProposals.map((proposal) => ({
      proposal_id: proposal.proposalId,
      ghost_id: proposal.ghostId,
      session_slot: proposal.sessionSlot,
      room: proposal.room,
      status: proposal.status,
      action_digest: proposal.actionDigest,
      descriptor: proposal.descriptor === null ? null : actionDescriptorToJson(proposal.descriptor),
      created_sequence: proposal.createdSequence,
      decision: decisionToJson(proposal.decision),
    })),
    pending_permissions: projection.pendingPermissions.map((permission) => ({
      slot: permission.slot,
      mid: permission.mid,
      requested_sequence: permission.requestedSequence,
      tool_name: permission.toolName,
      action_digest: permission.actionDigest,
      proposal_id: permission.proposalId,
    })),
    ...(projection.readOnly ? { read_only: true } : {}),
  }
}
