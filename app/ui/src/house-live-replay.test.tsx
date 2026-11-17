// Live and replay render the same house (Spec 6 task 7.4). The same root
// component is mounted twice: once on a live host that answers from the
// recorded canonical log and the backend's own final projection, once on the
// replay stand-in with the Attic's Cursor at the end of the same recording.
// What the house says about rooms, Doors, ghosts and what needs the Operator
// must be equal, and the replay may request nothing but ./fixture.jsonl.
// **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8, 10.9**
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../fixtures/replay/demo.jsonl?raw'
import demoWorkflow from '../../../fixtures/replay/demo.workflow.json'
import { emptyRoomGhosts, roomGhostsToJson } from './core/room-projection'
import { appEventToJson, type AppEvent } from './core/seance-event'
import { parseEventLog } from './core/seance-log'
import { parseWorkflowProjection, workflowProjectionToJson, type WorkflowProjection } from './core/workflow-projection'

const FIXTURE_URL = './fixture.jsonl'
const MANSION = 'demo-mansion'
const LOG = parseEventLog(demo).events
const API = '/apps/haunted-house/api'

let unexpected: string[] = []

function blocked(name: string) {
  return class {
    constructor() {
      unexpected.push(name)
      throw new Error(`The page must not open a ${name}.`)
    }
  }
}

function backendFinal(): WorkflowProjection {
  const parsed = parseWorkflowProjection((demoWorkflow.steps as { workflow: unknown }[]).at(-1)!.workflow, MANSION)
  if (!parsed.ok) throw new Error(`backend projection refused at ${parsed.path}`)
  return parsed.projection
}

/** What the house shows, as comparable data read from the page alone. */
interface Shown {
  readonly root: string
  readonly rooms: readonly (string | null)[]
  readonly roomLabels: readonly (string | null)[]
  readonly ghosts: readonly string[]
  readonly doors: readonly string[]
  readonly needsYou: string
  readonly atticDiagnostic: string
  readonly liveRegions: number
  readonly components: readonly string[]
  /** One line per room: the room, the Warden's status line, his pose and its label. */
  readonly guide: readonly string[]
}

function read(container: HTMLElement): Shown {
  const shell = container.querySelector<HTMLElement>('.hh-ui')!
  return {
    root: container.firstElementChild?.tagName ?? '',
    rooms: Array.from(shell.querySelectorAll('.hh-ui-rooms > li'), (item) => item.getAttribute('data-room')),
    roomLabels: Array.from(shell.querySelectorAll('[data-room-control]'), (room) => room.getAttribute('aria-label')),
    ghosts: Array.from(shell.querySelectorAll('[data-ghost-control]'), (ghost) => `${ghost.getAttribute('aria-label')} | ${ghost.getAttribute('data-ghost')}`),
    doors: Array.from(shell.querySelectorAll<HTMLElement>('[data-door-control]'), (door) => `${door.getAttribute('aria-label')} | ${door.dataset.phase}:${door.dataset.status}/${door.dataset.door}`),
    needsYou: shell.querySelector('.hh-ui-needs')?.getAttribute('data-count') ?? '',
    // The integrity each room reports. (A recording adds its read-only sentence; that is the one intended difference.)
    atticDiagnostic: Array.from(shell.querySelectorAll('.hh-ui-rooms > li'), (item) => item.getAttribute('data-integrity')).join(','),
    liveRegions: container.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"], output').length,
    // The same parts are on the page in both modes.
    components: ['[data-toolbar]', 'nav.hh-ui-map', '.hh-stage-roof-art', '.hh-ui-needs', '.hh-ui-toggle', '[data-announcer]'].filter(
      (selector) => shell.querySelector(selector) !== null,
    ),
    guide: readGuide(shell),
  }
}

/**
 * What the Warden says and how he stands in every room (Spec 8, Requirement
 * 14.1): each room is walked to through its map control, read, and put away.
 */
