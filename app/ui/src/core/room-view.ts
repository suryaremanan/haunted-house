// The joined Room_Projection and its view model (Spec 5 design "Joined room
// projection" and "Room UI"; Requirements 10.4 to 10.7, 11.1 to 11.4, 12.1,
// 12.5, 12.6). It joins three already-parsed sources and adds nothing of its
// own: Spec 2 Ghost_Snapshots (ghost state), the Spec 4 WorkflowProjection
// (phase, Door, approvals) and the Room Ghosts answer (documents, tasks, runs).
//
// Display survives any doubt; controls do not. A version or integrity mismatch
// between the sources withholds every Room Ghosts mutation and asks for a
// fresh read. Nothing here infers an approval, a success, or a ghost state.
// No SDK, React, network, or clock.

import type { GhostSnapshot, GhostState } from './ghost-state'
import { GHOST_STATE_LABELS, ghostReasonText } from './ghost-status'
import {
  PHASE_NAMES,
  digestPrefix,
  ghostName,
  type Authority,
  type RoomId,
  type RoomView,
} from './house-view'
import {
  DOCUMENT_PHASES,
  MAX_ATTEMPTS,
  MAX_REVIEW_CYCLES,
  MAX_TINKERS,
  type DocumentPhase,
  type FindingView,
  type ReviewState,
  type RoomGhosts,
  type RunState,
  type TaskOutcomeStatus,
  type TaskState,
} from './room-projection'
import { PHASES, type Integrity, type Phase, type PhaseView, type WorkflowProjection } from './workflow-projection'

export type RoomGhostsStatus = 'loading' | 'ready' | 'malformed' | 'unavailable'

// ---------------------------------------------------------------------------
// Commands: the four Room Ghosts mutations, each with the version it was made on.

export const MAX_FEEDBACK_CHARACTERS = 4000

export type RoomCommand =
  | { readonly kind: 'send_feedback'; readonly phase: DocumentPhase; readonly feedback: string; readonly expectedVersion: number }
  | { readonly kind: 'start_workshop'; readonly taskIds: readonly string[]; readonly expectedVersion: number }
  | { readonly kind: 'cancel_run'; readonly runId: string; readonly expectedVersion: number }
  | { readonly kind: 'retry_run'; readonly runId: string; readonly expectedVersion: number }

/** Identifies the control a command came from, so only that control shows as busy. */
export function roomCommandTarget(command: RoomCommand): string {
  switch (command.kind) {
    case 'send_feedback':
      return `feedback:${command.phase}`
    case 'start_workshop':
      return 'workshop'
    case 'cancel_run':
    case 'retry_run':
      return `run:${command.runId}`
  }
}

// ---------------------------------------------------------------------------
// The mutation gate: may this page offer a Room Ghosts mutation right now?

export type RoomGateBlock = 'authority' | 'loading' | 'unavailable' | 'malformed' | 'read_only' | 'integrity' | 'mismatch'

export interface RoomGate {
  /** True only when the three sources agree and decisions are allowed. */
  readonly allowed: boolean
  readonly block: RoomGateBlock | null
  /** Why the room's controls are off, in plain words. Null when they are on. */
  readonly text: string | null
  /** True when the sources disagree and the room's answer should be read again. */
  readonly needsRefresh: boolean
}

const GATE_TEXT: Readonly<Record<Exclude<RoomGateBlock, 'authority'>, string>> = {
  loading: "Loading this room's output. Its controls are off until it arrives.",
  unavailable: "This room's output could not be read. Its controls are off; Door and approval decisions are unaffected.",
  malformed: "The house sent room output this page cannot read. This room's controls are off.",
  read_only: 'This is a recording. Nothing can be sent, cancelled or retried here.',
  integrity: "The room's output failed its integrity check. Its controls are off until it is repaired.",
  mismatch: "The room's output and the house's state are from different moments. Refreshing before anything can be sent.",
}

export interface RoomGateInput {
  readonly projection: WorkflowProjection | null
  readonly roomGhosts: RoomGhosts | null
  readonly roomGhostsStatus: RoomGhostsStatus
  readonly authority: Authority
}

