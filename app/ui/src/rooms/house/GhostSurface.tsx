// The details of one ghost (Spec 6 Requirement 2.10): its exact state in
// words with its pose, why it is blocked or failed, and how many approvals
// wait on it. Looking at a ghost starts, approves and sends nothing; the one
// button opens the ghost's room, where the decisions are.
import { DoorOpen } from 'lucide-react'
import type { GhostPresentation, HouseSurfaceTarget, RoomPresentation } from '../../core/house-projection'
import { stateWord } from '../../core/house-registry'
import { GhostArt, ghostVariantOf } from '../../components/house-art'

export interface GhostSurfaceProps {
  room: RoomPresentation
  ghost: GhostPresentation
  /** Opens the ghost's room on top of this surface. */
  onOpenRoom: (target: HouseSurfaceTarget, opener: HTMLElement) => void
}

export function GhostSurface({ room, ghost, onOpenRoom }: GhostSurfaceProps) {
  return (
    <div className="hh-ghost-surface" data-ghost-surface={ghost.ghostId}>
      <p className="hh-ui-state" data-ghost={ghost.state}>
        <GhostArt state={ghost.state} variant={ghostVariantOf(ghost.ghostId)} />
        <span>
          Ghost state: <span className="hh-ui-state-word">{stateWord(ghost.state)}</span>
          {ghost.pendingText === null ? null : `, ${ghost.pendingText}`}
        </span>
      </p>
      {ghost.reason === null ? null : <p data-ghost-reason>{ghost.reason}</p>}
      <p className="hh-ui-reason">
        {ghost.name} lives in the {room.name}. Looking at a ghost changes nothing.
      </p>
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
