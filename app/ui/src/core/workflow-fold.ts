// Replay_Projection (Spec 4 task 15.1; Requirements 10.4 to 10.6): the
// workflow and approval projection folded from Spec 2 canonical records.
//
// Only the replay stand-in uses this. In live mode the projection always comes
// from the backend; this fold exists so a recording can show the same house
// with no backend. It mirrors the backend transition functions
// (`core/workflow.py` and `core/approvals.py`) rule for rule, and a parity test
// compares both on the canonical replay fixture.
//
// Input is canonical App_Events only. This file reads `domain_event_recorded`
// payloads of the `doors_and_guardrails` domain and the mid of canonical
// approval events. It parses no log, verifies no hash, orders nothing but by
// the Sequence Spec 2 assigned, and interprets no Crew envelope.
// No SDK, React, network, or clock.

import { HOUSE_OPERATOR_GHOST_ID } from './ghost-status'
import { canonicalJson, sha256Hex, type AppEvent, type EventId, type JsonValue } from './seance-event'
import {
  PATH_ACCESS_KINDS,
  PHASES,
  parseActionDescriptor,
  type ActionDescriptor,
  type ArtifactRevision,
  type DecisionActor,
  type DecisionRef,
  type DoorProposal,
  type DoorStatus,
  type Integrity,
  type PendingPermission,
  type Phase,
  type PhaseStatus,
  type RiskyProposal,
  type RiskyStatus,
  type WorkflowProjection,
} from './workflow-projection'

export const GUARDRAIL_DOMAIN = 'doors_and_guardrails'
const GUARDRAIL_SOURCE_TYPE = 'guardrail'
/** The scope of house or operator facts that belong to no ghost session. */
export const OPERATOR_GHOST_ID = HOUSE_OPERATOR_GHOST_ID

type Data = { readonly [key: string]: JsonValue }
type Check = (value: JsonValue | undefined) => boolean

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/
const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/
const DIGEST = /^[0-9a-f]{64}$/
const SPEC_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_REVISION = 2 ** 31 - 1
const MAX_SIZE_BYTES = Number.MAX_SAFE_INTEGER
const MAX_PATH_BYTES = 1024
const MAX_PATH_COMPONENTS = 32
const MAX_SEGMENT_BYTES = 255
const UNDISPLAYABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u

const utf8Length = (value: string): number => new TextEncoder().encode(value).length

/** A clean relative Project_Path: already normalized, or refused. Never repaired. */
export function isCleanRelativePath(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw === '' || utf8Length(raw) > MAX_PATH_BYTES) return false
  if (raw.includes('\\') || UNDISPLAYABLE.test(raw) || raw.startsWith('/') || raw.normalize('NFC') !== raw) return false
  const parts = raw.split('/')
  if (parts.length > MAX_PATH_COMPONENTS) return false
  // A percent escape could spell a traversal once decoded; no recorded path needs one.
  return parts.every((part) => part !== '' && part !== '.' && part !== '..' && utf8Length(part) <= MAX_SEGMENT_BYTES && !/%[0-9A-Fa-f]{2}/.test(part))
}

const identifier: Check = (value) => typeof value === 'string' && IDENTIFIER.test(value)
const label: Check = (value) => typeof value === 'string' && LABEL.test(value)
const code: Check = (value) => typeof value === 'string' && SAFE_CODE.test(value)
const phase: Check = (value) => typeof value === 'string' && (PHASES as readonly string[]).includes(value)
const digest: Check = (value) => typeof value === 'string' && DIGEST.test(value)
const cleanPath: Check = (value) => isCleanRelativePath(value)
const intBetween =
  (minimum: number, maximum: number): Check =>
  (value) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum
const oneOf =
  (...allowed: readonly string[]): Check =>
  (value) =>
    typeof value === 'string' && allowed.includes(value)
const optional =
  (inner: Check): Check =>
  (value) =>
    value === null || inner(value)
const object: Check = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

const revision = intBetween(1, MAX_REVISION)
const size = intBetween(0, MAX_SIZE_BYTES)
const actor = oneOf('operator', 'crew')

