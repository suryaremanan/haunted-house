// The house of one Mansion: the map of rooms, the open room with its Door and
// risky-action panels, and what needs the Operator (Spec 4 section 14).
// Rendered inside the Mansion Shell. View only: state and handlers come from
// useHouse, and every decision is an explicit button press.
import { Lock, RefreshCw, TriangleAlert } from 'lucide-react'
import { useId, useRef } from 'react'
import { ROOM_OUTPUT_STYLES } from '../../components/room-output-styles'
import { SeanceRoomPanel } from '../seance-room/SeanceRoomPanel'
import { HOUSE_STYLES } from './house-styles'
import { HouseMap } from './HouseMap'
import { NeedsYouBar } from './NeedsYouBar'
import { RoomPanel } from './RoomPanel'
import { useHouse } from './use-house'
import { usePanelFocus } from './use-panel-focus'

export interface HouseProps {
  /** The open Mansion. */
  mansionId: string
  /** The Mansion's Project_Spec. Defaults to the Mansion's own name. */
  specName?: string
  /** Display names by `ghost_id`. A ghost without one is named after its id. */
  ghostNames?: Readonly<Record<string, string>>
  /** Receives each announcement for the page's one polite live region. */
  onAnnounce: (message: string) => void
  /** Still House: turns off the working spinner. Reduced motion in the browser does the same. */
  stillHouse?: boolean
}

export function House({ mansionId, specName, ghostNames, onAnnounce, stillHouse = false }: HouseProps) {
  const house = useHouse({ mansionId, specName, ghostNames, onAnnounce })
  const titleId = useId()
  const panelId = useId()
  const panelTitleId = useId()
  const root = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  usePanelFocus(root, heading, house.ui.openRoom, house.inFlight)

  return (
    <section
      className="hh-house-map"
      aria-labelledby={titleId}
      aria-busy={house.loading}
      data-still={stillHouse}
      ref={root}
      onKeyDown={(event) => {
        // Escape closes the open room first. With no room open it is left to
        // the Mansion Shell, which returns to the Foyer.
        if (event.key !== 'Escape' || house.ui.openRoom === null) return
        event.preventDefault()
        house.closeRoom()
      }}
    >
      <style>{HOUSE_STYLES + ROOM_OUTPUT_STYLES}</style>
      <h3 id={titleId}>The house</h3>
      <p className="hh-house-lede">
        Arrow keys move between rooms. Enter opens a room. Escape closes it. Doors open only when you approve them.
      </p>
      {house.loading ? (
        <p className="hh-house-note hh-house-muted">
          <RefreshCw size={16} aria-hidden />
          <span>Loading the house…</span>
        </p>
      ) : null}
      {house.logProblem === null ? null : (
        <p className="hh-house-note hh-house-problem">
          <TriangleAlert size={16} aria-hidden />
          <span>{house.logProblem}</span>
        </p>
      )}
      {house.authority.text === null || house.authority.block === 'loading' ? null : (
        <p className="hh-house-note hh-house-blocked" data-block={house.authority.block}>
          <Lock size={16} aria-hidden />
          <span>{house.authority.text}</span>
        </p>
      )}
      <NeedsYouBar items={house.needsYou} text={house.needsYouText} onJump={house.jumpToNeedsYou} />
      <HouseMap
        rooms={house.rooms}
        focusedRoom={house.ui.focusedRoom}
        openRoom={house.ui.openRoom}
        panelId={panelId}
        onFocus={house.focusRoom}
        onMove={house.moveRoom}
        onOpen={house.openRoom}
      />
      {house.ui.notice === null ? null : <p className="hh-house-note">{house.ui.notice}</p>}
      {house.roomNotice === null ? null : (
        <p className="hh-house-note" data-room-notice>
          {house.roomNotice}
        </p>
      )}
      {house.open === null ? null : (
        <RoomPanel
          id={panelId}
          titleId={panelTitleId}
          detail={house.open}
          ref={heading}
          onClose={house.closeRoom}
          onSend={house.send}
          output={house.output}
          onRoomSend={house.sendRoom}
          onOpenSession={house.openSession}
        />
      )}
      {/* Stretch: present only when the backend turned the Séance Room on and it has a review. */}
      {house.review === null ? null : <SeanceRoomPanel view={house.review} onOpenSession={house.openSession} />}
    </section>
  )
}
