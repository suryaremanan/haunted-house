// Replay source of canonical séance events (Spec 2, Requirements 8.1 to 8.6;
// replay-and-submission task 3.2).
//
// In the replay build the SDK stand-in answers the canonical read route,
// `GET /apps/haunted-house/api/mansions/{id}/seance/events`, from the recorded
// Event_Log instead of a backend. The recording is the only source of event
// data and nothing here folds or interprets it.
//
// The recording is loaded once by replay-source.ts, parsed and
// integrity-checked by core/seance-log.ts and ordered by the Spec 2 selector.
// This route serves the prefix of Canonical_Order that the Attic's Cursor has
// presented, with the parser's diagnostics. It reads no clock: a recording
// advances only when the Attic's Replay Controller moves the Cursor.
import { MAX_PAGE_LIMIT } from '../../core/seance-api'
import { appEventToJson } from '../../core/seance-event'
import { createReplaySource, type PresentedRecords, type ReplaySource } from './replay-source'

export { FIXTURE_URL } from './replay-source'
export type { PresentedRecords } from './replay-source'

const EVENTS_ROUTE = /^\/apps\/haunted-house\/api\/mansions\/([^/?#]+)\/seance\/events(?:\?([^#]*))?$/

export interface SeanceReplayRoutes {
  /**
   * Answers the canonical read route with the JSON the live backend would
   * send, or rejects with an SDK-style error. Returns null for any other path.
   */
  get(path: string): Promise<unknown> | null
  /**
   * The canonical records of one Mansion that the Attic has presented so far,
   * with the integrity verdict of the Spec 2 parser. For stand-ins of other
   * read routes that project the same recording. Fetches nothing new.
   */
  presented(mansionId: string): Promise<PresentedRecords>
}

function replayError(status: number, body: string): Error {
  return Object.assign(new Error(`API ${status}: ${body}`), { name: 'AppApiError', status, body })
}

function sequenceParameter(query: URLSearchParams, name: string, fallback: number, minimum: number): number | null {
  const raw = query.get(name)
  if (raw === null) return fallback
  if (!/^\d{1,15}$/.test(raw)) return null
  const value = Number(raw)
  return value >= minimum ? value : null
}

/** The séance read route over one recording. */
export function createSeanceReplayRoutes(source: ReplaySource = createReplaySource()): SeanceReplayRoutes {
  async function read(mansionId: string, query: URLSearchParams): Promise<unknown> {
    const afterSequence = sequenceParameter(query, 'after_sequence', 0, 0)
    const limit = sequenceParameter(query, 'limit', MAX_PAGE_LIMIT, 1)
    if (afterSequence === null || limit === null || limit > MAX_PAGE_LIMIT) {
      throw replayError(400, 'The replay read needs a valid after_sequence and a limit from 1 to 500.')
    }

    const { records, diagnostics } = await source.recording()
    // A per-Mansion log: Sequence only means something for the Mansion it was recorded in.
    const recorded = records.filter((event) => event.scope.mansion_id === mansionId)
    if (recorded.length === 0 && records.length > 0) {
      throw replayError(404, 'The replay has no séance log for this mansion.')
    }

    const visible = recorded.slice(0, source.presentedCount(mansionId))
    return {
      events: visible
        .filter((event) => event.sequence > afterSequence)
        .slice(0, limit)
        .map(appEventToJson),
      highest_sequence: visible.at(-1)?.sequence ?? 0,
      valid_prefix_sequence: records.at(-1)?.sequence ?? 0,
      diagnostics,
    }
  }

  return {
    presented: (mansionId) => source.presented(mansionId),
    get(path) {
      const match = EVENTS_ROUTE.exec(path)
      if (match === null) return null
      let mansionId: string
      try {
        mansionId = decodeURIComponent(match[1])
      } catch {
        return Promise.reject(replayError(400, 'The mansion name is not valid.'))
      }
      return read(mansionId, new URLSearchParams(match[2] ?? ''))
    },
  }
}
