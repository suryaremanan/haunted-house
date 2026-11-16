// The Study inside the house (Spec 6 task 6.2): the requirements document, then its state, its Door and what the Archivist did.
// A thin composition over the approved Spec 4 and Spec 5 room modules: the
// artifact comes first, the secondary session link last. It adds no composer,
// no revision state and no approval of its own.
import { RoomNote } from '../house/RoomNote'
import { RoomPanelBody } from '../house/RoomPanel'
import { ROOM_STATE_UNREAD_TEXT, type RoomHousePanelProps } from '../house/room-house-panel'

export function StudyHousePanel({ room, detail, output, onSend, onRoomSend, onOpenSession }: RoomHousePanelProps) {
  return (
    <>
      <RoomNote room={room} />
      {detail === null ? (
        <p className="hh-ui-reason">{ROOM_STATE_UNREAD_TEXT}</p>
      ) : (
        <RoomPanelBody detail={detail} output={output} onSend={onSend} onRoomSend={onRoomSend} onOpenSession={onOpenSession} />
      )}
    </>
  )
}
