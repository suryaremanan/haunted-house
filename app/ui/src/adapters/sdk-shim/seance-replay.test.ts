// Replay séance read route: the recording as the only event source (task 8.3).
// **Validates: Requirements 7.4, 7.5, 7.6, 8.3, 8.4, 8.5, 8.6**
import { describe, expect, it, vi } from 'vitest'
import demo from '../../../../../fixtures/replay/demo.jsonl?raw'
import { parseCanonicalPage, seanceEventsPath } from '../../core/seance-api'
import { parseEventLog } from '../../core/seance-log'
import { FIXTURE_URL, createSeanceReplayRoutes } from './seance-replay'

const LOG = parseEventLog(demo).events
const MANSION = 'demo-mansion'

function setup(text: string = demo, response: () => Response = () => new Response(text, { status: 200 })) {
  let now = 50_000
  const fetchSpy = vi.fn(async (_url: string) => response())
  const routes = createSeanceReplayRoutes({ fetch: fetchSpy, now: () => now })
  return {
    routes,
    fetchSpy,
    advance(ms: number) {
      now += ms
    },
    async read(afterSequence = 0, limit = 500, mansion = MANSION) {
      const body = await routes.get(seanceEventsPath(mansion, afterSequence, limit))
      const parsed = parseCanonicalPage(body)
      if (!parsed.ok) throw new Error(parsed.diagnostic.safe_detail)
      return { body: body as Record<string, unknown>, page: parsed.page }
    },
  }
}

describe('replay séance read route', () => {
  it('answers only the canonical read route and fetches nothing for other paths', () => {
    const { routes, fetchSpy } = setup()
    for (const path of [
      '/api/version',
      '/apps/haunted-house/api/mansions',
      `/apps/haunted-house/api/mansions/${MANSION}/seance/ingest`,
      `/apps/haunted-house/api/mansions/${MANSION}/seance/events/extra`,
      `/apps/other/api/mansions/${MANSION}/seance/events`,
    ]) {
      expect(routes.get(path)).toBeNull()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches ./fixture.jsonl once however many reads follow', async () => {
    const { read, fetchSpy } = setup()
    await Promise.all([read(), read(3), read(0, 5)])
    await read()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith(FIXTURE_URL)
  })

  it('reveals records in Sequence order as playback time passes, then all of them', async () => {
    const { read, advance } = setup()

    const start = await read()
    // Playback starts when the recording has loaded: only what is due at time zero.
    expect(start.page.events.length).toBeGreaterThan(0)
    expect(start.page.events.length).toBeLessThan(LOG.length)
    expect(start.page.events).toEqual(LOG.slice(0, start.page.events.length))
    expect(start.page.highestSequence).toBe(start.page.events.length)
    expect(start.page.nextEventInMs).toBeGreaterThan(0)

    let seen = start.page.events.length
    let hint = start.page.nextEventInMs
    for (let step = 0; step < LOG.length && hint !== null; step += 1) {
      // Just before the hint nothing new is readable; at the hint something is.
      advance(hint - 1)
      expect((await read(seen)).page.events).toEqual([])
      advance(1)
      const next = await read(seen)
      expect(next.page.events.length).toBeGreaterThan(0)
      expect(next.page.events).toEqual(LOG.slice(seen, seen + next.page.events.length))
      seen += next.page.events.length
      expect(next.page.highestSequence).toBe(seen)
      hint = next.page.nextEventInMs
    }
    expect(seen).toBe(LOG.length)
    expect(hint).toBeNull()

    const end = await read()
    expect(end.page.events).toEqual(LOG)
    expect(end.body).not.toHaveProperty('next_event_in_ms')
    expect(end.page.diagnostics).toEqual([])
  })

  it('pages by after_sequence and limit like the live route', async () => {
    const { read, advance } = setup()
    await read()
    advance(10 * 60_000)

    expect((await read(0, 4)).page.events).toEqual(LOG.slice(0, 4))
    expect((await read(4, 4)).page.events).toEqual(LOG.slice(4, 8))
    expect((await read(LOG.length)).page.events).toEqual([])
    expect((await read(LOG.length - 1)).page).toMatchObject({ events: [LOG.at(-1)], highestSequence: LOG.length })
  })

  it.each([
    ['after_sequence=-1&limit=5'],
    ['after_sequence=abc'],
    ['after_sequence=0&limit=0'],
    ['after_sequence=0&limit=501'],
    ['after_sequence=1.5'],
  ])('rejects ?%s with status 400', async (query) => {
    const { routes } = setup()
    await expect(routes.get(`/apps/haunted-house/api/mansions/${MANSION}/seance/events?${query}`)).rejects.toMatchObject({
      status: 400,
    })
  })

  it('has no log for a mansion the recording does not contain', async () => {
    const { routes } = setup()
    await expect(routes.get(seanceEventsPath('other-mansion', 0))).rejects.toMatchObject({ status: 404 })
  })

  it('serves an empty recording as an empty log', async () => {
    const { read } = setup('')
    const { page } = await read()
    expect(page).toMatchObject({ events: [], highestSequence: 0, diagnostics: [], nextEventInMs: null })
  })

  it('serves only the valid prefix of a damaged recording, with the safe diagnostic', async () => {
    const lines = demo.split('\n').filter((line) => line !== '')
    lines.splice(9, 1) // Sequence 10 is missing.
    const { read, advance } = setup(`${lines.join('\n')}\n`)
    await read()
    advance(10 * 60_000)

    const { page, body } = await read()
    expect(page.events).toEqual(LOG.slice(0, 9))
    expect(page.highestSequence).toBe(9)
    expect(body.valid_prefix_sequence).toBe(9)
    expect(page.diagnostics).toEqual([expect.objectContaining({ code: 'missing_sequence', line: 10 })])
    expect(page.nextEventInMs).toBeNull()
  })

  it('rejects every read when the recording cannot be loaded, without fetching again', async () => {
    const missing = setup(demo, () => new Response('not found', { status: 404 }))
    await expect(missing.routes.get(seanceEventsPath(MANSION, 0))).rejects.toMatchObject({ status: 502 })
    await expect(missing.routes.get(seanceEventsPath(MANSION, 0))).rejects.toMatchObject({ status: 502 })
    expect(missing.fetchSpy).toHaveBeenCalledTimes(1)

    const offline = createSeanceReplayRoutes({
      fetch: async () => {
        throw new TypeError('offline')
      },
    })
    await expect(offline.get(seanceEventsPath(MANSION, 0))).rejects.toBeInstanceOf(TypeError)
  })
})
