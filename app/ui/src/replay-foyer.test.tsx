// Replay DOM parity for the Foyer journey (task 9.3; Requirements 9.1, 9.2, 9.3).
// Renders the replay entry, replay/main.tsx, with the SDK mapped to the replay
// stand-in as vite.replay.config.ts maps it, and walks list, create, select,
// open, and return. Every way out of the page is stubbed to throw and recorded.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { isValidElement } from 'react'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import recordedMansions from '../../../fixtures/replay/mansions.json'
import { liveRegions } from './rooms/foyer/foyer-test-kit'

// replay/main.tsx doesn't export its root. This pass-through keeps each root
// and what it rendered, so the test can check the root component and unmount it.
interface CreatedRoot {
  container: Element | DocumentFragment
  root: Root
  rendered: unknown[]
}
const roots = vi.hoisted(() => [] as CreatedRoot[])
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>()
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      const root = actual.createRoot(...args)
      const created: CreatedRoot = { container: args[0], root, rendered: [] }
      const renderRoot = root.render.bind(root)
      root.render = (children) => {
        created.rendered.push(children)
        renderRoot(children)
      }
      roots.push(created)
      return root
    },
  }
})

const FIXTURE_JSON = '../../../fixtures/replay/mansions.json'
const ROOT = '~/workspace/haunted-house/mansions'
const SUMMARY = 'Backend reachable · Gateway replay'

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

// Requests the page tried that it must not make. Checked by each test.
let unexpected: string[] = []

// The recorded event file is the one request the stand-in may make. This page
// needs no frames from it, so an empty recording is served.
const fetchSpy = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
  const url = urlOf(input)
  if (!url.endsWith('fixture.jsonl')) {
    unexpected.push(`fetch ${url}`)
    throw new TypeError(`The replay must not request ${url}.`)
  }
  return new Response('', { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
})

function blocked(name: string) {
  return class {
    constructor() {
      unexpected.push(name)
      throw new Error(`The replay must not open a ${name}.`)
    }
  }
}

/** Mounts the replay entry in a fresh #root and waits for the mansion list state. */
async function mountReplay(): Promise<HTMLElement> {
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  await act(async () => {
    await import('../replay/main')
  })
  await screen.findByText(SUMMARY)
  await screen.findByRole('region', { name: 'Foyer' })
  await waitFor(() => expect(screen.queryByText('Loading mansions…')).not.toBeInTheDocument())
  return container
}

function radioValues(): string[] {
  return (screen.queryAllByRole('radio') as HTMLInputElement[]).map((input) => input.value)
}

function radio(name: string): HTMLInputElement {
  return screen.getByRole('radio', { name: new RegExp(`^${name}\\b`) })
}

async function createMansion(name: string): Promise<void> {
  fireEvent.change(screen.getByRole('textbox', { name: 'New mansion name' }), { target: { value: name } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create mansion' }))
  })
}

/** Markup with generated ids removed, so two renders of the same state compare equal. */
function markup(container: Element): string {
  return container.innerHTML.replace(/:r[0-9a-z]+:/g, ':id:')
}

/**
 * The markup both builds must share for an opened mansion: everything but the
 * mode attribute and what only a recording shows. The replay bar (with the
 * start note and the one read-only sentence) replaces the live build's
 * read-only note. Attributes are compared as a set, so the order React
 * happened to write them in does not count.
 */
function sharedMarkup(container: Element): string {
  const copy = container.cloneNode(true) as Element
  copy.querySelectorAll('[data-replay-start], [data-replay-bar], .hh-ui-notes > [data-block="read_only"]').forEach((note) => note.remove())
  copy.querySelectorAll('[data-mode]').forEach((node) => node.removeAttribute('data-mode'))
  for (const node of [copy, ...Array.from(copy.querySelectorAll('*'))]) {
    const attributes = Array.from(node.attributes, ({ name, value }) => [name, value] as const).sort(([a], [b]) => (a < b ? -1 : 1))
    for (const [name] of attributes) node.removeAttribute(name)
    for (const [name, value] of attributes) node.setAttribute(name, value)
  }
  return markup(copy)
}

