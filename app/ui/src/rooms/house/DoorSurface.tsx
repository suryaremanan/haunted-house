// The details of one Door (Spec 6 Requirements 2.5, 2.9, 2.10): its exact
// state in words with its shape, what that state means, and, when a proposal
// exists, the approved Spec 4 Door panel with its own Approve and Reject.
// Opening this surface decides nothing. A decision is still one explicit
// press on a control the upstream view enabled.
import { DoorOpen } from 'lucide-react'
import { DoorArt } from '../../components/house-art'
import type { DoorPresentation, HouseSurfaceTarget, RoomPresentation } from '../../core/house-projection'
import { stateWord } from '../../core/house-registry'
import type { DoorDecisionView, WorkflowCommand } from '../../core/house-view'
import { DoorPanel } from './DoorPanel'
import { RoomNote } from './RoomNote'

export interface DoorSurfaceProps {
  room: RoomPresentation
  door: DoorPresentation
  /** The Spec 4 Door panel of this phase, or null when the Door never had a proposal. */
  decision: DoorDecisionView | null
  onSend: (command: WorkflowCommand) => void
  /** Opens the Door's room on top of this surface. */
  onOpenRoom: (target: HouseSurfaceTarget, opener: HTMLElement) => void
}

export function DoorSurface({ room, door, decision, onSend, onOpenRoom }: DoorSurfaceProps) {
  return (
    <div className="hh-door-surface" data-door-surface={door.phase}>
      <RoomNote room={room} />
      <p className="hh-ui-state" data-door={door.state}>
        <DoorArt state={door.state} />
        <span>
          Door state: <span className="hh-ui-state-word">{stateWord(door.state)}</span>
        </span>
      </p>
      <p data-door-hint>{door.hint}</p>
      {door.phaseText === null ? null : <p className="hh-ui-reason">{door.phaseText}</p>}
      {decision === null ? null : <DoorPanel view={decision} onSend={onSend} />}
      <div className="hh-decide">
        <button
          type="button"
          className="hh-button"
          data-opener-key={`nested:room:${room.roomId}`}
          onClick={(event) => onOpenRoom({ kind: 'room', roomId: room.roomId }, event.currentTarget)}
        >
          <DoorOpen size={16} aria-hidden />
          Open the {room.name}
        </button>
      </div>
    </div>
  )
}
