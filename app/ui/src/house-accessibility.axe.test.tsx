// axe-core over the house (Spec 6 task 8.1): zero violations for the Foyer,
// the House with each room, Door and ghost panel open, the risky-action
// panel, the Attic, and the static replay entry. Rules that need layout or
// colour are off (see `test/axe-audit.ts`); the hand-written structural audit
// in house-accessibility.test.tsx keeps running beside this suite.
// **Validates: Requirements 3.1, 3.9, 3.10, 4.1, 4.2, 4.3, 4.4, 4.8, 4.9, 10.4, 10.6**
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../fixtures/replay/demo.jsonl?raw'
import type { HouseProjection } from './core/house-projection'
import { PRESENTATION_DOOR_STATES, PRESENTATION_GHOST_STATES } from './core/house-registry'
import type { RoomGhosts } from './core/room-projection'
import type { AppEvent } from './core/seance-event'
import type { WorkflowProjection } from './core/workflow-projection'
import { Foyer } from './rooms/foyer/Foyer'
import { listBody, mansion } from './rooms/foyer/foyer-test-kit'
import { House } from './rooms/house/House'
import { axeViolations } from './test/axe-audit'
import { ghostEvent } from './test/house-kit'
import { MANSION_DESCRIPTOR } from './test/house-projection-kit'
import { FakeRoomBackend } from './test/room-house-kit'
import { REQUIREMENTS_WAITING, TASKS_APPROVED, requirementsWritten, roomGhosts, run, workshopAtWork } from './test/room-kit'
import { Shell, WAITING_WORKFLOW, houseOf, installMatchMedia, newRecorded, quietHouse, waitingHouse, withRoomState } from './test/shell-kit'
import { projection, riskyProposal } from './test/workflow-arbitraries'

// axe walks every node of every opened surface: up to ~2.5 s per test alone,
// more while the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 })

const host = vi.hoisted(() => ({
  backend: null as unknown as { get: (path: string) => Promise<unknown>; post: (path: string, body?: unknown) => Promise<unknown> },
  theme: { mode: 'light', accent: '', colorTheme: 'default' } as unknown,
}))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({ get: (path: string) => host.backend.get(path), post: (path: string, body?: unknown) => host.backend.post(path, body), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: () => () => {},
  useTheme: () => host.theme,
  useNotify: () => vi.fn(),
  useNavBadge: () => vi.fn(),
  useChatLauncher: () => ({ openChat: vi.fn() }),
}))

// The replay entry, replay/main.tsx, does not export its root; this pass-through
// keeps each root so the replay case can unmount it.
const roots = vi.hoisted(() => [] as Root[])
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>()
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      const root = actual.createRoot(...args)
      roots.push(root)
      return root
    },
  }
})

beforeEach(() => {
  host.theme = { mode: 'light', accent: '', colorTheme: 'default' }
})

describe('the axe audit itself', () => {
  it('reports violations it is relied on for', async () => {
    const { container } = render(
      <div>
        <button type="button" />
        <img src="ghost.png" />
        <ul>
          <div>stray</div>
        </ul>
        <input type="text" />
        <div role="dialog" />
      </div>,
    )
    const found = new Set((await axeViolations(container)).map((line) => line.split(':')[0]))
    for (const rule of ['button-name', 'image-alt', 'list', 'label', 'aria-dialog-name']) expect(found).toContain(rule)
  })

  it('counts a heading level screen readers do not support as a failure', async () => {
    const { container } = render(
      <p role="heading" aria-level={7}>
        Deep
      </p>,
    )
    expect(await axeViolations(container)).toEqual([expect.stringMatching(/^aria-valid-attr-value: .* \[needs review\]$/)])
  })
})

