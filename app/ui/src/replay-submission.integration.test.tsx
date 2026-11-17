// Cross-layer live/replay integration (replay-and-submission task 10.2).
// One canonical Event_Log is driven two ways through the same root component:
// as live acknowledgements served by a backend double, and as the Static
// Replay fixture loaded by the SDK stand-in. The selected records, the final
// house, the Attic and its diagnostics must agree, a record the backend has
// not acknowledged must never appear in a replay, and the replay page must
// stay read-only and off every live transport.
// **Validates: Requirements 1.1-1.7, 3.1-3.9, 4.1-4.9, 11.3, 11.4, 11.5**
import { act, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import expected from '../../../fixtures/replay/demo.expected.json'
import demo from '../../../fixtures/replay/demo.jsonl?raw'
import recordedMansions from '../../../fixtures/replay/mansions.json'
import { buildReplayModel, foldLive, parseCanonicalLog, replayFoldFor, workflowOf } from './core/replay-timeline'
import { appEventToJson } from './core/seance-event'
import { parseEventLog } from './core/seance-log'
import { atGate } from './test/first-visit-kit'

const FIXTURE_URL = './fixture.jsonl'
const MANSION = 'demo-mansion'
const LOG = parseEventLog(demo).events
const TOTAL = LOG.length
const MODEL = buildReplayModel(parseCanonicalLog(demo))
const FOLD = replayFoldFor(MODEL)

interface LiveBackend {
  /** How many records of the log the backend has acknowledged and will serve. */
  acknowledged: number
}

interface Mounted {
  readonly container: HTMLElement
  readonly unexpected: string[]
  readonly requests: string[]
  readonly hostEffects: string[]
  readonly fetchSpy: ReturnType<typeof vi.fn>
  readonly advance: (ms: number) => Promise<void>
  readonly unmount: () => void
}

function blocked(name: string, unexpected: string[]) {
  return class {
    constructor() {
      unexpected.push(name)
      throw new Error(`The page must not open a ${name}.`)
    }
  }
}

/** Mounts src/App.tsx on the replay stand-in (`fixture` text) or on a live backend double. */
async function mount(source: { fixture: string } | { live: LiveBackend }): Promise<Mounted> {
  vi.resetModules()
  const unexpected: string[] = []
  const requests: string[] = []
  const hostEffects: string[] = []
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!('fixture' in source) || url !== FIXTURE_URL || (init?.method ?? 'GET') !== 'GET') {
      unexpected.push(`fetch ${url}`)
      throw new TypeError(`The page must not request ${url}.`)
    }
    return new Response(source.fixture, { status: 200 })
  })
  vi.stubGlobal('fetch', fetchSpy)
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) vi.stubGlobal(name, blocked(name, unexpected))

  if ('fixture' in source) {
    vi.doMock('@kirocrew/app-sdk', () => import('./adapters/sdk-shim'))
  } else {
    const backend = source.live
    const { foldWorkflow } = await import('./core/workflow-fold')
    const { workflowProjectionToJson } = await import('./core/workflow-projection')
    const { emptyRoomGhosts, roomGhostsToJson } = await import('./core/room-projection')
    const mansions = recordedMansions.mansions
    const served = () => LOG.slice(0, backend.acknowledged)
    const get = async (path: string): Promise<unknown> => {
      requests.push(`GET ${path}`)
      const workflow = foldWorkflow(served(), { mansionId: MANSION }).projection
      if (path.endsWith('/whoami')) return { backend: 'ok', gateway: { version: '0.12.2' } }
      if (path.endsWith('/api/mansions')) return { schemaVersion: 1, mansions }
      if (path.endsWith('/workflow')) return workflowProjectionToJson(workflow)
      if (path.endsWith('/room-ghosts')) {
        return roomGhostsToJson(emptyRoomGhosts(MANSION, MANSION, { version: workflow.version, integrity: 'valid' }))
      }
      const events = /\/seance\/events\?after_sequence=(\d+)&limit=\d+$/.exec(path)
      if (events !== null) {
        return {
          events: served().filter((record) => record.sequence > Number(events[1])).map(appEventToJson),
          highest_sequence: backend.acknowledged,
          diagnostics: [],
        }
      }
      unexpected.push(`GET ${path}`)
      throw new Error(`unexpected GET ${path}`)
    }
    const post = async (path: string, body?: { name?: string }): Promise<unknown> => {
      requests.push(`POST ${path}`)
      if (path.endsWith('/mansions/open')) return { mansion: mansions.find(({ name }) => name === body?.name) }
      unexpected.push(`POST ${path}`)
      throw new Error(`unexpected POST ${path}`)
    }
    vi.doMock('@kirocrew/app-sdk', () => ({
      useAppApi: () => ({ get, post, put: post, patch: post, del: post }),
      useAppEvents: () => () => {},
      useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
      useNotify: () => (text: string) => hostEffects.push(`toast ${text}`),
      useNavBadge: () => (count: number) => hostEffects.push(`badge ${count}`),
    }))
  }

  const { default: Root } = await import('./App')
  const view = render(<Root />)
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  await advance(0)
  return { container: view.container, unexpected, requests, hostEffects, fetchSpy, advance, unmount: view.unmount }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
})