/** Waits until the opened mansion's house has read its state, so both builds are compared at rest. */
async function houseSettled(container: Element): Promise<void> {
  await waitFor(() => expect(container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
}

function expectNoWayOut(): void {
  expect(fetchSpy.mock.calls.map(([input]) => urlOf(input)).filter((url) => !url.endsWith('fixture.jsonl'))).toEqual([])
  expect(unexpected).toEqual([])
}

beforeEach(() => {
  // Same mapping as the replay build. Registered per test, not with a hoisted
  // vi.mock, so every test gets a fresh stand-in and a fresh mansion registry.
  vi.doMock('@kirocrew/app-sdk', () => import('./adapters/sdk-shim'))
  unexpected = []
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
  vi.stubGlobal('XMLHttpRequest', blocked('XMLHttpRequest'))
  vi.stubGlobal('WebSocket', blocked('WebSocket'))
  vi.stubGlobal('EventSource', blocked('EventSource'))
  for (const method of ['setItem', 'removeItem', 'clear'] as const) {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      unexpected.push(`Storage.${method}`)
    })
  }
})

afterEach(() => {
  for (const { root } of roots.splice(0)) act(() => root.unmount())
  document.getElementById('root')?.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.doUnmock('@kirocrew/app-sdk')
  vi.doUnmock(FIXTURE_JSON)
  vi.resetModules()
})

