// Where the Attic reads its Event_Log from (replay-and-submission task 3.1;
// Requirements 1.1, 1.2, 1.4, 4.2, 4.3, 4.5, 4.6).
//
// Two sources, one per build, and no fallback between them:
//   live    pages the Spec 2 signed read route of the open Mansion, and
//           nothing else: no Crew chat history, no snapshot, no other route.
//   static  reads the text of `./fixture.jsonl` through the replay seam of
//           the SDK boundary, and nothing else.
// Both hand records to the Spec 2 Canonical_Parser and Event_Selector through
// the canonical replay port. A failure yields fixed bounded copy and no
// records; it never triggers a second request to another place.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CANONICAL_REPLAY_PORT,
  REPLAY_DIAGNOSTIC_TEXT,
  parserDiagnostic,
  selectCanonical,
  type CanonicalSelection,
  type ReplayDiagnostic,
} from '../core/replay-timeline'
import { MAX_PAGE_LIMIT, errorCodeOf, httpStatusOf, parseCanonicalPage, seanceEventsPath } from '../core/seance-api'
import type { AppEvent } from '../core/seance-event'
import { REPLAY_RECORDING, useAppApi, type ReplayRecordingSeam } from './sdk'

export type AtticLogStatus = 'loading' | 'ready' | 'error'

/**
 * One read of a Mansion's Event_Log. `selection` holds the records the Spec 2
 * parser and selector returned, in Canonical_Order, with their diagnostics.
 * (design.md sketches a `text` field; the live route answers parsed pages, not
 * text, so both sources hand over the selection the parser made.)
 */
export interface AtticLogResult {
  readonly status: AtticLogStatus
  /** Null while loading and after a failure. */
  readonly selection: CanonicalSelection | null
  /** Fixed copy of a failure, or null. Never a response body, URL or exception text. */
  readonly safeMessage: string | null
}

export const ATTIC_LOG_LOADING: AtticLogResult = { status: 'loading', selection: null, safeMessage: null }
export const ATTIC_LOG_FAILED: AtticLogResult = {
  status: 'error',
  selection: null,
  safeMessage: REPLAY_DIAGNOSTIC_TEXT.fixture_unavailable,
}

/** Most pages one live read follows: 100,000 records. A longer log is reported, not chased. */
export const MAX_ATTIC_PAGES = 200
/** Most diagnostics kept from a live read. */
export const MAX_ATTIC_DIAGNOSTICS = 50

const EMPTY_SELECTION: CanonicalSelection = { records: [], diagnostics: [], integrityOk: true }

function ready(selection: CanonicalSelection): AtticLogResult {
  return { status: 'ready', selection, safeMessage: null }
}

/** The records of one Mansion. Canonical_Order and the log's diagnostics are kept. */
function ofMansion(selection: CanonicalSelection, mansionId: string): CanonicalSelection {
  return { ...selection, records: selection.records.filter((record) => record.scope.mansion_id === mansionId) }
}

/** Static replay: the one recording, parsed by the Canonical_Parser. Makes no request of its own. */
export async function loadStaticAtticLog(
  seam: Pick<ReplayRecordingSeam, 'load'>,
  mansionId: string,
): Promise<AtticLogResult> {
  let text: string
  try {
    text = await seam.load()
  } catch {
    return ATTIC_LOG_FAILED
  }
  if (typeof text !== 'string') return ATTIC_LOG_FAILED
  return ready(ofMansion(CANONICAL_REPLAY_PORT.parse(text), mansionId))
}

/** The one client method the live source uses. */
export interface AtticLogApi {
  get(path: string): Promise<unknown>
}

/**
 * Live: pages `GET …/mansions/{id}/seance/events` from Sequence zero until the
 * backend has nothing newer. Every record passes the canonical parser inside
 * `parseCanonicalPage`; the backend's own diagnostics are kept by line.
 */
export async function loadLiveAtticLog(api: AtticLogApi, mansionId: string): Promise<AtticLogResult> {
  const records: AppEvent[] = []
  const diagnostics: ReplayDiagnostic[] = []
  const seen = new Set<string>()
  let after = 0
  try {
    for (let page = 0; page < MAX_ATTIC_PAGES; page += 1) {
      const parsed = parseCanonicalPage(await api.get(seanceEventsPath(mansionId, after, MAX_PAGE_LIMIT)))
      if (!parsed.ok) return ATTIC_LOG_FAILED
      for (const raw of parsed.page.diagnostics) {
        const diagnostic = parserDiagnostic(raw)
        const key = `${diagnostic.code}:${diagnostic.line ?? ''}`
        if (seen.has(key) || diagnostics.length >= MAX_ATTIC_DIAGNOSTICS) continue
        seen.add(key)
        diagnostics.push(diagnostic)
      }
      let highest = after
      for (const event of parsed.page.events) {
        if (event.scope.mansion_id === mansionId) records.push(event)
        highest = Math.max(highest, event.sequence)
      }
      // Stop when the backend has nothing newer, or a page brought no progress.
      if (highest === after || highest >= parsed.page.highestSequence) break
      after = highest
    }
  } catch (error) {
    // A Mansion nothing has happened in yet has no log: that is an empty one, not a failure.
    if (httpStatusOf(error) === 404 && errorCodeOf(error) === 'log_not_found') return ready(EMPTY_SELECTION)
    return ATTIC_LOG_FAILED
  }
  return ready(
    selectCanonical(records, {
      diagnostics,
      integrityOk: !diagnostics.some((diagnostic) => diagnostic.code === 'integrity_failed'),
    }),
  )
}

export interface AtticLog {
  readonly result: AtticLogResult
  /** `replay`: the static build, reading the recording. `live`: Crew, reading the signed route. */
  readonly mode: 'live' | 'replay'
  /** Reads the log again from its one source. */
  readonly reload: () => void
}

/** The Event_Log of one Mansion from this build's one source. Reads on mount and on `reload`. */
export function useAtticLog(mansionId: string): AtticLog {
  const api = useAppApi()
  // The host may hand out a new client object on every render.
  const apiRef = useRef(api)
  apiRef.current = api
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<AtticLogResult>(ATTIC_LOG_LOADING)

  useEffect(() => {
    let cancelled = false
    setResult(ATTIC_LOG_LOADING)
    const load =
      REPLAY_RECORDING === null
        ? loadLiveAtticLog({ get: (path) => apiRef.current.get(path) }, mansionId)
        : loadStaticAtticLog(REPLAY_RECORDING, mansionId)
    void load.then((next) => {
      if (!cancelled) setResult(next)
    })
    return () => {
      cancelled = true
    }
  }, [mansionId, attempt])

  const reload = useCallback(() => setAttempt((count) => count + 1), [])
  return { result, mode: REPLAY_RECORDING === null ? 'live' : 'replay', reload }
}
