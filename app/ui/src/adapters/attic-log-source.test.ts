// The Attic's two Event_Log sources (replay-and-submission task 3.4).
// **Validates: Requirements 1.1, 1.2, 1.4, 4.3, 4.5, 4.6**
import { describe, expect, it, vi } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import { REPLAY_DIAGNOSTIC_TEXT, parseCanonicalLog } from '../core/replay-timeline'
import { appEventToJson, type AppEvent } from '../core/seance-event'
import { parseEventLog } from '../core/seance-log'
import {
  ATTIC_LOG_FAILED,
  MAX_ATTIC_PAGES,
  loadLiveAtticLog,
  loadStaticAtticLog,
} from './attic-log-source'

const MANSION = 'demo-mansion'
const LOG = parseEventLog(demo).events
const EVENTS_PATH = /^\/apps\/haunted-house\/api\/mansions\/demo-mansion\/seance\/events\?after_sequence=(\d+)&limit=500$/

/** A backend that serves `records` in pages of `pageSize`, like the Spec 2 read route. */
function backend(records: readonly AppEvent[], pageSize: number, diagnostics: readonly unknown[] = []) {
  const get = vi.fn(async (path: string): Promise<unknown> => {
    const match = EVENTS_PATH.exec(path)
    if (match === null) throw new Error(`The Attic must not request ${path}.`)
    const after = Number(match[1])
    return {
      events: records
        .filter((record) => record.sequence > after)
        .slice(0, pageSize)
        .map(appEventToJson),
      highest_sequence: records.at(-1)?.sequence ?? 0,
      diagnostics,
    }
  })
  return { get }
}

function sdkError(status: number, body: unknown): Error {
  return Object.assign(new Error(`API ${status}`), { name: 'AppApiError', status, body: JSON.stringify(body) })
}

