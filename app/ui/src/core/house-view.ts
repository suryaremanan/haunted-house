// Pure view model of the house (Spec 4, Requirements 4.8, 9.1 to 9.9): which
// rooms exist, what each shows for its phase, Door and ghosts, whether a
// decision may be offered, and what currently needs the Operator.
//
// Inputs are a parsed backend WorkflowProjection and Spec 2 Ghost_Snapshots.
// Nothing here approves, folds Crew data, or changes a proposal: authority can
// only be withheld. No SDK, React, network, or clock.

import type { GhostSnapshot } from './ghost-state'
import { defaultGhostName, ghostRows, type GhostRow } from './ghost-status'
import { roomDefinition, type RoomId as HouseRoomId } from './house-registry'
import type { EventDiagnostic } from './seance-event'
import {
  PHASES,
  type ActionDescriptor,
  type ActionKind,
  type ArtifactRevision,
  type DecisionRef,
  type DoorStatus,
  type PathAccess,
  type Phase,
  type PhaseStatus,
  type PhaseView,
  type RiskyProposal,
  type RiskyStatus,
  type WorkflowProjection,
} from './workflow-projection'

/** The rooms that hold a workflow phase. The whole house, with its order and names, is `house-registry.ts`. */
export const ROOM_IDS = ['study', 'drafting-room', 'workshop'] as const satisfies readonly HouseRoomId[]
export type RoomId = (typeof ROOM_IDS)[number]

export interface RoomDefinition {
  readonly id: RoomId
  readonly name: string
  readonly phases: readonly Phase[]
  /** Ghost id prefixes that live here when the backend has not bound a ghost to a phase yet. */
  readonly roles: readonly string[]
}

/** Names, phases and ghost roles come from the house registry, so they are written down once. */
export const ROOMS: readonly RoomDefinition[] = ROOM_IDS.map((id) => {
  const room = roomDefinition(id)
  return { id, name: room.name, phases: room.workflowPhases, roles: room.ghostRoles }
})

export const PHASE_NAMES: Readonly<Record<Phase, string>> = {
  requirements: 'Requirements',
  design: 'Design',
  tasks: 'Tasks',
  implementation: 'Implementation',
}

export const PHASE_STATUS_TEXT: Readonly<Record<PhaseStatus, string>> = {
  not_started: 'Not started',
  ready: 'Ready to start',
  starting: 'Starting',
  working: 'Working',
  waiting: 'Waiting for your decision',
  revision_required: 'Revision required',
  approved: 'Approved',
  failed: 'Failed to start',
  done: 'Done',
}

export const DOOR_STATUS_TEXT: Readonly<Record<DoorStatus, string>> = {
  sealed: 'Sealed door',
  waiting: 'Door waiting for your decision',
  open: 'Open door',
  rejected: 'Door kept shut',
}

/** The display name of a ghost: the given one, else its id in words. */
export function ghostName(ghostId: string, names: Readonly<Record<string, string>> = {}): string {
  const given = Object.hasOwn(names, ghostId) ? names[ghostId] : undefined
  return given === undefined || given.trim() === '' ? defaultGhostName(ghostId) : given
}

export function roomOfPhase(phase: Phase): RoomId {
  return ROOMS.find((room) => room.phases.includes(phase))!.id
}

/** The room a ghost belongs to: the phase the backend bound it to, else its role name. */
export function roomOfGhost(ghostId: string, projection: WorkflowProjection | null): RoomId | null {
  if (projection !== null) {
    for (const phase of projection.phases) {
      if (phase.ghostIds.includes(ghostId)) return roomOfPhase(phase.phase)
    }
  }
  for (const room of ROOMS) {
    if (room.roles.some((role) => ghostId === role || ghostId.startsWith(`${role}-`))) return room.id
  }
  return null
}

function successorOf(phase: Phase): Phase | null {
  return PHASES[PHASES.indexOf(phase) + 1] ?? null
}

