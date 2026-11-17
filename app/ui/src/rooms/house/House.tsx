// The house of one open Mansion: the House Projection adapter joined to the
// Mansion Shell (Spec 6 tasks 6 and 7.1). This file only connects: it reads
// the upstream projections through `useHouseProjection`, hands the projection
// to the shell, and fills each open surface with the approved room module and
// that module's exact upstream callbacks. It keeps no room, Door, ghost or
// approval state, and every decision is an explicit press inside a panel.
import { Lock, RefreshCw, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAtticReplay } from '../../adapters/attic-replay'
import { useHouseProjection } from '../../adapters/house-projection'
import type { ReplayScheduler } from '../../adapters/replay-controller'
import { MansionShell, type MansionShellProps, type SurfaceApi } from '../../components/MansionShell'
import type { PanelMode } from '../../components/RoomPanelHost'
import { ROOM_OUTPUT_STYLES } from '../../components/room-output-styles'
import { builtView, type BuiltInput } from '../../core/house-built'
import type { OpenSurface } from '../../core/house-projection'
import type { SeanceRoomSetting } from '../../core/house-registry'
import type { MansionDescriptor } from '../../core/mansion-api'
import { AtticPanel } from '../attic/AtticPanel'
import { ReplayBar } from '../attic/ReplayBar'
import { useAtticPanel } from '../attic/use-attic-panel'
import { DraftingHousePanel } from '../drafting-room/DraftingHousePanel'
import { ActiveMansionFoyerPanel } from '../foyer/ActiveMansionFoyerPanel'
import { LockedSeancePanel } from '../seance-room/LockedSeancePanel'
import { SeanceHousePanel } from '../seance-room/SeanceHousePanel'
import { StudyHousePanel } from '../study/StudyHousePanel'
import { WorkshopHousePanel } from '../workshop/WorkshopHousePanel'
import { DoorSurface } from './DoorSurface'
import { GhostSurface } from './GhostSurface'
import { HOUSE_PANEL_STYLES } from './panel-styles'

/**
 * The build-time setting of the stretch Séance Room: shown locked, with plain
 * words, and nothing to operate. `enabled` is the stretch build.
 */
export const HOUSE_SEANCE_ROOM: SeanceRoomSetting = 'locked'

export const REPLAY_START_TEXT = 'The recording is paused at its start. Press Play to watch the house fill, or open the Attic to step through it.'

/** The bar's sentence while the house has not yet said why decisions are off. */
export const READ_ONLY_BAR_TEXT = 'This is a recording. Nothing can be started, approved or rejected here.'

const PANEL_STYLES = HOUSE_PANEL_STYLES + ROOM_OUTPUT_STYLES

export interface HouseProps {
  /** The open Mansion, as the Foyer's open call returned it. */
  mansion: MansionDescriptor
  /** The Foyer's return action. */
  onReturn: () => void
  /** The latest result the page announced before or outside the house (a Mansion opened). */
  announcement?: string
  /** The foundation status details, for the toolbar's disclosure. */
  status?: ReactNode
  /** Display names by `ghost_id`. A ghost without one is named after its id. */
  ghostNames?: Readonly<Record<string, string>>
  seanceRoom?: SeanceRoomSetting
  panelMode?: PanelMode
  /** Steps the Attic's playback. For tests; the page uses timeouts. */
  replayScheduler?: ReplayScheduler
  /** Milliseconds clock for the interruption window. Defaults to Date.now. */
  now?: () => number
  /** The guide's settings, held by the page so they last for the visit and not for one Mansion. */
  guide?: MansionShellProps['guide']
}