/** True when a pending Door proposal and the room's document name different bytes. */
function documentsDisagree(projection: WorkflowProjection, roomGhosts: RoomGhosts): boolean {
  return roomGhosts.documents.some((document) => {
    const phase = projection.phases[PHASES.indexOf(document.phase)]
    const proposal = phase.door.proposal
    if (proposal === null || proposal.status !== 'pending' || phase.door.status !== 'waiting') return false
    return document.artifact === null
      ? !roomGhosts.readOnly
      : document.artifact.artifactRevision.sha256 !== proposal.artifactRevision.sha256 ||
          document.artifact.artifactRevision.revision !== proposal.artifactRevision.revision
  })
}

/**
 * Decides whether Room Ghosts mutations may be offered. Every doubt withholds
 * them: the Spec 4 authority first, then an unread, unreadable or recorded
 * answer, then any disagreement between the sources.
 */
export function deriveRoomGate(input: RoomGateInput): RoomGate {
  const blocked = (block: Exclude<RoomGateBlock, 'authority'>, needsRefresh = false): RoomGate => ({
    allowed: false,
    block,
    text: GATE_TEXT[block],
    needsRefresh,
  })
  if (input.roomGhosts?.readOnly === true) return blocked('read_only')
  if (!input.authority.canDecide) return { allowed: false, block: 'authority', text: input.authority.text, needsRefresh: false }
  if (input.roomGhostsStatus === 'malformed') return blocked('malformed')
  if (input.roomGhosts === null || input.projection === null) {
    return blocked(input.roomGhostsStatus === 'unavailable' ? 'unavailable' : 'loading')
  }
  if (input.roomGhostsStatus !== 'ready') return blocked(input.roomGhostsStatus)
  if (input.roomGhosts.integrity === 'corrupt' || input.projection.integrity === 'corrupt') return blocked('integrity')
  if (input.roomGhosts.integrity !== input.projection.integrity) return blocked('mismatch', true)
  if (input.roomGhosts.integrity !== 'valid') return blocked('integrity')
  if (input.roomGhosts.mansionId !== input.projection.mansionId) return blocked('mismatch', true)
  if (input.roomGhosts.version !== input.projection.version) return blocked('mismatch', true)
  if (documentsDisagree(input.projection, input.roomGhosts)) return blocked('mismatch', true)
  return { allowed: true, block: null, text: null, needsRefresh: false }
}

/** One gated control: shown or not, and the exact command it sends when it may. */
export interface ControlView {
  readonly label: string
  /** Null means the control is shown but off. */
  readonly command: RoomCommand | null
  readonly busy: boolean
  /** Why the control is off. Null when it is on. */
  readonly blockedText: string | null
}

const ONE_AT_A_TIME = 'Another request is on its way. Wait for it to finish.'

function control(
  label: string,
  command: RoomCommand,
  gate: RoomGate,
  inFlight: string | null,
  reason: string | null = null,
): ControlView {
  const busy = inFlight === roomCommandTarget(command)
  const blockedText = !gate.allowed ? gate.text : reason !== null ? reason : inFlight !== null ? ONE_AT_A_TIME : null
  return { label, command: blockedText === null ? command : null, busy, blockedText: busy ? null : blockedText }
}

// ---------------------------------------------------------------------------
// Documents.

export const DOCUMENT_TITLES: Readonly<Record<DocumentPhase, string>> = {
  requirements: 'Requirements document',
  design: 'Design document',
  tasks: 'Task plan',
}

export type ValidationState = 'unwritten' | 'valid' | 'invalid' | 'unknown'

export const VALIDATION_TEXT: Readonly<Record<ValidationState, string>> = {
  unwritten: 'Not written yet',
  valid: "Valid: it passed the house's checks",
  invalid: "Not valid: it failed the house's checks",
  unknown: 'Not checked here',
}

function byteText(size: number): string {
  return size === 1 ? '1 byte' : `${size.toLocaleString('en-US')} bytes`
}

export function findingsText(count: number): string {
  if (count === 0) return 'No findings'
  return count === 1 ? '1 finding' : `${count} findings`
}

