// Accessibility rules over the house in every major state (Spec 6 task 8.1):
// each room, Door and ghost state, every panel, light and dark, locked,
// unavailable, read-only, and with motion off. The rules are the structural
// ones in `test/a11y-audit.ts`; this suite does not use a rule engine.
// **Validates: Requirements 3.1, 3.9, 3.10, 4.1, 4.2, 4.3, 4.4, 4.8, 4.9, 10.4, 10.6**
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseProjection } from './core/house-projection'
import { PRESENTATION_DOOR_STATES, PRESENTATION_GHOST_STATES } from './core/house-registry'
import type { RoomGhosts } from './core/room-projection'
import type { AppEvent } from './core/seance-event'
import type { WorkflowProjection } from './core/workflow-projection'
import { House } from './rooms/house/House'
import { auditAccessibility } from './test/a11y-audit'
import { ghostEvent } from './test/house-kit'
import { MANSION_DESCRIPTOR } from './test/house-projection-kit'
import { FakeRoomBackend } from './test/room-house-kit'
import { REQUIREMENTS_WAITING, TASKS_APPROVED, requirementsWritten, roomGhosts, run, workshopAtWork } from './test/room-kit'
import { Shell, houseOf, installMatchMedia, newRecorded, quietHouse, waitingHouse, withRoomState, WAITING_WORKFLOW } from './test/shell-kit'
import { projection, riskyProposal } from './test/workflow-arbitraries'

const host = vi.hoisted(() => ({
  backend: null as unknown as { get: (path: string) => Promise<unknown>; post: (path: string, body?: unknown) => Promise<unknown> },
  theme: { mode: 'light', accent: '', colorTheme: 'default' } as unknown,
}))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({ get: (path: string) => host.backend.get(path), post: (path: string, body?: unknown) => host.backend.post(path, body), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: () => undefined as unknown as () => void,
  useTheme: () => host.theme,
  useNotify: () => vi.fn(),
  useNavBadge: () => vi.fn(),
  useChatLauncher: () => ({ openChat: vi.fn() }),
}))

let media: ReturnType<typeof installMatchMedia> | null = null

beforeEach(() => {
  host.theme = { mode: 'light', accent: '', colorTheme: 'default' }
})

afterEach(() => {
  media?.restore()
  media = null
})

/** Audits the shell with nothing open, then with each control's surface open in turn. */
function auditEverySurface(container: HTMLElement): string[] {
  const problems = auditAccessibility(container).map((line) => `closed: ${line}`)
  for (const control of Array.from(container.querySelectorAll<HTMLElement>('.hh-ui-map button'))) {
    fireEvent.click(control)
    problems.push(...auditAccessibility(container).map((line) => `${control.getAttribute('aria-label')}: ${line}`))
    // A closed panel leaves nothing behind.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    if (container.querySelector('.hh-ui-panel') !== null) problems.push('a closed panel stayed in the tree')
  }
  return problems
}

describe('shell fixtures', () => {
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

  it.each(FIXTURES)('has no rule violation with %s, in light and dark, with every surface opened', (_name, house) => {
    for (const mode of ['light', 'dark'] as const) {
      host.theme = { mode, accent: '', colorTheme: 'default' }
      const view = render(<Shell projection={house()} recorded={newRecorded()} status={<p>Backend reachable</p>} />)
      expect(view.container.querySelector('.hh-ui')).toHaveAttribute('data-theme', mode)
      expect(auditEverySurface(view.container)).toEqual([])
      view.unmount()
    }
  })

  it.each([
    ['motion on', false, false],
    ['Still House', false, true],
    ['reduced motion', true, false],
  ] as const)('has no rule violation with %s', (_name, reduced, still) => {
    media = installMatchMedia(reduced)
    const { container } = render(<Shell projection={waitingHouse()} recorded={newRecorded()} />)
    if (still) fireEvent.click(screen.getByRole('button', { name: /^Still house/ }))
    expect(container.querySelector('.hh-ui')).toHaveAttribute('data-motion', reduced || still ? 'none' : 'low-frequency')
    expect(auditEverySurface(container)).toEqual([])
  })

  it('has no rule violation as a modal dialog', () => {
    const { container } = render(<Shell projection={waitingHouse()} recorded={newRecorded()} panelMode="dialog" />)
    fireEvent.click(container.querySelector<HTMLElement>('[data-room-control="study"]')!)
    expect(screen.getByRole('dialog', { name: 'Study' })).toBeInTheDocument()
    expect(auditAccessibility(container)).toEqual([])
  })
})

