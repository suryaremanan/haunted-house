// The House Projection (Spec 6, Requirements 2.1 to 2.4, 2.8, 3.7, 3.8, 4.2,
// 8.7 to 8.10): the one place upstream state becomes what the house shows.
//
// It reads values the owning specs already parsed and gated: the open Mansion
// (Spec 3), the workflow projection and its authority (Spec 4), ghost
// snapshots (Spec 2), the joined room projections (Spec 5) and the replay
// projection. It copies Door and Ghost states exactly. It can only withhold:
// any doubt upstream turns a room's mutating controls off and adds a fixed,
// bounded sentence saying why. It never approves, starts, retries, folds Crew
// data, or decides which proposal is pending; those answers come from
// `house-view.ts` and `room-view.ts` unchanged.
//
// No React, DOM, Crew SDK, network, or clock.

import { GHOST_STATES, type GhostSnapshot, type GhostState } from './ghost-state'
import { HOUSE_OPERATOR_GHOST_ID, ghostRows } from './ghost-status'
import {
  HOUSE_ROOMS,
  ROOM_PHASE_TEXT,
  compareRooms,
  isRoomId,
  roomDefinition,
  stateWord,
  visibleRooms,
  type PresentationDoorState,
  type PresentationGhostState,
  type RoomDefinition,
  type RoomId,
  type RoomPhase,
  type SeanceRoomSetting,
} from './house-registry'
import {
  DOOR_STATUS_TEXT,
  PHASE_NAMES,
  PHASE_STATUS_TEXT,
  doorHint,
  needsYou as workflowNeedsYou,
  needsYouText,
  roomOfGhost,
  type Authority,
  type AuthorityBlock,
} from './house-view'
import type { MansionDescriptor } from './mansion-api'
import type { ReplayDiagnostic, ReplayIntegrity } from './replay-timeline'
import type { RoomGate, RoomProjection as JoinedRoomProjection } from './room-view'
import { DOOR_STATUSES, PHASES, PHASE_STATUSES, type DoorStatus, type Phase, type PhaseStatus, type WorkflowProjection } from './workflow-projection'

export type { PresentationDoorState, PresentationGhostState } from './house-registry'

export const PROJECTION_INTEGRITIES = ['valid', 'uncertain', 'incompatible', 'corrupt'] as const
/** How far a room's upstream state can be trusted. Listed from best to worst. */
export type ProjectionIntegrity = (typeof PROJECTION_INTEGRITIES)[number]

export const MAX_DIAGNOSTIC_CODE_POINTS = 240
export const MAX_LABEL_CODE_POINTS = 160
export const MAX_NAME_CODE_POINTS = 60

/** One line of bounded text: control characters and runs of whitespace become single spaces. */
function oneLine(value: string, limit: number): string {
  const flat = value.replace(/[\u0000-\u001f\u007f-\u009f\s]+/g, ' ').trim()
  const characters = Array.from(flat)
  return characters.length <= limit ? flat : `${characters.slice(0, limit - 1).join('').trimEnd()}…`
}

// ---------------------------------------------------------------------------
// Inputs: what the upstream specs hand over.

/** The replay facts the house shows: the fields of the Spec 2 replay projection it reads. */
export interface UpstreamReplay {
  readonly integrity: ReplayIntegrity
  readonly validRecordCount: number
  readonly diagnostics: readonly ReplayDiagnostic[]
}

export interface UpstreamHouseInput {
  /** The open Mansion (Spec 3). */
  readonly mansion: MansionDescriptor
  /** The parsed workflow projection (Spec 4), or null when none could be read. */
  readonly workflow: WorkflowProjection | null
  /** `deriveAuthority` of Spec 4: whether a decision may be offered right now, and why not. */
  readonly authority: Authority
  /** Ghost snapshots of this Mansion (Spec 2), keyed by ghost id. */
  readonly ghosts: ReadonlyMap<string, GhostSnapshot>
  /** `joinRoomProjection` of Spec 5 for each room that has one, keyed by room id. */
  readonly rooms: ReadonlyMap<string, JoinedRoomProjection>
  readonly replay: UpstreamReplay
  /** Display names by ghost id. A ghost without one is named after its id. */
  readonly ghostNames?: Readonly<Record<string, string>>
}

