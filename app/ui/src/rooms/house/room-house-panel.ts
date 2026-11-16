// What the Mansion Shell hands a workflow room's panel (Spec 6 tasks 6.2 and
// 6.3): the room as the house shows it, the upstream views of that room, and
// the exact upstream callbacks. There is no generic approve function and no
// path here; every decision is a command an upstream view already built.
import type { RoomPresentation } from '../../core/house-projection'
import type { RoomDetail, WorkflowCommand } from '../../core/house-view'
import type { RoomCommand, RoomProjection } from '../../core/room-view'

export interface RoomHousePanelProps {
  /** The room as the House Projection presents it. */
  room: RoomPresentation
  /** Spec 4: phases, Door proposals and risky actions with their gated commands. Null before any state was read. */
  detail: RoomDetail | null
  /** Spec 5: documents, task board, runs and session links. */
  output: RoomProjection | null
  /** Sends one explicit Spec 4 start or decision. */
  onSend: (command: WorkflowCommand) => void
  /** Sends one explicit Room Ghosts mutation. */
  onRoomSend: (command: RoomCommand) => void
  /** Opens an existing Crew session by slot key. Null when the host offers no way to. */
  onOpenSession: ((slotKey: string) => void) | null
}

export const ROOM_STATE_UNREAD_TEXT = "This room's state has not been read yet."