/** What the Door of a phase means in words. A sealed Door also says how it opens. */
export function doorHint(phase: Phase, status: DoorStatus): string {
  const name = PHASE_NAMES[phase].toLowerCase()
  const next = successorOf(phase)
  switch (status) {
    case 'sealed':
      return `Sealed door: approve the ${name} to open it.`
    case 'waiting':
      return `The ${name} are ready. Approve or reject them to decide this door.`
    case 'open':
      return next === null
        ? `Open door: the ${name} were approved.`
        : `Open door: the ${name} were approved. ${PHASE_NAMES[next]} may be started.`
    case 'rejected':
      return `Door kept shut: the ${name} were rejected and need a revision.`
  }
}

// ---------------------------------------------------------------------------
// Authority: may this page offer a decision right now?

export type AuthorityBlock =
  | 'read_only'
  | 'loading'
  | 'unavailable'
  | 'malformed'
  | 'integrity'
  | 'uncertain'
  | 'catching_up'
  | 'stale'

export interface Authority {
  /** True only when a decision made now would be about the state on screen. */
  readonly canDecide: boolean
  readonly block: AuthorityBlock | null
  /** Why decisions are off, in plain words. Null when they are on. */
  readonly text: string | null
}

export type ProjectionStatus = 'loading' | 'ready' | 'malformed' | 'unavailable'

/** The parts of the Spec 2 live state authority depends on. */
export interface CanonicalHealth {
  readonly loaded: boolean
  readonly catchingUp: boolean
  readonly highestSequence: number
  readonly diagnostic: EventDiagnostic | null
}

export interface AuthorityInput {
  readonly projection: WorkflowProjection | null
  readonly projectionStatus: ProjectionStatus
  readonly canonical: CanonicalHealth
  /** Replay: the page shows a recording and can decide nothing. */
  readonly readOnly?: boolean
}

const BLOCK_TEXT: Readonly<Record<AuthorityBlock, string>> = {
  read_only: 'This is a recording. Nothing can be started, approved or rejected here.',
  loading: 'Loading the state of the house. Decisions are off until it arrives.',
  unavailable: 'The house could not be reached. Decisions are off until it answers.',
  malformed: 'The house sent a state this page cannot read. Decisions are off.',
  integrity: 'The séance log failed its integrity check. Decisions are off until it is repaired.',
  uncertain: 'The latest ghost activity is not confirmed yet. Decisions are off until the house catches up.',
  catching_up: 'Catching up with the séance log. Decisions are off until it is current.',
  stale: 'Something changed in the house. Refreshing before you decide.',
}

const INTEGRITY_CODES: ReadonlySet<string> = new Set([
  'hash_mismatch',
  'hash_link_broken',
  'mixed_integrity_mode',
  'duplicate_sequence',
  'missing_sequence',
])

/**
 * Decides whether decision controls may be enabled. Every doubt disables them
 * (Requirements 7.8, 9.4, 11.7): unread or malformed state, an integrity or
 * persistence problem, a catch-up in progress, or canonical records newer than
 * the projection on screen.
 */
export function deriveAuthority(input: AuthorityInput): Authority {
  const blocked = (block: AuthorityBlock): Authority => ({ canDecide: false, block, text: BLOCK_TEXT[block] })
  if (input.readOnly === true || input.projection?.readOnly === true) return blocked('read_only')
  if (input.projectionStatus === 'malformed') return blocked('malformed')
  if (input.projection === null) return blocked(input.projectionStatus === 'unavailable' ? 'unavailable' : 'loading')
  if (input.projection.integrity === 'corrupt') return blocked('integrity')
  if (input.canonical.diagnostic !== null) {
    return blocked(INTEGRITY_CODES.has(input.canonical.diagnostic.code) ? 'integrity' : 'uncertain')
  }
  if (input.projection.integrity === 'uncertain') return blocked('uncertain')
  if (input.projectionStatus === 'unavailable') return blocked('unavailable')
  if (!input.canonical.loaded || input.canonical.catchingUp) return blocked('catching_up')
  // A Sequence the log holds but the projection has not folded: the screen is behind.
  if (input.canonical.highestSequence > input.projection.version) return blocked('stale')
  return { canDecide: true, block: null, text: null }
}

