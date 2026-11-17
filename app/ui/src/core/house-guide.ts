// The Caretaker's words (the walk-in room view): one or two plain sentences
// about the room on show, and the rooms either side of it in the order the
// work is done. The guide only repeats what the room's own controls already
// say; it decides nothing and starts nothing.
//
// Pure: a function of the House Projection. No React, DOM, SDK, or clock.
import type { HouseProjection, RoomPresentation } from './house-projection'
import type { RoomId } from './house-registry'

export interface GuideView {
  readonly text: string
  /** The room before this one in Room order, or null at the Foyer. */
  readonly previous: { readonly roomId: RoomId; readonly name: string } | null
  /** The room after this one in Room order, or null at the last. */
  readonly next: { readonly roomId: RoomId; readonly name: string } | null
}

export const ROOM_GUIDE_TEXT: Readonly<Record<RoomId, string>> = {
  foyer: 'This is the Foyer, the way in and out. The rooms open off it in the order the work is done.',
  study: 'This is the Study. The Archivist writes the requirements here.',
  'drafting-room': 'This is the Drafting Room. The Draughtsman turns the requirements into a design here.',
  workshop: 'This is the Workshop. The Foreman plans the tasks and the Tinkers build them.',
  attic: 'This is the Attic. It keeps the recording of everything that happened, ready to play back.',
  'seance-room': 'This is the Séance Room, where finished work is reviewed.',
}

function names(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/** What the Caretaker says about one room, most pressing thing first. */
export function guideText(room: RoomPresentation): string {
  if (room.locked) return room.diagnostic ?? 'This room is locked.'
  const waiting = room.waitingItems.length
  if (waiting > 0) {
    return waiting === 1 ? "One thing in this room is waiting for you. It is on this room's sheet." : `${waiting} things in this room are waiting for you. They are on this room's sheet.`
  }
  const inState = (state: string) => room.ghosts.filter((ghost) => ghost.state === state).map((ghost) => ghost.name)
  const failed = inState('failed')
  if (failed.length > 0) return `${names(failed)} ${failed.length === 1 ? 'has' : 'have'} failed. This room's sheet says why.`
  const blocked = inState('blocked')
  if (blocked.length > 0) return `${names(blocked)} ${blocked.length === 1 ? 'is' : 'are'} blocked. This room's sheet says why.`
  const working = inState('working')
  if (working.length > 0) return `${names(working)} ${working.length === 1 ? 'is' : 'are'} at work. A door opens only when you approve it.`
  return ROOM_GUIDE_TEXT[room.roomId]
}

export function guideFor(projection: HouseProjection, roomId: RoomId): GuideView | null {
  const index = projection.rooms.findIndex((room) => room.roomId === roomId)
  if (index < 0) return null
  const beside = (room: RoomPresentation | undefined) => (room === undefined ? null : { roomId: room.roomId, name: room.name })
  return { text: guideText(projection.rooms[index]), previous: beside(projection.rooms[index - 1]), next: beside(projection.rooms[index + 1]) }
}