export interface DocumentView {
  readonly phase: DocumentPhase
  readonly title: string
  readonly documentPath: string
  readonly validation: ValidationState
  readonly validationText: string
  /** "Revision 2 (4,871 bytes)", or null when nothing was written. */
  readonly revisionText: string | null
  /** The whole SHA-256 of the bytes shown, or null when nothing was written. */
  readonly digest: string | null
  readonly digestPrefix: string | null
  /** The document text, or null with `contentNote` saying why there is none. */
  readonly content: string | null
  readonly contentNote: string | null
  readonly findings: readonly FindingView[]
  readonly findingsText: string
  /** What this room's ghost may write. */
  readonly writeScope: readonly string[]
  /** Set when a pending Door proposal covers other bytes than the ones shown. */
  readonly doorNote: string | null
  /** The optional revision request for this document, or null when none can be made now. */
  readonly feedback: FeedbackView | null
}

export interface FeedbackView {
  readonly phase: DocumentPhase
  readonly label: string
  readonly maxCharacters: number
  /** True when the form may be sent at all (the text is still checked on send). */
  readonly enabled: boolean
  readonly busy: boolean
  readonly blockedText: string | null
  readonly expectedVersion: number
}

/** The phases whose current output may still be revised in the same session. */
const REVISABLE: ReadonlySet<string> = new Set(['waiting', 'revision_required'])

function feedbackView(
  phase: PhaseView,
  document: DocumentPhase,
  roomGhosts: RoomGhosts,
  gate: RoomGate,
  inFlight: string | null,
): FeedbackView | null {
  // A revision goes to the phase's existing session, before its Door is approved.
  if (!REVISABLE.has(phase.status) || phase.door.status === 'open') return null
  if (!roomGhosts.runs.some((run) => run.phase === document)) return null
  const target = `feedback:${document}`
  const blockedText = !gate.allowed ? gate.text : inFlight !== null && inFlight !== target ? ONE_AT_A_TIME : null
  return {
    phase: document,
    label: `Ask for a revision of the ${PHASE_NAMES[document].toLowerCase()}`,
    maxCharacters: MAX_FEEDBACK_CHARACTERS,
    enabled: blockedText === null && inFlight === null,
    busy: inFlight === target,
    blockedText,
    expectedVersion: roomGhosts.version,
  }
}

/** The trimmed feedback when it may be sent, or the reason it may not. */
export function checkFeedback(text: string): { readonly ok: true; readonly feedback: string } | { readonly ok: false; readonly text: string } {
  const feedback = text.trim()
  if (feedback === '') return { ok: false, text: 'Write what should change before sending.' }
  if (feedback.length > MAX_FEEDBACK_CHARACTERS) {
    return { ok: false, text: `Keep the request under ${MAX_FEEDBACK_CHARACTERS.toLocaleString('en-US')} characters.` }
  }
  return { ok: true, feedback }
}

/** The Spec_Directory the Door proposals of this projection name, when they name one. */
function specFolder(projection: WorkflowProjection): string | undefined {
  for (const phase of projection.phases) {
    const path = phase.door.proposal?.documentPath
    if (path !== undefined && path.includes('/')) return path.slice(0, path.lastIndexOf('/'))
  }
  return undefined
}