// ---------------------------------------------------------------------------
// Commands: the exact values a decision carries.

export type DecisionVerb = 'approve' | 'reject'

export type WorkflowCommand =
  | { readonly kind: 'start_phase'; readonly phase: Phase; readonly expectedVersion: number }
  | {
      readonly kind: 'decide_door'
      readonly decision: DecisionVerb
      readonly proposalId: string
      readonly phase: Phase
      readonly documentPath: string
      readonly artifactRevision: ArtifactRevision
      readonly expectedVersion: number
    }
  | {
      readonly kind: 'decide_risky'
      readonly decision: DecisionVerb
      readonly proposalId: string
      readonly actionDigest: string
      readonly expectedVersion: number
    }

/** Identifies the control a command came from, so only that control shows as busy. */
export function commandTarget(command: WorkflowCommand): string {
  return command.kind === 'start_phase' ? `phase:${command.phase}` : `proposal:${command.proposalId}`
}

// ---------------------------------------------------------------------------
// Decision panels.

export const DIGEST_PREFIX_LENGTH = 12

export function digestPrefix(digest: string): string {
  return digest.slice(0, DIGEST_PREFIX_LENGTH)
}

function byteText(size: number): string {
  return size === 1 ? '1 byte' : `${size.toLocaleString('en-US')} bytes`
}

function outcomeText(decision: DecisionRef): string {
  const verb = decision.outcome === 'approved' ? 'Approved' : 'Rejected'
  return decision.actor === 'operator' ? `${verb} by the operator in Haunted House.` : `${verb} in Crew, outside Haunted House.`
}

export interface DecisionControls {
  readonly canApprove: boolean
  readonly canReject: boolean
  /** True while this proposal's own command is on its way. */
  readonly busy: boolean
  /** Why approval is off although the proposal is pending. Null when it is on, or not pending. */
  readonly blockedText: string | null
}

function controls(pending: boolean, complete: boolean, authority: Authority, inFlight: string | null, target: string): DecisionControls {
  if (!pending) return { canApprove: false, canReject: false, busy: false, blockedText: null }
  const busy = inFlight === target
  const free = authority.canDecide && inFlight === null
  return {
    canApprove: free && complete,
    canReject: free,
    busy,
    blockedText: !authority.canDecide
      ? authority.text
      : !complete
        ? 'Blocked: this action cannot be shown completely, so it cannot be approved. You can reject it.'
        : null,
  }
}

export interface DoorDecisionView extends DecisionControls {
  readonly phase: Phase
  readonly proposalId: string
  readonly state: 'pending' | 'approved' | 'rejected' | 'superseded'
  readonly title: string
  readonly documentPath: string
  readonly revisionText: string
  readonly digestPrefix: string
  readonly sizeText: string
  /** Outcome and actor once decided or superseded. Null while pending. */
  readonly outcomeText: string | null
  readonly approve: WorkflowCommand | null
  readonly reject: WorkflowCommand | null
}