function readGuide(shell: HTMLElement): string[] {
  return Array.from(shell.querySelectorAll<HTMLElement>('[data-room-control]'), (room) => {
    fireEvent.click(room)
    const pose = shell.querySelector<HTMLElement>('[data-guide-pose]')
    const line = `${room.getAttribute('data-room-control')} | ${shell.querySelector('[data-guide-text]')?.textContent} | ${pose?.getAttribute('data-guide-pose')} | ${pose?.textContent}`
    fireEvent.keyDown(document.body, { key: 'Escape' })
    return line
  })
}

/** Opens the recorded Mansion from the Foyer. `settle` lets pending reads finish (fake or real time). */
async function openDemoMansion(settle: () => Promise<void>): Promise<void> {
  await settle()
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${MANSION}\\b`) }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: `Open ${MANSION}` }))
  })
  await settle()
  expect(screen.getByRole('navigation', { name: 'Mansion rooms' })).toBeInTheDocument()
}

const realSettle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40))
  })

async function renderReplay(text = demo) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const fetchSpy = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url !== FIXTURE_URL) {
      unexpected.push(`fetch ${url}`)
      throw new TypeError(`The replay must not request ${url}.`)
    }
    return new Response(text, { status: 200 })
  })
  vi.stubGlobal('fetch', fetchSpy)
  vi.doMock('@kirocrew/app-sdk', () => import('./adapters/sdk-shim'))
  const { default: App } = await import('./App')
  const view = render(<App />)
  const settle = () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
  // A recording starts at the Gate: the Foyer is put away until the visitor knocks. (A live page that already holds a mansion starts in the Foyer.)
  // The kit's `knock` waits for the button, and a query that waits never ends on the faked clock, so the button is pressed here.
  await settle()
  fireEvent.click(screen.getByRole('button', { name: 'Knock' }))
  await openDemoMansion(settle)
  // The Attic plays the whole recording: the Cursor goes to its last record.
  fireEvent.click(screen.getByRole('button', { name: /^Attic\./ }))
  const attic = screen.getByRole('region', { name: 'Attic' })
  const slider = within(attic).getByRole('slider') as HTMLInputElement
  fireEvent.change(slider, { target: { value: slider.max } })
  fireEvent.keyDown(attic, { key: 'Escape' })
  await settle()
  return { view, App, fetchSpy, settle }
}

interface LiveHost {
  log: AppEvent[]
  workflow: WorkflowProjection
  /** When set, an ingest call waits on it before the backend acknowledges anything. */
  hold: Promise<void> | null
  pendingAcknowledgment: AppEvent[]
  handlers: Map<string, Set<(data: unknown) => void>>
  writes: string[]
}

async function renderLive(log: readonly AppEvent[] = LOG, workflow: WorkflowProjection = backendFinal()) {
  const host: LiveHost = { log: [...log], workflow, hold: null, pendingAcknowledgment: [], handlers: new Map(), writes: [] }
  vi.stubGlobal('fetch', (input: unknown) => {
    unexpected.push(`fetch ${String(input)}`)
    throw new TypeError('The live page talks to Crew through the SDK client only.')
  })
  const descriptor = { name: MANSION, projectSpec: MANSION, displayPath: `~/workspace/haunted-house/mansions/${MANSION}`, status: 'ready' }
  const httpError = (status: number) => Object.assign(new Error(`API ${status}`), { status, body: '{}' })
  vi.doMock('@kirocrew/app-sdk', async () => {
    const { useEffect } = await import('react')
    return {
      useAppApi: () => ({
        async get(path: string): Promise<unknown> {
          if (path === `${API}/whoami`) return { backend: 'ok', gateway: { version: '0.12.2' } }
          if (path === `${API}/mansions`) return { schemaVersion: 1, mansions: [descriptor] }
          if (path.startsWith(`${API}/mansions/${MANSION}/seance/events`)) {
            const after = Number(new URL(path, 'http://x').searchParams.get('after_sequence') ?? '0')
            return { events: host.log.filter((event) => event.sequence > after).map(appEventToJson), highest_sequence: host.log.at(-1)?.sequence ?? 0, diagnostics: [] }
          }
          if (path === `${API}/mansions/${MANSION}/workflow`) return JSON.parse(JSON.stringify(workflowProjectionToJson(host.workflow)))
          // The room answer of the same moment, with nothing in it: room output is not what this test compares.
          if (path === `${API}/mansions/${MANSION}/specs/${MANSION}/room-ghosts`) {
            return JSON.parse(JSON.stringify(roomGhostsToJson(emptyRoomGhosts(MANSION, MANSION, { version: host.workflow.version, integrity: host.workflow.integrity }))))
          }
          throw httpError(404)
        },
        async post(path: string): Promise<unknown> {
          if (path === `${API}/mansions/open`) return { mansion: descriptor }
          if (path === `${API}/mansions/${MANSION}/seance/ingest`) {
            if (host.hold !== null) await host.hold
            const acknowledged = host.pendingAcknowledgment
            host.pendingAcknowledgment = []
            host.log.push(...acknowledged)
            return { events: acknowledged.map(appEventToJson), highest_sequence: host.log.at(-1)?.sequence ?? 0, diagnostics: [] }
          }
          host.writes.push(path)
          throw httpError(500)
        },
        put: vi.fn(),
        patch: vi.fn(),
        del: vi.fn(),
      }),
      useAppEvents: (event: string, cb: (data: unknown) => void) => {
        useEffect(() => {
          const set = host.handlers.get(event) ?? new Set()
          host.handlers.set(event, set)
          set.add(cb)
          return () => {
            set.delete(cb)
          }
        }, [event, cb])
        return undefined as unknown as () => void
      },
      useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
      useNotify: () => () => {},
      useNavBadge: () => () => {},
    }
  })
  const { default: App } = await import('./App')
  const view = render(<App />)
  await openDemoMansion(realSettle)
  await waitFor(() => expect(view.container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
  return { view, App, host }
}

beforeEach(() => {
  unexpected = []
  vi.stubGlobal('XMLHttpRequest', blocked('XMLHttpRequest'))
  vi.stubGlobal('WebSocket', blocked('WebSocket'))
  vi.stubGlobal('EventSource', blocked('EventSource'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
})

describe('equivalent canonical records, live and replayed', () => {
  it('render the same rooms in the same order with the same labels, states and Needs You count', async () => {
    const replay = await renderReplay()
    const replayed = read(replay.view.container)
    expect(replay.view.container.querySelector('.hh-ui')).toHaveAttribute('data-mode', 'replay')
    expect(replay.fetchSpy).toHaveBeenCalledTimes(1)
    expect(replay.fetchSpy).toHaveBeenCalledWith(FIXTURE_URL)
    expect(replay.App.name).toBe('HauntedHouseApp')
    replay.view.unmount()
    vi.useRealTimers()
    vi.doUnmock('@kirocrew/app-sdk')
    vi.resetModules()

    const live = await renderLive()
    const shown = read(live.view.container)
    expect(live.view.container.querySelector('.hh-ui')).toHaveAttribute('data-mode', 'live')
    expect(live.App.name).toBe('HauntedHouseApp')

    expect(shown.root).toBe('MAIN')
    expect(shown.rooms).toEqual(['foyer', 'study', 'drafting-room', 'workshop', 'attic', 'seance-room'])
    // The recording is not trivial: ghosts and Doors are on the map.
    expect(shown.ghosts.length).toBeGreaterThan(2)
    expect(shown.doors).toHaveLength(4)
    expect(replayed.rooms).toEqual(shown.rooms)
    expect(replayed.roomLabels).toEqual(shown.roomLabels)
    expect(replayed.ghosts).toEqual(shown.ghosts)
    expect(replayed.doors).toEqual(shown.doors)
    expect(replayed.needsYou).toBe(shown.needsYou)
    expect(replayed.atticDiagnostic).toBe(shown.atticDiagnostic)
    expect(replayed.components).toEqual(shown.components)
    expect(shown.components).toHaveLength(6)
    // The Warden says the same thing and stands the same way in every room of both.
    expect(shown.guide).toHaveLength(6)
    expect(shown.guide.every((line) => !line.includes('undefined') && !line.includes('null'))).toBe(true)
    expect(replayed.guide).toEqual(shown.guide)
    expect([replayed.liveRegions, shown.liveRegions]).toEqual([1, 1])
    expect(unexpected).toEqual([])
    expect(live.host.writes).toEqual([])
  })
})

describe('replay', () => {
  it('is read-only with visible copy, and neither a decision nor a session link sends anything', async () => {
    const { view, fetchSpy, settle } = await renderReplay()
    const shell = view.container.querySelector<HTMLElement>('.hh-ui')!
    expect(shell.querySelector('[data-block="read_only"]')).toHaveTextContent('This is a recording.')
    for (const name of [/^Study\./, /^Drafting Room\./, /^Workshop\./]) {
      fireEvent.click(within(shell).getByRole('button', { name }))
      await settle()
      const panel = shell.querySelector<HTMLElement>('.hh-ui-panel')!
      expect(panel.querySelector('[data-room-note]')).toHaveTextContent('This is a recording.')
      const controls = within(panel)
        .getAllByRole('button')
        .filter((button) => !button.hasAttribute('aria-expanded') && button.textContent?.trim() !== 'Close room')
      for (const control of controls) {
        expect(control, control.textContent ?? '').toHaveAttribute('aria-disabled', 'true')
        fireEvent.click(control)
      }
      fireEvent.keyDown(panel, { key: 'Escape' })
    }
    await settle()
    const shim = await import('./adapters/sdk-shim')
    expect(shim.replayChatLauncherCalls).toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
  })

  it('shows the valid prefix of a damaged recording and its diagnostic in the Attic, and invents no later state', async () => {
    const lines = demo.trimEnd().split('\n')
    const cut = Math.floor(lines.length / 2)
    const damaged = [...lines.slice(0, cut), lines[cut].replace(/"sequence":\s*\d+/, '"sequence":999999'), ...lines.slice(cut + 1)].join('\n') + '\n'
    const { view, fetchSpy } = await renderReplay(damaged)
    const attic = view.container.querySelector<HTMLElement>('[data-room="attic"]')!
    expect(attic).toHaveAttribute('data-integrity', 'incompatible')
    expect(attic.querySelector('[data-room-reason]')).toHaveTextContent('The séance log failed its integrity check. The Attic shows only the records before the failure.')
    // Nothing after the failure is shown: no ghost is in a state only a later record gives it.
    const prefix = parseEventLog(damaged).events
    expect(prefix.length).toBeLessThan(LOG.length)
    fireEvent.click(within(view.container).getByRole('button', { name: /^Attic\./ }))
    const panel = within(view.container).getByRole('region', { name: 'Attic' })
    expect((within(panel).getByRole('slider') as HTMLInputElement).max).toBe(String(prefix.length))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(unexpected).toEqual([])
  })
})

describe('live', () => {
  it('changes the house only from records the backend acknowledged', async () => {
    const first = LOG.slice(0, 1)
    const live = await renderLive(first, { ...backendFinal(), version: 1_000_000 })
    const before = read(live.view.container)
    // A Crew frame arrives; the backend has not answered the ingest yet.
    let release: () => void = () => {}
    live.host.hold = new Promise<void>((resolve) => {
      release = resolve
    })
    live.host.pendingAcknowledgment = LOG.slice(1)
    await act(async () => {
      for (const handler of [...(live.host.handlers.get('chat_status') ?? [])]) handler({ slot: 'opaque', text: 'raw frame the page must not fold' })
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    // Unacknowledged: the house shows exactly what it showed.
    expect(read(live.view.container)).toEqual(before)
    await act(async () => {
      release()
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    await waitFor(() => expect(read(live.view.container).ghosts.length).toBeGreaterThan(before.ghosts.length))
    expect(unexpected).toEqual([])
  })

  it('keeps the foundation status and Retry instead of a house when the backend does not answer', async () => {
    vi.doMock('@kirocrew/app-sdk', () => ({
      useAppApi: () => ({ get: async () => Promise.reject(Object.assign(new Error('down'), { status: 502, body: '' })), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
      useAppEvents: () => () => {},
      useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
      useNotify: () => () => {},
      useNavBadge: () => () => {},
    }))
    const { default: App } = await import('./App')
    const { container } = render(<App />)
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(container.querySelector('.hh-ui')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Mansion rooms' })).toBeNull()
    expect(container.querySelector('.hh-summary')).toHaveTextContent('Backend not reachable (HTTP 502)')
  })
})
