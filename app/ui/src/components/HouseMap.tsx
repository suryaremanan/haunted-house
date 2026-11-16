// The House Map (Spec 6 task 5.1; Requirements 1.3 to 1.6, 3.1 to 3.4, 4.1 to
// 4.3, 6.4): the cutaway house as one navigation landmark holding one ordered
// list of rooms in Room order. CSS places the same list as a cutaway, a
// compact grid or one column; the DOM order and the arrow map never change.
//
// Arrow keys act on Room controls only and follow the fixed map of
// `house-registry.ts`. Ghost and Door controls are reached with Tab.
import { useCallback, useId, useMemo, useRef } from 'react'
import type { HouseProjection, HouseSurfaceTarget } from '../core/house-projection'
import { nextRoom, type ArrowDirection, type RoomId } from '../core/house-registry'
import type { EffectiveMotion } from '../core/motion-policy'
import { HouseCutawayArt } from './house-art'
import { RoomHotspots } from './RoomHotspots'

export interface HouseMapProps {
  projection: HouseProjection
  /** Asks the shell to open a surface. Opening is never a decision. */
  openSurface: (target: HouseSurfaceTarget, opener: HTMLElement) => void
  /** Carried for the art; all behaviour here is the same with motion off. */
  motion: EffectiveMotion
  /** Stable key of the open surface, or null. */
  openKey?: string | null
  /** The id of the panel a control opens. */
  panelId?: string
}

export const HOUSE_MAP_LABEL = 'Mansion rooms'
export const HOUSE_MAP_HELP =
  'Arrow keys move between rooms. Enter opens a room, a ghost or a door. Escape closes it. Doors open only when you approve them.'

export function HouseMap({ projection, openSurface, motion, openKey = null, panelId = '' }: HouseMapProps) {
  const titleId = useId()
  const list = useRef<HTMLOListElement>(null)
  const visible = useMemo(() => new Set<RoomId>(projection.rooms.map((room) => room.roomId)), [projection.rooms])
  const seance = visible.has('seance-room')

  const onArrow = useCallback(
    (room: RoomId, key: ArrowDirection | 'Home' | 'End') => {
      const order = projection.rooms.map((item) => item.roomId)
      const target = key === 'Home' ? order[0] : key === 'End' ? order[order.length - 1] : nextRoom(room, key, visible)
      // No room in that direction: focus stays where it is.
      if (target === undefined || target === room) return
      list.current?.querySelector<HTMLElement>(`[data-room-control="${target}"]`)?.focus()
    },
    [projection.rooms, visible],
  )

  return (
    <nav className="hh-ui-map" aria-label={HOUSE_MAP_LABEL} data-motion-art={motion}>
      <h3 className="hh-ui-map-title" id={titleId} tabIndex={-1} data-map-title>
        The house
      </h3>
      <p className="hh-ui-reason hh-ui-map-help">{HOUSE_MAP_HELP}</p>
      <div className="hh-ui-house">
        <HouseCutawayArt seanceRoom={seance} />
        <ol className="hh-ui-rooms" data-seance={seance ? 'shown' : 'hidden'} ref={list} aria-labelledby={titleId}>
          {projection.rooms.map((room) => (
            <RoomHotspots
              key={room.roomId}
              room={room}
              needsYou={projection.needsYou.filter((item) => item.roomId === room.roomId).length}
              openKey={openKey}
              panelId={panelId}
              onOpen={openSurface}
              onArrow={onArrow}
            />
          ))}
        </ol>
      </div>
    </nav>
  )
}
