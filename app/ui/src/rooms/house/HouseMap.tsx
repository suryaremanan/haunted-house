// The house map: a navigation list of the three rooms (Requirement 9.8). Each
// room is one button whose label says its phase, Door and ghost state. Tab
// reaches every room, the arrow keys move between rooms, Enter opens one.
import { Bell } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { needsYouText, type RoomId, type RoomView } from '../../core/house-view'
import { DOOR_TONE, DoorIcon, GHOST_TONE, GhostIcon, PHASE_TONE, PhaseIcon } from './house-icons'

export interface HouseMapProps {
  rooms: readonly RoomView[]
  /** The room the arrow keys last moved to. */
  focusedRoom: RoomId
  /** The room whose panel is open, or null. */
  openRoom: RoomId | null
  /** The id of the room panel, for `aria-controls`. */
  panelId: string
  onFocus: (room: RoomId) => void
  onMove: (direction: 'next' | 'previous' | 'first' | 'last') => void
  onOpen: (room: RoomId) => void
}

const KEY_MOVES: Readonly<Record<string, 'next' | 'previous' | 'first' | 'last'>> = {
  ArrowRight: 'next',
  ArrowDown: 'next',
  ArrowLeft: 'previous',
  ArrowUp: 'previous',
  Home: 'first',
  End: 'last',
}

export function HouseMap({ rooms, focusedRoom, openRoom, panelId, onFocus, onMove, onOpen }: HouseMapProps) {
  const nav = useRef<HTMLElement>(null)

  // An arrow key changed the focused room: move DOM focus with it, but only
  // while focus is already on the map, so nothing steals focus from elsewhere.
  useEffect(() => {
    const map = nav.current
    if (map === null || !map.contains(document.activeElement)) return
    map.querySelector<HTMLElement>(`[data-room="${focusedRoom}"]`)?.focus()
  }, [focusedRoom])

  return (
    <nav className="hh-map" aria-label="House map" ref={nav}>
      <ol className="hh-map-rooms">
        {rooms.map((room) => (
          <li key={room.id}>
            <button
              type="button"
              className="hh-room"
              data-room={room.id}
              data-needs={room.needsYou > 0}
              aria-label={room.label}
              aria-expanded={openRoom === room.id}
              aria-controls={openRoom === room.id ? panelId : undefined}
              onFocus={() => onFocus(room.id)}
              onClick={() => onOpen(room.id)}
              onKeyDown={(event) => {
                const move = KEY_MOVES[event.key]
                if (move === undefined) return
                event.preventDefault()
                onMove(move)
              }}
            >
              <span className="hh-room-name">{room.name}</span>
              {room.phases.map((phase) => (
                <span
                  key={phase.phase}
                  style={{ display: 'contents' }}
                  data-phase={phase.phase}
                  data-status={phase.status}
                  data-door={phase.doorStatus}
                >
                  <span className="hh-room-line" data-tone={PHASE_TONE[phase.status]}>
                    <PhaseIcon status={phase.status} />
                    <span>
                      {phase.name}: {phase.statusText}
                    </span>
                  </span>
                  <span className="hh-room-line" data-tone={DOOR_TONE[phase.doorStatus]}>
                    <DoorIcon status={phase.doorStatus} />
                    <span>{phase.doorText}</span>
                  </span>
                </span>
              ))}
              {room.ghosts.length === 0 ? (
                <span className="hh-room-line">
                  <GhostIcon state="idle" />
                  <span>No ghost here yet</span>
                </span>
              ) : (
                room.ghosts.map((ghost) => (
                  <span key={ghost.key} className="hh-room-line" data-tone={GHOST_TONE[ghost.state]}>
                    <GhostIcon state={ghost.state} />
                    <span>
                      {ghost.name}: {ghost.stateText}
                    </span>
                  </span>
                ))
              )}
              {room.needsYou > 0 ? (
                <span className="hh-room-line hh-room-needs" data-tone="attention">
                  <Bell size={16} aria-hidden />
                  <span>{needsYouText(room.needsYou)}</span>
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
