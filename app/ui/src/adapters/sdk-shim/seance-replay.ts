// Replay source of canonical séance events (Spec 2, Requirements 8.1 to 8.6).
//
// In the replay build the SDK stand-in answers the canonical read route,
// `GET /apps/haunted-house/api/mansions/{id}/seance/events`, from the recorded
// Event_Log instead of a backend. The UI therefore runs the very same
// Live_Event_Bridge, selector and reducer as in live mode: the recording is the
// only source of event data and nothing here folds or interprets it.
//
// The one network request is a single fetch of ./fixture.jsonl. The file is
// parsed and integrity-checked by core/seance-log.ts; only its valid prefix is
// served, with the parser's diagnostics. Records become readable in
// Canonical_Order as playback time passes.
import { createTimeline, type ReplayTimeline } from '../../core/replay-player'
import { MAX_PAGE_LIMIT } from '../../core/seance-api'
import { appEventToJson, type AppEvent, type EventDiagnostic } from '../../core/seance-event'
import { parseEventLog } from '../../core/seance-log'

/** The recorded Event_Log, next to the replay page. The build copies fixtures/replay/demo.jsonl here. */
export const FIXTURE_URL = './fixture.jsonl'

/** Presents the recording at its recorded pace. */
const REPLAY_SPEED = 1
/** A long silence in a recording is shortened to this, so a judge never waits on an empty house. */
const MAX_GAP_MS = 4_000

const EVENTS_ROUTE = /^\/apps\/haunted-house\/api\/mansions\/([^/?#]+)\/seance\/events(?:\?([^#]*))?$/

interface Recording {
  readonly timeline: ReplayTimeline
  readonly diagnostics: readonly EventDiagnostic[]
  /** False when the Spec 2 parser ended the valid prefix at an integrity failure. */
  readonly integrityOk: boolean
  /** Clock reading when playback started. */
  readonly startedAt: number
}

export interface SeanceReplayOptions {
  /** Defaults to the global fetch. */
  readonly fetch?: (url: string) => Promise<Response>
  /** Milliseconds clock. Defaults to Date.now. */
  readonly now?: () => number
  readonly speed?: number
  readonly maxGapMs?: number
}

export interface SeanceReplayRoutes {
  /**
   * Answers the canonical read route with the JSON the live backend would
   * send, or rejects with an SDK-style error. Returns null for any other path.
   */
  get(path: string): Promise<unknown> | null
  /**
   * The canonical records of one Mansion that playback has presented so far,
   * with the integrity verdict of the Spec 2 parser. For stand-ins of other
   * read routes that project the same recording. Fetches nothing new.
   */
  presented(mansionId: string): Promise<PresentedRecords>
}

export interface PresentedRecords {
  /** Valid-prefix records of the Mansion presented so far, in Sequence order. */
  readonly events: readonly AppEvent[]
  readonly integrityOk: boolean
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

/** One replay session over one recording. The recording is fetched once, on the first read. */
export function createSeanceReplayRoutes(options: SeanceReplayOptions = {}): SeanceReplayRoutes {
  const now = options.now ?? (() => Date.now())
  let loading: Promise<Recording> | null = null

  /** Fetches, parses and schedules the recording once. A failure is kept and not retried. */
  function load(): Promise<Recording> {
    loading ??= Promise.resolve()
      .then(() => (options.fetch ?? ((url: string) => fetch(url)))(FIXTURE_URL))
      .then((response) => {
        if (!response.ok) throw replayError(502, `Could not load the replay recording (HTTP ${response.status}).`)
        return response.text()
      })
      .then((text) => {
        const parsed = parseEventLog(text)
        return {
          timeline: createTimeline(parsed.events, {
            speed: options.speed ?? REPLAY_SPEED,
            maxGapMs: options.maxGapMs ?? MAX_GAP_MS,
          }),
          diagnostics: parsed.diagnostics,
          integrityOk: parsed.integrityOk,
          startedAt: now(),
        }
      })
    return loading
  }

  async function read(mansionId: string, query: URLSearchParams): Promise<unknown> {
    const afterSequence = sequenceParameter(query, 'after_sequence', 0, 0)
    const limit = sequenceParameter(query, 'limit', MAX_PAGE_LIMIT, 1)
    if (afterSequence === null || limit === null || limit > MAX_PAGE_LIMIT) {
      throw replayError(400, 'The replay read needs a valid after_sequence and a limit from 1 to 500.')
    }

    const { timeline, diagnostics, startedAt } = await load()
    // A per-Mansion log: Sequence only means something for the Mansion it was recorded in.
    const recorded = timeline.events.filter((event) => event.scope.mansion_id === mansionId)
    if (recorded.length === 0 && timeline.events.length > 0) {
      throw replayError(404, 'The replay has no séance log for this mansion.')
    }

    const elapsed = now() - startedAt
    const visible = timeline.events
      .slice(0, timeline.visibleCount(elapsed))
      .filter((event) => event.scope.mansion_id === mansionId)
    const nextInMs = timeline.nextInMs(elapsed)
    return {
      events: visible
        .filter((event) => event.sequence > afterSequence)
        .slice(0, limit)
        .map(appEventToJson),
      highest_sequence: visible.at(-1)?.sequence ?? 0,
      valid_prefix_sequence: timeline.events.at(-1)?.sequence ?? 0,
      diagnostics,
      ...(nextInMs === null ? {} : { next_event_in_ms: nextInMs }),
    }
  }

  return {
    async presented(mansionId) {
      const { timeline, integrityOk, startedAt } = await load()
      return {
        events: timeline.events
          .slice(0, timeline.visibleCount(now() - startedAt))
          .filter((event) => event.scope.mansion_id === mansionId),
        integrityOk,
      }
    },
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