describe('replay Foyer', () => {
  it('renders the live root component with the Foyer listing the recorded mansions', async () => {
    const container = await mountReplay()

    // The element rendered into #root is the default export of src/App.tsx,
    // the module the live build ships, which mounts the one Foyer component.
    const { default: HauntedHouseApp } = await import('./App')
    const pageRoots = roots.filter((r) => r.container === container)
    expect(pageRoots).toHaveLength(1)
    const element = pageRoots[0].rendered[0]
    expect(isValidElement(element) && element.type).toBe(HauntedHouseApp)

    const page = within(container)
    const main = page.getByRole('main', { name: 'Haunted House' })
    expect(within(main).getByRole('region', { name: 'Foyer' })).toBeInTheDocument()
    const group = page.getByRole('radiogroup', { name: 'Mansions' })
    expect(radioValues()).toEqual(recordedMansions.mansions.map(({ name }) => name).sort())
    for (const { name, displayPath, status } of recordedMansions.mansions) {
      const card = radio(name).closest('label')!
      expect(card.querySelector('.hh-mansion-path')?.textContent).toBe(displayPath)
      expect(radio(name).disabled).toBe(status !== 'ready')
    }
    expect(within(group).getByText(/^Missing:/)).toBeInTheDocument()
    // The recording's mansion is selected and invited, but nothing opens by itself.
    expect(radio('demo-mansion').checked).toBe(true)
    expect(page.getByText('Watch a mansion get built, then step through what happened.')).toBeInTheDocument()
    expect(page.getByRole('button', { name: 'Open demo-mansion' })).toHaveAttribute('aria-disabled', 'false')
    expect(page.queryByRole('region', { name: 'Mansion demo-mansion' })).not.toBeInTheDocument()
    expect(page.getByRole('button', { name: 'Create mansion' })).toHaveAttribute('aria-disabled', 'false')
    expect(page.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(liveRegions(container)).toHaveLength(1)
    expectNoWayOut()
  })

  it('creates, selects, opens, and returns through the same reducer and components, with no request', async () => {
    const container = await mountReplay()
    const before = radioValues()

    // Create: the visible list gains the mansion through the sorted upsert.
    await createMansion('a-new-wing')
    expect(radioValues()).toEqual(['a-new-wing', ...before])
    expect(radio('a-new-wing').closest('label')!.querySelector('.hh-mansion-path')?.textContent).toBe(`${ROOT}/a-new-wing`)
    const summary = liveRegions(container)[0]
    expect(summary).toHaveTextContent(`${SUMMARY} Mansion a-new-wing created.`)

    // Creating it again is idempotent: one entry, and the copy says so.
    await createMansion('a-new-wing')
    expect(radioValues()).toEqual(['a-new-wing', ...before])
    expect(summary).toHaveTextContent('Mansion a-new-wing already exists. Nothing was changed.')

    // An invalid name is refused beside the field, as in live mode.
    await createMansion('Not Valid')
    expect(screen.getByText('Use 1–40 lowercase letters, numbers, and single hyphens.')).toBeInTheDocument()
    expect(radioValues()).toEqual(['a-new-wing', ...before])

    // Select exactly one, then open it.
    fireEvent.click(radio('a-new-wing'))
    expect((screen.getAllByRole('radio') as HTMLInputElement[]).filter((input) => input.checked).map((i) => i.value)).toEqual([
      'a-new-wing',
    ])
    const open = screen.getByRole('button', { name: 'Open a-new-wing' })
    open.focus()
    await act(async () => {
      fireEvent.click(open)
    })
    const shell = await screen.findByRole('region', { name: 'Mansion a-new-wing' })
    expect(within(shell).getByRole('heading', { level: 2, name: /^Mansion\s*a-new-wing$/ })).toHaveFocus()
    expect(screen.queryByRole('region', { name: 'Foyer' })).not.toBeInTheDocument()
    // In an open mansion the house's announcer is the page's one live region.
    expect(liveRegions(container)).toHaveLength(1)
    expect(liveRegions(container)[0]).toHaveTextContent('Mansion a-new-wing opened.')
    // The Foyer room of the house names the mansion and its folder, and offers the way back.
    fireEvent.click(within(shell).getByRole('button', { name: /^Foyer\./ }))
    const foyerRoom = await within(shell).findByRole('region', { name: 'Foyer' })
    expect(within(foyerRoom).getByText('Project spec').nextElementSibling).toHaveTextContent('a-new-wing')
    expect(within(foyerRoom).getByText('Folder').nextElementSibling).toHaveTextContent(`${ROOT}/a-new-wing`)

    // Return: the Foyer is back, focus is on the control that opened the shell.
    fireEvent.click(within(foyerRoom).getByRole('button', { name: 'Return to Foyer' }))
    expect(screen.getByRole('region', { name: 'Foyer' })).toBeInTheDocument()
    expect(open).toHaveFocus()
    expect(radio('a-new-wing').checked).toBe(true)

    // Escape returns too, after opening a recorded mansion with Enter.
    const recorded = radio('weather-station')
    recorded.focus()
    await act(async () => {
      fireEvent.keyDown(recorded, { key: 'Enter' })
    })
    expect(await screen.findByRole('region', { name: 'Mansion weather-station' })).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(recorded).toHaveFocus()

    expect(liveRegions(container)).toHaveLength(1)
    // The bundled recording was not edited by the session.
    const fresh = await vi.importActual<{ default: typeof recordedMansions }>(FIXTURE_JSON)
    expect(fresh.default).toEqual(recordedMansions)
    expect(recordedMansions.mansions.map(({ name }) => name)).not.toContain('a-new-wing')
    expectNoWayOut()
  })

  it('shows the named empty state for an empty recording and fills it on create', async () => {
    vi.doMock(FIXTURE_JSON, () => ({ default: { schemaVersion: 1, mansions: [] } }))
    const container = await mountReplay()

    expect(screen.getByRole('heading', { level: 3, name: 'No mansions yet' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Open\b/ })).not.toBeInTheDocument()

    await createMansion('first-mansion')
    expect(screen.queryByRole('heading', { name: 'No mansions yet' })).not.toBeInTheDocument()
    expect(radioValues()).toEqual(['first-mansion'])
    expect(liveRegions(container)[0]).toHaveTextContent('Mansion first-mansion created.')
    expectNoWayOut()
  })

  it('starts every replay session from the recording, not from an earlier session', async () => {
    await mountReplay()
    await createMansion('only-this-session')
    expect(radioValues()).toContain('only-this-session')

    for (const { root } of roots.splice(0)) act(() => root.unmount())
    document.getElementById('root')?.remove()
    // A page reload: every module, including the stand-in, is evaluated again.
    // The mapping is registered again because Vitest keeps a factory's result
    // across vi.resetModules().
    vi.resetModules()
    vi.doMock('@kirocrew/app-sdk', () => import('./adapters/sdk-shim'))

    await mountReplay()
    expect(radioValues()).toEqual(recordedMansions.mansions.map(({ name }) => name).sort())
    expectNoWayOut()
  })

  it('renders the same markup as the live build for the same list, shell, and return', async () => {
    const replay = await mountReplay()
    const replayList = markup(replay.querySelector('.hh-foyer')!)
    fireEvent.click(radio('weather-station'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open weather-station' }))
    })
    await screen.findByRole('region', { name: 'Mansion weather-station' })
    await houseSettled(replay)
    const opened = replay.querySelector('.hh-foyer')!
    const replayShell = {
      mode: opened.querySelector('.hh-ui')?.getAttribute('data-mode'),
      startNotes: opened.querySelectorAll('[data-replay-start]').length,
      markup: sharedMarkup(opened),
    }
    for (const { root } of roots.splice(0)) act(() => root.unmount())
    replay.remove()

    // The live build: the same App over a host client that answers from a backend.
    vi.resetModules()
    const mansions = [...recordedMansions.mansions].sort((a, b) => (a.name < b.name ? -1 : 1))
    const post = vi.fn(async (_path: string, body: { name: string }) => ({
      mansion: mansions.find(({ name }) => name === body.name),
    }))
    vi.doMock('@kirocrew/app-sdk', () => ({
      useAppApi: () => ({
        get: async (path: string) => {
          if (path.endsWith('/whoami')) return { backend: 'ok', gateway: { version: 'replay' } }
          if (path.endsWith('/api/mansions')) return { schemaVersion: 1, mansions }
          // The opened mansion's house: the same state the replay's empty recording gives,
          // an empty séance log and the initial, read-only workflow.
          if (path.endsWith('/workflow')) {
            return { ...workflowProjectionToJson(initialWorkflowProjection('weather-station')), read_only: true }
          }
          return { events: [], highest_sequence: 0, diagnostics: [] }
        },
        post,
        put: vi.fn(),
        patch: vi.fn(),
        del: vi.fn(),
      }),
      useAppEvents: () => () => {},
      useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
      useNotify: () => () => {},
      useNavBadge: () => () => {},
    }))
    const { initialWorkflowProjection, workflowProjectionToJson } = await import('./core/workflow-projection')
    const { default: LiveApp } = await import('./App')
    const { REPLAY_LANDING } = await import('./landing')
    // The same root with the same landing props: the replay entry passes its invitation, nothing else differs.
    const live = render(<LiveApp landing={REPLAY_LANDING} />)
    await screen.findByRole('radiogroup', { name: 'Mansions' })
    expect(markup(live.container.querySelector('.hh-foyer')!)).toBe(replayList)

    fireEvent.click(radio('weather-station'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open weather-station' }))
    })
    await screen.findByRole('region', { name: 'Mansion weather-station' })
    await houseSettled(live.container)
    // The shell now holds the house too: same map, same rooms, same read-only notice.
    // The shell now holds the house too: same map, same rooms, same read-only notice. The
    // replay differs in exactly two labelled things: its mode, and the note that a recording
    // starts paused (replay-and-submission Requirement 2.1).
    const liveShell = live.container.querySelector('.hh-foyer')!
    expect(replayShell.mode).toBe('replay')
    expect(liveShell.querySelector('.hh-ui')).toHaveAttribute('data-mode', 'live')
    expect(replayShell.startNotes).toBe(1)
    expect(liveShell.querySelectorAll('[data-replay-start]')).toHaveLength(0)
    expect(replayShell.markup).toContain('hh-ui-map')
    expect(sharedMarkup(liveShell)).toBe(replayShell.markup)
    expect(post).toHaveBeenCalledTimes(1)
    expectNoWayOut()
  })
})
