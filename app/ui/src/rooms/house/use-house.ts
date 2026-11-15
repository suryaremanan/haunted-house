// State and handlers of the house for one Mansion (Spec 4 task 14.3). It joins
// the backend WorkflowProjection with Spec 2 ghost state, derives authority,
// and wires the page's one live region, the Needs You badge and toasts.
// All logic lives here and in core/; the components only render.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useHouseInterruptions } from '../../adapters/house-interruptions'
import { useRoomGhosts } from '../../adapters/room-ghosts-api'
import { useSessionOpener } from '../../adapters/sdk'
import { useSeanceLiveControls } from '../../adapters/seance-live'
import { useWorkflow } from '../../adapters/workflow-live'
import type { GhostTransitionId } from '../../core/ghost-state'
import { diagnosticText, interruptionsFor } from '../../core/ghost-status'
import type { HouseUiState } from '../../core/house-reducer'
import {
  deriveAuthority,
  houseRooms,
  needsYou,
  needsYouText,
  roomDetail,
  waitingAnnouncement,
  type Authority,
  type NeedsYouItem,
  type RoomDetail,
  type RoomId,
  type RoomView,
  type WorkflowCommand,
} from '../../core/house-view'
import { deriveRoomGate, joinRoomProjection, reviewView, type ReviewView, type RoomCommand, type RoomProjection } from '../../core/room-view'

export interface UseHouseOptions {
  /** The open Mansion. */
  readonly mansionId: string
  /** The Project_Spec of the Mansion. Defaults to the Mansion's own name, which is what a Mansion is created with. */
  readonly specName?: string
  /** Display names by `ghost_id`. */
  readonly ghostNames?: Readonly<Record<string, string>>
  /** Receives each announcement for the page's one polite live region. */
  readonly onAnnounce: (message: string) => void
}

export interface HouseModel {
  readonly ui: HouseUiState
  readonly authority: Authority
  readonly rooms: readonly RoomView[]
  /** The open room with its gated controls, or null when only the map shows. */
  readonly open: RoomDetail | null
  readonly needsYou: readonly NeedsYouItem[]
  readonly needsYouText: string
  /** True until both the projection and the canonical log were read once. */
  readonly loading: boolean
  /** The Spec 2 diagnostic in plain words, or null. */
  readonly logProblem: string | null
  readonly focusRoom: (room: RoomId) => void
  readonly moveRoom: (direction: 'next' | 'previous' | 'first' | 'last') => void
  readonly openRoom: (room: RoomId) => void
  readonly closeRoom: () => void
  /** Sends one explicit start or decision. The only way anything is sent. */
  readonly send: (command: WorkflowCommand) => void
  /** Opens the room of the first thing that needs the Operator. */
  readonly jumpToNeedsYou: () => void
  /** The joined Room_Projection of the open room (Spec 5), or null when only the map shows. */
  readonly output: RoomProjection | null
  /** The stretch Séance Room review. Null unless the backend turned the Séance Room on and it reviewed. */
  readonly review: ReviewView | null
  /** The result of the last Room Ghosts command, in plain words. */
  readonly roomNotice: string | null
  /** The command on its way, of either kind, or null. */
  readonly inFlight: string | null
  /** Sends one explicit Room Ghosts mutation: feedback, Workshop start, cancel or retry. */
  readonly sendRoom: (command: RoomCommand) => void
  /** Opens an existing Crew session by slot key. Null when the host offers no way to. */
  readonly openSession: ((slotKey: string) => void) | null
}

