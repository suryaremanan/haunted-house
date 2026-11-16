// The note at the top of a panel when the room's controls are off (Spec 6
// Requirements 2.4, 3.10, 9.6): the fixed sentence of the House Projection
// with an icon. Read-only and locked rooms get their own border style, so the
// reason is not carried by color.
import { Lock, TriangleAlert } from 'lucide-react'
import type { RoomPresentation } from '../../core/house-projection'

export interface RoomNoteProps {
  room: Pick<RoomPresentation, 'diagnostic' | 'locked' | 'readOnly' | 'integrity'>
}

export function RoomNote({ room }: RoomNoteProps) {
  if (room.diagnostic === null) return null
  const kind = room.integrity !== 'valid' ? 'diagnostic' : room.locked ? 'locked' : room.readOnly ? 'read-only' : 'diagnostic'
  return (
    <p className="hh-ui-note" data-kind={kind} data-room-note>
      {kind === 'diagnostic' ? <TriangleAlert size={16} aria-hidden /> : <Lock size={16} aria-hidden />}
      <span>{room.diagnostic}</span>
    </p>
  )
}