const page = (mounted: Mounted) => within(mounted.container)
const atticRegion = (mounted: Mounted) => page(mounted).getByRole('region', { name: 'Attic' })
const atticPanel = (mounted: Mounted) => mounted.container.querySelector<HTMLElement>('[data-attic-panel]')!
const slider = (mounted: Mounted) => within(atticRegion(mounted)).getByRole('slider') as HTMLInputElement
const seek = (mounted: Mounted, cursor: number) => act(() => fireEvent.change(slider(mounted), { target: { value: String(cursor) } }))
const mapSignature = (mounted: Mounted) =>
  Array.from(mounted.container.querySelectorAll<HTMLElement>('[data-door-control], [data-ghost-control]'), (control) =>
    [control.dataset.doorControl ?? control.dataset.ghostControl, control.dataset.status ?? '', control.dataset.door ?? control.dataset.ghost].join(':'),
  ).join('|')

async function openMansion(mounted: Mounted) {
  for (let turn = 0; turn < 5; turn += 1) await mounted.advance(1)
  if (atGate(mounted.container)) fireEvent.click(page(mounted).getByRole('button', { name: 'Knock' }))
  fireEvent.click(page(mounted).getByRole('radio', { name: /^demo-mansion\b/ }))
  await act(async () => {
    fireEvent.click(page(mounted).getByRole('button', { name: 'Open demo-mansion' }))
  })
  for (let turn = 0; turn < 5; turn += 1) await mounted.advance(1)
}

async function openAttic(mounted: Mounted) {
  const control = page(mounted).getByRole('button', { name: /^Attic\./ })
  control.focus()
  fireEvent.click(control)
  await mounted.advance(0)
  return atticRegion(mounted)
}

async function atticOf(source: { fixture: string } | { live: LiveBackend }): Promise<Mounted> {
  const mounted = await mount(source)
  await openMansion(mounted)
  await openAttic(mounted)
  return mounted
}

/** What the Attic shows, as data: timeline rows, summary lines and diagnostics. */
function atticFacts(mounted: Mounted) {
  const panel = atticPanel(mounted)
  const rows = Array.from(panel.querySelectorAll<HTMLElement>('[data-attic="timeline"] [data-position]'))
  return {
    max: Number(slider(mounted).max),
    cursor: Number(slider(mounted).value),
    timeline: rows.map((row) => row.textContent ?? ''),
    played: rows.filter((row) => row.dataset.played === 'true').length,
    phases: Array.from(panel.querySelectorAll<HTMLElement>('[data-attic="summary"] [data-phase]'), (line) => [line.dataset.phase, line.dataset.status, line.dataset.door]),
    ghosts: Array.from(panel.querySelectorAll<HTMLElement>('[data-attic="summary"] [data-ghost]'), (line) => [line.dataset.ghost, line.dataset.state]),
    diagnostics: panel.querySelector('[data-attic="diagnostics"]')?.textContent ?? '',
    noDiagnostics: panel.querySelector('[data-attic="diagnostics-empty"]') !== null,
  }
}

