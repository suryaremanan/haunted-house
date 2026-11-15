// The work products of the open room, shown before its state and controls
// (Spec 5 Requirements 11.1, 11.4): each room document, and in the Workshop
// the task board. There is no chat here and nothing to type.
import { RefreshCw } from 'lucide-react'
import { ArtifactView } from '../../components/ArtifactView'
import type { RoomCommand, RoomProjection } from '../../core/room-view'
import { WorkshopTaskBoard } from '../workshop/WorkshopTaskBoard'

export interface RoomOutputProps {
  output: RoomProjection
  onSend: (command: RoomCommand) => void
  onOpenSession: ((slotKey: string) => void) | null
}

export function RoomOutput({ output, onSend, onOpenSession }: RoomOutputProps) {
  return (
    <div className="hh-output" data-room-output={output.room}>
      {output.outputNote === null ? null : (
        <p className="hh-house-note hh-house-muted" data-output-note>
          <RefreshCw size={16} aria-hidden />
          <span>{output.outputNote}</span>
        </p>
      )}
      {output.documents.map((view) => (
        <ArtifactView key={view.phase} view={view} />
      ))}
      {output.taskBoard === null ? null : <WorkshopTaskBoard board={output.taskBoard} onSend={onSend} onOpenSession={onOpenSession} />}
    </div>
  )
}
