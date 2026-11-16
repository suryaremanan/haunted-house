// The Workshop inside the house (Spec 6 task 6.3): the task plan and the task
// board by wave, then the tasks and implementation phases with their Doors,
// the Foreman and the Tinkers, risky actions, and last the runs with their
// secondary session links. A thin composition over the approved Spec 4 and
// Spec 5 modules. Which tasks run, how many Tinkers work at once (never more
// than three) and what a claim means are decided upstream; nothing here
// schedules a task or keeps task state.
import { RoomNote } from '../house/RoomNote'
import { RoomPanelBody } from '../house/RoomPanel'
import { ROOM_STATE_UNREAD_TEXT, type RoomHousePanelProps } from '../house/room-house-panel'

export function WorkshopHousePanel({ room, detail, output, onSend, onRoomSend, onOpenSession }: RoomHousePanelProps) {
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