describe('one canonical Event_Log, live and replayed', () => {
  it('selects the same records in the same order as the committed expectation', () => {
    // The fixture builder (Python, backend parser and selector) and the UI parser agree record for record.
    expect(expected.mansion_id).toBe(MANSION)
    expect(expected.record_count).toBe(TOTAL)
    expect(MODEL.records.map((record) => record.record_id)).toEqual(expected.selected_record_ids)
    expect(MODEL.timeline.map((entry) => entry.recordId)).toEqual(expected.selected_record_ids)
    expect(MODEL.diagnostics).toEqual([])
    expect(FOLD(MODEL.records)).toEqual(foldLive(LOG))
  })

  it('shows the same Attic and the same final house from live acknowledgements and from the fixture', async () => {
    const replay = await atticOf({ fixture: demo })
    seek(replay, TOTAL)
    const replayFacts = atticFacts(replay)
    const replayHouse = mapSignature(replay)
    expect(replay.unexpected).toEqual([])
    replay.unmount()
    vi.doUnmock('@kirocrew/app-sdk')

    const live = await atticOf({ live: { acknowledged: TOTAL } })
    seek(live, TOTAL)
    const liveFacts = atticFacts(live)

    expect(liveFacts).toEqual(replayFacts)
    expect(mapSignature(live)).toBe(replayHouse)
    // Both equal the pure fold of the selected records: phases, Doors and Ghost states.
    const workflow = workflowOf(FOLD(MODEL.records), MANSION)!
    expect(liveFacts.max).toBe(TOTAL)
    expect(liveFacts.timeline).toHaveLength(TOTAL)
    expect(liveFacts.played).toBe(TOTAL)
    expect(liveFacts.phases).toEqual(workflow.phases.map((phase) => [phase.phase, phase.status, phase.door.status]))
    expect(liveFacts.ghosts.map(([ghost]) => ghost).sort()).toEqual([...expected.narrative.ghost_ids].sort())
    expect(liveFacts.noDiagnostics).toBe(true)
    expect(live.unexpected).toEqual([])
    // The live Attic read only the canonical Event_Log route, never chat history or a snapshot.
    const reads = live.requests.filter((request) => /seance|chat|snapshot|history/.test(request))
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.every((request) => /^GET \/apps\/haunted-house\/api\/mansions\/[^/]+\/seance\/events\?/.test(request))).toBe(true)
  })

  it.each([1, 17, TOTAL - 1])('keeps a record the backend has not acknowledged out of the replay (%i acknowledged)', async (acknowledged) => {
    // The rest of the log exists upstream but its acknowledgement is held.
    const live = await atticOf({ live: { acknowledged } })
    seek(live, acknowledged)
    const liveFacts = atticFacts(live)
    expect(liveFacts.max).toBe(acknowledged)
    expect(liveFacts.timeline).toHaveLength(acknowledged)
    // A seek past the acknowledged prefix changes nothing.
    seek(live, TOTAL)
    expect(atticFacts(live).cursor).toBeLessThanOrEqual(acknowledged)
    expect(atticFacts(live).timeline).toHaveLength(acknowledged)
    live.unmount()
    vi.doUnmock('@kirocrew/app-sdk')

    // The acknowledged prefix replayed as a static fixture is the same Attic.
    const prefix = demo.split('\n').slice(0, acknowledged).join('\n') + '\n'
    const replay = await atticOf({ fixture: prefix })
    seek(replay, acknowledged)
    expect(atticFacts(replay)).toEqual(liveFacts)
    // And it is exactly the fold of that prefix, with none of the held records.
    const workflow = workflowOf(FOLD(MODEL.records.slice(0, acknowledged)), MANSION)
    expect(liveFacts.phases).toEqual((workflow?.phases ?? []).map((phase) => [phase.phase, phase.status, phase.door.status]))
    const held = MODEL.timeline.slice(acknowledged).map((entry) => entry.recordId)
    for (const recordId of held) expect(atticPanel(replay).innerHTML).not.toContain(recordId)
  })

  it('replays the valid prefix of a damaged fixture with a line diagnostic and no raw payload', async () => {
    const lines = demo.trimEnd().split('\n')
    const marker = 'zq-raw-payload-marker'
    const damaged = [...lines.slice(0, 12), `{"damaged": "${marker}"`, ...lines.slice(12)].join('\n') + '\n'
    const replay = await atticOf({ fixture: damaged })
    const facts = atticFacts(replay)
    expect(facts.max).toBe(parseCanonicalLog(damaged).records.length)
    expect(facts.max).toBeGreaterThanOrEqual(12)
    expect(facts.noDiagnostics).toBe(false)
    expect(facts.diagnostics).toMatch(/Line 13\b/)
    expect(replay.container.innerHTML).not.toContain(marker)
    expect(replay.unexpected).toEqual([])
  })

  it('shows a diagnostic and an empty replay when the fixture is missing, with no fallback request', async () => {
    const replay = await mount({ fixture: '' })
    replay.fetchSpy.mockImplementation(async () => new Response('missing', { status: 404 }))
    await openMansion(replay)
    await openAttic(replay)
    const requested = replay.fetchSpy.mock.calls.map(([input]) => String(input))
    expect(requested.every((url) => url === FIXTURE_URL)).toBe(true)
    expect(replay.unexpected).toEqual([])
    expect(atticPanel(replay).querySelectorAll('[data-attic="timeline"] [data-position]')).toHaveLength(0)
  })
})

