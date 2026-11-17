// One room of the House Map (Spec 6 task 5.1): a list item holding the room's
// own control and one separate control for each ghost and each Door that
// lives there. Every control is a native button, none sits inside another,
// and all stay in the ordinary Tab order. The drawings are decoration; each
// state is also written out in its exact words.
//
// Viewing is not deciding: a control here only asks the shell to open a
// surface. Nothing in this file can approve, start or send anything.
import { Bell, CircleDashed, Lock, TriangleAlert } from 'lucide-react'
import { useId } from 'react'
import {
  doorAccessibleName,
  ghostAccessibleName,
  roomAccessibleName,
  roomStateFields,
  surfaceKey,
  type HouseSurfaceTarget,
  type RoomPresentation,
} from '../core/house-projection'
import { needsYouText } from '../core/house-view'
import { stateWord, type ArrowDirection, type RoomId } from '../core/house-registry'
import { DoorArt, GhostArt, ghostVariantOf } from './house-art'
import { RoomDiorama } from './RoomDiorama'

export interface RoomHotspotsProps {
  room: RoomPresentation
  /** Unresolved Operator actions in this room. */
  needsYou: number
  /** Stable key of the open surface, or null. Marks the control that opened it as expanded. */
  openKey: string | null
  /** The id of the panel, for `aria-controls`. */
  panelId: string
  onOpen: (target: HouseSurfaceTarget, opener: HTMLElement) => void
  /** An arrow key was pressed on the Room control. */
  onArrow: (room: RoomId, direction: ArrowDirection | 'Home' | 'End') => void
}

const ARROWS: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'])

export function RoomHotspots({ room, needsYou, openKey, panelId, onOpen, onArrow }: RoomHotspotsProps) {
  const needsId = useId()
  const reasonId = useId()
  const roomTarget: HouseSurfaceTarget = { kind: 'room', roomId: room.roomId }
  const roomKey = surfaceKey(roomTarget)
  const describedBy = [needsYou > 0 ? needsId : null, room.diagnostic !== null ? reasonId : null].filter((id) => id !== null).join(' ')
  const [phase, door, ghost] = roomStateFields(room)
  // A recording says it is read-only once, in the house's replay banner. The
  // room keeps the same words for assistive technology, tied to its control.
  const quietReason = room.readOnly && !room.locked && room.integrity === 'valid'
  return (
    <li
      className="hh-ui-room-cell"
      data-room={room.roomId}
      data-integrity={room.integrity}
      data-locked={room.locked}
      data-read-only={room.readOnly}
      data-needs={needsYou > 0}
    >
      <div className="hh-ui-room-controls">
        <button
          type="button"
          className="hh-ui-room-control"
          data-room-control={room.roomId}
          data-opener-key={roomKey}
          aria-label={roomAccessibleName(room)}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          aria-disabled={room.locked ? true : undefined}
          aria-expanded={openKey === roomKey}
          aria-controls={openKey === roomKey ? panelId : undefined}
          onClick={(event) => onOpen(roomTarget, event.currentTarget)}
          onKeyDown={(event) => {
            if (!ARROWS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return
            event.preventDefault()
            onArrow(room.roomId, event.key as ArrowDirection | 'Home' | 'End')
          }}
        >
          <span className="hh-ui-room-name">
            {room.locked ? <Lock size={16} aria-hidden /> : null} {room.name}
          </span>
          <span className="hh-ui-state" data-field="phase">
            <CircleDashed size={16} aria-hidden />
            <span>
              {phase.label}: <span className="hh-ui-state-word">{phase.value}</span>
            </span>
          </span>
          <span className="hh-ui-state" data-field="door" data-door={room.door}>
            <DoorArt state={room.door} size={18} />
            <span>
              {door.label}: <span className="hh-ui-state-word">{door.value}</span>
            </span>
          </span>
          <span className="hh-ui-state" data-field="ghost" data-ghost={room.ghost}>
            <GhostArt state={room.ghost} size={22} />
            <span>
              {ghost.label}: <span className="hh-ui-state-word">{ghost.value}</span>
            </span>
          </span>
        </button>
        {room.ghosts.length === 0 ? null : (
          <div className="hh-ui-ghosts">
            {room.ghosts.map((item) => {
              const target: HouseSurfaceTarget = {
                kind: 'ghost',
                roomId: room.roomId,
                ghostId: item.ghostId,
              }
              const key = surfaceKey(target)
              return (
                <button
                  key={item.ghostId}
                  type="button"
                  className="hh-ui-ghost-control"
                  data-ghost-control={item.ghostId}
                  data-ghost={item.state}
                  data-opener-key={key}
                  aria-label={ghostAccessibleName(room, item)}
                  aria-expanded={openKey === key}
                  aria-controls={openKey === key ? panelId : undefined}
                  onClick={(event) => onOpen(target, event.currentTarget)}
                >
                  <GhostArt state={item.state} variant={ghostVariantOf(item.ghostId)} size={56} />
                  <span className="hh-ui-state">
                    <span>
                      <span className="hh-ui-ghost-name">{item.name}:</span>{' '}
                      <span className="hh-ui-state-word">{stateWord(item.state)}</span>
                      {item.pendingText === null ? null : `, ${item.pendingText}`}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {room.doors.length === 0 ? null : (
          <div className="hh-ui-doors">
            {room.doors.map((item) => {
              const target: HouseSurfaceTarget = {
                kind: 'door',
                roomId: room.roomId,
                phase: item.phase,
                proposalId: item.proposalId,
              }
              const key = surfaceKey(target)
              return (
                <button
                  key={item.phase}
                  type="button"
                  className="hh-ui-door-control"
                  data-door-control={item.phase}
                  data-phase={item.phase}
                  data-status={item.phaseStatus ?? 'unavailable'}
                  data-door={item.state}
                  data-opener-key={key}
                  aria-label={doorAccessibleName(room, item)}
                  aria-expanded={openKey === key}
                  aria-controls={openKey === key ? panelId : undefined}
                  onClick={(event) => onOpen(target, event.currentTarget)}
                >
                  <DoorArt state={item.state} />
                  <span className="hh-ui-state">
                    <span>
                      {item.phaseName} door: <span className="hh-ui-state-word">{stateWord(item.state)}</span>
                      <span className="hh-ui-door-words"> {item.text}</span>
                      {item.phaseText === null ? null : <span className="hh-ui-door-words"> {item.phaseText}</span>}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {needsYou > 0 ? (
          <p className="hh-ui-state hh-ui-room-needs" id={needsId}>
            <Bell size={16} aria-hidden />
            <span className="hh-ui-state-word">{needsYouText(needsYou)}</span>
          </p>
        ) : null}
        {room.diagnostic === null ? null : (
          <p
            className={quietReason ? 'hh-ui-reason hh-ui-state hh-ui-visually-hidden' : 'hh-ui-reason hh-ui-state'}
            id={reasonId}
            data-room-reason={room.locked ? 'locked' : room.readOnly ? 'read-only' : 'diagnostic'}
          >
            {room.locked || room.readOnly ? <Lock size={16} aria-hidden /> : <TriangleAlert size={16} aria-hidden />}
            <span>{room.diagnostic}</span>
          </p>
        )}
      </div>
      <div className="hh-ui-room-scene">
        <RoomDiorama room={room} interactive />
      </div>
    </li>
  )
}
