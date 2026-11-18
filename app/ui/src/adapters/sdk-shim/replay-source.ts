// The one recording of the static replay (replay-and-submission task 3.2;
// Requirements 1.2, 1.7, 4.3, 4.5).
//
// The replay build has exactly one source of event data: `./fixture.jsonl`, a
// canonical Event_Log. This file fetches it once, has the Spec 2
// Canonical_Parser verify it, and puts its valid prefix in Canonical_Order
// with the Spec 2 Event_Selector. A failed fetch is kept and never retried,
// and there is no second URL to fall back to.
//
// Nothing here reads a clock. Which records the stand-in's read routes serve
// is decided by the Attic: `present(mansion, cursor)` names a prefix length,
// and the routes serve exactly `records.slice(0, cursor)` of that Mansion.
// Until the Attic presents something, the prefix is empty: a recording never
// plays by itself.
import { selectCanonical } from '../../core/replay-timeline'
import type { AppEvent, EventDiagnostic } from '../../core/seance-event'
import { parseEventLog } from '../../core/seance-log'

/** The recorded Event_Log, next to the replay page. The build copies fixtures/replay/demo.jsonl here. */
export const FIXTURE_URL = './fixture.jsonl'

/** Fixed copy of a failed load. Never a response body, a URL or an exception text. */
export const FIXTURE_UNAVAILABLE_TEXT = 'Could not load the replay recording.'

export interface ReplaySourceOptions {
  /** Defaults to the global fetch. Called once, with `FIXTURE_URL` only. */
  readonly fetch?: (url: string) => Promise<Response>
  /** A séance log the visitor opened from their own computer: used instead of the fixture, and nothing is fetched. */
  readonly text?: string
}

export interface Recording {
  /** The valid prefix of the log, every Mansion, in Canonical_Order. */
  readonly records: readonly AppEvent[]
  /** The Spec 2 parser's diagnostics, in file order. */
  readonly diagnostics: readonly EventDiagnostic[]
  /** False when the Spec 2 parser ended the valid prefix at an integrity failure. */
  readonly integrityOk: boolean
}

export interface PresentedRecords {
  /** The records of the Mansion the Attic has presented so far, in Canonical_Order. */
  readonly events: readonly AppEvent[]
  readonly integrityOk: boolean
}

export interface ReplaySource {
  /** The text of `./fixture.jsonl`. One request per page, shared by every caller. */
  loadText(): Promise<string>
  /** The parsed recording, from the same one request. */
  recording(): Promise<Recording>
  /**
   * Sets how many records of a Mansion the read routes serve: the Attic's
   * Cursor. Anything but an integer of zero or more is ignored.
   */
  present(mansionId: string, cursor: number): void
  /** The prefix length last presented for a Mansion. Zero until the Attic presents one. */
  presentedCount(mansionId: string): number
  /** The presented prefix of one Mansion. Fetches nothing new. */
  presented(mansionId: string): Promise<PresentedRecords>
}

function unavailable(): Error {
  return Object.assign(new Error(`API 502: ${FIXTURE_UNAVAILABLE_TEXT}`), {
    name: 'AppApiError',
    status: 502,
    body: FIXTURE_UNAVAILABLE_TEXT,
  })
}

/** One replay session over one recording. */
export function createReplaySource(options: ReplaySourceOptions = {}): ReplaySource {
  let text: Promise<string> | null = null
  let parsed: Promise<Recording> | null = null
  const cursors = new Map<string, number>()

  function loadText(): Promise<string> {
    if (options.text !== undefined) text ??= Promise.resolve(options.text)
    text ??= Promise.resolve()
      .then(() => (options.fetch ?? ((url: string) => fetch(url)))(FIXTURE_URL))
      .then(
        (response) => {
          if (!response.ok) throw unavailable()
          return response.text()
        },
        () => {
          throw unavailable()
        },
      )
    return text
  }

  function recording(): Promise<Recording> {
    parsed ??= loadText().then((body) => {
      const log = parseEventLog(body)
      return {
        records: selectCanonical(log.events).records,
        diagnostics: log.diagnostics,
        integrityOk: log.integrityOk,
      }
    })
    return parsed
  }

  const presentedCount = (mansionId: string): number => cursors.get(mansionId) ?? 0

  return {
    loadText,
    recording,
    present(mansionId, cursor) {
      if (Number.isSafeInteger(cursor) && cursor >= 0) cursors.set(mansionId, cursor)
    },
    presentedCount,
    async presented(mansionId) {
      const { records, integrityOk } = await recording()
      return {
        events: records.filter((event) => event.scope.mansion_id === mansionId).slice(0, presentedCount(mansionId)),
        integrityOk,
      }
    },
  }
}