describe('the house with its real room panels', () => {
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

  async function auditHouse(container: HTMLElement): Promise<string[]> {
    const problems = auditAccessibility(container).map((line) => `closed: ${line}`)
    for (const control of Array.from(container.querySelectorAll<HTMLElement>('.hh-ui-map button'))) {
      const name = control.getAttribute('aria-label')
      fireEvent.click(control)
      const panel = await waitFor(() => {
        const found = container.querySelector<HTMLElement>('.hh-ui-panel')
        if (found === null) throw new Error('no panel')
        return found
      })
      await waitFor(() => expect(panel.querySelector('[data-output-note], [data-attic="loading"]')).toBeNull())
      // Open every disclosure inside the panel too, so its content is audited.
      for (const toggle of Array.from(panel.querySelectorAll<HTMLElement>('button[aria-expanded="false"]'))) fireEvent.click(toggle)
      problems.push(...auditAccessibility(container).map((line) => `${name}: ${line}`))
      fireEvent.click(panel.querySelector<HTMLElement>('.hh-ui-panel-close')!)
    }
    return problems
  }

  const STUDY_LOG = [
    ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing requirements', room: 'study' }),
    ghostEvent(2, 'archivist', 'run_completed', { reason: 'requirements.md is ready for review' }),
  ]

  it.each(['light', 'dark'] as const)('has no rule violation with a Door waiting, in every room and surface (%s)', async (mode) => {
    host.theme = { mode, accent: '', colorTheme: 'default' }
    const answer = requirementsWritten({ runs: [run({ runId: 'archivist-run', sessionSlot: 'hh-archivist', sessionLink: 'hh-archivist' })] })
    const { container } = await mountHouse(REQUIREMENTS_WAITING, answer, STUDY_LOG)
    expect(await auditHouse(container)).toEqual([])
  })

  it('has no rule violation with the Workshop at work, a risky action pending, and a failed and a blocked ghost', async () => {
    const log = [
      ghostEvent(1, 'tinker-1', 'run_started', { reason: 'Building task 1.2', room: 'workshop' }),
      ghostEvent(2, 'tinker-2', 'run_started', { reason: 'Building', room: 'workshop' }),
      ghostEvent(3, 'tinker-2', 'run_blocked', { reason: 'locked_door' }),
      ghostEvent(4, 'tinker-3', 'run_started', { reason: 'Building', room: 'workshop' }),
      ghostEvent(5, 'tinker-3', 'run_failed', { reason: 'crew_error' }),
    ]
    const workflow = { ...TASKS_APPROVED, riskyProposals: [riskyProposal({ createdSequence: 8 })] }
    const { container } = await mountHouse(workflow, workshopAtWork(), log)
    expect(await auditHouse(container)).toEqual([])
  })

  it('has no rule violation as a recording and with an unreadable room answer', async () => {
    const recording = await mountHouse({ ...REQUIREMENTS_WAITING, readOnly: true }, requirementsWritten({ readOnly: true }), STUDY_LOG)
    expect(await auditHouse(recording.container)).toEqual([])
    recording.unmount()
    const unread = await mountHouse(projection({ version: 10, integrity: 'uncertain' }), roomGhosts({ integrity: 'uncertain' }))
    expect(await auditHouse(unread.container)).toEqual([])
  })
})

describe('the audit itself', () => {
  it('reports each kind of violation it is relied on for', () => {
    const { container } = render(
      <div>
        <p aria-live="polite">one</p>
        <output>two</output>
        <button id="twin" type="button">
          <span tabIndex={0}>nested</span>
        </button>
        <button id="twin" type="button" aria-describedby="nowhere" />
        <nav>
          <ol>
            <div>stray</div>
          </ol>
        </nav>
        <h2>Title</h2>
        <h5>Jump</h5>
        <svg>
          <title>named art</title>
        </svg>
        <section role="dialog" aria-label="Dialog" />
        <button type="button" aria-disabled="true">
          Off
        </button>
      </div>,
    )
    const problems = auditAccessibility(container).join('\n')
    for (const expected of [
      'live regions: expected 1, found 2',
      'duplicate id "twin"',
      'names a missing id "nowhere"',
      'nested interactive content',
      'no accessible name: button#twin',
      'unlabelled navigation',
      'has a non-item child',
      'heading level jumps from 2 to 5',
      'art exposed to assistive technology',
      'art with a name',
      'dialog without aria-modal',
      'control is off without a stated reason',
    ]) {
      expect(problems).toContain(expected)
    }
  })
})