describe('static replay is read-only and isolated', () => {
  it('plays to the end with one fixture request, no live transport and no host effect', async () => {
    const replay = await atticOf({ fixture: demo })
    const play = atticPanel(replay).querySelector<HTMLButtonElement>('[data-attic="controls"] [data-action="play"]')!
    fireEvent.click(play)
    for (let step = 0; step < TOTAL + 2; step += 1) await replay.advance(4_000)
    const facts = atticFacts(replay)
    expect(facts.cursor).toBe(TOTAL)
    expect(facts.played).toBe(TOTAL)
    expect(atticPanel(replay)).toHaveAttribute('data-mode', 'replay')
    expect(replay.fetchSpy.mock.calls.map(([input]) => String(input))).toEqual([FIXTURE_URL])
    expect(replay.unexpected).toEqual([])
    const shim = await import('./adapters/sdk-shim')
    expect(shim.replayChatLauncherCalls).toEqual([])
  })

  it('offers no enabled live action, and pressing every enabled control sends nothing', async () => {
    const replay = await atticOf({ fixture: demo })
    seek(replay, TOTAL)
    const live = /^(approve|deny|start|retry|cancel|open (the )?(crew )?session)/i
    const named = (button: HTMLButtonElement) => live.test(button.textContent ?? '') || live.test(button.getAttribute('aria-label') ?? '')
    const enabled = (button: HTMLButtonElement) => !button.disabled && button.getAttribute('aria-disabled') !== 'true'
    expect(Array.from(replay.container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => named(button) && enabled(button))).toEqual([])
    expect(replay.container.textContent).toMatch(/read-only/i)

    // Press every enabled control the page offers, room by room; a recording answers none of them with a request.
    const fetches = replay.fetchSpy.mock.calls.length
    let pressed = 0
    for (let round = 0; round < 3; round += 1) {
      for (const button of Array.from(replay.container.querySelectorAll<HTMLButtonElement>('button'))) {
        if (!button.isConnected || !enabled(button)) continue
        await act(async () => {
          fireEvent.click(button)
        })
        await replay.advance(1)
        pressed += 1
      }
    }
    expect(pressed).toBeGreaterThan(10)
    expect(replay.fetchSpy.mock.calls.length).toBe(fetches)
    expect(replay.unexpected).toEqual([])
    const shim = await import('./adapters/sdk-shim')
    expect(shim.replayChatLauncherCalls).toEqual([])
    expect(Array.from(replay.container.querySelectorAll<HTMLButtonElement>('button')).filter((button) => named(button) && enabled(button))).toEqual([])
  })
})