function documentView(
  phase: DocumentPhase,
  projection: WorkflowProjection | null,
  roomGhosts: RoomGhosts | null,
  gate: RoomGate,
  inFlight: string | null,
  specName: string,
): DocumentView {
  const phaseView = projection === null ? null : projection.phases[PHASES.indexOf(phase)]
  const proposal = phaseView?.door.proposal ?? null
  const document = roomGhosts?.documents[DOCUMENT_PHASES.indexOf(phase)] ?? null
  const artifact = document?.artifact ?? null
  // Without the room's own answer, the Door proposal still names the exact revision it covers.
  const revision = artifact?.artifactRevision ?? proposal?.artifactRevision ?? null
  // Where the room holds no bytes of this document, the Door proposals say where the spec lives:
  // this document's own proposal first, else the folder the other proposals of the spec share.
  const folder = artifact !== null || projection === null ? undefined : specFolder(projection)
  const documentPath =
    (artifact === null ? (proposal?.documentPath ?? (folder === undefined ? undefined : `${folder}/${phase}.md`)) : undefined) ??
    document?.documentPath ??
    `.kiro/specs/${specName}/${phase}.md`
  const validation: ValidationState =
    artifact !== null ? (artifact.validated ? 'valid' : 'invalid') : revision !== null ? 'unknown' : 'unwritten'
  const pendingProposal = proposal !== null && proposal.status === 'pending' && phaseView?.door.status === 'waiting' ? proposal : null
  const disagrees =
    artifact !== null &&
    pendingProposal !== null &&
    (artifact.artifactRevision.sha256 !== pendingProposal.artifactRevision.sha256 ||
      artifact.artifactRevision.revision !== pendingProposal.artifactRevision.revision)
  return {
    phase,
    title: DOCUMENT_TITLES[phase],
    documentPath,
    validation,
    validationText: VALIDATION_TEXT[validation],
    revisionText: revision === null ? null : `Revision ${revision.revision} (${byteText(revision.sizeBytes)})`,
    digest: revision?.sha256 ?? null,
    digestPrefix: revision === null ? null : digestPrefix(revision.sha256),
    content: artifact?.content ?? null,
    contentNote:
      artifact?.content != null
        ? null
        : revision === null
          ? 'Nothing has been written here yet.'
          : roomGhosts?.readOnly === true
            ? 'The séance log records the path, revision and digest of a document, never its text, so this recording has no text to show.'
            : artifact === null
              ? "The document text is not loaded. The facts below come from the door proposal."
              : 'The house did not send the text of this document. Its path, revision and digest are exact.',
    findings: artifact?.findings ?? [],
    findingsText: findingsText(artifact?.findings.length ?? 0),
    // The Door proposal names the exact document; where the room has no bytes of its own, its path is the scope.
    writeScope: document === null || (artifact === null && documentPath !== document.documentPath) ? [documentPath] : document.writeScope,
    doorNote: disagrees
      ? `The text shown is revision ${artifact.artifactRevision.revision}. The door proposal covers revision ${pendingProposal.artifactRevision.revision} (digest ${digestPrefix(pendingProposal.artifactRevision.sha256)}). The house is refreshing.`
      : null,
    feedback: phaseView == null || roomGhosts === null ? null : feedbackView(phaseView, phase, roomGhosts, gate, inFlight),
  }
}

// ---------------------------------------------------------------------------
// Runs: output summary, recovery controls and the secondary session link.

export interface SessionLinkView {
  /** The slot key to open, or null when the link is off. */
  readonly slotKey: string | null
  /** "Open Archivist's Crew session (Working)". */
  readonly label: string
  /** Why the link is off. Null when it is on. */
  readonly disabledText: string | null
}

export interface RunView {
  readonly runId: string
  readonly ghostId: string
  readonly ghostName: string
  readonly phase: Phase
  readonly taskId: string | null
  /** The ghost's Spec 2 state when its current run is this one; null for an earlier run. */
  readonly state: GhostState | null
  readonly stateText: string
  readonly attemptText: string
  /** The bounded Ghost_Result summary, on one line, or null. */
  readonly summary: string | null
  readonly reasonText: string | null
  /** The task claim of a Tinker run. Empty for a phase run. */
  readonly writeScope: readonly string[]
  /** Null when cancelling does not apply to this run. */
  readonly cancel: ControlView | null
  /** Null when retrying does not apply to this run. */
  readonly retry: ControlView | null
  /** Set when the run used every attempt: nothing retries on its own. */
  readonly exhaustedText: string | null
  readonly sessionLink: SessionLinkView
}

const SESSION_LINK_OFF = 'Opening this session from Haunted House is not available yet. Find it in Crew by its name.'
const SESSION_LINK_RECORDING = 'This is a recording: there is no Crew session to open.'

function oneLine(value: string, limit = 400): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  const characters = Array.from(flat)
  return characters.length <= limit ? flat : `${characters.slice(0, limit - 1).join('').trimEnd()}…`
}