export interface HouseOptions {
  /** Build-time setting. Never an Operator-controlled authority value. */
  readonly seanceRoom: SeanceRoomSetting
  /** `replay`: the house shows a recording and nothing can be changed. */
  readonly mode: 'live' | 'replay'
}

// ---------------------------------------------------------------------------
// Outputs.

/** One Door of a room, with the upstream state untouched. */
export interface DoorPresentation {
  readonly phase: Phase
  readonly phaseName: string
  readonly state: PresentationDoorState
  /** The state in words, as Spec 4 writes it ("Sealed door"). */
  readonly text: string
  /** What the state means and how the Door opens. */
  readonly hint: string
  /** The proposal waiting on this Door, or null. Identifies the decision surface; it decides nothing. */
  readonly proposalId: string | null
  /** The upstream status of the phase behind this Door, or null when it could not be read. */
  readonly phaseStatus: PhaseStatus | null
  /** The phase and its status as Spec 4 writes them ("Design: Ready to start"), or null. */
  readonly phaseText: string | null
}

/** One ghost of a room, with the upstream state untouched. */
export interface GhostPresentation {
  readonly ghostId: string
  readonly name: string
  readonly state: PresentationGhostState
  /** Short safe reason for blocked or failed, or null. */
  readonly reason: string | null
  /** "1 approval pending", or null. */
  readonly pendingText: string | null
}

export const WAITING_ITEM_KINDS = ['door-decision', 'tool-decision', 'risky-decision'] as const
export type WaitingItemKind = (typeof WAITING_ITEM_KINDS)[number]

/** One decision the upstream specs say is open in a room. */
export interface WaitingItemView {
  readonly kind: WaitingItemKind
  /** The authoritative id of the proposal or prompt. */
  readonly id: string
  readonly ghostId: string | null
  /** Bounded display copy. Never tool input, artifact content, a path, or model text. */
  readonly label: string
  readonly status: 'pending' | 'resolved'
  /** True when the Operator can act on it. */
  readonly actionAvailable: boolean
}

/** A failed current run and whether the backend offers an explicit fresh attempt. */
export interface RecoveryActionView {
  readonly runId: string
  readonly ghostId: string
  readonly label: string
  /** False for a failed run nobody can retry: it never counts as needing the Operator. */
  readonly available: boolean
}

export interface RoomPresentation {
  readonly roomId: RoomId
  readonly name: string
  readonly phase: RoomPhase
  /**
   * The Door in front of the Operator: the first Door of the room, in workflow
   * order, that is not open, else the last one. An exact upstream value.
   */
  readonly door: PresentationDoorState
  /**
   * The ghost state that most needs attention among the room's ghosts
   * (failed, blocked, waiting, working, done, idle). An exact upstream value.
   */
  readonly ghost: PresentationGhostState
  /** Every Door of the room in workflow order. Empty for a room without a Door. */
  readonly doors: readonly DoorPresentation[]
  /** Every ghost of the room. Empty when no ghost has appeared here. */
  readonly ghosts: readonly GhostPresentation[]
  readonly integrity: ProjectionIntegrity
  /** True only when every upstream source this room depends on is valid and the house is live. */
  readonly mutatingActionsEnabled: boolean
  /** Replay: the room shows a recording. */
  readonly readOnly: boolean
  /** The stretch Séance Room in a build that only explains it. */
  readonly locked: boolean
  /** Why controls are off, as fixed bounded copy. Null when they are on. */
  readonly diagnostic: string | null
  /** Open decisions of this room in upstream order. */
  readonly waitingItems: readonly WaitingItemView[]
  /** Failed current runs of this room in upstream order. */
  readonly recoveryActions: readonly RecoveryActionView[]
}

export const NEEDS_YOU_KINDS = [...WAITING_ITEM_KINDS, 'failed-run-recovery'] as const
export type NeedsYouKind = (typeof NEEDS_YOU_KINDS)[number]

/** One thing the Operator can act on. The badge is the number of these and nothing else. */
export interface NeedsYouItem {
  readonly id: string
  readonly kind: NeedsYouKind
  readonly roomId: RoomId
  readonly ghostId: string | null
  readonly label: string
  readonly actionAvailable: true
}

