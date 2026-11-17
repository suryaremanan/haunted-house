// The body of an open workflow room: each phase with its state, its explicit
// start control and its Door proposal, the ghosts of the room, and the risky
// actions they asked for. Nothing here starts or advances on its own. The
// labelled panel, its heading and its Close control belong to the Mansion
// Shell's panel host (Spec 6).
//
// With a joined Room_Projection (Spec 5) the room's work products come first:
// documents and the task board above the phase state, and the runs with their
// secondary session links last.
import { Play } from 'lucide-react'
import type { RoomDetail, WorkflowCommand } from '../../core/house-view'
import type { RoomCommand, RoomProjection } from '../../core/room-view'
import { DoorPanel } from './DoorPanel'
import { DOOR_TONE, DoorIcon, GHOST_TONE, GhostIcon, PHASE_TONE, PhaseIcon } from './house-icons'
import { RevisionRequest } from './RevisionRequest'
import { RiskyActionPanel } from './RiskyActionPanel'
import { RoomOutput } from './RoomOutput'
import { RoomRuns } from './RoomRuns'

export interface RoomPanelProps {
  detail: RoomDetail
  onSend: (command: WorkflowCommand) => void
  /** The joined Room_Projection of this room. Without it the panel shows state and decisions only. */
  output?: RoomProjection | null
  /** Sends one Room Ghosts mutation: feedback, Workshop start, cancel or retry. */
  onRoomSend?: (command: RoomCommand) => void
  /** Opens an existing Crew session by slot key. Null when the host offers no way to. */
  onOpenSession?: ((slotKey: string) => void) | null
}

const ignore = () => {}

export function RoomPanelBody({ detail, onSend, output = null, onRoomSend = ignore, onOpenSession = null }: RoomPanelProps) {
  const { room } = detail
  return (
    <div className="hh-room-panel" data-room-body={room.id}>
      {output === null ? null : <RoomOutput output={output} onSend={onRoomSend} onOpenSession={onOpenSession} />}
      {detail.phases.map(({ line, start, door }) => (
        <div className="hh-phase" key={line.phase} data-phase={line.phase} data-status={line.status}>
          <p className="hh-room-line" data-tone={PHASE_TONE[line.status]}>
            <PhaseIcon status={line.status} />
            <span>
              {line.name}: {line.statusText}
            </span>
          </p>
          <p className="hh-room-line" data-tone={DOOR_TONE[line.doorStatus]}>
            <DoorIcon status={line.doorStatus} />
            <span>{line.doorHint}</span>
          </p>
          {/* With a task board, implementation starts from the ticked tasks there, not from a bare start. */}
          {start === null || (line.phase === 'implementation' && output?.ownsImplementationStart === true) ? null : (
            <div className="hh-decide" aria-busy={start.busy}>
              <button
                type="button"
                className="hh-button hh-button-primary"
                data-guide-control={`start:${line.phase}`}
                aria-disabled={start.command === null}
                onClick={() => {
                  if (start.command !== null) onSend(start.command)
                }}
              >
                <Play size={16} aria-hidden />
                {start.busy ? 'Starting…' : start.label}
              </button>
            </div>
          )}
          {door === null ? null : <DoorPanel view={door} onSend={onSend} />}
          {output?.documents.map((document) =>
            document.phase === line.phase && document.feedback !== null ? (
              <RevisionRequest key={document.phase} view={document.feedback} onSend={onRoomSend} />
            ) : null,
          )}
        </div>
      ))}
      <div className="hh-phase">
        <p className="hh-proposal-group">Ghosts in this room</p>
        {room.ghosts.length === 0 ? (
          <p className="hh-room-line">
            <GhostIcon state="idle" />
            <span>No ghost here yet</span>
          </p>
        ) : (
          <ul className="hh-ghost-lines">
            {room.ghosts.map((ghost) => (
              <li key={ghost.key} className="hh-room-line" data-tone={GHOST_TONE[ghost.state]} data-ghost={ghost.ghostId}>
                <GhostIcon state={ghost.state} />
                <span>
                  {ghost.name}: {ghost.stateText}
                  {ghost.pendingText === null ? null : `, ${ghost.pendingText}`}
                  {ghost.reason === null ? null : `. ${ghost.reason}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {detail.risky.length === 0 ? null : (
        <div className="hh-phase">
          <p className="hh-proposal-group">Risky actions</p>
          {detail.risky.map((view) => (
            <RiskyActionPanel key={view.proposalId} view={view} onSend={onSend} />
          ))}
        </div>
      )}
      {output === null ? null : <RoomRuns output={output} onSend={onRoomSend} onOpenSession={onOpenSession} />}
    </div>
  )
}