function runView(
  run: RunState,
  snapshots: ReadonlyMap<string, GhostSnapshot>,
  roomGhosts: RoomGhosts,
  gate: RoomGate,
  inFlight: string | null,
  names: Readonly<Record<string, string>>,
): RunView {
  const snapshot = snapshots.get(run.ghostId)
  const current = snapshot !== undefined && snapshot.run_id === run.runId
  const state = current ? snapshot.state : null
  const stateText = state === null ? 'Earlier run' : GHOST_STATE_LABELS[state]
  const name = ghostName(run.ghostId, names)
  const version = roomGhosts.version
  return {
    runId: run.runId,
    ghostId: run.ghostId,
    ghostName: name,
    phase: run.phase,
    taskId: run.taskId,
    state,
    stateText,
    attemptText: `Attempt ${run.attempt} of ${MAX_ATTEMPTS}`,
    summary: run.summary === null ? null : oneLine(run.summary),
    reasonText: ghostReasonText(run.reasonCode),
    writeScope: run.claimPaths,
    cancel: run.cancelRequested
      ? { label: 'Cancelling…', command: null, busy: false, blockedText: 'Cancellation was requested. Waiting for Crew to confirm it.' }
      : run.canCancel
        ? control(`Cancel ${name}'s run`, { kind: 'cancel_run', runId: run.runId, expectedVersion: version }, gate, inFlight)
        : null,
    retry: run.canRetry
      ? control(`Retry with a fresh session`, { kind: 'retry_run', runId: run.runId, expectedVersion: version }, gate, inFlight)
      : null,
    exhaustedText:
      !run.canRetry && !run.canCancel && run.attempt >= MAX_ATTEMPTS && (state === 'failed' || state === 'blocked')
        ? `All ${MAX_ATTEMPTS} attempts are used. Nothing retries on its own.`
        : null,
    sessionLink: {
      slotKey: roomGhosts.readOnly ? null : run.sessionLink,
      label: `Open ${name}'s Crew session (${stateText})`,
      disabledText: roomGhosts.readOnly ? SESSION_LINK_RECORDING : run.sessionLink === null ? SESSION_LINK_OFF : null,
    },
  }
}

// ---------------------------------------------------------------------------
// Workshop task board.

export type TaskBoardStatus = TaskOutcomeStatus | 'backpressure' | 'not_selected'

export const TASK_STATUS_TEXT: Readonly<Record<TaskBoardStatus, string>> = {
  not_selected: 'Not selected',
  queued: 'Queued',
  backpressure: 'Queued: waiting for capacity',
  active: 'A Tinker is working on it',
  complete: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
  blocked: 'Blocked',
  skipped: 'Skipped',
}

const BACKPRESSURE_TEXT = {
  crew_capacity: 'Crew has no room for another ghost right now',
  local_capacity: `All ${MAX_TINKERS} Tinker seats are taken`,
  claim_busy: 'Another task is writing the same files',
} as const

export interface TaskRow {
  readonly taskId: string
  readonly title: string
  readonly optional: boolean
  readonly complete: boolean
  readonly status: TaskBoardStatus
  readonly statusText: string
  readonly requirementsText: string
  readonly writes: readonly string[]
  /** "Attempt 2 of 3", or null before the first attempt. */
  readonly attemptText: string | null
  /** Backpressure or failure detail in plain words, or null. */
  readonly detail: string | null
  /** True when the Operator may tick this task for the next start. */
  readonly selectable: boolean
  /** The run working on, or last working on, this task. */
  readonly run: RunView | null
}

export interface TaskWave {
  /** The wave number, or null for the tasks no wave lists. */
  readonly wave: number | null
  readonly title: string
  readonly tasks: readonly TaskRow[]
}

export interface TaskBoardView {
  readonly waves: readonly TaskWave[]
  readonly taskCount: number
  readonly doneCount: number
  readonly activeCount: number
  /** "2 of 3 Tinkers working". */
  readonly capacityText: string
  readonly findings: readonly FindingView[]
  /** Why nothing can be started now. Null when a start may be offered. */
  readonly startBlockedText: string | null
  readonly startBusy: boolean
  readonly expectedVersion: number
}

function taskStatus(task: TaskState): TaskBoardStatus {
  if (task.complete) return 'complete'
  if (task.outcome === null) return 'not_selected'
  if (task.outcome.status === 'queued' && task.backpressure !== null) return 'backpressure'
  return task.outcome.status
}

function taskDetail(task: TaskState): string | null {
  if (task.complete) return null
  if (task.backpressure !== null) {
    const { dispatchFailures, nextDelaySeconds, lastReason } = task.backpressure
    const tries = dispatchFailures === 1 ? '1 refusal so far' : `${dispatchFailures} refusals so far`
    const wait = nextDelaySeconds === 1 ? '1 second' : `${nextDelaySeconds} seconds`
    return `${BACKPRESSURE_TEXT[lastReason]}. Next try in ${wait} (${tries}). This does not use up an attempt.`
  }
  return ghostReasonText(task.outcome?.reasonCode ?? null)
}

