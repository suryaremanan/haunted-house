// Replay source of the workflow projection (Spec 4 task 15.1; Requirements
// 10.4 to 10.6).
//
// In the replay build the SDK stand-in answers the workflow read route,
// `GET /apps/haunted-house/api/mansions/{id}/workflow`, by folding the Spec 4
// domain records of the recording that playback has presented so far. The UI
// therefore runs the same adapter, parser and house as in live mode, and makes
// no Gateway or Backend request.
//
// The records come from the séance replay stand-in, which fetched the file
// once and had the Spec 2 parser verify it. This file parses no log, verifies
// no hash and orders nothing: it hands the valid prefix to the pure fold and
// passes on the integrity verdict it was given. The projection is marked
// read-only, and every workflow mutation is refused by the stand-in.
import { foldWorkflow } from '../../core/workflow-fold'
import { workflowProjectionToJson } from '../../core/workflow-projection'
import type { SeanceReplayRoutes } from './seance-replay'

const WORKFLOW_ROUTE = /^\/apps\/haunted-house\/api\/mansions\/([^/?#]+)\/workflow$/

export interface WorkflowReplayRoutes {
  /**
   * Answers the workflow read route with the JSON the live backend would send,
   * or rejects with an SDK-style error. Returns null for any other path.
   */
  get(path: string): Promise<unknown> | null
}

function replayError(status: number, body: string): Error {
  return Object.assign(new Error(`API ${status}: ${body}`), { name: 'AppApiError', status, body })
}

/** The workflow route over the same recording the séance route serves. */
export function createWorkflowReplayRoutes(seance: Pick<SeanceReplayRoutes, 'presented'>): WorkflowReplayRoutes {
  return {
    get(path) {
      const match = WORKFLOW_ROUTE.exec(path)
      if (match === null) return null
      let mansionId: string
      try {
        mansionId = decodeURIComponent(match[1])
      } catch {
        return Promise.reject(replayError(400, 'The mansion name is not valid.'))
      }
      return seance.presented(mansionId).then(({ events, integrityOk }) =>
        workflowProjectionToJson(
          foldWorkflow(events, {
            mansionId,
            // Spec 2 decided integrity; a failure means only the valid prefix was handed over.
            integrity: integrityOk ? 'valid' : 'corrupt',
            readOnly: true,
          }).projection,
        ),
      )
    },
  }
}
