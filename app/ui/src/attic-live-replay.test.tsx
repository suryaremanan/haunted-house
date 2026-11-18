// The Attic inside the shared house, live and replay (replay-and-submission
// task 4.3). The same root component is mounted twice: on the replay stand-in
// exactly as the replay build maps it, and on a live client double that serves
// the same canonical log. Both must reach the Attic through the same gates,
// show the same Attic for the same Cursor, keep the house's keyboard and focus
// contract, and say nothing while a replay plays. The way in differs by one
// step: a recording starts at the Gate, where the visitor knocks, and a live
// page that already holds a mansion starts in the Foyer.
// **Validates: Requirements 1.6, 3.1, 3.5, 3.6, 3.7, 3.8, 3.9, 4.1, 11.4**
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../fixtures/replay/demo.jsonl?raw'
import recordedMansions from '../../../fixtures/replay/mansions.json'
import { buildReplayModel, parseCanonicalLog, replayFoldFor } from './core/replay-timeline'
import { appEventToJson } from './core/seance-event'
import { parseEventLog } from './core/seance-log'
import { atGate } from './test/first-visit-kit'

const FIXTURE_URL = './fixture.jsonl'
const MANSION = 'demo-mansion'
const LOG = parseEventLog(demo).events
const TOTAL = LOG.length
const MODEL = buildReplayModel(parseCanonicalLog(demo))
const FOLD = replayFoldFor(MODEL)

type Mode = 'live' | 'replay'