export interface ReplayView {
  readonly integrity: ReplayIntegrity
  readonly validRecordCount: number
  /** The first replay problem in fixed copy, or null. */
  readonly diagnostic: string | null
}

/** A held action the owner has decided (dread-and-night 3.4): refused sends the ghost back, released lets it go. */
export interface DecidedHold {
  readonly proposalId: string
  readonly ghostId: string
  readonly outcome: 'refused' | 'released'
}

export interface HouseProjection {
  readonly mansionName: string
  readonly mode: 'live' | 'replay'
  /** The visible rooms in Room order. */
  readonly rooms: readonly RoomPresentation[]
  /** Deduplicated, in Room order then upstream action order. */
  readonly needsYou: readonly NeedsYouItem[]
  readonly replay: ReplayView
  /** Held actions already decided, in upstream order. Absent where nothing was ever held. */
  readonly decided?: readonly DecidedHold[]
}

// ---------------------------------------------------------------------------
// Fixed copy.

export const INTEGRITY_TEXT: Readonly<Record<Exclude<ProjectionIntegrity, 'valid'>, string>> = {
  uncertain: "This room's state is not confirmed. Its controls are off until the house catches up.",
  incompatible: 'The house sent a state for this room that this page cannot read. Its controls are off.',
  corrupt: "This room's record failed its integrity check. Its controls are off until it is repaired.",
}

export const READ_ONLY_TEXT = 'This is a recording. Nothing can be started, approved, rejected or opened in Crew here.'
export const LOCKED_SEANCE_TEXT =
  'The Séance Room is locked. Review is a later chapter of this house, so nothing can be started or changed here.'
export const MANSION_UNAVAILABLE_TEXT = "This mansion's folder could not be confirmed. Return to the Foyer and open it again."
export const ATTIC_TEXT: Readonly<Record<Exclude<ReplayIntegrity, 'valid'>, string>> = {
  diagnostic: 'Part of the séance log was left out. The Attic shows the records that could be read.',
  incompatible: 'The séance log failed its integrity check. The Attic shows only the records before the failure.',
}
export const DOOR_UNAVAILABLE_TEXT = 'Door state unavailable'
export const DOOR_UNAVAILABLE_HINT = 'The state of this door could not be read. Nothing can be decided until it can.'

// ---------------------------------------------------------------------------
// Integrity.

/** The worse of two integrity values. */
export function worseIntegrity(left: ProjectionIntegrity, right: ProjectionIntegrity): ProjectionIntegrity {
  return PROJECTION_INTEGRITIES.indexOf(left) >= PROJECTION_INTEGRITIES.indexOf(right) ? left : right
}

const AUTHORITY_INTEGRITY: Readonly<Record<AuthorityBlock, ProjectionIntegrity>> = {
  // A recording is whole; it is only not changeable.
  read_only: 'valid',
  loading: 'uncertain',
  unavailable: 'uncertain',
  uncertain: 'uncertain',
  catching_up: 'uncertain',
  stale: 'uncertain',
  malformed: 'incompatible',
  integrity: 'corrupt',
}

function gateIntegrity(gate: RoomGate, joined: JoinedRoomProjection): ProjectionIntegrity {
  switch (gate.block) {
    case null:
    case 'read_only':
    // The Spec 4 authority is read on its own.
    case 'authority':
      return 'valid'
    case 'malformed':
      return 'incompatible'
    case 'integrity':
      return joined.integrity === 'corrupt' ? 'corrupt' : 'uncertain'
    default:
      return 'uncertain'
  }
}

function isDoorStatus(value: unknown): value is DoorStatus {
  return typeof value === 'string' && (DOOR_STATUSES as readonly string[]).includes(value)
}

function isPhaseStatus(value: unknown): value is PhaseStatus {
  return typeof value === 'string' && (PHASE_STATUSES as readonly string[]).includes(value)
}