/** A task may be ticked when it is open and no run holds it or waits to. */
function isSelectable(task: TaskState): boolean {
  return !task.complete && (task.outcome === null || task.outcome.status === 'skipped')
}

function taskBoard(
  projection: WorkflowProjection | null,
  roomGhosts: RoomGhosts,
  runs: readonly RunView[],
  gate: RoomGate,
  inFlight: string | null,
): TaskBoardView | null {
  const plan = roomGhosts.taskPlan
  if (plan === null) return null
  const runOf = new Map(runs.filter((run) => run.taskId !== null).map((run) => [run.runId, run]))
  const row = (task: TaskState): TaskRow => {
    const status = taskStatus(task)
    return {
      taskId: task.taskId,
      title: task.title,
      optional: task.optional,
      complete: task.complete,
      status,
      statusText: TASK_STATUS_TEXT[status],
      requirementsText: task.requirements.length === 0 ? 'None' : task.requirements.join(', '),
      writes: task.writes,
      attemptText: task.outcome === null || task.outcome.attempt === 0 ? null : `Attempt ${task.outcome.attempt} of ${MAX_ATTEMPTS}`,
      detail: taskDetail(task),
      selectable: isSelectable(task),
      run: task.outcome?.runId == null ? null : (runOf.get(task.outcome.runId) ?? null),
    }
  }
  const waves: TaskWave[] = plan.waves.map((_, index) => ({
    wave: index,
    title: `Wave ${index + 1}`,
    tasks: plan.tasks.filter((task) => task.wave === index).map(row),
  }))
  const unscheduled = plan.tasks.filter((task) => task.wave === null).map(row)
  if (unscheduled.length > 0) waves.push({ wave: null, title: 'Outside the waves', tasks: unscheduled })
  const activeCount = plan.tasks.filter((task) => task.outcome?.status === 'active').length
  const tasksDoor = projection?.phases[PHASES.indexOf('tasks')].door.status
  const startBlockedText = !gate.allowed
    ? gate.text
    : tasksDoor !== 'open'
      ? 'Sealed door: approve the task plan before any task can start.'
      : plan.findings.length > 0
        ? 'The task plan has findings. It needs a revision before any task can start.'
        : !plan.tasks.some(isSelectable)
          ? 'Every open task is already selected or done.'
          : inFlight !== null && inFlight !== 'workshop'
            ? ONE_AT_A_TIME
            : null
  return {
    waves,
    taskCount: plan.tasks.length,
    doneCount: plan.tasks.filter((task) => task.complete).length,
    activeCount,
    capacityText: `${activeCount} of ${MAX_TINKERS} Tinkers working`,
    findings: plan.findings,
    startBlockedText,
    startBusy: inFlight === 'workshop',
    expectedVersion: roomGhosts.version,
  }
}

/**
 * The start command for the ticked tasks, or null when it may not be sent:
 * nothing ticked, a ticked task that cannot be selected, or a blocked board.
 * Tasks are sent in plan order, whatever order they were ticked in.
 */
export function workshopStartCommand(board: TaskBoardView, chosen: ReadonlySet<string>): RoomCommand | null {
  if (board.startBlockedText !== null || board.startBusy) return null
  const rows = board.waves.flatMap((wave) => wave.tasks)
  const taskIds = rows.filter((row) => chosen.has(row.taskId)).map((row) => row.taskId)
  if (taskIds.length === 0 || taskIds.length !== chosen.size) return null
  if (rows.some((row) => chosen.has(row.taskId) && !row.selectable)) return null
  return { kind: 'start_workshop', taskIds, expectedVersion: board.expectedVersion }
}

// ---------------------------------------------------------------------------
// The joined projection of one room.

export interface RoomProjection {
  /** Projection_Version of the Spec 4 workflow this room was joined at. */
  readonly projectionVersion: number
  readonly integrity: Integrity
  readonly room: RoomId
  /** Spec 2 snapshots of the ghosts in this room. */
  readonly ghosts: readonly GhostSnapshot[]
  /** Spec 4 phases of this room. */
  readonly phases: readonly PhaseView[]
  readonly gate: RoomGate
  /** One entry per document this room produces, first. */
  readonly documents: readonly DocumentView[]
  /** The Workshop task board, or null in other rooms and before a valid plan exists. */
  readonly taskBoard: TaskBoardView | null
  /** Runs of this room, newest first. */
  readonly runs: readonly RunView[]
  /** Set when the room's own answer is missing: what the panel says instead. */
  readonly outputNote: string | null
  /** True when the task board replaces the generic implementation start. */
  readonly ownsImplementationStart: boolean
}