/** The Door panel of one phase, or null when that Door never had a proposal. */
export function doorDecisionView(
  projection: WorkflowProjection,
  phase: PhaseView,
  authority: Authority,
  inFlight: string | null,
): DoorDecisionView | null {
  const proposal = phase.door.proposal
  if (proposal === null) return null
  const pending = proposal.status === 'pending' && phase.door.status === 'waiting'
  const state = pending ? 'pending' : proposal.status === 'pending' ? 'superseded' : proposal.status
  const gate = controls(pending, true, authority, inFlight, `proposal:${proposal.proposalId}`)
  const command = (decision: DecisionVerb): WorkflowCommand => ({
    kind: 'decide_door',
    decision,
    proposalId: proposal.proposalId,
    phase: phase.phase,
    documentPath: proposal.documentPath,
    artifactRevision: proposal.artifactRevision,
    expectedVersion: projection.version,
  })
  return {
    ...gate,
    phase: phase.phase,
    proposalId: proposal.proposalId,
    state,
    title: `${PHASE_NAMES[phase.phase]} door`,
    documentPath: proposal.documentPath,
    revisionText: `Revision ${proposal.artifactRevision.revision}`,
    digestPrefix: digestPrefix(proposal.artifactRevision.sha256),
    sizeText: byteText(proposal.artifactRevision.sizeBytes),
    outcomeText:
      proposal.decision !== null
        ? outcomeText(proposal.decision)
        : state === 'superseded'
          ? 'Superseded: the document changed after this proposal. A new revision needs its own decision.'
          : null,
    approve: gate.canApprove ? command('approve') : null,
    reject: gate.canReject ? command('reject') : null,
  }
}

export const ACTION_KIND_TEXT: Readonly<Record<ActionKind, string>> = {
  delete_path: 'Delete a file or empty folder',
  run_command: 'Run a command',
  git_write: 'Change the git repository',
}

export const PATH_ACCESS_TEXT: Readonly<Record<PathAccess, string>> = {
  list: 'List',
  read: 'Read',
  write: 'Write',
  delete: 'Delete',
  command_read: 'Command may read',
  command_write: 'Command may write',
  git_write: 'Git may write',
}

export const RISKY_STATUS_TEXT: Readonly<Record<RiskyStatus, string>> = {
  pending: 'Waiting for your decision',
  approved: 'Approved, not used yet',
  rejected: 'Rejected',
  consumed: 'Approval used: the action is running',
  succeeded: 'Done: the approved action succeeded',
  failed: 'Failed: the approved action did not succeed. The approval is used up.',
  superseded: 'Superseded',
}

export const ONE_ATTEMPT_TEXT =
  'Approving allows exactly one attempt of exactly this action. If the attempt fails, the approval is used up and the ghost must ask again.'

export interface DetailLine {
  readonly label: string
  readonly value: string
}

/** One argument as exact text: strings as written, everything else as JSON. */
function argumentText(value: unknown): string {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.map((item) => JSON.stringify(item)).join(' ')
  }
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** Every execution-relevant field of the descriptor, in a fixed order. */
export function descriptorLines(descriptor: ActionDescriptor): { readonly scope: readonly DetailLine[]; readonly arguments: readonly DetailLine[]; readonly paths: readonly DetailLine[] } {
  return {
    scope: [
      { label: 'Action', value: ACTION_KIND_TEXT[descriptor.kind] },
      { label: 'Mansion', value: descriptor.mansionId },
      { label: 'Room', value: descriptor.room },
      { label: 'Session', value: descriptor.sessionSlot },
      { label: 'Working folder', value: descriptor.workingDirectory === '' ? 'The mansion folder' : descriptor.workingDirectory },
    ],
    arguments: Object.keys(descriptor.arguments)
      .sort()
      .map((key) => ({ label: key, value: argumentText(descriptor.arguments[key]) })),
    paths: descriptor.pathIntents.map((intent) => ({ label: PATH_ACCESS_TEXT[intent.access], value: intent.path })),
  }
}

export interface RiskyDecisionView extends DecisionControls {
  readonly proposalId: string
  readonly ghostId: string
  readonly ghostName: string
  readonly status: RiskyStatus
  readonly statusText: string
  readonly title: string
  /** False when the descriptor is missing, redacted or unreadable (Requirement 9.4). */
  readonly complete: boolean
  readonly scope: readonly DetailLine[]
  readonly arguments: readonly DetailLine[]
  readonly paths: readonly DetailLine[]
  readonly digestPrefix: string
  readonly oneAttemptText: string
  readonly outcomeText: string | null
  readonly approve: WorkflowCommand | null
  readonly reject: WorkflowCommand | null
}

