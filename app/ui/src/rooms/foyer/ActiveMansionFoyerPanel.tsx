// The Foyer inside an open Mansion (Spec 6 task 6.1; Requirement 1.7): which
// Mansion and Project_Spec are open, and the one way back to the Foyer's
// list. Return calls the Foyer's own action, which also puts focus back on
// the control that opened this Mansion. Listing, creating and opening stay in
// the Foyer; there is no second reducer here.
import { ArrowLeft } from 'lucide-react'
import type { RoomPresentation } from '../../core/house-projection'
import type { MansionDescriptor } from '../../core/mansion-api'
import { RoomNote } from '../house/RoomNote'

export interface ActiveMansionFoyerPanelProps {
  room: RoomPresentation
  mansion: MansionDescriptor
  /** The Foyer's return action. */
  onReturn: () => void
}

export const FOYER_RETURN_HINT = 'Escape also returns to the Foyer when no room is open.'

export function ActiveMansionFoyerPanel({ room, mansion, onReturn }: ActiveMansionFoyerPanelProps) {
  return (
    <>
      <RoomNote room={room} />
      <dl className="hh-shell-facts" data-active-mansion={mansion.name}>
        <dt>Mansion</dt>
        <dd>{mansion.name}</dd>
        <dt>Project spec</dt>
        <dd>{mansion.projectSpec}</dd>
        <dt>Folder</dt>
        <dd>{mansion.displayPath}</dd>
      </dl>
      <div className="hh-foyer-actions">
        <button type="button" className="hh-button" onClick={onReturn}>
          <ArrowLeft size={16} aria-hidden />
          Return to Foyer
        </button>
        <span className="hh-foyer-hint">{FOYER_RETURN_HINT}</span>
      </div>
    </>
  )
}