describe('the Foyer', () => {
  it.each(['light', 'dark'] as const)('has no axe violation with ready, missing and conflicting mansions (%s)', async (mode) => {
    host.theme = { mode, accent: '#c58b45', colorTheme: 'midnight' }
    const body = listBody(mansion('alpha'), mansion('beta', 'missing'), mansion('gamma', 'conflict'))
    host.backend = { get: async () => body, post: async () => ({}) }
    const { container } = render(<Foyer />)
    await waitFor(() => expect(screen.queryByText('Loading mansions…')).not.toBeInTheDocument())
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(await axeViolations(container)).toEqual([])
    // With a mansion selected and the create form showing a validation error.
    fireEvent.click(screen.getByRole('radio', { name: /^alpha\b/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create mansion' }))
    expect(await axeViolations(container)).toEqual([])
  })

  it('has no axe violation with no mansions yet', async () => {
    host.backend = { get: async () => listBody(), post: async () => ({}) }
    const { container } = render(<Foyer />)
    await waitFor(() => expect(screen.queryByText('Loading mansions…')).not.toBeInTheDocument())
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('the house shell in every major state', () => {
  let media: ReturnType<typeof installMatchMedia> | null = null
  afterEach(() => {
    media?.restore()
    media = null
  })

  /** axe with nothing open, then with each map control's surface open in turn. */
  async function axeEverySurface(container: HTMLElement): Promise<string[]> {
    const problems = (await axeViolations(container)).map((line) => `closed: ${line}`)
    for (const control of Array.from(container.querySelectorAll<HTMLElement>('.hh-ui-map button'))) {
      fireEvent.click(control)
      problems.push(...(await axeViolations(container)).map((line) => `${control.getAttribute('aria-label')}: ${line}`))
      fireEvent.keyDown(document.body, { key: 'Escape' })
    }
    return problems
  }

  const FIXTURES: [string, () => HouseProjection][] = [
    ['a quiet house', () => quietHouse()],
    ['a house that needs the Operator', () => waitingHouse()],
    ['the Séance Room hidden', () => waitingHouse({ seanceRoom: 'hidden' })],
    ['the Séance Room locked', () => waitingHouse({ seanceRoom: 'locked' })],
    ['the Séance Room enabled', () => waitingHouse({ seanceRoom: 'enabled' })],
    ['a recording (read-only)', () => houseOf({ workflow: WAITING_WORKFLOW, readOnly: true }, { mode: 'replay' })],
    ['a corrupt log', () => houseOf({ workflow: { ...WAITING_WORKFLOW, integrity: 'corrupt' } })],
    ['an unconfirmed state', () => houseOf({ workflow: { ...WAITING_WORKFLOW, integrity: 'uncertain' } })],
    ['no readable state (unavailable)', () => houseOf({ workflow: null, workflowStatus: 'unavailable' })],
    ['a state the page cannot read', () => houseOf({ workflow: null, workflowStatus: 'malformed' })],
    ...PRESENTATION_DOOR_STATES.map((door): [string, () => HouseProjection] => [`Door ${door}`, () => withRoomState(quietHouse(), 'drafting-room', { door })]),
    ...PRESENTATION_GHOST_STATES.map((ghost): [string, () => HouseProjection] => [`ghost ${ghost}`, () => withRoomState(quietHouse(), 'drafting-room', { ghost })]),
  ]

  it.each(FIXTURES)('has no axe violation with %s, in light and dark, with every surface opened', async (_name, house) => {
    for (const mode of ['light', 'dark'] as const) {
      host.theme = { mode, accent: '', colorTheme: 'default' }
      const view = render(<Shell projection={house()} recorded={newRecorded()} status={<p>Backend reachable</p>} />)
      expect(view.container.querySelector('.hh-ui')).toHaveAttribute('data-theme', mode)
      expect(await axeEverySurface(view.container)).toEqual([])
      view.unmount()
    }
  })

  it.each([
    ['motion on', false, false],
    ['Still House', false, true],
    ['reduced motion', true, false],
  ] as const)('has no axe violation with %s', async (_name, reduced, still) => {
    media = installMatchMedia(reduced)
    const { container } = render(<Shell projection={waitingHouse()} recorded={newRecorded()} />)
    if (still) fireEvent.click(screen.getByRole('button', { name: /^Still house/ }))
    expect(container.querySelector('.hh-ui')).toHaveAttribute('data-motion', reduced || still ? 'none' : 'low-frequency')
    expect(await axeEverySurface(container)).toEqual([])
  })

  it('has no axe violation as a modal dialog', async () => {
    const { container } = render(<Shell projection={waitingHouse()} recorded={newRecorded()} panelMode="dialog" />)
    fireEvent.click(container.querySelector<HTMLElement>('[data-room-control="study"]')!)
    expect(screen.getByRole('dialog', { name: 'Study' })).toBeInTheDocument()
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('the House with its real panels', () => {
  async function mountHouse(workflow: WorkflowProjection, rooms: RoomGhosts, log: AppEvent[] = []) {
    const backend = new FakeRoomBackend(workflow, rooms)
    backend.log = [...log]
    host.backend = backend
    const view = render(<House mansion={MANSION_DESCRIPTOR} onReturn={() => {}} />)
    await screen.findByRole('button', { name: /^Study\./ })
    await waitFor(() => expect(view.container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
    await waitFor(() => expect(backend.roomReads).toBeGreaterThan(0))
    return view
  }

  /**
   * axe over the House closed, then with each map control's panel open in
   * turn (every room, Door, ghost and the Attic), each disclosure inside it
   * expanded. Returns the violations and the panels that were opened.
   */
  async function auditHouse(container: HTMLElement): Promise<{ problems: string[]; opened: string[]; attic: boolean; articles: string[] }> {
    const problems = (await axeViolations(container)).map((line) => `closed: ${line}`)
    const opened: string[] = []
    const articles: string[] = []
    let attic = false
    for (const control of Array.from(container.querySelectorAll<HTMLElement>('.hh-ui-map button'))) {
      const name = control.getAttribute('aria-label') ?? control.textContent ?? '?'
      fireEvent.click(control)
      const panel = await waitFor(() => {
        const found = container.querySelector<HTMLElement>('.hh-ui-panel')
        if (found === null) throw new Error('no panel')
        return found
      })
      await waitFor(() => expect(panel.querySelector('[data-output-note], [data-attic="loading"]')).toBeNull())
      for (const toggle of Array.from(panel.querySelectorAll<HTMLElement>('button[aria-expanded="false"]'))) fireEvent.click(toggle)
      opened.push(name)
      attic ||= panel.querySelector('[data-attic]') !== null
      for (const article of within(panel).queryAllByRole('article')) articles.push(article.querySelector('h1, h2, h3, h4, h5, h6')?.textContent ?? '')
      problems.push(...(await axeViolations(container)).map((line) => `${name}: ${line}`))
      fireEvent.click(panel.querySelector<HTMLElement>('.hh-ui-panel-close')!)
    }
    return { problems, opened, attic, articles }
  }

  const STUDY_LOG = [
    ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing requirements', room: 'study' }),
    ghostEvent(2, 'archivist', 'run_completed', { reason: 'requirements.md is ready for review' }),
  ]

  it.each(['light', 'dark'] as const)('has no axe violation with a Door waiting, in every room, Door, ghost and the Attic (%s)', async (mode) => {
    host.theme = { mode, accent: '', colorTheme: 'default' }
    const answer = requirementsWritten({ runs: [run({ runId: 'archivist-run', sessionSlot: 'hh-archivist', sessionLink: 'hh-archivist' })] })
    const { container } = await mountHouse(REQUIREMENTS_WAITING, answer, STUDY_LOG)
    const { problems, opened, attic } = await auditHouse(container)
    expect(problems).toEqual([])
    // Each room panel, a Door panel and the Attic were among the surfaces audited.
    for (const room of [/^Study\./, /^Drafting Room\./, /^Workshop\./, /^Attic\b/]) expect(opened.some((name) => room.test(name))).toBe(true)
    expect(attic).toBe(true)
    expect(opened.some((name) => /door/i.test(name))).toBe(true)
  })

  it('has no axe violation with the Workshop at work, a risky action pending, and a failed and a blocked ghost', async () => {
    const log = [
      ghostEvent(1, 'tinker-1', 'run_started', { reason: 'Building task 1.2', room: 'workshop' }),
      ghostEvent(2, 'tinker-2', 'run_started', { reason: 'Building', room: 'workshop' }),
      ghostEvent(3, 'tinker-2', 'run_blocked', { reason: 'locked_door' }),
      ghostEvent(4, 'tinker-3', 'run_started', { reason: 'Building', room: 'workshop' }),
      ghostEvent(5, 'tinker-3', 'run_failed', { reason: 'crew_error' }),
    ]
    // One complete proposal and one whose tool input was withheld (shown as blocked).
    const riskyProposals = [
      riskyProposal({ proposalId: 'risky-1', ghostId: 'tinker-1', createdSequence: 8 }),
      riskyProposal({ proposalId: 'risky-2', ghostId: 'tinker-2', descriptor: null, createdSequence: 9 }),
    ]
    const workflow = { ...TASKS_APPROVED, waitingCount: riskyProposals.length, riskyProposals }
    const { container } = await mountHouse(workflow, workshopAtWork(), log)
    const { problems, articles } = await auditHouse(container)
    expect(problems).toEqual([])
    // Both risky-action cards were open while axe ran.
    expect(articles.filter((title) => /asks: /.test(title)).length).toBeGreaterThanOrEqual(2)
  })

  it('has no axe violation as a recording and with an unreadable room answer', async () => {
    const recording = await mountHouse({ ...REQUIREMENTS_WAITING, readOnly: true }, requirementsWritten({ readOnly: true }), STUDY_LOG)
    expect((await auditHouse(recording.container)).problems).toEqual([])
    recording.unmount()
    const unread = await mountHouse(projection({ version: 10, integrity: 'uncertain' }), roomGhosts({ integrity: 'uncertain' }))
    expect((await auditHouse(unread.container)).problems).toEqual([])
  })
})

describe('the static replay entry', () => {
  beforeEach(() => {
    // Same mapping as the replay build, registered per test over the hoisted
    // mock above, as replay.test.tsx does.
    vi.resetModules()
    vi.doMock('@kirocrew/app-sdk', () => import('./adapters/sdk-shim'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (!url.endsWith('fixture.jsonl')) throw new TypeError(`The replay must not request ${url}.`)
        return new Response(demo, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
      }),
    )
  })

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount())
    document.getElementById('root')?.remove()
    vi.unstubAllGlobals()
    vi.doUnmock('@kirocrew/app-sdk')
    vi.resetModules()
  })

  it('has no axe violation on the replay Foyer, the opened recorded mansion, and its Attic', async () => {
    const container = document.createElement('div')
    container.id = 'root'
    document.body.append(container)
    await act(async () => {
      await import('../replay/main')
    })
    await screen.findByRole('region', { name: 'Foyer' })
    await waitFor(() => expect(screen.queryByText('Loading mansions…')).not.toBeInTheDocument())
    expect(await axeViolations(container)).toEqual([])

    fireEvent.click(screen.getByRole('radio', { name: /^demo-mansion\b/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open demo-mansion' }))
    })
    await screen.findByRole('region', { name: 'Mansion demo-mansion' })
    await waitFor(() => expect(container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
    expect(container.querySelector('.hh-ui')).toHaveAttribute('data-mode', 'replay')
    expect(await axeViolations(container)).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: /^Attic\b/ }))
    const panel = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('.hh-ui-panel [data-attic]')
      if (found === null) throw new Error('no Attic')
      return found
    })
    await waitFor(() => expect(container.querySelector('[data-attic="loading"]')).toBeNull())
    for (const toggle of Array.from(panel.querySelectorAll<HTMLElement>('button[aria-expanded="false"]'))) fireEvent.click(toggle)
    expect(await axeViolations(container)).toEqual([])
  })
})