interface Mounted {
  readonly mode: Mode
  readonly container: HTMLElement
  /** The root component that was rendered. */
  readonly Root: unknown
  /** The AtticPanel component of this module graph. */
  readonly Panel: unknown
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

/** Mounts the default export of src/App.tsx, the root both builds render. */
async function mountRoot(mode: Mode): Promise<Mounted> {
  vi.resetModules()
  const unexpected: string[] = []
  const requests: string[] = []
  const hostEffects: string[] = []
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const fetchSpy = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (mode !== 'replay' || url !== FIXTURE_URL) {
      unexpected.push(`fetch ${url}`)
      throw new TypeError(`The page must not request ${url}.`)
    }
    return new Response(demo, { status: 200 })
  })
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubGlobal('XMLHttpRequest', blocked('XMLHttpRequest', unexpected))
  vi.stubGlobal('WebSocket', blocked('WebSocket', unexpected))
  vi.stubGlobal('EventSource', blocked('EventSource', unexpected))

  if (mode === 'replay') {
    vi.doMock('@kirocrew/app-sdk', () => import('./adapters/sdk-shim'))
  } else {
    const { foldWorkflow } = await import('./core/workflow-fold')
    const { workflowProjectionToJson } = await import('./core/workflow-projection')
    const { emptyRoomGhosts, roomGhostsToJson } = await import('./core/room-projection')
    const workflow = foldWorkflow(LOG, { mansionId: MANSION }).projection
    const mansions = recordedMansions.mansions
    const get = async (path: string): Promise<unknown> => {
      requests.push(`GET ${path}`)
      if (path.endsWith('/whoami')) return { backend: 'ok', gateway: { version: '0.12.2' } }
      if (path.endsWith('/api/mansions')) return { schemaVersion: 1, mansions }
      if (path.endsWith('/workflow')) return workflowProjectionToJson(workflow)
      if (path.endsWith('/room-ghosts')) {
        return roomGhostsToJson(emptyRoomGhosts(MANSION, MANSION, { version: workflow.version, integrity: 'valid' }))
      }
      const events = /\/seance\/events\?after_sequence=(\d+)&limit=\d+$/.exec(path)
      if (events !== null) {
        return {
          events: LOG.filter((record) => record.sequence > Number(events[1])).map(appEventToJson),
          highest_sequence: TOTAL,
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
  const { AtticPanel: Panel } = await import('./rooms/attic/AtticPanel')
  const view = render(<Root />)
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  await advance(0)
  return { mode, container: view.container, Root, Panel, unexpected, requests, hostEffects, fetchSpy, advance, unmount: view.unmount }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
})

const page = (mounted: Mounted) => within(mounted.container)
const liveRegions = (mounted: Mounted) =>
  Array.from(mounted.container.querySelectorAll<HTMLElement>('[aria-live], [role="status"], [role="alert"], [role="log"]'))
const said = (mounted: Mounted) => mounted.container.querySelector('[data-announcer]')?.textContent ?? ''
const atticControl = (mounted: Mounted) => page(mounted).getByRole('button', { name: /^Attic\./ })
const atticRegion = (mounted: Mounted) => page(mounted).getByRole('region', { name: 'Attic' })
const atticPanel = (mounted: Mounted) => mounted.container.querySelector<HTMLElement>('[data-attic-panel]')
const slider = (mounted: Mounted) => within(atticRegion(mounted)).getByRole('slider') as HTMLInputElement
const seek = (mounted: Mounted, cursor: number) => act(() => fireEvent.change(slider(mounted), { target: { value: String(cursor) } }))
const mapSignature = (mounted: Mounted) =>
  Array.from(mounted.container.querySelectorAll<HTMLElement>('[data-door-control], [data-ghost-control]'), (control) =>
    [control.dataset.doorControl ?? control.dataset.ghostControl, control.dataset.status ?? '', control.dataset.door ?? control.dataset.ghost].join(':'),
  ).join('|')

/** At the Gate: knocks, giving no name. The Foyer is on show afterwards. The kit's `knock` waits for the button, and a query that waits never ends on the faked clock, so the button is pressed here. */
const knock = (mounted: Mounted) => fireEvent.click(page(mounted).getByRole('button', { name: 'Knock' }))

/** From the Foyer: selects the recorded mansion and opens it. */
async function openFromFoyer(mounted: Mounted) {
  fireEvent.click(page(mounted).getByRole('radio', { name: /^demo-mansion\b/ }))
  await act(async () => {
    fireEvent.click(page(mounted).getByRole('button', { name: 'Open demo-mansion' }))
  })
  for (let turn = 0; turn < 5; turn += 1) await mounted.advance(1)
  expect(mounted.container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false')
}

/** From the first screen: knocks where the page starts at the Gate, then opens the recorded mansion from the Foyer. */
async function openMansion(mounted: Mounted) {
  // Timers are faked, so the page's promise chains are settled by advancing, not by polling.
  for (let turn = 0; turn < 5; turn += 1) await mounted.advance(1)
  // A recording starts at the Gate. A live page that already holds a mansion starts in the Foyer.
  if (mounted.mode === 'replay') knock(mounted)
  await openFromFoyer(mounted)
}

async function openAttic(mounted: Mounted) {
  const control = atticControl(mounted)
  control.focus()
  fireEvent.click(control)
  await mounted.advance(0)
  return atticRegion(mounted)
}

/** Attic markup without the two things that name the mode, and without generated ids or attribute order. */
function sharedAttic(mounted: Mounted): string {
  const copy = atticPanel(mounted)!.cloneNode(true) as HTMLElement
  copy.querySelector('[data-attic="mode"]')?.remove()
  // The static replay's own labelled extra: opening a séance log of your own (own-seance).
  copy.querySelector('[data-own-seance]')?.remove()
  copy.removeAttribute('data-mode')
  for (const node of [copy, ...Array.from(copy.querySelectorAll('*'))]) {
    const attributes = Array.from(node.attributes, ({ name, value }) => [name, value] as const).sort(([a], [b]) => (a < b ? -1 : 1))
    for (const [name] of attributes) node.removeAttribute(name)
    for (const [name, value] of attributes) node.setAttribute(name, value)
  }
  return copy.outerHTML.replace(/:r[0-9a-z]+:/g, ':id:')
}

describe.each(['replay', 'live'] as const)('Attic in the shared house (%s)', (mode) => {
  it('is reached only through the status gate, the Gate on a first visit, the Foyer and the house map', async () => {
    const mounted = await mountRoot(mode)
    // Before a Mansion is open there is no house, no Attic and no replay.
    expect(page(mounted).getByRole('heading', { level: 1, name: 'Haunted House' })).toBeInTheDocument()
    if (mode === 'replay') {
      // A recording starts at the Gate. The Foyer is put away until the visitor knocks, and nothing at the Gate leads to the Attic.
      expect(atGate(mounted.container)).toBe(true)
      expect(page(mounted).queryByRole('region', { name: 'Foyer' })).toBeNull()
      expect(page(mounted).queryByRole('button', { name: /^Attic\./ })).toBeNull()
      expect(atticPanel(mounted)).toBeNull()
      knock(mounted)
    }
    // A live page that already holds a mansion starts in the Foyer. A recording is there after the knock.
    expect(atGate(mounted.container)).toBe(false)
    expect(page(mounted).getByRole('region', { name: 'Foyer' })).toBeInTheDocument()
    expect(page(mounted).queryByRole('button', { name: /^Attic\./ })).toBeNull()
    expect(atticPanel(mounted)).toBeNull()

    await openFromFoyer(mounted)
    const map = page(mounted).getByRole('navigation', { name: 'Mansion rooms' })
    expect(within(map).getByRole('button', { name: /^Attic\./ })).toBe(atticControl(mounted))
    expect(atticPanel(mounted)).toBeNull()

    const region = await openAttic(mounted)
    expect(region).toContainElement(atticPanel(mounted))
    expect(atticPanel(mounted)).toHaveAttribute('data-mode', mode)
    expect(mounted.container.querySelector('.hh-ui')).toHaveAttribute('data-mode', mode)
    // Opening the room moves focus to its heading; the Attic's controls follow it in the document.
    const heading = within(region).getByRole('heading', { name: 'Attic' })
    expect(heading).toHaveFocus()
    expect(heading.compareDocumentPosition(atticPanel(mounted)!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(mounted.unexpected).toEqual([])
  })

  it('keeps Escape, focus return and the map arrow keys of the house', async () => {
    const mounted = await mountRoot(mode)
    await openMansion(mounted)
    const region = await openAttic(mounted)
    seek(mounted, 12)

    // Arrow keys on the Attic's own controls stay there: the open room and the Cursor's owner do not change.
    const range = slider(mounted)
    range.focus()
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) fireEvent.keyDown(range, { key })
    const timeline = within(region).getByRole('group', { name: 'Timeline of recorded events' })
    timeline.focus()
    for (const key of ['ArrowUp', 'ArrowDown']) fireEvent.keyDown(timeline, { key })
    expect(atticRegion(mounted)).toBe(region)
    expect(timeline).toHaveFocus()
    expect(atticControl(mounted)).toHaveAttribute('aria-expanded', 'true')

    // Escape closes the Attic room, not the Mansion, and focus returns to the Attic on the map.
    fireEvent.keyDown(timeline, { key: 'Escape' })
    await mounted.advance(0)
    expect(page(mounted).queryByRole('region', { name: 'Attic' })).toBeNull()
    expect(page(mounted).getByRole('region', { name: `Mansion ${MANSION}` })).toBeInTheDocument()
    expect(atticControl(mounted)).toHaveFocus()

    // The map's arrow contract is intact after the Attic closed: down from the Attic is the Drafting Room.
    fireEvent.keyDown(atticControl(mounted), { key: 'ArrowDown' })
    expect(page(mounted).getByRole('button', { name: /^Drafting Room\./ })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(atticControl(mounted)).toHaveFocus()

    // The replay was not lost with the panel: reopening shows the same Cursor.
    await openAttic(mounted)
    expect(slider(mounted).value).toBe('12')
    expect(within(atticRegion(mounted)).getByRole('heading', { name: 'Attic' })).toHaveFocus()
    // The Close button does the same as Escape.
    fireEvent.click(within(atticRegion(mounted)).getByRole('button', { name: /Close/ }))
    await mounted.advance(0)
    expect(atticControl(mounted)).toHaveFocus()
    expect(mounted.unexpected).toEqual([])
  })

  it('has one live region, and playback says nothing until the replay ends', async () => {
    const mounted = await mountRoot(mode)
    await openMansion(mounted)
    expect(liveRegions(mounted)).toHaveLength(1)
    // In Crew the live house first says what is waiting in it right now (its own
    // interruption burst, merged over ten seconds). Let that finish: it is not playback.
    await mounted.advance(15_000)
    const before = said(mounted)
    const effectsBefore = [...mounted.hostEffects]

    const region = await openAttic(mounted)
    expect(liveRegions(mounted)).toHaveLength(1)
    const play = within(region).getByRole('button', { name: 'Play' })
    fireEvent.click(play)
    const heard = new Set<string>([said(mounted)])
    for (let step = 0; step < 40; step += 1) {
      await mounted.advance(500)
      heard.add(said(mounted))
    }
    expect(Number(slider(mounted).value)).toBeGreaterThan(5)
    expect(play).toHaveTextContent('Pause')
    // Twenty seconds of playback: the live region still holds what it held before.
    expect([...heard]).toEqual([before])
    // Playback sent no toast and set no badge.
    expect(mounted.hostEffects).toEqual(effectsBefore)

    for (let step = 0; step < 200 && play.textContent !== 'Play'; step += 1) await mounted.advance(1_000)
    expect(slider(mounted).value).toBe(String(TOTAL))
    expect(said(mounted)).toBe(`Replay complete. Event ${TOTAL} of ${TOTAL}.`)
    expect(liveRegions(mounted)).toHaveLength(1)
    expect(liveRegions(mounted)[0]).toHaveAttribute('aria-live', 'polite')
    expect(mounted.container.querySelectorAll('audio, video')).toHaveLength(0)
    expect(mounted.hostEffects).toEqual(effectsBefore)
    expect(mounted.unexpected).toEqual([])
  })

  it('puts the replay before anything secondary, and offers no live action', async () => {
    const mounted = await mountRoot(mode)
    await openMansion(mounted)
    const region = await openAttic(mounted)
    const panel = atticPanel(mounted)!
    // Inside the Attic room nothing follows the replay: no session link, no mutation.
    const after = Array.from(region.querySelectorAll<HTMLElement>('a, button, input, textarea, select')).filter(
      (control) => panel.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING && !panel.contains(control),
    )
    expect(after).toEqual([])
    expect(region.querySelectorAll('[data-session-link]')).toHaveLength(0)
    expect(Array.from(panel.querySelectorAll('button'), (button) => button.textContent)).toEqual(['Play', 'Restart', 'Previous event', 'Next event'])

    // Operating every control sends nothing but the log read this mode is allowed.
    const requestsBefore = mounted.requests.length
    seek(mounted, TOTAL)
    fireEvent.click(within(region).getByRole('button', { name: 'Restart' }))
    fireEvent.click(within(region).getByRole('button', { name: 'Next event' }))
    fireEvent.click(within(region).getByRole('radio', { name: '2×' }))
    fireEvent.click(within(region).getByRole('button', { name: 'Resume' }))
    await mounted.advance(2_000)
    expect(mounted.requests.slice(requestsBefore).filter((request) => !/^GET .*\/(seance\/events\?|workflow$|room-ghosts$)/.test(request))).toEqual([])
    expect(mounted.requests.filter((request) => request.startsWith('POST') && !request.endsWith('/mansions/open'))).toEqual([])
    if (mode === 'replay') {
      expect(mounted.fetchSpy).toHaveBeenCalledTimes(1)
      expect(within(region).getAllByText(/This is a recording/).length).toBeGreaterThan(0)
      expect(panel.querySelector('[data-attic="mode"]')).toHaveTextContent(/read-only/)
    } else {
      expect(mounted.fetchSpy).not.toHaveBeenCalled()
    }
    expect(mounted.unexpected).toEqual([])
  })
})

describe('Attic: live and replay are one tree', () => {
  it('renders the same root and the same Attic, with the same fold at every Cursor', async () => {
    const replay = await mountRoot('replay')
    await openMansion(replay)
    await openAttic(replay)
    const replayViews = new Map<number, string>()
    for (const cursor of [0, 1, 20, 41, TOTAL]) {
      seek(replay, cursor)
      replayViews.set(cursor, sharedAttic(replay))
    }
    const replayNames = { root: (replay.Root as { name: string }).name, panel: (replay.Panel as { name: string }).name }
    // In the replay build the house itself is the recording at its Cursor.
    seek(replay, 20)
    const replayHouseAt20 = mapSignature(replay)
    seek(replay, TOTAL)
    const replayHouseAtEnd = mapSignature(replay)
    expect(replayHouseAt20).not.toBe(replayHouseAtEnd)
    replay.unmount()
    vi.doUnmock('@kirocrew/app-sdk')

    const live = await mountRoot('live')
    await openMansion(live)
    // The live house shows the fold of the whole acknowledged log.
    const liveHouse = mapSignature(live)
    expect(liveHouse).toBe(replayHouseAtEnd)
    await openAttic(live)
    for (const [cursor, markup] of replayViews) {
      seek(live, cursor)
      expect(sharedAttic(live), `Attic at Cursor ${cursor}`).toBe(markup)
      // Replaying inside Crew never changes the live house.
      expect(mapSignature(live)).toBe(liveHouse)
    }
    // The same components by name from the same modules; only the SDK module differs.
    expect({ root: (live.Root as { name: string }).name, panel: (live.Panel as { name: string }).name }).toEqual(replayNames)
    expect(replayNames).toEqual({ root: 'HauntedHouseApp', panel: 'AtticPanel' })
    // The only differences are the two things that name the mode.
    expect(atticPanel(live)).toHaveAttribute('data-mode', 'live')
    expect(atticPanel(live)!.querySelector('[data-attic="mode"]')).toHaveTextContent(/Replaying changes nothing/)
    expect(live.unexpected).toEqual([])
  })

  it('shows at the final Cursor exactly the projection a fresh replay and the live fold give', async () => {
    const { foldLive } = await import('./core/replay-timeline')
    expect(FOLD(MODEL.records)).toEqual(foldLive(LOG))
    const replay = await mountRoot('replay')
    await openMansion(replay)
    const region = await openAttic(replay)
    seek(replay, TOTAL)
    const workflow = FOLD(MODEL.records).workflows[0]
    expect(
      Array.from(region.querySelectorAll<HTMLElement>('[data-attic="summary"] [data-phase]'), (line) => [line.dataset.phase, line.dataset.status, line.dataset.door]),
    ).toEqual(workflow.phases.map((phase) => [phase.phase, phase.status, phase.door.status]))
    expect(
      Array.from(replay.container.querySelectorAll<HTMLElement>('[data-door-control]'), (door) => [door.dataset.phase, door.dataset.status, door.dataset.door]),
    ).toEqual(workflow.phases.map((phase) => [phase.phase, phase.status, phase.door.status]))
  })
})

describe('Attic: Still House', () => {
  it('suppresses the Attic transition and nothing else', async () => {
    const mounted = await mountRoot('replay')
    await openMansion(mounted)
    const region = await openAttic(mounted)
    // jsdom has no reduced-motion answer, which the Motion Policy reads as a request for stillness.
    expect(mounted.container.querySelector('.hh-ui')).toHaveAttribute('data-motion', 'none')
    expect(atticPanel(mounted)).toHaveAttribute('data-motion', 'none')
    // Every control still works and playback still advances.
    fireEvent.click(within(region).getByRole('button', { name: 'Play' }))
    await mounted.advance(0)
    await mounted.advance(4_000)
    expect(Number(slider(mounted).value)).toBeGreaterThanOrEqual(2)
    fireEvent.click(within(region).getByRole('button', { name: 'Pause' }))
    seek(mounted, 30)
    expect(atticPanel(mounted)!.querySelector('[aria-current="step"]')).toHaveAttribute('data-position', '30')
    expect(screen.queryByRole('region', { name: 'Attic' })).toBe(region)
  })
})
