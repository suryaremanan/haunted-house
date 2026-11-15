// Replay source of the Room Ghosts answer (Spec 5 task 9.6; Requirements
// 10.6, 10.7, 11.5).
//
// In the replay build the SDK stand-in answers the Room Ghosts read route,
// `GET /apps/haunted-house/api/mansions/{id}/specs/{spec}/room-ghosts`, for
// the recording playback has presented so far. A séance log never holds
// document text, task plans or session capabilities, so the answer carries
// none: it is the empty, read-only answer at the version the workflow fold of
// the same records reports. The room panels then show what the log does
// record (each document's path, revision and digest, from the Door proposals)
// with every mutation and session link off.
//
// This file parses no log and folds no ghost state. It makes no request.
import { emptyRoomGhosts, roomGhostsToJson } from '../../core/room-projection'
import { foldWorkflow } from '../../core/workflow-fold'
import type { SeanceReplayRoutes } from './seance-replay'

const ROOM_GHOSTS_ROUTE = /^\/apps\/haunted-house\/api\/mansions\/([^/?#]+)\/specs\/([^/?#]+)\/room-ghosts$/

export interface RoomGhostsReplayRoutes {
  /**
   * Answers the Room Ghosts read route with the JSON shape the live backend
   * sends, or rejects with an SDK-style error. Returns null for any other path.
   */
  get(path: string): Promise<unknown> | null
}

function replayError(status: number, body: string): Error {
  return Object.assign(new Error(`API ${status}: ${body}`), { name: 'AppApiError', status, body })
}

/** The Room Ghosts route over the same recording the séance and workflow routes serve. */
export function createRoomGhostsReplayRoutes(seance: Pick<SeanceReplayRoutes, 'presented'>): RoomGhostsReplayRoutes {
  return {
    get(path) {
      const match = ROOM_GHOSTS_ROUTE.exec(path)
      if (match === null) return null
      let mansionId: string
      let specName: string
      try {
        mansionId = decodeURIComponent(match[1])
        specName = decodeURIComponent(match[2])
      } catch {
        return Promise.reject(replayError(400, 'The mansion or spec name is not valid.'))
      }
      return seance.presented(mansionId).then(({ events, integrityOk }) => {
        const integrity = integrityOk ? 'valid' : 'corrupt'
        // The same fold the workflow route uses, so both answers carry one version.
        const { projection } = foldWorkflow(events, { mansionId, integrity, readOnly: true })
        return roomGhostsToJson(emptyRoomGhosts(mansionId, specName, { version: projection.version, integrity, readOnly: true }))
      })
    },
  }
}