const ARTIFACT = { document_path: cleanPath, revision, sha256: digest, size_bytes: size }
const DOOR_DECISION = { phase, proposal_id: identifier, ...ARTIFACT, actor, command_id: identifier }
const RISKY_DECISION = {
  proposal_id: identifier,
  action_digest: digest,
  actor,
  command_id: identifier,
  crew_slot: optional(label),
  crew_mid: optional(label),
}
const RISKY_OUTCOME = {
  proposal_id: identifier,
  action_digest: digest,
  claim_id: identifier,
  code,
  exit_code: optional(intBetween(-255, 255)),
  output_bytes: size,
}

/** kind -> [closed data schema, the data field that is the entity id]. Same table as the backend. */
const SCHEMAS = {
  phase_start_reserved: [{ phase, reservation_id: identifier, command_id: identifier }, 'phase'],
  phase_started: [{ phase, reservation_id: identifier, session_slot: label }, 'phase'],
  phase_start_failed: [{ phase, reservation_id: identifier, code }, 'phase'],
  phase_start_denied: [{ phase, command_id: identifier, code }, 'phase'],
  phase_output_ready: [{ phase, proposal_id: identifier, ...ARTIFACT }, 'proposal_id'],
  revision_started: [{ phase, command_id: identifier, session_slot: label }, 'phase'],
  door_superseded: [{ phase, proposal_id: identifier, revision, sha256: digest, code }, 'proposal_id'],
  door_approved: [DOOR_DECISION, 'proposal_id'],
  door_rejected: [DOOR_DECISION, 'proposal_id'],
  risky_action_proposed: [{ proposal_id: identifier, action_digest: digest, descriptor: object }, 'proposal_id'],
  risky_action_approved: [RISKY_DECISION, 'proposal_id'],
  risky_action_rejected: [RISKY_DECISION, 'proposal_id'],
  risky_action_superseded: [{ proposal_id: identifier, action_digest: digest, code }, 'proposal_id'],
  risky_action_consumed: [{ proposal_id: identifier, action_digest: digest, claim_id: identifier, session_slot: label }, 'proposal_id'],
  risky_action_denied: [
    { proposal_id: identifier, action_digest: optional(digest), denial_id: identifier, session_slot: label, code },
    'proposal_id',
  ],
  risky_action_succeeded: [RISKY_OUTCOME, 'proposal_id'],
  risky_action_failed: [RISKY_OUTCOME, 'proposal_id'],
  approval_resolution_ignored: [
    { resolution_id: identifier, session_slot: label, mid: label, outcome: oneOf('approved', 'rejected'), code },
    'resolution_id',
  ],
  path_denied: [
    { denial_id: identifier, session_slot: label, room: code, access: oneOf(...PATH_ACCESS_KINDS), code, path: optional(cleanPath) },
    'denial_id',
  ],
  spec_write_prepared: [
    {
      write_id: identifier,
      phase,
      document_path: cleanPath,
      base_revision: intBetween(0, MAX_REVISION),
      base_sha256: optional(digest),
      revision,
      sha256: digest,
      size_bytes: size,
    },
    'write_id',
  ],
  spec_document_written: [{ write_id: identifier, phase, ...ARTIFACT }, 'write_id'],
  spec_write_recovered: [{ write_id: identifier, phase, document_path: cleanPath, outcome: oneOf('completed', 'not_applied') }, 'write_id'],
  spec_write_uncertain: [{ write_id: identifier, phase, document_path: cleanPath, code }, 'write_id'],
  // Design decision 2026-11-16: the house approved a non-risky room-tool prompt.
  room_tool_answered: [
    {
      answer_id: identifier,
      session_slot: label,
      mid: label,
      tool: oneOf('list_room_files', 'read_room_file', 'write_spec_document', 'write_room_file', 'submit_phase_output'),
      outcome: oneOf('approved'),
      actor: oneOf('house'),
      reason: oneOf('non_risky_room_tool'),
    },
    'answer_id',
  ],
} as const satisfies Record<string, readonly [Record<string, Check>, string]>