export interface RoomJoinInput {
  readonly room: RoomView
  readonly specName: string
  readonly projection: WorkflowProjection | null
  readonly snapshots: ReadonlyMap<string, GhostSnapshot>
  readonly roomGhosts: RoomGhosts | null
  readonly roomGhostsStatus: RoomGhostsStatus
  readonly authority: Authority
  /** `roomCommandTarget` of the Room Ghosts command on its way, or null. */
  readonly inFlight: string | null
  readonly names?: Readonly<Record<string, string>>
}

const DOCUMENTS_OF_ROOM: Readonly<Record<RoomId, readonly DocumentPhase[]>> = {
  study: ['requirements'],
  'drafting-room': ['design'],
  workshop: ['tasks'],
}

/** Joins the three sources for one room. Pure: the same inputs give the same projection. */
export function joinRoomProjection(input: RoomJoinInput): RoomProjection {
  const { room, projection, roomGhosts, snapshots } = input
  const names = input.names ?? {}
  const gate = deriveRoomGate(input)
  const phaseNames = room.phases.map((line) => line.phase)
  const phases = projection === null ? [] : phaseNames.map((phase) => projection.phases[PHASES.indexOf(phase)])
  const ghostIds = new Set(room.ghosts.map((ghost) => ghost.ghostId))
  const runs =
    roomGhosts === null
      ? []
      : roomGhosts.runs
          .filter((run) => phaseNames.includes(run.phase))
          .map((run) => runView(run, snapshots, roomGhosts, gate, input.inFlight, names))
          .reverse()
  const board = roomGhosts === null || room.id !== 'workshop' ? null : taskBoard(projection, roomGhosts, runs, gate, input.inFlight)
  return {
    projectionVersion: projection?.version ?? 0,
    integrity: projection === null ? 'uncertain' : roomGhosts === null ? projection.integrity : worstIntegrity(projection.integrity, roomGhosts.integrity),
    room: room.id,
    ghosts: Array.from(snapshots.values()).filter((snapshot) => ghostIds.has(snapshot.ghost_id)),
    phases,
    gate,
    documents: DOCUMENTS_OF_ROOM[room.id].map((phase) => documentView(phase, projection, roomGhosts, gate, input.inFlight, input.specName)),
    taskBoard: board,
    runs,
    outputNote:
      roomGhosts !== null
        ? null
        : input.roomGhostsStatus === 'loading'
          ? GATE_TEXT.loading
          : input.roomGhostsStatus === 'malformed'
            ? GATE_TEXT.malformed
            : GATE_TEXT.unavailable,
    ownsImplementationStart: board !== null,
  }
}

function worstIntegrity(left: Integrity, right: Integrity): Integrity {
  if (left === 'corrupt' || right === 'corrupt') return 'corrupt'
  return left === 'uncertain' || right === 'uncertain' ? 'uncertain' : 'valid'
}

// ---------------------------------------------------------------------------
// The last check before a Room Ghosts command is sent.

/**
 * Passes a command only when the gate allows it, nothing else is in flight,
 * and the command names exactly what the current answer shows. The backend
 * repeats every check; this one keeps a stale screen from asking.
 */
export function authorizeRoomCommand(
  roomGhosts: RoomGhosts | null,
  projection: WorkflowProjection | null,
  gate: RoomGate,
  inFlight: string | null,
  command: RoomCommand,
): RoomCommand | null {
  if (!gate.allowed || inFlight !== null || roomGhosts === null || projection === null) return null
  if (command.expectedVersion !== roomGhosts.version || command.expectedVersion !== projection.version) return null
  switch (command.kind) {
    case 'send_feedback': {
      const checked = checkFeedback(command.feedback)
      if (!checked.ok || checked.feedback !== command.feedback) return null
      const phase = projection.phases[PHASES.indexOf(command.phase)]
      if (!REVISABLE.has(phase.status) || phase.door.status === 'open') return null
      return roomGhosts.runs.some((run) => run.phase === command.phase) ? command : null
    }
    case 'start_workshop': {
      const plan = roomGhosts.taskPlan
      if (plan === null || plan.findings.length > 0) return null
      if (projection.phases[PHASES.indexOf('tasks')].door.status !== 'open') return null
      if (command.taskIds.length === 0 || new Set(command.taskIds).size !== command.taskIds.length) return null
      const open = new Set(plan.tasks.filter(isSelectable).map((task) => task.taskId))
      return command.taskIds.every((taskId) => open.has(taskId)) ? command : null
    }
    case 'cancel_run': {
      const run = roomGhosts.runs.find((item) => item.runId === command.runId)
      return run !== undefined && run.canCancel && !run.cancelRequested ? command : null
    }
    case 'retry_run': {
      const run = roomGhosts.runs.find((item) => item.runId === command.runId)
      return run !== undefined && run.canRetry && run.attempt < MAX_ATTEMPTS ? command : null
    }
  }
}