export function House({
  mansion,
  onReturn,
  announcement = '',
  status,
  ghostNames,
  seanceRoom = HOUSE_SEANCE_ROOM,
  panelMode,
  replayScheduler,
  now,
  guide,
}: HouseProps) {
  // The latest thing the Operator asked for and got an answer to. The shell says it once.
  const [message, setMessage] = useState(announcement)
  useEffect(() => setMessage(announcement), [announcement])
  const announce = useCallback((text: string) => setMessage(text), [])

  // The Attic's replay is held here, once, so playback goes on while the Attic room is closed.
  // In the static replay build it also supplies the house at its Cursor; inside Crew the house stays live.
  const attic = useAtticReplay(mansion.name, replayScheduler)
  const mode = attic.mode
  const house = useHouseProjection({ mansion, ghostNames, seanceRoom, mode, replay: attic.upstream, replayed: attic.house, onAnnounce: announce })
  const { projection } = house
  // The replay bar is a second view of the same replay. In the static replay it,
  // not the Attic room, says when playback ends or a command is refused.
  const bar = useAtticPanel(attic, announce, { watch: mode === 'replay', refresh: false })

  const host = useMemo(
    () => ({
      mansionId: mansion.name,
      // A recording being played back interrupts nobody.
      active: mode === 'live',
      transitions: house.canonical.transitions,
      snapshots: house.canonical.snapshots,
      roomOf: house.canonical.roomOf,
      nameOf: house.canonical.nameOf,
      now,
    }),
    [mansion.name, mode, house.canonical, now],
  )

  // What was made, for the Foyer's sheet: the rooms' documents and the Workshop's task rows, as the house holds them.
  const builtInput: BuiltInput = useMemo(
    () => ({
      documents: Array.from(house.outputs.values()).flatMap((room) => room.documents.map((document) => ({ phase: document.phase, path: document.documentPath }))),
      tasks: (house.outputs.get('workshop')?.taskBoard?.waves ?? []).flatMap((wave) =>
        wave.tasks.map((task) => ({ taskId: task.taskId, title: task.title, complete: task.complete, writes: task.writes })),
      ),
      folder: mansion.displayPath,
    }),
    [house.outputs, mansion.displayPath],
  )

  const renderSurface = (surface: OpenSurface, api: SurfaceApi): ReactNode => {
    const target = surface.target
    const room = projection.rooms.find((candidate) => candidate.roomId === target.roomId)
    if (room === undefined) return null
    const detail = house.details.get(room.roomId) ?? null
    const output = house.outputs.get(room.roomId) ?? null
    if (target.kind === 'ghost') {
      const ghost = room.ghosts.find((candidate) => candidate.ghostId === target.ghostId)
      return ghost === undefined ? null : <GhostSurface room={room} ghost={ghost} onOpenRoom={api.openNested} />
    }
    if (target.kind === 'door') {
      const door = room.doors.find((candidate) => candidate.phase === target.phase)
      if (door === undefined) return null
      const decision = detail?.phases.find((phase) => phase.line.phase === target.phase)?.door ?? null
      return <DoorSurface room={room} door={door} decision={decision} onSend={house.send} onOpenRoom={api.openNested} />
    }
    const panel = { room, detail, output, onSend: house.send, onRoomSend: house.sendRoom, onOpenSession: house.openSession }
    switch (room.roomId) {
      case 'foyer':
        return <ActiveMansionFoyerPanel room={room} mansion={mansion} onReturn={onReturn} built={builtView(projection, builtInput)} />
      case 'study':
        return <StudyHousePanel {...panel} />
      case 'drafting-room':
        return <DraftingHousePanel {...panel} />
      case 'workshop':
        return <WorkshopHousePanel {...panel} />
      case 'attic':
        return (
          <>
            {/* A plain recording is already said in the Attic's own note and the replay bar. */}
            {room.diagnostic === null || (room.readOnly && room.integrity === 'valid') ? null : (
              <p className="hh-ui-note" data-kind="diagnostic" data-attic-diagnostic>
                <TriangleAlert size={16} aria-hidden />
                <span>{room.diagnostic}</span>
              </p>
            )}
            <AtticPanel replay={attic} onAnnounce={announce} motion={api.stillHouse ? 'none' : 'low-frequency'} watch={mode !== 'replay'} />
          </>
        )
      case 'seance-room':
        return room.locked ? <LockedSeancePanel /> : <SeanceHousePanel room={room} review={house.review} onOpenSession={house.openSession} />
    }
  }

  const notes = (
    <div className="hh-ui-notes">
      {house.loading ? (
        <p className="hh-ui-note" data-kind="loading" data-house-loading>
          <RefreshCw size={16} aria-hidden />
          <span>Loading the house…</span>
        </p>
      ) : null}
      {house.logProblem === null ? null : (
        <p className="hh-ui-note" data-kind="diagnostic" data-log-problem>
          <TriangleAlert size={16} aria-hidden />
          <span>{house.logProblem}</span>
        </p>
      )}
      {house.authority.text === null || house.authority.block === 'loading' || (mode === 'replay' && house.authority.block === 'read_only') ? null : (
        <p className="hh-ui-note" data-kind={house.authority.block === 'read_only' ? 'read-only' : 'diagnostic'} data-block={house.authority.block}>
          <Lock size={16} aria-hidden />
          <span>{house.authority.text}</span>
        </p>
      )}
      {house.notice === null ? null : (
        <p className="hh-ui-note" data-kind="notice" data-house-notice>
          <span>{house.notice}</span>
        </p>
      )}
      {house.roomNotice === null ? null : (
        <p className="hh-ui-note" data-kind="notice" data-room-notice>
          <span>{house.roomNotice}</span>
        </p>
      )}
    </div>
  )

  return (
    <MansionShell
      projection={projection}
      renderSurface={renderSurface}
      host={host}
      message={message}
      status={status}
      notes={notes}
      banner={
        mode === 'replay' ? (
          <ReplayBar
            panel={bar}
            readOnlyText={house.authority.block === 'read_only' && house.authority.text !== null ? house.authority.text : READ_ONLY_BAR_TEXT}
            startText={attic.state.cursor === 0 ? REPLAY_START_TEXT : null}
          />
        ) : undefined
      }
      busy={house.loading}
      onReturn={onReturn}
      panelMode={panelMode}
      inFlight={house.inFlight}
      panelStyles={PANEL_STYLES}
      guide={guide}
    />
  )
}