export function useHouse({ mansionId, specName, ghostNames, onAnnounce }: UseHouseOptions): HouseModel {
  const { state: seance, catchUp } = useSeanceLiveControls(mansionId)
  // After a command the backend appended records: have Spec 2 read them.
  const { state: ui, dispatch, send: sendCommand, refresh: refreshWorkflow } = useWorkflow(mansionId, seance.highestSequence, catchUp)
  // After a Room Ghosts command both other sources may have moved: read them again.
  const afterRoomCommand = useCallback(() => {
    catchUp()
    void refreshWorkflow()
  }, [catchUp, refreshWorkflow])
  const room = useRoomGhosts(mansionId, specName ?? mansionId, ui.projection?.version ?? null, afterRoomCommand)
  const openSession = useSessionOpener()

  const authority = useMemo(
    () =>
      deriveAuthority({
        projection: ui.projection,
        projectionStatus: ui.projectionStatus,
        canonical: seance,
      }),
    [ui.projection, ui.projectionStatus, seance],
  )
  const rooms = useMemo(
    () => houseRooms(ui.projection, seance.snapshots.values(), ghostNames),
    [ui.projection, seance.snapshots, ghostNames],
  )
  const waiting = useMemo(() => needsYou(ui.projection, ghostNames), [ui.projection, ghostNames])
  const open = useMemo(() => {
    const room = rooms.find((candidate) => candidate.id === ui.openRoom)
    return room === undefined ? null : roomDetail(ui.projection, room, authority, ui.inFlight, ghostNames)
  }, [rooms, ui.openRoom, ui.projection, ui.inFlight, authority, ghostNames])

  // Room Ghosts mutations are offered only while the three sources agree.
  const roomGate = useMemo(
    () => deriveRoomGate({ projection: ui.projection, roomGhosts: room.state.roomGhosts, roomGhostsStatus: room.state.status, authority }),
    [ui.projection, room.state.roomGhosts, room.state.status, authority],
  )
  const noteDisagreement = room.noteDisagreement
  useEffect(() => {
    if (roomGate.needsRefresh && ui.projection !== null) noteDisagreement(ui.projection.version)
  }, [roomGate.needsRefresh, ui.projection, room.state.roomGhosts, noteDisagreement])
  // One command at a time across the house: a Spec 4 command on its way also holds the room's controls.
  const roomInFlight = room.state.inFlight ?? (ui.inFlight === null ? null : `workflow:${ui.inFlight}`)
  const output = useMemo(() => {
    const view = rooms.find((candidate) => candidate.id === ui.openRoom)
    if (view === undefined) return null
    return joinRoomProjection({
      room: view,
      specName: specName ?? mansionId,
      projection: ui.projection,
      snapshots: seance.snapshots,
      roomGhosts: room.state.roomGhosts,
      roomGhostsStatus: room.state.status,
      authority,
      inFlight: roomInFlight,
      names: ghostNames,
    })
  }, [rooms, ui.openRoom, ui.projection, seance.snapshots, room.state.roomGhosts, room.state.status, authority, roomInFlight, ghostNames, specName, mansionId])
  const review = useMemo(
    () => reviewView(room.state.roomGhosts, seance.snapshots, ghostNames),
    [room.state.roomGhosts, seance.snapshots, ghostNames],
  )

  useHouseInterruptions({
    mansionId,
    transitions: seance.transitions,
    snapshots: seance.snapshots,
    items: waiting,
    names: ghostNames,
  })

  // One polite announcement per pass: ghosts that newly wait, are blocked or
  // failed, and proposals that newly need a decision. Each fact is said once.
  const announceRef = useRef(onAnnounce)
  announceRef.current = onAnnounce
  const namesRef = useRef(ghostNames)
  namesRef.current = ghostNames
  const announcedTransitions = useRef(new Set<GhostTransitionId>())
  const announcedItems = useRef(new Set<string>())
  useEffect(() => {
    const ghosts = interruptionsFor(seance.transitions, seance.snapshots.values(), announcedTransitions.current, namesRef.current)
    for (const id of ghosts.seen) announcedTransitions.current.add(id)
    const proposals = waitingAnnouncement(waiting, announcedItems.current)
    for (const id of proposals.seen) announcedItems.current.add(id)
    const message = [proposals.message, ghosts.message].filter((part) => part !== null).join(' ')
    if (message !== '') announceRef.current(message)
  }, [seance.transitions, seance.snapshots, waiting])

  // The result of a command is said once, through the same region.
  useEffect(() => {
    if (ui.notice !== null) announceRef.current(ui.notice)
  }, [ui.notice])

  // So is the result of a Room Ghosts command.
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
  const focusRoom = useCallback((room: RoomId) => dispatch({ type: 'room_focused', room }), [dispatch])
  const moveRoom = useCallback(
    (direction: 'next' | 'previous' | 'first' | 'last') => dispatch({ type: 'room_moved', direction }),
    [dispatch],
  )
  const openRoom = useCallback((room: RoomId) => dispatch({ type: 'room_opened', room }), [dispatch])
  const closeRoom = useCallback(() => dispatch({ type: 'room_closed' }), [dispatch])
  const waitingRef = useRef(waiting)
  waitingRef.current = waiting
  const jumpToNeedsYou = useCallback(() => {
    const first = waitingRef.current.find((item) => item.room !== null)
    if (first?.room != null) dispatch({ type: 'room_opened', room: first.room })
  }, [dispatch])

  return {
    ui,
    authority,
    rooms,
    open,
    needsYou: waiting,
    needsYouText: needsYouText(waiting.length),
    loading: ui.projectionStatus === 'loading' || (!seance.loaded && seance.diagnostic === null),
    logProblem: seance.diagnostic === null ? null : diagnosticText(seance.diagnostic),
    focusRoom,
    moveRoom,
    openRoom,
    closeRoom,
    send,
    jumpToNeedsYou,
    output,
    review,
    roomNotice: room.state.notice,
    inFlight: ui.inFlight ?? room.state.inFlight,
    sendRoom,
    openSession,
  }
}
