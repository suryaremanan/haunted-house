// A house backend double that also answers the Room Ghosts routes, for DOM
// tests of the artifact-first room panels. Not shipped.
import { roomGhostsToJson, type RoomGhosts } from '../core/room-projection'
import type { WorkflowProjection } from '../core/workflow-projection'
import { BASE, FakeHouseBackend, httpError, type PostCall } from './house-kit'
import { SPEC } from './room-kit'

export const ROOM_ROUTE = `${BASE}/specs/${SPEC}/room-ghosts`
export const FEEDBACK_ROUTE = `${BASE}/specs/${SPEC}/feedback`
export const WORKSHOP_START_ROUTE = `${BASE}/specs/${SPEC}/workshop/start`
export const RUNS_BASE = '/apps/haunted-house/api/room-ghosts/runs'

export const roomWire = (value: RoomGhosts): unknown => JSON.parse(JSON.stringify(roomGhostsToJson(value)))

function isRoomPost(path: string): boolean {
  return path === FEEDBACK_ROUTE || path === WORKSHOP_START_ROUTE || path.startsWith(`${RUNS_BASE}/`)
}

/** Tests change `rooms` (an answer, a raw body, or an Error to throw) and answer mutations through `onRoomPost`. */
export class FakeRoomBackend extends FakeHouseBackend {
  rooms: RoomGhosts | Error | { raw: unknown }
  roomReads = 0
  /** Room Ghosts POSTs seen, in order. Workflow POSTs stay in `posts`. */
  readonly roomPosts: PostCall[] = []
  onRoomPost: (call: PostCall) => unknown = () => ({ accepted: true })
  /** Called at the start of each Room Ghosts read with its number, so a test can change `rooms` between reads. */
  onRoomRead: (count: number) => void = () => {}

  constructor(workflow: WorkflowProjection, rooms: RoomGhosts | Error | { raw: unknown }) {
    super(workflow)
    this.rooms = rooms
    const houseGet = this.get
    const housePost = this.post
    this.get = async (path: string): Promise<unknown> => {
      if (path !== ROOM_ROUTE) return houseGet(path)
      this.roomReads += 1
      this.onRoomRead(this.roomReads)
      const current = this.rooms
      if (current instanceof Error) throw current
      return 'raw' in current ? current.raw : roomWire(current)
    }
    this.post = async (path: string, body?: unknown): Promise<unknown> => {
      if (!isRoomPost(path)) return housePost(path, body)
      const call = { path, body }
      this.roomPosts.push(call)
      const answer = this.onRoomPost(call)
      if (answer instanceof Error) throw answer
      return answer
    }
  }
}

export { httpError }
