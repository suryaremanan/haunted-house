// The House Projection adapter (Spec 6 task 7.1; Requirements 2.1, 2.4, 9.1,
// 9.8). The one place the page subscribes to the upstream projections of an
// open Mansion and hands them to the pure `buildHouseProjection`:
//
// - Spec 2: canonical ghost snapshots and transitions (`seance-live`), which
//   hold only records the backend acknowledged;
// - Spec 4: the backend workflow projection and its authority (`workflow-live`);
// - Spec 5: the Room Ghosts answer joined per room (`room-ghosts-api`).
//
// It adds no state of its own. It folds nothing, decides nothing and keeps no
// Door or approval: every command still leaves through `authorizeCommand` and
// `authorizeRoomCommand` inside the two upstream adapters, and only for an
// explicit press. Navigation and open panels are not here at all; they are
// UI state of the Mansion Shell.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { GhostSnapshot, GhostTransition } from '../core/ghost-state'
import { diagnosticText } from '../core/ghost-status'
import {
  buildHouseProjection,
  houseRoomOfGhost,
  type HouseProjection,
  type UpstreamHouseInput,
  type UpstreamReplay,
} from '../core/house-projection'
import type { RoomId, SeanceRoomSetting } from '../core/house-registry'
import {
  deriveAuthority,
  ghostName,
  houseRooms,
  roomDetail,
  type Authority,
  type ProjectionStatus,
  type RoomDetail,
  type WorkflowCommand,
} from '../core/house-view'
import type { MansionDescriptor } from '../core/mansion-api'
import { parserDiagnostic } from '../core/replay-timeline'
import type { RoomGhosts } from '../core/room-projection'
import {
  deriveRoomGate,
  joinRoomProjection,
  reviewView,
  type ReviewView,
  type RoomCommand,
  type RoomGhostsStatus,
  type RoomProjection,
} from '../core/room-view'
import type { EventDiagnostic } from '../core/seance-event'
import type { WorkflowProjection } from '../core/workflow-projection'
import { useRoomGhosts } from './room-ghosts-api'
import { useSessionOpener } from './sdk'
import { useSeanceLiveControls } from './seance-live'
import { useWorkflow } from './workflow-live'

/**
 * What the live canonical log says about itself, in the shape the Attic and
 * the House Projection read. A live page holds every acknowledged record up
 * to `highestSequence`; a problem the log reports is passed on with fixed copy.
 */
export function liveReplayFacts(canonical: { readonly highestSequence: number; readonly diagnostic: EventDiagnostic | null }): UpstreamReplay {
  const problem = canonical.diagnostic
  if (problem === null) return { integrity: 'valid', validRecordCount: canonical.highestSequence, diagnostics: [] }
  const diagnostic = parserDiagnostic(problem)
  return {
    integrity: diagnostic.code === 'integrity_failed' ? 'incompatible' : 'diagnostic',
    validRecordCount: canonical.highestSequence,
    diagnostics: [diagnostic],
  }
}

/** The upstream values of one moment. Live adapters and a replayed prefix both produce this. */
export interface HouseSources {
  readonly mansion: MansionDescriptor
  readonly specName: string
  readonly workflow: WorkflowProjection | null
  readonly workflowStatus: ProjectionStatus
  readonly snapshots: ReadonlyMap<string, GhostSnapshot>
  readonly canonical: { readonly loaded: boolean; readonly catchingUp: boolean; readonly highestSequence: number; readonly diagnostic: EventDiagnostic | null }
  readonly roomGhosts: RoomGhosts | null
  readonly roomGhostsStatus: RoomGhostsStatus
  readonly replay: UpstreamReplay
  /** `commandTarget` of the Spec 4 command on its way, or null. */
  readonly workflowInFlight: string | null
  /** `roomCommandTarget` of the Spec 5 command on its way, or null. */
  readonly roomInFlight: string | null
  readonly ghostNames?: Readonly<Record<string, string>>
  /** True when the page shows a recording. */
  readonly readOnly: boolean
}

export interface ComposedHouse {
  readonly authority: Authority
  readonly input: UpstreamHouseInput
  /** Spec 4 detail of each workflow room, with decision and start controls already gated. */
  readonly details: ReadonlyMap<RoomId, RoomDetail>
  /** Spec 5 joined projection of each workflow room. */
  readonly outputs: ReadonlyMap<RoomId, RoomProjection>
}

/**
 * Runs the upstream derivations for every workflow room and returns the input
 * of `buildHouseProjection`. Pure: the same sources give the same result.
 */
