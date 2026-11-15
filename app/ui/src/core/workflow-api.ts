// Pure shapes of the signed workflow routes (Spec 4 design "Signed workflow
// routes"; Requirements 8.1 to 8.7): paths, exact request bodies, and parsing
// of responses and failures. Every response is untrusted until parsed here.
// The browser sends decisions; it never appends a record itself.
// No SDK, React, network, or clock.

import { PHASE_NAMES, type DecisionVerb, type WorkflowCommand } from './house-view'
import { errorCodeOf, httpStatusOf } from './seance-api'
import type { EventId, JsonValue } from './seance-event'
import { artifactRevisionToJson, parseWorkflowProjection, type Phase, type WorkflowProjection } from './workflow-projection'

const MANSIONS_BASE = '/apps/haunted-house/api/mansions'

function mansionBase(mansionId: string): string {
  return `${MANSIONS_BASE}/${encodeURIComponent(mansionId)}`
}

/** `GET`: the current workflow and approval projection of one Mansion. */
export function workflowPath(mansionId: string): string {
  return `${mansionBase(mansionId)}/workflow`
}

/** `POST`: explicit Phase_Start_Command. */
export function phaseStartPath(mansionId: string, phase: Phase): string {
  return `${mansionBase(mansionId)}/phases/${phase}/start`
}

/** `POST`: exact Artifact_Revision approval or rejection. */
export function doorDecisionPath(mansionId: string, proposalId: string, decision: DecisionVerb): string {
  return `${mansionBase(mansionId)}/doors/${encodeURIComponent(proposalId)}/${decision}`
}

/** `POST`: exact Action_Digest approval or rejection. */
export function approvalDecisionPath(mansionId: string, proposalId: string, decision: DecisionVerb): string {
  return `${mansionBase(mansionId)}/approvals/${encodeURIComponent(proposalId)}/${decision}`
}

export const COMMAND_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/

export interface WorkflowRequest {
  readonly path: string
  readonly body: { readonly [key: string]: JsonValue }
}

/**
 * The one request a command becomes. Every body carries the command id (for
 * idempotent retries) and the Projection_Version the Operator was looking at.
 */
export function workflowRequest(mansionId: string, command: WorkflowCommand, commandId: string): WorkflowRequest {
  const common = { command_id: commandId, expected_version: command.expectedVersion }
  switch (command.kind) {
    case 'start_phase':
      return { path: phaseStartPath(mansionId, command.phase), body: common }
    case 'decide_door':
      return {
        path: doorDecisionPath(mansionId, command.proposalId, command.decision),
        body: {
          ...common,
          phase: command.phase,
          document_path: command.documentPath,
          artifact_revision: artifactRevisionToJson(command.artifactRevision),
        },
      }
    case 'decide_risky':
      return {
        path: approvalDecisionPath(mansionId, command.proposalId, command.decision),
        body: { ...common, action_digest: command.actionDigest },
      }
  }
}

export interface WorkflowAck {
  /** The acknowledged App_Event of this mutation. */
  readonly eventId: EventId
  readonly sequence: number
  readonly projection: WorkflowProjection
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parses a mutation response: `{event_id, sequence, version, workflow}`.
 * Null when anything is missing or inconsistent, in which case the caller
 * re-reads the projection instead of trusting the answer.
 */
export function parseWorkflowAck(body: unknown, mansionId: string): WorkflowAck | null {
  if (!isRecord(body)) return null
  const { event_id: eventId, sequence, version } = body
  if (typeof eventId !== 'string' || !/^e1:[0-9a-f]{64}$/.test(eventId)) return null
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1) return null
  const parsed = parseWorkflowProjection(body.workflow, mansionId)
  if (!parsed.ok) return null
  if (version !== parsed.projection.version || sequence > parsed.projection.version) return null
  return { eventId: eventId as EventId, sequence, projection: parsed.projection }
}

export type WorkflowFailureKind =
  /** 409: the projection moved on; the body carries the current one. */
  | 'conflict'
  /** 400: the backend refused the request shape. */
  | 'invalid'
  /** 404: the Mansion or proposal is gone. */
  | 'not_found'
  /** 423: canonical integrity is unavailable. */
  | 'integrity'
  /** 502 or 504: Crew did not do its part. */
  | 'crew'
  /** 405: the page is a recording. */
  | 'read_only'
  /** Anything else, including no answer at all. */
  | 'unavailable'

export interface WorkflowFailure {
  readonly kind: WorkflowFailureKind
  /** Plain words for the Operator. Never the server's own text. */
  readonly text: string
  /** The current projection, when the error body carried a valid one (always on a 409, also after a failed start). */
  readonly projection: WorkflowProjection | null
}

const FAILURE_TEXT: Readonly<Record<WorkflowFailureKind, string>> = {
  conflict: 'The house changed before your decision arrived, so nothing was recorded. Check what is shown now and decide again.',
  invalid: 'The house refused that request. Nothing was recorded.',
  not_found: 'That mansion or proposal no longer exists. Nothing was recorded.',
  integrity: 'The séance log failed its integrity check, so the house accepts no decisions. Nothing was recorded.',
  crew: 'Crew did not answer in time. Check the state shown before trying again.',
  read_only: 'This is a recording. Nothing was recorded.',
  unavailable: 'The house could not be reached. It is not known whether anything was recorded; the state is being read again.',
}

const MAX_CONFLICT_BODY_CHARACTERS = 512 * 1024

function conflictProjection(error: unknown, mansionId: string): WorkflowProjection | null {
  if (typeof error !== 'object' || error === null) return null
  const body = (error as { body?: unknown }).body
  if (typeof body !== 'string' || body.length > MAX_CONFLICT_BODY_CHARACTERS) return null
  try {
    const parsed: unknown = JSON.parse(body)
    if (!isRecord(parsed)) return null
    const projection = parseWorkflowProjection(parsed.workflow, mansionId)
    return projection.ok ? projection.projection : null
  } catch {
    return null
  }
}

/** Classifies a rejected workflow request by HTTP status. The stable error code only refines the kind. */
export function workflowFailure(error: unknown, mansionId: string): WorkflowFailure {
  const status = httpStatusOf(error)
  const current = conflictProjection(error, mansionId)
  const failure = (kind: WorkflowFailureKind): WorkflowFailure => ({ kind, text: FAILURE_TEXT[kind], projection: current })
  switch (status) {
    case 409:
      return failure('conflict')
    case 400:
    case 413:
    case 422:
      return failure('invalid')
    case 404:
      return failure('not_found')
    case 423:
      return failure('integrity')
    case 405:
      return failure('read_only')
    case 502:
    case 504:
      return failure('crew')
    default:
      return failure(errorCodeOf(error) === 'integrity_unavailable' ? 'integrity' : 'unavailable')
  }
}

/** What to say once a command was acknowledged. */
export function successText(command: WorkflowCommand): string {
  switch (command.kind) {
    case 'start_phase':
      return `${PHASE_NAMES[command.phase]} started.`
    case 'decide_door':
      return command.decision === 'approve'
        ? `${PHASE_NAMES[command.phase]} door approved. The next phase starts only when you start it.`
        : `${PHASE_NAMES[command.phase]} door rejected. A revision is required.`
    case 'decide_risky':
      return command.decision === 'approve'
        ? 'Action approved for one attempt.'
        : 'Action rejected. It will not run.'
  }
}