describe('static Attic log source', () => {
  it('reads the recording once through the seam and parses it with the canonical parser', async () => {
    const load = vi.fn(async () => demo)
    const result = await loadStaticAtticLog({ load }, MANSION)
    expect(load).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ status: 'ready', selection: parseCanonicalLog(demo), safeMessage: null })
    expect(result.selection?.records).toEqual(LOG)
  })

  it('keeps only the records of the open Mansion, in Canonical_Order', async () => {
    const result = await loadStaticAtticLog({ load: async () => demo }, 'another-mansion')
    expect(result).toMatchObject({ status: 'ready', selection: { records: [], integrityOk: true } })
  })

  it('preserves line diagnostics and every valid record of a log with a malformed line', async () => {
    const lines = demo.split('\n')
    lines.splice(3, 0, '{"not": "a record", "token": "sk-live-PLANTED"}')
    const result = await loadStaticAtticLog({ load: async () => lines.join('\n') }, MANSION)
    expect(result.status).toBe('ready')
    expect(result.selection?.diagnostics).toEqual([
      { code: 'invalid_record', line: 4, safeDetail: REPLAY_DIAGNOSTIC_TEXT.invalid_record },
    ])
    expect(JSON.stringify(result.selection?.diagnostics)).not.toContain('PLANTED')
    expect(result.selection?.records.length).toBeGreaterThan(0)
  })

  it('answers a failed load with fixed copy and no records, and asks nowhere else', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const load = vi.fn(async (): Promise<string> => {
        throw new Error('GET https://example.invalid/secret failed for /Users/someone')
      })
      const result = await loadStaticAtticLog({ load }, MANSION)
      expect(result).toBe(ATTIC_LOG_FAILED)
      expect(result).toEqual({ status: 'error', selection: null, safeMessage: 'The replay recording could not be loaded.' })
      expect(load).toHaveBeenCalledTimes(1)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('live Attic log source', () => {
  it('pages only the signed read route until the backend has nothing newer', async () => {
    const api = backend(LOG, 25)
    const result = await loadLiveAtticLog(api, MANSION)
    expect(result).toEqual({ status: 'ready', selection: parseCanonicalLog(demo), safeMessage: null })
    // 91 records in pages of 25: four reads, each after the last Sequence it holds.
    expect(LOG).toHaveLength(91)
    expect(api.get.mock.calls.map(([path]) => EVENTS_PATH.exec(path)?.[1])).toEqual(['0', '25', '50', '75'])
  })

  it('reads a short log in one request', async () => {
    const api = backend(LOG.slice(0, 5), 500)
    const result = await loadLiveAtticLog(api, MANSION)
    expect(result.selection?.records).toEqual(LOG.slice(0, 5))
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it('puts records in Canonical_Order and collapses a repeated page', async () => {
    const shuffled = [...LOG.slice(0, 10)].reverse()
    const get = vi.fn(async () => ({ events: [...shuffled, ...shuffled].map(appEventToJson), highest_sequence: 10, diagnostics: [] }))
    const result = await loadLiveAtticLog({ get }, MANSION)
    expect(result.selection?.records).toEqual(LOG.slice(0, 10))
  })

  it('drops records of another Mansion', async () => {
    const foreign = LOG.slice(0, 3).map((record) => ({ ...record, scope: { ...record.scope, mansion_id: 'other' } }))
    const get = vi.fn(async () => ({ events: foreign.map(appEventToJson), highest_sequence: 3, diagnostics: [] }))
    const result = await loadLiveAtticLog({ get }, MANSION)
    expect(result).toMatchObject({ status: 'ready', selection: { records: [] } })
  })

  it('keeps the backend diagnostics by line as fixed copy, once, and marks a failed integrity check', async () => {
    const diagnostics = [
      { code: 'hash_mismatch', line: 12, reason: 'expected deadbeef at /Users/someone/.haunted-house' },
      { code: 'invalid_record', line: 30, safe_detail: 'x' },
    ]
    const result = await loadLiveAtticLog(backend(LOG.slice(0, 11), 4, diagnostics), MANSION)
    expect(result.selection).toMatchObject({
      integrityOk: false,
      diagnostics: [
        { code: 'integrity_failed', line: 12, safeDetail: REPLAY_DIAGNOSTIC_TEXT.integrity_failed },
        { code: 'invalid_record', line: 30, safeDetail: REPLAY_DIAGNOSTIC_TEXT.invalid_record },
      ],
    })
    expect(JSON.stringify(result)).not.toContain('someone')
    expect(result.selection?.records).toEqual(LOG.slice(0, 11))
  })

  it('reports a record the canonical parser refuses and keeps the valid ones', async () => {
    const events = [...LOG.slice(0, 3).map(appEventToJson), { schema_version: 1, event_type: 'run_started' }]
    const get = vi.fn(async () => ({ events, highest_sequence: 3, diagnostics: [] }))
    const result = await loadLiveAtticLog({ get }, MANSION)
    expect(result.selection?.records).toEqual(LOG.slice(0, 3))
    expect(result.selection?.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['invalid_record'])
  })

  it('treats a Mansion without a log as an empty one', async () => {
    const get = vi.fn(async () => {
      throw sdkError(404, { error: { code: 'log_not_found', message: 'no log' } })
    })
    expect(await loadLiveAtticLog({ get }, MANSION)).toEqual({
      status: 'ready',
      selection: { records: [], diagnostics: [], integrityOk: true },
      safeMessage: null,
    })
  })

  it.each([
    ['a server error', () => Promise.reject(sdkError(500, { error: { code: 'internal', message: 'boom /Users/someone' } }))],
    ['another 404', () => Promise.reject(sdkError(404, { error: { code: 'mansion_not_found' } }))],
    ['a thrown scope refusal', () => { throw new Error('path outside permissions.api') }],
    ['a body that is not a page', () => Promise.resolve({ snapshot: {} })],
  ] as const)('answers %s with fixed copy, no records, and no second request anywhere', async (_name, answer) => {
    const get = vi.fn(async (_path: string): Promise<unknown> => answer())
    const result = await loadLiveAtticLog({ get }, MANSION)
    expect(result).toBe(ATTIC_LOG_FAILED)
    // One request to the one route: no chat history, snapshot or fallback read follows.
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][0]).toMatch(EVENTS_PATH)
  })

  it('stops after a bounded number of pages when the backend never finishes', async () => {
    let sequence = 0
    const get = vi.fn(async () => {
      sequence += 1
      return { events: [appEventToJson({ ...LOG[0], sequence })], highest_sequence: Number.MAX_SAFE_INTEGER, diagnostics: [] }
    })
    const result = await loadLiveAtticLog({ get }, MANSION)
    expect(get).toHaveBeenCalledTimes(MAX_ATTIC_PAGES)
    expect(result.status).toBe('ready')
  })
})
