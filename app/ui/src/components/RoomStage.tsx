// The room the Operator stands in (the walk-in view): one painted room fills
// the stage from edge to edge, a desk runs across the front, and the
// Caretaker waits in the corner with a speech balloon that says what is
// going on and lists what can be done next.
//
// Everything painted is decoration. A pointer may press a ghost, a door or a
// thing on the desk as a shortcut; each press is forwarded to the one real
// control for that thing elsewhere on the page. Keyboard and assistive
// technology use the balloon's choices, which are ordinary buttons, and the
// map of the whole house. Nothing here decides anything.
import { ArrowLeft, ArrowRight, BookOpen, LogOut, Map as MapIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { guideFor } from '../core/house-guide'
import type { HouseProjection, HouseSurfaceTarget } from '../core/house-projection'
import { stateWord, type RoomId } from '../core/house-registry'
import { pressMapControl } from './RoomDiorama'
import { CaretakerArt, DeskPainting, RoomPainting, SpectreArt, spectreRoleOf } from './room-paint'

export interface RoomStageProps {
  projection: HouseProjection
  roomId: RoomId
  /** True while a surface of this room is open over the stage. */
  open?: boolean
  /** Leaves the Mansion for the Foyer. Omitted on a page that cannot. */
  onReturn?: () => void
  /** Whether the map of the whole house is laid over the room. */
  mapOpen?: boolean
  /** Lays the map over the room, or puts it away. */
  onToggleMap?: () => void
}

export const GUIDE_HINT = 'To open something, press it. Or choose:'

/** Presses the first control matching `selector` in the same house. */
function pressControl(from: Element, selector: string): void {
  from.closest('.hh-ui')?.querySelector<HTMLElement>(selector)?.click()
}

/** Where a pressable part of the painting sits, in percent of the stage. */
function place(left: number, top: number, width: number, height: number): CSSProperties {
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }
}

const LEFT_DOOR = place(2.5, 28, 8.5, 53)
const RIGHT_DOOR = place(89, 28, 8.5, 53)
const BACK_DOOR = place(69.7, 28, 12.3, 41.5)
const LEDGER = place(15.8, 84.5, 23.4, 11.5)
const BELL = place(46.5, 82.5, 9.4, 11)

export function RoomStage({ projection, roomId, open = false, onReturn, mapOpen = false, onToggleMap }: RoomStageProps) {
  const room = projection.rooms.find((candidate) => candidate.roomId === roomId)
  const guide = guideFor(projection, roomId)
  if (room === undefined || guide === null) return null
  const lit = room.ghosts.some((ghost) => ghost.state === 'working' || ghost.state === 'waiting')
  const [firstDoor, secondDoor] = room.doors
  const toRoom = (target: RoomId): HouseSurfaceTarget => ({ kind: 'room', roomId: target })

  const option = (key: string, icon: ReactNode, text: string, onPress: (from: HTMLElement) => void) => (
    <li key={key}>
      <button type="button" className="hh-stage-option" data-guide-option={key} onClick={(event) => onPress(event.currentTarget)}>
        <span className="hh-stage-bullet" aria-hidden="true">
          {icon}
        </span>
        <span>{text}</span>
      </button>
    </li>
  )
  const spot = (key: string, label: string, where: CSSProperties, onPress: (from: HTMLElement) => void) => (
    <span key={key} className="hh-stage-spot" data-spot={key} data-label={label} style={where} onClick={(event) => onPress(event.currentTarget)} />
  )

  return (
    <div className="hh-stage-room" data-stage-room={roomId} data-open={open}>
      <h3 className="hh-stage-room-title" data-stage-title>
        You are in the {room.name}
      </h3>
      <div className="hh-stage-room-scene">
        <RoomPainting
          room={roomId}
          door={firstDoor === undefined ? null : firstDoor.state}
          secondDoor={secondDoor === undefined ? null : secondDoor.state}
          lit={lit}
          hasPrevious={guide.previous !== null}
          hasNext={guide.next !== null}
        />
        <div className="hh-stage-spots" aria-hidden="true">
          {guide.previous === null ? null : spot('previous', `To the ${guide.previous.name}`, LEFT_DOOR, (from) => pressMapControl(from, toRoom(guide.previous!.roomId)))}
          {firstDoor !== undefined
            ? spot('door', `${firstDoor.phaseName} door: ${stateWord(firstDoor.state)}`, RIGHT_DOOR, (from) =>
                pressMapControl(from, { kind: 'door', roomId, phase: firstDoor.phase, proposalId: firstDoor.proposalId }),
              )
            : guide.next === null
              ? null
              : spot('next', `To the ${guide.next.name}`, RIGHT_DOOR, (from) => pressMapControl(from, toRoom(guide.next!.roomId)))}
          {secondDoor === undefined
            ? null
            : spot('door-2', `${secondDoor.phaseName} door: ${stateWord(secondDoor.state)}`, BACK_DOOR, (from) =>
                pressMapControl(from, { kind: 'door', roomId, phase: secondDoor.phase, proposalId: secondDoor.proposalId }),
              )}
          {room.ghosts.map((ghost, index) => (
            <span
              key={ghost.ghostId}
              className="hh-stage-figure"
              data-ghost={ghost.state}
              data-label={`${ghost.name}: ${stateWord(ghost.state)}`}
              style={{ '--hh-i': index, '--hh-n': room.ghosts.length } as CSSProperties}
              onClick={(event) => pressMapControl(event.currentTarget, { kind: 'ghost', roomId, ghostId: ghost.ghostId })}
            >
              <SpectreArt state={ghost.state} role={spectreRoleOf(ghost.ghostId)} />
            </span>
          ))}
        </div>
        <DeskPainting />
        <div className="hh-stage-spots" aria-hidden="true">
          {spot('ledger', `Open the ${room.name}`, LEDGER, (from) => pressMapControl(from, toRoom(roomId)))}
          {spot('bell', 'What needs you', BELL, (from) => pressControl(from, '[data-opener-key="needs-you"]'))}
        </div>
      </div>
      <div className="hh-stage-guide">
        <div className="hh-stage-balloon">
          <p className="hh-stage-balloon-title" data-guide-text>
            {guide.text}
          </p>
          <p className="hh-stage-balloon-hint">{GUIDE_HINT}</p>
          <ul className="hh-stage-options">
            {open ? null : option('open', <BookOpen size={13} />, `Look around the ${room.name}`, (from) => pressMapControl(from, toRoom(roomId)))}
            {guide.previous === null ? null : option('previous', <ArrowLeft size={13} />, `Go to the ${guide.previous.name}`, (from) => pressMapControl(from, toRoom(guide.previous!.roomId)))}
            {guide.next === null ? null : option('next', <ArrowRight size={13} />, `Go to the ${guide.next.name}`, (from) => pressMapControl(from, toRoom(guide.next!.roomId)))}
            {onToggleMap === undefined ? null : option('map', <MapIcon size={13} />, mapOpen ? 'Put the house map away' : 'See the whole house', onToggleMap)}
          </ul>
        </div>
        <div className="hh-stage-keeper">
          <span className="hh-stage-caretaker" aria-hidden="true">
            <CaretakerArt />
          </span>
          {onReturn === undefined ? null : (
            <button type="button" className="hh-stage-exit" data-guide-exit aria-label="Exit to the Foyer" onClick={onReturn}>
              <LogOut size={13} aria-hidden />
              Exit
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