export function riskyDecisionView(
  projection: WorkflowProjection,
  proposal: RiskyProposal,
  authority: Authority,
  inFlight: string | null,
  names: Readonly<Record<string, string>> = {},
): RiskyDecisionView {
  const complete = proposal.descriptor !== null
  const pending = proposal.status === 'pending'
  const gate = controls(pending, complete, authority, inFlight, `proposal:${proposal.proposalId}`)
  const lines = proposal.descriptor === null ? { scope: [], arguments: [], paths: [] } : descriptorLines(proposal.descriptor)
  const command = (decision: DecisionVerb): WorkflowCommand => ({
    kind: 'decide_risky',
    decision,
    proposalId: proposal.proposalId,
    actionDigest: proposal.actionDigest,
    expectedVersion: projection.version,
  })
  return {
    ...gate,
    proposalId: proposal.proposalId,
    ghostId: proposal.ghostId,
    ghostName: ghostName(proposal.ghostId, names),
    status: proposal.status,
    statusText: RISKY_STATUS_TEXT[proposal.status],
    title: proposal.descriptor === null ? 'Risky action (details unavailable)' : ACTION_KIND_TEXT[proposal.descriptor.kind],
    complete,
    ...lines,
    digestPrefix: digestPrefix(proposal.actionDigest),
    oneAttemptText: ONE_ATTEMPT_TEXT,
    outcomeText: proposal.decision === null ? null : outcomeText(proposal.decision),
    approve: gate.canApprove ? command('approve') : null,
    reject: gate.canReject ? command('reject') : null,
  }
}

// ---------------------------------------------------------------------------
// Explicit starts.

export interface StartView {
  readonly phase: Phase
  readonly label: string
  readonly enabled: boolean
  readonly busy: boolean
  readonly command: WorkflowCommand | null
}

const START_LABEL: Partial<Record<PhaseStatus, (name: string) => string>> = {
  ready: (name) => `Start ${name}`,
  failed: (name) => `Try starting ${name} again`,
  revision_required: (name) => `Start the ${name} revision`,
}

/**
 * The start control of a phase, or null when the phase cannot be started.
 * Nothing starts on its own: an open Door only makes this control appear.
 */
export function startView(projection: WorkflowProjection, phase: PhaseView, authority: Authority, inFlight: string | null): StartView | null {
  const label = START_LABEL[phase.status]
  if (label === undefined) return null
  const enabled = authority.canDecide && inFlight === null
  return {
    phase: phase.phase,
    label: label(PHASE_NAMES[phase.phase].toLowerCase()),
    enabled,
    busy: inFlight === `phase:${phase.phase}`,
    command: enabled ? { kind: 'start_phase', phase: phase.phase, expectedVersion: projection.version } : null,
  }
}

// ---------------------------------------------------------------------------
// Needs You.

export type NeedsYouItem =
  | { readonly kind: 'door'; readonly id: string; readonly room: RoomId; readonly phase: Phase; readonly ghostId: string | null; readonly text: string }
  | { readonly kind: 'risky'; readonly id: string; readonly room: RoomId; readonly ghostId: string; readonly text: string }
  | { readonly kind: 'permission'; readonly id: string; readonly room: RoomId | null; readonly ghostId: string | null; readonly text: string }

/**
 * Every unresolved Operator action, in house order: Door proposals by phase,
 * then risky proposals, then Crew permission prompts no proposal accounts for.
 * The badge shows the length of this list and nothing else (Requirement 9.5).
 */