// ---------------------------------------------------------------------------
// The stretch Séance Room review.

export const REVIEW_STATUS_TEXT: Readonly<Record<ReviewState['status'], string>> = {
  reviewing: 'The Medium is reviewing',
  pass: 'Passed: the review found nothing to change',
  changes_requested: 'Changes requested',
  blocked: 'Blocked: the review needs your decision',
}

export const REPAIR_STATUS_TEXT = {
  proposed: 'Proposed: not started',
  approved: 'Approved for the Workshop',
  rejected: 'Rejected',
} as const

export interface ReviewFindingRow {
  readonly findingId: string
  readonly summary: string
  readonly requirementsText: string
  readonly paths: readonly string[]
  /** The repair task proposed for this finding, or null. */
  readonly repair: { readonly taskId: string; readonly title: string; readonly writes: readonly string[]; readonly statusText: string; readonly status: keyof typeof REPAIR_STATUS_TEXT } | null
}

export interface ReviewView {
  readonly status: ReviewState['status']
  readonly statusText: string
  /** "Review cycle 2 of 3". */
  readonly cycleText: string
  /** Set after the third cycle without a pass: nothing reviews again on its own. */
  readonly limitText: string | null
  readonly ghostName: string
  /** The Medium's Spec 2 state, or null when it has no snapshot. */
  readonly state: GhostState | null
  readonly stateText: string
  readonly findings: readonly ReviewFindingRow[]
  readonly sessionLink: SessionLinkView
}

/** The Séance Room review, or null when the Séance Room is off or has not reviewed. */
export function reviewView(
  roomGhosts: RoomGhosts | null,
  snapshots: ReadonlyMap<string, GhostSnapshot>,
  names: Readonly<Record<string, string>> = {},
): ReviewView | null {
  if (roomGhosts === null || !roomGhosts.seanceEnabled || roomGhosts.review === null) return null
  const review = roomGhosts.review
  const state = snapshots.get(review.ghostId)?.state ?? null
  const stateText = state === null ? 'No run yet' : GHOST_STATE_LABELS[state]
  const name = ghostName(review.ghostId, names)
  return {
    status: review.status,
    statusText: REVIEW_STATUS_TEXT[review.status],
    cycleText: `Review cycle ${review.cycle} of ${MAX_REVIEW_CYCLES}`,
    limitText:
      review.status === 'blocked' || (review.cycle >= MAX_REVIEW_CYCLES && review.status === 'changes_requested')
        ? 'Three review cycles ended without a pass. No fourth review starts on its own: the next step is your decision.'
        : null,
    ghostName: name,
    state,
    stateText,
    findings: review.findings.map((finding) => {
      const repair = review.repairs.find((item) => item.findingId === finding.findingId)
      return {
        findingId: finding.findingId,
        summary: oneLine(finding.summary),
        requirementsText: finding.requirementIds.length === 0 ? 'None' : finding.requirementIds.join(', '),
        paths: finding.paths,
        repair:
          repair === undefined
            ? null
            : { taskId: repair.taskId, title: repair.title, writes: repair.writes, status: repair.status, statusText: REPAIR_STATUS_TEXT[repair.status] },
      }
    }),
    sessionLink: {
      slotKey: roomGhosts.readOnly ? null : review.sessionLink,
      label: `Open ${name}'s Crew session (${stateText})`,
      disabledText: roomGhosts.readOnly ? SESSION_LINK_RECORDING : review.sessionLink === null ? SESSION_LINK_OFF : null,
    },
  }
}
