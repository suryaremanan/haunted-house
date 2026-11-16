// The Séance Room when the stretch build setting turns it on (Spec 6 tasks
// 6.5 and 9.1; Requirements 1.5, 11.6): the bounded review Spec 5 projects.
// It reads that projection and holds no review state. It shows proposals and
// decides nothing; an approved repair runs through the Workshop like any
// other task, and nothing reviews again on its own.
import type { RoomPresentation } from '../../core/house-projection'
import type { ReviewView } from '../../core/room-view'
import { RoomNote } from '../house/RoomNote'
import { SeanceRoomPanel } from './SeanceRoomPanel'

export interface SeanceHousePanelProps {
  room: RoomPresentation
  /** The Spec 5 review, or null when the backend has the Séance Room off or nothing was reviewed. */
  review: ReviewView | null
  onOpenSession: ((slotKey: string) => void) | null
}

export const NO_REVIEW_TEXT = 'No review yet. The Medium reviews only when the house asks it to.'

export function SeanceHousePanel({ room, review, onOpenSession }: SeanceHousePanelProps) {
  return (
    <>
      <RoomNote room={room} />
      {review === null ? (
        <p className="hh-ui-reason" data-seance="empty">
          {NO_REVIEW_TEXT}
        </p>
      ) : (
        <SeanceRoomPanel view={review} onOpenSession={onOpenSession} />
      )}
    </>
  )
}