function isGhostState(value: unknown): value is GhostState {
  return typeof value === 'string' && (GHOST_STATES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Rooms.

/** The room a ghost lives in: its bound phase or role (Spec 4), else a stretch room's role. */
export function houseRoomOfGhost(ghostId: string, workflow: WorkflowProjection | null): RoomId | null {
  const workflowRoom = roomOfGhost(ghostId, workflow)
  if (workflowRoom !== null) return workflowRoom
  for (const room of HOUSE_ROOMS) {
    if (room.ghostRoles.some((role) => ghostId === role || ghostId.startsWith(`${role}-`))) return room.id
  }
  return null
}

const GHOST_ATTENTION: readonly GhostState[] = ['failed', 'blocked', 'waiting', 'working', 'done', 'idle']

function headlineDoor(doors: readonly DoorPresentation[]): PresentationDoorState {
  if (doors.length === 0) return 'not_applicable'
  const unread = doors.find((door) => door.state === 'unavailable')
  if (unread !== undefined) return 'unavailable'
  return (doors.find((door) => door.state !== 'open') ?? doors[doors.length - 1]).state
}

function headlineGhost(ghosts: readonly GhostPresentation[]): PresentationGhostState {
  if (ghosts.length === 0) return 'not_applicable'
  if (ghosts.some((ghost) => ghost.state === 'unavailable')) return 'unavailable'
  return GHOST_ATTENTION.find((state) => ghosts.some((ghost) => ghost.state === state)) ?? 'not_applicable'
}

interface RoomFacts {
  readonly doors: readonly DoorPresentation[]
  readonly ghosts: readonly GhostPresentation[]
  /** True when an upstream state value was not one of the known ones. */
  readonly malformed: boolean
}

function roomFacts(room: RoomDefinition, input: UpstreamHouseInput): RoomFacts {
  let malformed = false
  const workflow = input.workflow
  const doors = room.workflowPhases.map((phase): DoorPresentation => {
    const view = workflow?.phases[PHASES.indexOf(phase)]
    const status: unknown = view?.door?.status
    if (view === undefined || !isDoorStatus(status)) {
      if (workflow !== null) malformed = true
      return {
        phase,
        phaseName: PHASE_NAMES[phase],
        state: 'unavailable',
        text: DOOR_UNAVAILABLE_TEXT,
        hint: DOOR_UNAVAILABLE_HINT,
        proposalId: null,
        phaseStatus: null,
        phaseText: null,
      }
    }
    const proposal = view.door.proposal
    return {
      phase,
      phaseName: PHASE_NAMES[phase],
      state: status,
      text: DOOR_STATUS_TEXT[status],
      hint: doorHint(phase, status),
      proposalId: status === 'waiting' && proposal !== null && proposal.status === 'pending' ? proposal.proposalId : null,
      phaseStatus: isPhaseStatus(view.status) ? view.status : null,
      phaseText: isPhaseStatus(view.status) ? `${PHASE_NAMES[phase]}: ${PHASE_STATUS_TEXT[view.status]}` : null,
    }
  })

  const here: GhostSnapshot[] = []
  for (const snapshot of input.ghosts.values()) {
    if (snapshot.ghost_id === HOUSE_OPERATOR_GHOST_ID) continue
    if (snapshot.mansion_id !== input.mansion.name) continue
    if (houseRoomOfGhost(snapshot.ghost_id, workflow) === room.id) here.push(snapshot)
  }
  const readable = here.filter((snapshot) => isGhostState(snapshot.state))
  const rows = new Map(ghostRows(readable, input.ghostNames).map((row) => [row.ghostId, row]))
  const ghosts = here.map((snapshot): GhostPresentation => {
    const row = rows.get(snapshot.ghost_id)
    if (row === undefined) {
      malformed = true
      return { ghostId: snapshot.ghost_id, name: oneLine(snapshot.ghost_id, MAX_NAME_CODE_POINTS), state: 'unavailable', reason: null, pendingText: null }
    }
    return {
      ghostId: row.ghostId,
      name: oneLine(row.name, MAX_NAME_CODE_POINTS) || 'Ghost',
      state: row.state,
      reason: row.reason,
      pendingText: row.pendingText,
    }
  })
  return { doors, ghosts, malformed }
}

const WAITING_KIND = { door: 'door-decision', risky: 'risky-decision', permission: 'tool-decision' } as const

/** Where a Crew tool prompt that names no room is shown: the hall every Mansion has. */
export const UNPLACED_ACTION_ROOM: RoomId = 'foyer'

/** The open decisions Spec 4 reports, placed in their rooms. The selection itself is Spec 4's. */
function waitingByRoom(input: UpstreamHouseInput): Map<RoomId, WaitingItemView[]> {
  const byRoom = new Map<RoomId, WaitingItemView[]>()
  for (const item of workflowNeedsYou(input.workflow, input.ghostNames)) {
    const roomId: RoomId = item.room ?? UNPLACED_ACTION_ROOM
    const list = byRoom.get(roomId) ?? []
    list.push({
      kind: WAITING_KIND[item.kind],
      id: item.id,
      ghostId: item.ghostId,
      label: oneLine(item.text, MAX_LABEL_CODE_POINTS),
      status: 'pending',
      actionAvailable: true,
    })
    byRoom.set(roomId, list)
  }
  return byRoom
}

/** Failed current runs of a joined room. A retry is "available" when the backend offers one. */
function recoveryActions(joined: JoinedRoomProjection | undefined): RecoveryActionView[] {
  if (joined === undefined) return []
  return joined.runs
    .filter((run) => run.state === 'failed')
    .map((run) => ({
      runId: run.runId,
      ghostId: run.ghostId,
      label: oneLine(`${oneLine(run.ghostName, MAX_NAME_CODE_POINTS) || 'A ghost'} failed. A fresh attempt can be started.`, MAX_LABEL_CODE_POINTS),
      available: run.retry !== null,
    }))
}

function replayIntegrity(integrity: ReplayIntegrity): ProjectionIntegrity {
  return integrity === 'valid' ? 'valid' : integrity === 'incompatible' ? 'incompatible' : 'uncertain'
}

function presentRoom(
  room: RoomDefinition,
  input: UpstreamHouseInput,
  options: HouseOptions,
  waiting: ReadonlyMap<RoomId, readonly WaitingItemView[]>,
): RoomPresentation {
  const facts = roomFacts(room, input)
  const joined = input.rooms.get(room.id)
  const readOnly = options.mode === 'replay' || input.authority.block === 'read_only'
  const locked = room.id === 'seance-room' && options.seanceRoom !== 'enabled'
  const usesWorkflow = room.workflowPhases.length > 0 || (room.id === 'seance-room' && !locked)

  let integrity: ProjectionIntegrity = 'valid'
  let reason: string | null = null
  if (room.id === 'foyer') {
    if (input.mansion.status !== 'ready') {
      integrity = 'uncertain'
      reason = MANSION_UNAVAILABLE_TEXT
    }
  } else if (room.id === 'attic') {
    integrity = replayIntegrity(input.replay.integrity)
    if (input.replay.integrity !== 'valid') reason = ATTIC_TEXT[input.replay.integrity]
  } else if (usesWorkflow) {
    if (input.authority.block !== null) integrity = AUTHORITY_INTEGRITY[input.authority.block]
    // Read on its own: a recording of a corrupt log is read-only and still corrupt.
    integrity = worseIntegrity(integrity, input.workflow === null ? 'uncertain' : input.workflow.integrity)
    if (joined !== undefined) {
      integrity = worseIntegrity(integrity, gateIntegrity(joined.gate, joined))
      integrity = worseIntegrity(integrity, joined.integrity)
    }
    // The upstream sentence when one exists; it already says exactly what is wrong.
    if (integrity !== 'valid') {
      reason =
        input.authority.block !== null && input.authority.block !== 'read_only'
          ? input.authority.text
          : joined !== undefined && joined.gate.block !== null && joined.gate.block !== 'read_only' && joined.gate.block !== 'authority'
            ? joined.gate.text
            : null
    }
  }
  // A state value no upstream contract defines, in any room: shown as unavailable, never guessed.
  if (facts.malformed) {
    integrity = worseIntegrity(integrity, 'incompatible')
    reason = INTEGRITY_TEXT.incompatible
  }

  // A room without any mutation of its own (Attic, a locked room) never enables one.
  const hasMutation = room.id !== 'attic' && !locked
  const upstreamAllows = !usesWorkflow || (input.authority.canDecide && (joined === undefined || joined.gate.allowed))
  const mutatingActionsEnabled = hasMutation && !readOnly && integrity === 'valid' && upstreamAllows

  const diagnostic =
    integrity !== 'valid'
      ? (reason ?? INTEGRITY_TEXT[integrity])
      : locked
        ? LOCKED_SEANCE_TEXT
        : readOnly
          ? READ_ONLY_TEXT
          : mutatingActionsEnabled || !hasMutation
            ? null
            : // Valid data, live, and still off: say what upstream said, or the plainest true thing.
              (input.authority.text ?? joined?.gate.text ?? INTEGRITY_TEXT.uncertain)

  return {
    roomId: room.id,
    name: room.name,
    phase: room.phase,
    door: headlineDoor(facts.doors),
    ghost: headlineGhost(facts.ghosts),
    doors: facts.doors,
    ghosts: facts.ghosts,
    integrity,
    mutatingActionsEnabled,
    readOnly,
    locked,
    diagnostic: diagnostic === null ? null : oneLine(diagnostic, MAX_DIAGNOSTIC_CODE_POINTS) || INTEGRITY_TEXT.uncertain,
    waitingItems: locked ? [] : (waiting.get(room.id) ?? []),
    recoveryActions: locked ? [] : recoveryActions(joined),
  }
}

/**
 * Builds what the house shows from the upstream projections. Total and pure:
 * the same inputs give the same projection, and no input is changed.
 */
export function buildHouseProjection(input: UpstreamHouseInput, options: HouseOptions): HouseProjection {
  const waiting = waitingByRoom(input)
  const rooms = visibleRooms(options.seanceRoom).map((room) => presentRoom(room, input, options, waiting))
  const firstProblem = input.replay.diagnostics[0]
  return {
    mansionName: oneLine(input.mansion.name, MAX_NAME_CODE_POINTS),
    mode: options.mode,
    rooms,
    needsYou: selectNeedsYouItems(rooms),
    decided: (input.workflow?.riskyProposals ?? []).flatMap((proposal): DecidedHold[] =>
      proposal.status === 'pending' || proposal.status === 'superseded'
        ? []
        : [{ proposalId: proposal.proposalId, ghostId: proposal.ghostId, outcome: proposal.status === 'rejected' ? 'refused' : 'released' }],
    ),
    replay: {
      integrity: input.replay.integrity,
      validRecordCount: Math.max(0, Math.trunc(input.replay.validRecordCount) || 0),
      diagnostic:
        firstProblem !== undefined
          ? oneLine(firstProblem.safeDetail, MAX_DIAGNOSTIC_CODE_POINTS)
          : input.replay.integrity === 'valid'
            ? null
            : ATTIC_TEXT[input.replay.integrity],
    },
  }
}

// ---------------------------------------------------------------------------
// Needs You.

/** `(kind, authoritative id)`: the identity one action is counted under. */
export function needsYouKey(item: { readonly kind: NeedsYouKind; readonly id: string }): string {
  return JSON.stringify([item.kind, item.id])
}

/**
 * Every action the Operator can take now: each open decision once and each
 * failed run the backend offers to retry once. Ambient state, resolved
 * decisions and a blocked or failed ghost with no action never appear. Order:
 * Room order, then the order upstream gave within a room (decisions before
 * recoveries). The input order of `rooms` does not matter.
 */
export function selectNeedsYouItems(rooms: readonly RoomPresentation[]): readonly NeedsYouItem[] {
  const ordered = rooms
    .filter((room) => isRoomId(room.roomId))
    .map((room, index) => ({ room, index }))
    .sort((left, right) => compareRooms(left.room.roomId, right.room.roomId) || left.index - right.index)
  const seen = new Set<string>()
  const items: NeedsYouItem[] = []
  const add = (item: NeedsYouItem) => {
    const key = needsYouKey(item)
    if (seen.has(key)) return
    seen.add(key)
    items.push(item)
  }
  for (const { room } of ordered) {
    for (const waiting of room.waitingItems) {
      if (waiting.status !== 'pending' || waiting.actionAvailable !== true) continue
      add({ id: waiting.id, kind: waiting.kind, roomId: room.roomId, ghostId: waiting.ghostId, label: waiting.label, actionAvailable: true })
    }
    for (const recovery of room.recoveryActions) {
      if (recovery.available !== true) continue
      add({
        id: recovery.runId,
        kind: 'failed-run-recovery',
        roomId: room.roomId,
        ghostId: recovery.ghostId,
        label: recovery.label,
        actionAvailable: true,
      })
    }
  }
  return items
}

/** The room the Needs You shortcut opens: the first item's room, or null when nothing needs the Operator. */
export function needsYouTarget(items: readonly NeedsYouItem[]): RoomId | null {
  return items[0]?.roomId ?? null
}

/** The shortcut's visible count text ("Nothing needs you", "2 things need you"). */
export function needsYouCountText(items: readonly NeedsYouItem[]): string {
  return needsYouText(items.length)
}

// ---------------------------------------------------------------------------
// Labels: one formatter for what is shown and what is read.

export interface StateField {
  readonly label: 'Phase' | 'Door' | 'Ghost'
  readonly value: string
}

type LabelledRoom = Pick<RoomPresentation, 'roomId' | 'name' | 'phase' | 'door' | 'ghost'>

/** The three state fields of a room in fixed order, with the exact state words. */
export function roomStateFields(room: Pick<RoomPresentation, 'phase' | 'door' | 'ghost'>): readonly StateField[] {
  return [
    { label: 'Phase', value: ROOM_PHASE_TEXT[room.phase] },
    { label: 'Door', value: stateWord(room.door) },
    { label: 'Ghost', value: stateWord(room.ghost) },
  ]
}

/**
 * The accessible name of a Room control:
 * `<Room name>. Phase: <phase>. Door: <state>. Ghost: <state>.`
 * Fixed copy only: no icon, color, diagnostic, or anything a ghost wrote.
 */
export function roomAccessibleName(room: LabelledRoom): string {
  const name = oneLine(room.name, MAX_NAME_CODE_POINTS).replace(/[.:]+$/u, '') || roomDefinition(room.roomId).name
  return `${name}. ${roomStateFields(room)
    .map((field) => `${field.label}: ${field.value}.`)
    .join(' ')}`
}

/** The accessible name of a Ghost control. */
export function ghostAccessibleName(room: Pick<RoomPresentation, 'name'>, ghost: GhostPresentation): string {
  return `${ghost.name}, ghost in the ${room.name}. State: ${stateWord(ghost.state)}.`
}

/** The accessible name of a Door control. */
export function doorAccessibleName(room: Pick<RoomPresentation, 'name'>, door: DoorPresentation): string {
  return `${door.phaseName} door of the ${room.name}. State: ${stateWord(door.state)}.`
}

// ---------------------------------------------------------------------------
// Surfaces: what a control opens. Opening one is never a decision.

export type HouseSurfaceTarget =
  | { readonly kind: 'room'; readonly roomId: RoomId }
  | { readonly kind: 'ghost'; readonly roomId: RoomId; readonly ghostId: string }
  | { readonly kind: 'door'; readonly roomId: RoomId; readonly phase: Phase; readonly proposalId: string | null }

export interface OpenSurface {
  readonly target: HouseSurfaceTarget
  /** Stable key of the control that opened it, to find that control again after a rerender. */
  readonly openerKey: string
}

/** The stable key of the control for a target. The same control keeps its key across rerenders. */
export function surfaceKey(target: HouseSurfaceTarget): string {
  switch (target.kind) {
    case 'room':
      return JSON.stringify(['room', target.roomId])
    case 'ghost':
      return JSON.stringify(['ghost', target.roomId, target.ghostId])
    case 'door':
      return JSON.stringify(['door', target.roomId, target.phase])
  }
}

/**
 * The surface still open after a new projection: itself while its room is
 * shown, else null (the panel closes and nothing in it can act on stale data).
 */
export function surfaceStillOpen(surface: OpenSurface | null, projection: HouseProjection): OpenSurface | null {
  if (surface === null) return null
  const room = projection.rooms.find((candidate) => candidate.roomId === surface.target.roomId)
  if (room === undefined) return null
  const target = surface.target
  if (target.kind === 'ghost' && !room.ghosts.some((ghost) => ghost.ghostId === target.ghostId)) return null
  if (target.kind === 'door' && !room.doors.some((door) => door.phase === target.phase)) return null
  return surface
}