export function composeHouse(sources: HouseSources): ComposedHouse {
  const names = sources.ghostNames
  const authority = deriveAuthority({
    projection: sources.workflow,
    projectionStatus: sources.workflowStatus,
    canonical: sources.canonical,
    readOnly: sources.readOnly,
  })
  // One command at a time across the house: a Spec 4 command on its way also holds the room's controls.
  const roomInFlight = sources.roomInFlight ?? (sources.workflowInFlight === null ? null : `workflow:${sources.workflowInFlight}`)
  const details = new Map<RoomId, RoomDetail>()
  const outputs = new Map<RoomId, RoomProjection>()
  for (const room of houseRooms(sources.workflow, sources.snapshots.values(), names)) {
    details.set(room.id, roomDetail(sources.workflow, room, authority, sources.workflowInFlight, names))
    outputs.set(
      room.id,
      joinRoomProjection({
        room,
        specName: sources.specName,
        projection: sources.workflow,
        snapshots: sources.snapshots,
        roomGhosts: sources.roomGhosts,
        roomGhostsStatus: sources.roomGhostsStatus,
        authority,
        inFlight: roomInFlight,
        names,
      }),
    )
  }
  return {
    authority,
    details,
    outputs,
    input: {
      mansion: sources.mansion,
      workflow: sources.workflow,
      authority,
      ghosts: sources.snapshots,
      rooms: outputs,
      replay: sources.replay,
      ghostNames: names,
    },
  }
}

/**
 * A replayed prefix that stands in for the live workflow and ghost data
 * (Spec 7: the house at the Attic's Cursor in the static replay). Null on a
 * live page.
 */
export interface ReplayedHouse {
  readonly workflow: WorkflowProjection
  readonly snapshots: ReadonlyMap<string, GhostSnapshot>
  readonly transitions: readonly GhostTransition[]
  readonly highestSequence: number
}

export interface UseHouseProjectionOptions {
  /** The open Mansion, as the Foyer's open call returned it. */
  readonly mansion: MansionDescriptor
  /** Display names by `ghost_id`. */
  readonly ghostNames?: Readonly<Record<string, string>>
  /** Build-time setting for the stretch Séance Room. */
  readonly seanceRoom: SeanceRoomSetting
  /** `replay`: the page shows a recording. */
  readonly mode: 'live' | 'replay'
  /** The replay facts the Attic shows. Defaults to what the live log says about itself. */
  readonly replay?: UpstreamReplay
  /** The replayed prefix to show instead of the live adapters' data, or null. */
  readonly replayed?: ReplayedHouse | null
  /** Receives the result of each command the Operator sent, for the page's one live region. */
  readonly onAnnounce: (message: string) => void
}

export interface HouseModel {
  readonly projection: HouseProjection
  readonly authority: Authority
  /** True until both the projection and the canonical log were read once. */
  readonly loading: boolean
  /** The Spec 2 diagnostic in plain words, or null. */
  readonly logProblem: string | null
  readonly details: ReadonlyMap<RoomId, RoomDetail>
  readonly outputs: ReadonlyMap<RoomId, RoomProjection>
  /** The stretch Séance Room review. Null unless the backend turned the Séance Room on and it reviewed. */
  readonly review: ReviewView | null
  /** The result of the last Spec 4 command, in plain words. */
  readonly notice: string | null
  /** The result of the last Room Ghosts command, in plain words. */
  readonly roomNotice: string | null
  /** The command on its way, of either kind, or null. */
  readonly inFlight: string | null
  /** Sends one explicit start or decision. The only way a Spec 4 command is sent. */
  readonly send: (command: WorkflowCommand) => void
  /** Sends one explicit Room Ghosts mutation: feedback, Workshop start, cancel or retry. */
  readonly sendRoom: (command: RoomCommand) => void
  /** Opens an existing Crew session by slot key. Null when the host offers no way to. */
  readonly openSession: ((slotKey: string) => void) | null
  /** The canonical ghost facts host effects are derived from. */
  readonly canonical: {
    readonly transitions: readonly GhostTransition[]
    readonly snapshots: ReadonlyMap<string, GhostSnapshot>
    readonly roomOf: (ghostId: string) => RoomId | null
    readonly nameOf: (ghostId: string) => string
  }
}