export function needsYou(projection: WorkflowProjection | null, names: Readonly<Record<string, string>> = {}): NeedsYouItem[] {
  if (projection === null) return []
  const items: NeedsYouItem[] = []
  const nameOf = (ghostId: string) => ghostName(ghostId, names)
  for (const phase of projection.phases) {
    const proposal = phase.door.proposal
    if (phase.door.status !== 'waiting' || proposal === null || proposal.status !== 'pending') continue
    items.push({
      kind: 'door',
      id: `door:${proposal.proposalId}`,
      room: roomOfPhase(phase.phase),
      phase: phase.phase,
      ghostId: phase.ghostIds.at(-1) ?? null,
      text: `The ${PHASE_NAMES[phase.phase].toLowerCase()} door needs your decision.`,
    })
  }
  const pendingRisky = new Set<string>()
  const pendingSlots = new Set<string>()
  for (const proposal of projection.riskyProposals) {
    if (proposal.status !== 'pending') continue
    pendingRisky.add(proposal.proposalId)
    pendingSlots.add(proposal.sessionSlot)
    const action = proposal.descriptor === null ? 'do something risky' : ACTION_KIND_TEXT[proposal.descriptor.kind].toLowerCase()
    items.push({
      kind: 'risky',
      id: `risky:${proposal.proposalId}`,
      room: roomOfGhost(proposal.ghostId, projection) ?? 'workshop',
      ghostId: proposal.ghostId,
      text: `${nameOf(proposal.ghostId)} asks to ${action}.`,
    })
  }
  for (const permission of projection.pendingPermissions) {
    // A prompt that belongs to a pending proposal is that proposal, not a second action.
    // Before the backend correlated it, a prompt in the session of a pending proposal counts as that one.
    if (permission.proposalId !== null ? pendingRisky.has(permission.proposalId) : pendingSlots.has(permission.slot)) continue
    items.push({
      kind: 'permission',
      id: `permission:${JSON.stringify([permission.slot, permission.mid])}`,
      room: null,
      ghostId: null,
      text:
        permission.toolName === null
          ? 'A ghost is waiting on a Crew tool prompt. Answer it in Crew.'
          : `A ghost is waiting on a Crew tool prompt (${permission.toolName}). Answer it in Crew.`,
    })
  }
  return items
}

export function needsYouText(count: number): string {
  if (count === 0) return 'Nothing needs you'
  return count === 1 ? '1 thing needs you' : `${count} things need you`
}

/**
 * The announcement for Needs You items not announced before. Each item is
 * announced once, when it first appears; several merge into one message.
 */
export function waitingAnnouncement(items: readonly NeedsYouItem[], announced: ReadonlySet<string>): { readonly seen: readonly string[]; readonly message: string | null } {
  const fresh = items.filter((item) => !announced.has(item.id))
  if (fresh.length === 0) return { seen: [], message: null }
  const sentences = fresh.map((item) => item.text)
  return {
    seen: fresh.map((item) => item.id),
    message: sentences.length === 1 ? sentences[0] : `${sentences.length} things need you. ${sentences.join(' ')}`,
  }
}

// ---------------------------------------------------------------------------
// Rooms.

export interface PhaseLine {
  readonly phase: Phase
  readonly name: string
  readonly status: PhaseStatus
  readonly statusText: string
  readonly doorStatus: DoorStatus
  readonly doorText: string
  readonly doorHint: string
}

export interface RoomView {
  readonly id: RoomId
  readonly name: string
  readonly phases: readonly PhaseLine[]
  readonly ghosts: readonly GhostRow[]
  /** Unresolved Operator actions in this room. */
  readonly needsYou: number
  /** The whole room in one sentence, for the map's navigation list. */
  readonly label: string
}

function ghostSummary(ghosts: readonly GhostRow[]): string {
  if (ghosts.length === 0) return 'No ghost here yet'
  return ghosts.map((ghost) => `${ghost.name}: ${ghost.stateText}`).join(', ')
}