export type GuardrailKind = keyof typeof SCHEMAS
export const GUARDRAIL_KINDS = Object.keys(SCHEMAS) as GuardrailKind[]

export interface DomainRecord {
  readonly kind: GuardrailKind
  readonly data: Data
  readonly eventId: EventId
  readonly sequence: number
  readonly ghostId: string
  readonly sessionSlot: string
  readonly mansionId: string
}

export interface FoldDiagnostic {
  readonly sequence: number
  readonly eventId: EventId
  /** The record kind, or `invalid_payload` when the payload itself was refused. */
  readonly kind: string
  /** A fixed code. Never a value from the record. */
  readonly code: string
}

function isData(value: JsonValue | undefined): value is Data {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads one canonical record. Null when it is not a Spec 4 fact; a code when
 * it claims to be one and is not valid; the validated record otherwise.
 */
export function readDomainRecord(event: AppEvent): DomainRecord | string | null {
  if (event.event_type !== 'domain_event_recorded') return null
  const payload = event.payload
  if (!isData(payload) || payload.domain !== GUARDRAIL_DOMAIN) return null
  if (event.source.origin !== 'house' || event.source.source_type !== GUARDRAIL_SOURCE_TYPE) return 'untrusted_source'
  const keys = Object.keys(payload)
  if (keys.length !== 4 || !['domain', 'kind', 'entity_id', 'data'].every((key) => keys.includes(key))) return 'invalid_shape'
  const kind = payload.kind
  if (typeof kind !== 'string' || !Object.hasOwn(SCHEMAS, kind)) return 'unsupported_value'
  const [schema, entityField] = SCHEMAS[kind as GuardrailKind] as readonly [Record<string, Check>, string]
  const data = payload.data
  if (!isData(data)) return 'invalid_type'
  const fields = Object.keys(data)
  if (!fields.every((field) => Object.hasOwn(schema, field))) return 'unknown_field'
  if (fields.length !== Object.keys(schema).length) return 'missing_field'
  for (const [field, check] of Object.entries(schema)) {
    if (!check(data[field])) return 'invalid_value'
  }
  if (payload.entity_id !== data[entityField]) return 'mismatch'
  return {
    kind: kind as GuardrailKind,
    data,
    eventId: event.event_id,
    sequence: event.sequence,
    ghostId: event.scope.ghost_id,
    sessionSlot: event.scope.session_slot,
    mansionId: event.scope.mansion_id,
  }
}

// ---------------------------------------------------------------------------
// Workflow transition function (mirrors `_apply` in core/workflow.py).

interface PhaseState {
  status: PhaseStatus
  door: DoorStatus
  proposal: DoorProposal | null
  reservationId: string | null
  sessionSlot: string | null
  lastRevision: number
}

interface PendingWrite {
  readonly phase: Phase
  readonly documentPath: string
  readonly artifact: ArtifactRevision
}

interface WorkflowState {
  readonly phases: Record<Phase, PhaseState>
  readonly documents: Map<string, ArtifactRevision>
  readonly pendingWrites: Map<string, PendingWrite>
  readonly proposalIds: Set<string>
  readonly commandIds: Set<string>
}

const WORKFLOW_KINDS: ReadonlySet<GuardrailKind> = new Set<GuardrailKind>([
  'phase_start_reserved',
  'phase_started',
  'phase_start_failed',
  'phase_start_denied',
  'phase_output_ready',
  'revision_started',
  'door_superseded',
  'door_approved',
  'door_rejected',
  'spec_write_prepared',
  'spec_document_written',
  'spec_write_recovered',
  'spec_write_uncertain',
])

/** `phase` of a Spec_Document path (`.kiro/specs/<name>/<phase>.md`), or null for any other path. */
export function specDocumentPhase(documentPath: string): Phase | null {
  if (!isCleanRelativePath(documentPath)) return null
  const parts = documentPath.split('/')
  if (parts.length !== 4 || parts[0] !== '.kiro' || parts[1] !== 'specs') return null
  if (parts[2].length > 64 || !SPEC_NAME.test(parts[2])) return null
  return PHASES.slice(0, 3).find((name) => parts[3] === `${name}.md`) ?? null
}

function artifactOf(data: Data): ArtifactRevision {
  return { revision: data.revision as number, sha256: data.sha256 as string, sizeBytes: data.size_bytes as number }
}

function sameArtifact(left: ArtifactRevision, right: ArtifactRevision): boolean {
  return left.revision === right.revision && left.sha256 === right.sha256 && left.sizeBytes === right.sizeBytes
}

function pathHasPendingWrite(state: WorkflowState, documentPath: string): boolean {
  for (const write of state.pendingWrites.values()) if (write.documentPath === documentPath) return true
  return false
}

function decisionRef(record: DomainRecord, outcome: DecisionRef['outcome']): DecisionRef {
  return { outcome, actor: record.data.actor as DecisionActor, eventId: record.eventId, sequence: record.sequence }
}

/** Applies one record in place, or returns a diagnostic code and changes nothing. */
function applyWorkflow(state: WorkflowState, record: DomainRecord): string | null {
  const { kind, data } = record
  if (!WORKFLOW_KINDS.has(kind)) return null
  const name = data.phase as Phase
  const view = state.phases[name]

  if (kind === 'phase_start_denied') return null

  if (kind === 'phase_start_reserved') {
    const commandId = data.command_id as string
    if (state.commandIds.has(commandId)) return 'duplicate_command'
    if (!PHASES.slice(0, PHASES.indexOf(name)).every((earlier) => state.phases[earlier].door === 'open')) {
      return 'predecessor_door_sealed'
    }
    if (view.status !== 'ready' && view.status !== 'failed' && view.status !== 'revision_required') return 'invalid_state'
    state.commandIds.add(commandId)
    view.status = 'starting'
    view.reservationId = data.reservation_id as string
    return null
  }

  if (kind === 'phase_started' || kind === 'phase_start_failed') {
    if (view.status !== 'starting') return 'invalid_state'
    if (data.reservation_id !== view.reservationId) return 'reservation_mismatch'
    if (kind === 'phase_started') {
      view.status = 'working'
      view.sessionSlot = data.session_slot as string
    } else {
      view.status = 'failed'
    }
    return null
  }

  if (kind === 'revision_started') {
    const commandId = data.command_id as string
    if (state.commandIds.has(commandId)) return 'duplicate_command'
    if (view.status !== 'revision_required') return 'invalid_state'
    state.commandIds.add(commandId)
    view.status = 'working'
    view.sessionSlot = data.session_slot as string
    return null
  }

  if (kind === 'phase_output_ready') {
    const proposalId = data.proposal_id as string
    const documentPath = data.document_path as string
    const artifact = artifactOf(data)
    if (view.status !== 'working') return 'invalid_state'
    if (state.proposalIds.has(proposalId)) return 'duplicate_proposal'
    const documentPhase = specDocumentPhase(documentPath)
    // The implementation result is not a Spec_Document; every other phase writes its own.
    if (name === 'implementation' ? documentPhase !== null : documentPhase !== name) return 'document_mismatch'
    if (artifact.revision <= view.lastRevision) return 'stale_revision'
    if (pathHasPendingWrite(state, documentPath)) return 'write_pending'
    const known = state.documents.get(documentPath)
    if (known !== undefined && !sameArtifact(known, artifact)) return 'artifact_mismatch'
    state.proposalIds.add(proposalId)
    view.status = 'waiting'
    view.door = 'waiting'
    view.lastRevision = artifact.revision
    view.proposal = {
      proposalId,
      phase: name,
      documentPath,
      artifactRevision: artifact,
      status: 'pending',
      createdSequence: record.sequence,
      decision: null,
    }
    return null
  }

  if (kind === 'door_superseded' || kind === 'door_approved' || kind === 'door_rejected') {
    const proposal = view.proposal
    if (view.status !== 'waiting' || proposal === null || proposal.status !== 'pending') return 'no_pending_proposal'
    if (data.proposal_id !== proposal.proposalId) return 'stale_proposal'
    const current = proposal.artifactRevision
    if (data.revision !== current.revision || data.sha256 !== current.sha256) return 'stale_revision'
    if (kind === 'door_superseded') {
      view.status = 'working'
      view.door = 'sealed'
      view.proposal = { ...proposal, status: 'superseded' }
      return null
    }
    const commandId = data.command_id as string
    if (state.commandIds.has(commandId)) return 'duplicate_command'
    if (data.document_path !== proposal.documentPath || data.size_bytes !== current.sizeBytes) return 'stale_revision'
    const known = state.documents.get(proposal.documentPath)
    if ((known !== undefined && !sameArtifact(known, current)) || pathHasPendingWrite(state, proposal.documentPath)) {
      // The document changed after the proposal: it must be superseded, not decided.
      return 'artifact_changed'
    }
    state.commandIds.add(commandId)
    if (kind === 'door_approved') {
      view.status = 'approved'
      view.door = 'open'
      view.proposal = { ...proposal, status: 'approved', decision: decisionRef(record, 'approved') }
      // Approval makes only the immediate successor ready. Nothing starts it.
      const following = PHASES[PHASES.indexOf(name) + 1]
      if (following !== undefined && state.phases[following].status === 'not_started') state.phases[following].status = 'ready'
    } else {
      view.status = 'revision_required'
      view.door = 'rejected'
      view.proposal = { ...proposal, status: 'rejected', decision: decisionRef(record, 'rejected') }
    }
    return null
  }

  // Spec_Document write evidence.
  const writeId = data.write_id as string
  const documentPath = data.document_path as string
  if (kind === 'spec_write_prepared') {
    if (specDocumentPhase(documentPath) !== name) return 'document_mismatch'
    if (view.status !== 'working' && view.status !== 'waiting') return 'invalid_state'
    if (state.pendingWrites.has(writeId) || pathHasPendingWrite(state, documentPath)) return 'write_pending'
    const known = state.documents.get(documentPath)
    const baseRevision = known?.revision ?? 0
    const baseSha = known?.sha256 ?? null
    if (data.base_revision !== baseRevision || data.base_sha256 !== baseSha) return 'stale_revision'
    if (data.revision !== baseRevision + 1) return 'stale_revision'
    state.pendingWrites.set(writeId, { phase: name, documentPath, artifact: artifactOf(data) })
    return null
  }

  const pending = state.pendingWrites.get(writeId)
  if (pending === undefined) return 'write_missing'
  if (pending.phase !== name || pending.documentPath !== documentPath) return 'write_mismatch'
  if (kind === 'spec_document_written') {
    if (!sameArtifact(artifactOf(data), pending.artifact)) return 'write_mismatch'
    state.pendingWrites.delete(writeId)
    state.documents.set(documentPath, pending.artifact)
    return null
  }
  if (kind === 'spec_write_recovered') {
    state.pendingWrites.delete(writeId)
    if (data.outcome === 'completed') state.documents.set(documentPath, pending.artifact)
    return null
  }
  // spec_write_uncertain: the write keeps blocking its path until recovery settles it.
  return null
}

// ---------------------------------------------------------------------------
// Approval ledger (mirrors `_apply` in core/approvals.py).

interface LedgerProposal {
  proposalId: string
  ghostId: string
  sessionSlot: string
  actionDigest: string
  descriptor: ActionDescriptor | null
  room: string | null
  status: RiskyStatus
  createdSequence: number
  decision: DecisionRef | null
  claimId: string | null
}

interface LedgerState {
  readonly proposals: Map<string, LedgerProposal>
  readonly commandIds: Set<string>
}

const LEDGER_KINDS: ReadonlySet<GuardrailKind> = new Set<GuardrailKind>([
  'risky_action_approved',
  'risky_action_rejected',
  'risky_action_superseded',
  'risky_action_consumed',
  'risky_action_denied',
  'risky_action_succeeded',
  'risky_action_failed',
])

/** Lowercase hex SHA-256 of the canonical JSON of a recorded descriptor. */
export function recordedActionDigest(descriptor: JsonValue): string | null {
  try {
    return sha256Hex(canonicalJson(descriptor))
  } catch {
    return null
  }
}

/**
 * The descriptor to show, or null: it must parse completely, hash to the
 * recorded digest, and belong to the Mansion and session that proposed it.
 */
function recordedDescriptor(record: DomainRecord): ActionDescriptor | null {
  const parsed = parseActionDescriptor(record.data.descriptor)
  if (parsed === null) return null
  if (recordedActionDigest(record.data.descriptor) !== record.data.action_digest) return null
  if (parsed.mansionId !== record.mansionId || parsed.sessionSlot !== record.sessionSlot) return null
  return parsed
}

function applyLedger(state: LedgerState, record: DomainRecord): string | null {
  const { kind, data } = record
  if (kind === 'risky_action_proposed') {
    const proposalId = data.proposal_id as string
    if (state.proposals.has(proposalId)) return 'duplicate_proposal'
    const descriptor = recordedDescriptor(record)
    state.proposals.set(proposalId, {
      proposalId,
      ghostId: record.ghostId,
      sessionSlot: record.sessionSlot,
      actionDigest: data.action_digest as string,
      descriptor,
      room: descriptor?.room ?? null,
      status: 'pending',
      createdSequence: record.sequence,
      decision: null,
      claimId: null,
    })
    return null
  }
  if (!LEDGER_KINDS.has(kind)) return null
  // A denied attempt is evidence only: it changes no authority.
  if (kind === 'risky_action_denied') return null
  const proposal = state.proposals.get(data.proposal_id as string)
  if (proposal === undefined) return 'proposal_missing'
  if (data.action_digest !== proposal.actionDigest) return 'digest_mismatch'

  if (kind === 'risky_action_approved' || kind === 'risky_action_rejected') {
    const approved = kind === 'risky_action_approved'
    const commandId = data.command_id as string
    if (proposal.status !== 'pending') return 'already_decided'
    if (state.commandIds.has(commandId)) return 'duplicate_command'
    if (approved && proposal.descriptor === null) return 'proposal_blocked'
    state.commandIds.add(commandId)
    proposal.status = approved ? 'approved' : 'rejected'
    proposal.decision = decisionRef(record, approved ? 'approved' : 'rejected')
    return null
  }
  if (kind === 'risky_action_superseded') {
    if (proposal.status !== 'pending' && proposal.status !== 'approved') return 'not_supersedable'
    proposal.status = 'superseded'
    return null
  }
  if (kind === 'risky_action_consumed') {
    if (proposal.status !== 'approved') return 'not_approved'
    if (proposal.descriptor === null || data.session_slot !== proposal.sessionSlot) return 'identity_mismatch'
    if (record.sessionSlot !== proposal.sessionSlot) return 'identity_mismatch'
    proposal.status = 'consumed'
    proposal.claimId = data.claim_id as string
    return null
  }
  // Outcome: only the claim that consumed the approval may settle it.
  if (proposal.status !== 'consumed') return 'not_consumed'
  if (data.claim_id !== proposal.claimId) return 'claim_mismatch'
  proposal.status = kind === 'risky_action_succeeded' ? 'succeeded' : 'failed'
  return null
}

// ---------------------------------------------------------------------------
// The fold.

export interface WorkflowFoldOptions {
  readonly mansionId: string
  /** Integrity as Spec 2 reported it for these records. The fold verifies nothing itself. */
  readonly integrity?: Integrity
  /** Marks the projection as folded from a recording. */
  readonly readOnly?: boolean
}

export interface WorkflowFold {
  readonly projection: WorkflowProjection
  /** Records that claimed to be Spec 4 facts and were not valid, or not valid transitions. */
  readonly diagnostics: readonly FoldDiagnostic[]
}

/**
 * Folds canonical records of one Mansion in Sequence order. Records of other
 * domains change no workflow state and still advance the version. An invalid
 * Spec 4 record yields a diagnostic and leaves the preceding state as it was.
 */
export function foldWorkflow(events: Iterable<AppEvent>, options: WorkflowFoldOptions): WorkflowFold {
  const ordered = Array.from(events)
    .filter((event) => event.scope.mansion_id === options.mansionId)
    .sort((left, right) => left.sequence - right.sequence || (left.event_id < right.event_id ? -1 : left.event_id > right.event_id ? 1 : 0))

  const phases = Object.fromEntries(
    PHASES.map((name, index): [Phase, PhaseState] => [
      name,
      { status: index === 0 ? 'ready' : 'not_started', door: 'sealed', proposal: null, reservationId: null, sessionSlot: null, lastRevision: 0 },
    ]),
  ) as Record<Phase, PhaseState>
  const workflow: WorkflowState = { phases, documents: new Map(), pendingWrites: new Map(), proposalIds: new Set(), commandIds: new Set() }
  const ledger: LedgerState = { proposals: new Map(), commandIds: new Set() }
  const permissions = new Map<string, PendingPermission>()
  /** The ghost of each session slot, from the scope of the first ghost record seen in it. */
  const slotGhosts = new Map<string, string>()
  const diagnostics: FoldDiagnostic[] = []
  let version = 0

  for (const event of ordered) {
    version = Math.max(version, event.sequence)
    if (event.scope.ghost_id !== OPERATOR_GHOST_ID && !slotGhosts.has(event.scope.session_slot)) {
      slotGhosts.set(event.scope.session_slot, event.scope.ghost_id)
    }

    // Crew permission prompts, as Spec 2 recorded them: keyed by (slot, mid).
    const payload = event.payload
    const mid = isData(payload) ? payload.mid : undefined
    if (typeof mid === 'string' && event.source.origin === 'crew') {
      const key = JSON.stringify([event.scope.session_slot, mid])
      if (event.event_type === 'approval_requested' && !permissions.has(key)) {
        permissions.set(key, {
          slot: event.scope.session_slot,
          mid,
          requestedSequence: event.sequence,
          toolName: null,
          actionDigest: null,
          proposalId: null,
        })
      } else if (event.event_type === 'approval_decided') {
        permissions.delete(key)
      }
    }

    const record = readDomainRecord(event)
    if (record === null) continue
    if (typeof record === 'string') {
      diagnostics.push({ sequence: event.sequence, eventId: event.event_id, kind: 'invalid_payload', code: record })
      continue
    }
    for (const failure of [applyWorkflow(workflow, record), applyLedger(ledger, record)]) {
      if (failure !== null) diagnostics.push({ sequence: record.sequence, eventId: record.eventId, kind: record.kind, code: failure })
    }
  }

  const riskyProposals: RiskyProposal[] = Array.from(ledger.proposals.values(), (proposal) => ({
    proposalId: proposal.proposalId,
    ghostId: proposal.ghostId,
    sessionSlot: proposal.sessionSlot,
    room: proposal.room,
    status: proposal.status,
    actionDigest: proposal.actionDigest,
    descriptor: proposal.descriptor,
    createdSequence: proposal.createdSequence,
    decision: proposal.decision,
  }))
  const views = PHASES.map((name) => {
    const state = phases[name]
    const ghost = state.sessionSlot === null ? undefined : slotGhosts.get(state.sessionSlot)
    return {
      phase: name,
      status: state.status,
      ghostIds: ghost === undefined ? [] : [ghost],
      door: { status: state.door, proposal: state.proposal },
    }
  })
  const pendingPermissions = Array.from(permissions.values())

  return {
    projection: {
      mansionId: options.mansionId,
      version,
      integrity: options.integrity ?? 'valid',
      waitingCount:
        views.filter((view) => view.door.proposal?.status === 'pending').length +
        riskyProposals.filter((proposal) => proposal.status === 'pending').length +
        pendingPermissions.length,
      phases: views as unknown as WorkflowProjection['phases'],
      riskyProposals,
      pendingPermissions,
      readOnly: options.readOnly === true,
    },
    diagnostics,
  }
}