export function useHouseProjection(options: UseHouseProjectionOptions): HouseModel {
  const { mansion, ghostNames, seanceRoom, mode } = options
  const mansionId = mansion.name
  const specName = mansion.projectSpec
  const replayed = options.replayed ?? null

  const { state: seance, catchUp } = useSeanceLiveControls(mansionId)
  // After a command the backend appended records: have Spec 2 read them.
  const { state: ui, send: sendCommand, refresh: refreshWorkflow } = useWorkflow(mansionId, seance.highestSequence, catchUp)
  // After a Room Ghosts command both other sources may have moved: read them again.
  const afterRoomCommand = useCallback(() => {
    catchUp()
    void refreshWorkflow()
  }, [catchUp, refreshWorkflow])
  const room = useRoomGhosts(mansionId, specName, (replayed === null ? ui.projection : replayed.workflow)?.version ?? null, afterRoomCommand)
  const openSession = useSessionOpener()

  const workflow = replayed === null ? ui.projection : replayed.workflow
  const workflowStatus: ProjectionStatus = replayed === null ? ui.projectionStatus : 'ready'
  const snapshots = replayed === null ? seance.snapshots : replayed.snapshots
  const transitions = replayed === null ? seance.transitions : replayed.transitions
  const roomGhosts = room.state.roomGhosts
  const roomGhostsStatus: RoomGhostsStatus = room.state.status
  const highestSequence = replayed === null ? seance.highestSequence : replayed.highestSequence
  const readOnly = mode === 'replay'

  const canonical = useMemo(
    () => ({ loaded: replayed !== null || seance.loaded, catchingUp: replayed === null && seance.catchingUp, highestSequence, diagnostic: seance.diagnostic }),
    [replayed, seance.loaded, seance.catchingUp, seance.diagnostic, highestSequence],
  )
  const replay = useMemo(() => options.replay ?? liveReplayFacts(canonical), [options.replay, canonical])

  const composed = useMemo(
    () =>
      composeHouse({
        mansion,
        specName,
        workflow,
        workflowStatus,
        snapshots,
        canonical,
        roomGhosts,
        roomGhostsStatus,
        replay,
        workflowInFlight: ui.inFlight,
        roomInFlight: room.state.inFlight,
        ghostNames,
        readOnly,
      }),
    [mansion, specName, workflow, workflowStatus, snapshots, canonical, roomGhosts, roomGhostsStatus, replay, ui.inFlight, room.state.inFlight, ghostNames, readOnly],
  )
  const projection = useMemo(() => buildHouseProjection(composed.input, { seanceRoom, mode }), [composed.input, seanceRoom, mode])
  const authority = composed.authority

  // Room Ghosts mutations are offered only while the three sources agree.
  const roomGate = useMemo(
    () => deriveRoomGate({ projection: workflow, roomGhosts, roomGhostsStatus, authority }),
    [workflow, roomGhosts, roomGhostsStatus, authority],
  )
  const noteDisagreement = room.noteDisagreement
  useEffect(() => {
    if (replayed === null && roomGate.needsRefresh && ui.projection !== null) noteDisagreement(ui.projection.version)
  }, [replayed, roomGate.needsRefresh, ui.projection, room.state.roomGhosts, noteDisagreement])

  const review = useMemo(
    () => (seanceRoom === 'enabled' ? reviewView(roomGhosts, snapshots, ghostNames) : null),
    [seanceRoom, roomGhosts, snapshots, ghostNames],
  )

  // The result of a command is said once, through the page's one live region.
  const announceRef = useRef(options.onAnnounce)
  announceRef.current = options.onAnnounce
  useEffect(() => {
    if (ui.notice !== null) announceRef.current(ui.notice)
  }, [ui.notice])
  useEffect(() => {
    if (room.state.notice !== null) announceRef.current(room.state.notice)
  }, [room.state.notice])

  const sendRoomCommand = room.send
  const roomContext = useRef({ projection: ui.projection, gate: roomGate, workflowBusy: ui.inFlight !== null })
  roomContext.current = { projection: ui.projection, gate: roomGate, workflowBusy: ui.inFlight !== null }
  const sendRoom = useCallback(
    (command: RoomCommand) => {
      void sendRoomCommand(command, roomContext.current)
    },
    [sendRoomCommand],
  )

  const authorityRef = useRef(authority)
  authorityRef.current = authority
  const send = useCallback(
    (command: WorkflowCommand) => {
      void sendCommand(command, authorityRef.current)
    },
    [sendCommand],
  )

  const roomOf = useCallback((ghostId: string) => houseRoomOfGhost(ghostId, workflow), [workflow])
  const nameOf = useCallback((ghostId: string) => ghostName(ghostId, ghostNames), [ghostNames])
  const facts = useMemo(() => ({ transitions, snapshots, roomOf, nameOf }), [transitions, snapshots, roomOf, nameOf])

  return {
    projection,
    authority,
    loading: replayed === null && (ui.projectionStatus === 'loading' || (!seance.loaded && seance.diagnostic === null)),
    logProblem: seance.diagnostic === null ? null : diagnosticText(seance.diagnostic),
    details: composed.details,
    outputs: composed.outputs,
    review,
    notice: ui.notice,
    roomNotice: room.state.notice,
    inFlight: ui.inFlight ?? room.state.inFlight,
    send,
    sendRoom,
    openSession,
    canonical: facts,
  }
}