/** The three rooms with their phase, Door and ghost state as text (Requirement 9.1). */
export function houseRooms(
  projection: WorkflowProjection | null,
  snapshots: Iterable<GhostSnapshot>,
  names: Readonly<Record<string, string>> = {},
): RoomView[] {
  const all = Array.from(snapshots)
  const waiting = needsYou(projection, names)
  return ROOMS.map((room) => {
    const phases: PhaseLine[] =
      projection === null
        ? []
        : room.phases.map((name) => {
            const view = projection.phases[PHASES.indexOf(name)]
            return {
              phase: name,
              name: PHASE_NAMES[name],
              status: view.status,
              statusText: PHASE_STATUS_TEXT[view.status],
              doorStatus: view.door.status,
              doorText: DOOR_STATUS_TEXT[view.door.status],
              doorHint: doorHint(name, view.door.status),
            }
          })
    const ghosts = ghostRows(
      all.filter((snapshot) => roomOfGhost(snapshot.ghost_id, projection) === room.id),
      names,
    )
    const count = waiting.filter((item) => item.room === room.id).length
    const phaseText =
      phases.length === 0
        ? 'State not loaded'
        : phases.map((line) => `${line.name}: ${line.statusText}, ${line.doorText}`).join('. ')
    return {
      id: room.id,
      name: room.name,
      phases,
      ghosts,
      needsYou: count,
      label: `${room.name}. ${phaseText}. ${ghostSummary(ghosts)}.${count > 0 ? ` ${needsYouText(count)}.` : ''}`,
    }
  })
}

/** The room after `current` in the given direction. Movement stops at the ends of the house. */
export function moveRoom(current: RoomId, direction: 'next' | 'previous' | 'first' | 'last'): RoomId {
  const index = ROOM_IDS.indexOf(current)
  switch (direction) {
    case 'next':
      return ROOM_IDS[Math.min(index + 1, ROOM_IDS.length - 1)]
    case 'previous':
      return ROOM_IDS[Math.max(index - 1, 0)]
    case 'first':
      return ROOM_IDS[0]
    case 'last':
      return ROOM_IDS[ROOM_IDS.length - 1]
  }
}

// ---------------------------------------------------------------------------
// Room panel.

export interface PhaseDetail {
  readonly line: PhaseLine
  readonly start: StartView | null
  readonly door: DoorDecisionView | null
}

export interface RoomDetail {
  readonly room: RoomView
  readonly phases: readonly PhaseDetail[]
  /** Risky proposals of this room: every pending one, then the most recent resolved ones. */
  readonly risky: readonly RiskyDecisionView[]
}

export const MAX_RESOLVED_RISKY_SHOWN = 5

/** Everything a room panel shows, with decision and start controls already gated. */
export function roomDetail(
  projection: WorkflowProjection | null,
  room: RoomView,
  authority: Authority,
  inFlight: string | null,
  names: Readonly<Record<string, string>> = {},
): RoomDetail {
  if (projection === null) return { room, phases: [], risky: [] }
  const phases = room.phases.map((line) => {
    const view = projection.phases[PHASES.indexOf(line.phase)]
    return {
      line,
      start: startView(projection, view, authority, inFlight),
      door: doorDecisionView(projection, view, authority, inFlight),
    }
  })
  const here = projection.riskyProposals.filter(
    (proposal) => (roomOfGhost(proposal.ghostId, projection) ?? 'workshop') === room.id,
  )
  const pending = here.filter((proposal) => proposal.status === 'pending')
  const resolved = here
    .filter((proposal) => proposal.status !== 'pending')
    .sort((left, right) => right.createdSequence - left.createdSequence)
    .slice(0, MAX_RESOLVED_RISKY_SHOWN)
  return {
    room,
    phases,
    risky: [...pending, ...resolved].map((proposal) => riskyDecisionView(projection, proposal, authority, inFlight, names)),
  }
}
