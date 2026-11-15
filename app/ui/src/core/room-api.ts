// Pure shapes of the Room Ghosts routes (Spec 5 design "Backend API
// extensions"; Requirements 5.7, 6.7, 8.1, 12.1, 12.5): paths, exact request
// bodies, and what to say about an answer. These are the only mutations Room
// Ghosts adds. Phase starts and Door or risky decisions stay on the Spec 4
// routes in workflow-api.ts; there is no second approval path here.
// No SDK, React, network, or clock.

import type { RoomCommand } from './room-view'
import { errorCodeOf, httpStatusOf } from './seance-api'
import type { JsonValue } from './seance-event'

const API_BASE = '/apps/haunted-house/api'

function specBase(mansionId: string, specName: string): string {
  return `${API_BASE}/mansions/${encodeURIComponent(mansionId)}/specs/${encodeURIComponent(specName)}`
}

/** `GET`: documents, task plan, runs and review of one spec. */
export function roomGhostsPath(mansionId: string, specName: string): string {
  return `${specBase(mansionId, specName)}/room-ghosts`
}

/** `POST`: bounded revision feedback to the current phase session, before its Door is approved. */
export function feedbackPath(mansionId: string, specName: string): string {
  return `${specBase(mansionId, specName)}/feedback`
}

/** `POST`: select validated tasks and start scheduling, once the tasks Door is open. */
export function workshopStartPath(mansionId: string, specName: string): string {
  return `${specBase(mansionId, specName)}/workshop/start`
}

/** `POST`: ask Crew to stop the owned session of one run. */
export function runCancelPath(runId: string): string {
  return `${API_BASE}/room-ghosts/runs/${encodeURIComponent(runId)}/cancel`
}

/** `POST`: one explicit fresh attempt, under the attempt limit. */
export function runRetryPath(runId: string): string {
  return `${API_BASE}/room-ghosts/runs/${encodeURIComponent(runId)}/retry`
}

export interface RoomRequest {
  readonly path: string
  readonly body: { readonly [key: string]: JsonValue }
}

/**
 * The one request a command becomes. Every body carries the command id (for
 * idempotent retries by the transport) and the version the Operator was looking at.
 */
export function roomRequest(mansionId: string, specName: string, command: RoomCommand, commandId: string): RoomRequest {
  const common = { command_id: commandId, expected_version: command.expectedVersion }
  switch (command.kind) {
    case 'send_feedback':
      return { path: feedbackPath(mansionId, specName), body: { ...common, phase: command.phase, feedback: command.feedback } }
    case 'start_workshop':
      return { path: workshopStartPath(mansionId, specName), body: { ...common, task_ids: [...command.taskIds] } }
    case 'cancel_run':
      return { path: runCancelPath(command.runId), body: { ...common, mansion_id: mansionId } }
    case 'retry_run':
      return { path: runRetryPath(command.runId), body: { ...common, mansion_id: mansionId } }
  }
}

export type RoomFailureKind =
  /** 409: the room moved on, or the command no longer fits its state. */
  | 'conflict'
  /** 400, 413, 422: the backend refused the request shape. */
  | 'invalid'
  /** 404: the Mansion, spec or run is gone. */
  | 'not_found'
  /** 423: canonical integrity is unavailable. */
  | 'integrity'
  /** 503: a prerequisite contract is unavailable (`contract_unavailable`). */
  | 'contract'
  /** 502 or 504: Crew did not do its part. */
  | 'crew'
  /** 405: the page is a recording. */
  | 'read_only'
  /** Anything else, including no answer at all. */
  | 'unavailable'

export interface RoomFailure {
  readonly kind: RoomFailureKind
  /** Plain words for the Operator. Never the server's own text. */
  readonly text: string
}

const FAILURE_TEXT: Readonly<Record<RoomFailureKind, string>> = {
  conflict: 'The room changed before your request arrived, so nothing was done. Check what is shown now and try again.',
  invalid: 'The house refused that request. Nothing was done.',
  not_found: 'That run or spec no longer exists. Nothing was done.',
  integrity: 'The séance log failed its integrity check, so the house accepts no requests. Nothing was done.',
  contract: 'The house cannot do this right now: a contract it depends on is unavailable. Nothing was done.',
  crew: 'Crew did not answer in time. Check the state shown before trying again.',
  read_only: 'This is a recording. Nothing was done.',
  unavailable: 'The house could not be reached. It is not known whether anything was done; the state is being read again.',
}

/** Classifies a rejected Room Ghosts request by HTTP status. The stable error code only refines the kind. */
export function roomFailure(error: unknown): RoomFailure {
  const failure = (kind: RoomFailureKind): RoomFailure => ({ kind, text: FAILURE_TEXT[kind] })
  switch (httpStatusOf(error)) {
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
    case 503:
      return failure('contract')
    case 405:
      return failure('read_only')
    case 502:
    case 504:
      return failure('crew')
    default: {
      const code = errorCodeOf(error)
      return failure(code === 'contract_unavailable' ? 'contract' : code === 'integrity_unavailable' ? 'integrity' : 'unavailable')
    }
  }
}

/** What to say once a command was accepted. Accepted is not finished: the room shows what follows. */
export function roomSuccessText(command: RoomCommand): string {
  switch (command.kind) {
    case 'send_feedback':
      return 'Revision request sent to the same session. The door stays sealed until you approve a new revision.'
    case 'start_workshop':
      return command.taskIds.length === 1
        ? '1 task selected. A Tinker starts when a seat and its files are free.'
        : `${command.taskIds.length} tasks selected. Tinkers start as seats and files come free, at most three at a time.`
    case 'cancel_run':
      return 'Cancellation requested. The run stops when Crew confirms it.'
    case 'retry_run':
      return 'Retry accepted. A fresh session takes the next attempt.'
  }
}
