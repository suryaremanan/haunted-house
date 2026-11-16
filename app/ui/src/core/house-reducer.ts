// UI state of the house and the one gate every command passes (Spec 4,
// Requirements 4.8, 9.7, 9.9). The reducer holds the latest backend projection
// as received: no action can change a proposal's status. Viewing, timers and
// ghost activity change nothing at all. A command leaves the page only through
// `authorizeCommand`, and only for an explicit press. Which room is focused or
// open is not workflow state: it lives in the Mansion Shell (Spec 6), and the
// arrow map is `house-registry.ts`.
// No SDK, React, network, or clock.

import type { Authority, ProjectionStatus, WorkflowCommand } from './house-view'
import type { WorkflowProjection } from './workflow-projection'

export interface HouseUiState {
  /** The newest projection the backend sent, exactly as parsed. */
  readonly projection: WorkflowProjection | null
  readonly projectionStatus: ProjectionStatus
  /** `commandTarget` of the command on its way, or null. One command at a time. */
  readonly inFlight: string | null
  /** The result of the last command, in plain words. */
  readonly notice: string | null
}

export const INITIAL_HOUSE_STATE: HouseUiState = {
  projection: null,
  projectionStatus: 'loading',
  inFlight: null,
  notice: null,
}

export type HouseAction =
  | { readonly type: 'projection_received'; readonly projection: WorkflowProjection }
  | { readonly type: 'projection_refused' }
  | { readonly type: 'projection_unavailable' }
  | { readonly type: 'command_sent'; readonly target: string }
  | { readonly type: 'command_settled'; readonly notice: string | null }
  | { readonly type: 'notice_dismissed' }
  /** Looking at a proposal. It is not a decision and changes nothing. */
  | { readonly type: 'proposal_viewed'; readonly id: string }
  /** Canonical ghost activity arrived (a turn ended, a run finished). Not a decision. */
  | { readonly type: 'ghost_activity' }
  /** Time passed. Not a decision. */
  | { readonly type: 'timer_elapsed' }

export function reduceHouse(state: HouseUiState, action: HouseAction): HouseUiState {
  switch (action.type) {
    case 'projection_received': {
      const current = state.projection
      // A late answer to an older read never replaces newer state.
      if (current !== null && current.mansionId === action.projection.mansionId && action.projection.version < current.version) {
        return state.projectionStatus === 'ready' ? state : { ...state, projectionStatus: 'ready' }
      }
      return { ...state, projection: action.projection, projectionStatus: 'ready' }
    }
    case 'projection_refused':
      // What was on screen stays for reading; authority goes (Requirement 9.4).
      return state.projectionStatus === 'malformed' ? state : { ...state, projectionStatus: 'malformed' }
    case 'projection_unavailable':
      return state.projectionStatus === 'unavailable' ? state : { ...state, projectionStatus: 'unavailable' }
    case 'command_sent':
      return { ...state, inFlight: action.target, notice: null }
    case 'command_settled':
      return { ...state, inFlight: null, notice: action.notice }
    case 'notice_dismissed':
      return state.notice === null ? state : { ...state, notice: null }
    case 'proposal_viewed':
    case 'ghost_activity':
    case 'timer_elapsed':
      return state
    default:
      // An action this page does not know is ignored whole.
      return state
  }
}

function sameRevision(left: { revision: number; sha256: string; sizeBytes: number }, right: typeof left): boolean {
  return left.revision === right.revision && left.sha256 === right.sha256 && left.sizeBytes === right.sizeBytes
}

/**
 * The last check before a command is sent. It passes a command only when
 * decisions are allowed, nothing else is in flight, and the command names
 * exactly what the current projection shows: the same Projection_Version and,
 * for a decision, the same pending proposal with the same revision or digest.
 * The backend repeats every one of these checks; this one keeps a stale screen
 * from asking.
 */
export function authorizeCommand(state: HouseUiState, authority: Authority, command: WorkflowCommand): WorkflowCommand | null {
  const projection = state.projection
  if (!authority.canDecide || state.inFlight !== null || projection === null || state.projectionStatus !== 'ready') return null
  if (command.expectedVersion !== projection.version) return null
  switch (command.kind) {
    case 'start_phase': {
      const phase = projection.phases.find((view) => view.phase === command.phase)
      const startable = phase?.status === 'ready' || phase?.status === 'failed' || phase?.status === 'revision_required'
      return startable ? command : null
    }
    case 'decide_door': {
      const phase = projection.phases.find((view) => view.phase === command.phase)
      const proposal = phase?.door.proposal
      if (phase === undefined || proposal == null) return null
      if (phase.door.status !== 'waiting' || proposal.status !== 'pending') return null
      if (proposal.proposalId !== command.proposalId || proposal.documentPath !== command.documentPath) return null
      return sameRevision(proposal.artifactRevision, command.artifactRevision) ? command : null
    }
    case 'decide_risky': {
      const proposal = projection.riskyProposals.find((item) => item.proposalId === command.proposalId)
      if (proposal === undefined || proposal.status !== 'pending' || proposal.actionDigest !== command.actionDigest) return null
      // An action that cannot be shown completely can be rejected, never approved.
      if (command.decision === 'approve' && proposal.descriptor === null) return null
      return command
    }
  }
}
