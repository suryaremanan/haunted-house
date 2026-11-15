// Replay mansion routes for the SDK stand-in. Answers the Foyer's list,
// create, and open calls from an in-memory registry seeded by a recorded
// `GET /api/mansions` reply that is bundled into the replay build. Nothing
// here fetches, stores, or touches a filesystem: a created mansion lives only
// in this page's memory and is gone on reload.
import recordedMansions from '../../../../../fixtures/replay/mansions.json'
import {
  createReplayMansionModel,
  replayMansionOperation,
  type ReplayMansionReply,
} from '../../core/replay-mansion'

/** The recorded list the replay Foyer starts from. Never edited. */
export const REPLAY_MANSION_FIXTURE: unknown = recordedMansions

/**
 * Answers one SDK-style call. Returns the status and JSON body the live
 * backend would send, or null when the call is not one of the three mansion
 * routes, so the stand-in can refuse it the way it refuses everything else.
 */
export type ReplayMansionRoutes = (method: string, path: string, body?: unknown) => ReplayMansionReply | null

/** One replay session's mansion routes over its own registry. */
export function createReplayMansionRoutes(fixture: unknown = REPLAY_MANSION_FIXTURE): ReplayMansionRoutes {
  const model = createReplayMansionModel(fixture)
  return (method, path, body) => {
    const operation = replayMansionOperation(method, path, body)
    return operation === null ? null : model.request(operation)
  }
}
