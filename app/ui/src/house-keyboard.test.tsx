// The complete keyboard and focus matrix of the house (Spec 6 task 8.2), run
// with motion on, with Still House, and under reduced motion: keyboard
// behaviour has no dependency on animation.
// jsdom does not move focus on Tab, so Tab order is asserted as what it is by
// construction: every control is a native, enabled-for-focus element with no
// positive tabindex, so the Tab sequence is the document order checked here.
// **Validates: Requirements 3.1 to 3.10, 7.8, 10.5**
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ARROW_DIRECTIONS, nextRoom, visibleRoomIds, visibleRooms, type RoomId } from './core/house-registry'
import { House } from './rooms/house/House'
import { ghostEvent } from './test/house-kit'
import { MANSION_DESCRIPTOR } from './test/house-projection-kit'
import { FakeRoomBackend } from './test/room-house-kit'
import { REQUIREMENTS_WAITING, requirementsWritten, roomGhosts, run } from './test/room-kit'
import { installMatchMedia } from './test/shell-kit'
import { projection } from './test/workflow-arbitraries'

const host = vi.hoisted(() => ({
  backend: null as unknown as { get: (path: string) => Promise<unknown>; post: (path: string, body?: unknown) => Promise<unknown> },
}))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({ get: (path: string) => host.backend.get(path), post: (path: string, body?: unknown) => host.backend.post(path, body), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: () => undefined as unknown as () => void,
  useTheme: () => ({ mode: 'light', accent: '', colorTheme: 'default' }),
  useNotify: () => vi.fn(),
  useNavBadge: () => vi.fn(),
  useChatLauncher: () => ({ openChat: vi.fn() }),
}))

const MOTION_MODES = ['motion on', 'Still House', 'reduced motion'] as const
type MotionMode = (typeof MOTION_MODES)[number]

let backend: FakeRoomBackend
let media: ReturnType<typeof installMatchMedia> | null = null
const onReturn = vi.fn()

const LOG = [
  ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing requirements', room: 'study' }),
  ghostEvent(2, 'archivist', 'run_completed', { reason: 'requirements.md is ready for review' }),
]

async function mount(mode: MotionMode, waiting = true) {
  media = installMatchMedia(mode === 'reduced motion')
  backend = waiting
    ? new FakeRoomBackend(REQUIREMENTS_WAITING, requirementsWritten({ runs: [run({ runId: 'archivist-run', sessionSlot: 'hh-archivist', sessionLink: 'hh-archivist' })] }))
    : new FakeRoomBackend(projection({ version: 10 }), roomGhosts())
  backend.log = waiting ? [...LOG] : []
  host.backend = backend
  const view = render(<House mansion={MANSION_DESCRIPTOR} onReturn={onReturn} />)
  await screen.findByRole('button', { name: /^Study\./ })
  await waitFor(() => expect(view.container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
  await waitFor(() => expect(backend.roomReads).toBeGreaterThan(0))
  if (mode === 'Still House') fireEvent.click(screen.getByRole('button', { name: 'Still house: off' }))
  expect(view.container.querySelector('.hh-ui')).toHaveAttribute('data-motion', mode === 'motion on' ? 'low-frequency' : 'none')
  return view
}

const roomControl = (id: RoomId) => document.querySelector<HTMLElement>(`[data-room-control="${id}"]`)!

/** Everything Tab stops at, in document order. */
function tabStops(scope: ParentNode): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>('button, summary, a[href], input, textarea, select, [tabindex]')).filter(
    (element) => element.tabIndex >= 0 && !element.hasAttribute('disabled') && element.closest('[inert], [hidden]') === null,
  )
}

const label = (element: HTMLElement) => element.getAttribute('aria-label') ?? element.textContent?.trim() ?? ''

beforeEach(() => {
  onReturn.mockReset()
})

afterEach(() => {
  media?.restore()
  media = null
})

describe.each(MOTION_MODES)('keyboard with %s', (mode) => {
  it('reaches every room, ghost, Door, panel and decision control with Tab, in reading order', async () => {
    const { container } = await mount(mode)
    fireEvent.click(roomControl('study'))
    const panel = await screen.findByRole('region', { name: 'Study' })
    await waitFor(() => expect(panel.querySelector('[data-output-note]')).toBeNull())
    const stops = tabStops(container)
    // No positive tabindex anywhere: Tab follows the document.
    for (const stop of stops) expect(stop.tabIndex).toBe(0)
    expect(stops.map(label)).toEqual([
      'Needs you: 1 thing needs you. Go to the first.',
      mode === 'Still House' ? 'Still house: on' : 'Still house: off',
      'Sound: off',
      'Side view: off',
      'Go to the Foyer',
      'Go to the Drafting Room',
      'See the whole house',
      'Exit to the Foyer',
      'Close room',
      'Requirements document text',
      'Approve Requirements door, revision 1',
      'Reject Requirements door, revision 1',
      'Ask for a revision of the requirements',
      "Open Archivist's Crew session (Done)",
      'Foyer. Phase: navigation. Door: not applicable. Ghost: not applicable.',
      'Study. Phase: requirements. Door: waiting. Ghost: done.',
      'Archivist, ghost in the Study. State: done.',
      'Requirements door of the Study. State: waiting.',
      'Drafting Room. Phase: design. Door: sealed. Ghost: not applicable.',
      'Design door of the Drafting Room. State: sealed.',
      'Workshop. Phase: tasks and implementation. Door: sealed. Ghost: not applicable.',
      'Tasks door of the Workshop. State: sealed.',
      'Implementation door of the Workshop. State: sealed.',
      'Attic. Phase: replay. Door: not applicable. Ghost: not applicable.',
      'Séance Room. Phase: review. Door: not applicable. Ghost: not applicable.',
    ])
    // Every one of them is a native control or a labelled scroll region, and none is hidden art.
    for (const stop of stops) expect(stop.closest('svg')).toBeNull()
  })

  it('moves along every edge of the fixed map with the arrows and stays put where there is none', async () => {
    await mount(mode, false)
    const visible = visibleRoomIds('locked')
    for (const room of visibleRooms('locked')) {
      for (const direction of ARROW_DIRECTIONS) {
        roomControl(room.id).focus()
        fireEvent.keyDown(roomControl(room.id), { key: direction })
        expect(document.activeElement, `${room.id} ${direction}`).toBe(roomControl(nextRoom(room.id, direction, visible)))
      }
    }
    expect(document.querySelector('.hh-ui-panel')).toBeNull()
  })

  it('opens on Enter, closes on Escape and returns focus, for a room and for a nested surface', async () => {
    await mount(mode)
    const study = roomControl('study')
    study.focus()
    // Enter on a native button is delivered as a click.
    fireEvent.click(study)
    expect(within(await screen.findByRole('region', { name: 'Study' })).getByRole('heading', { name: 'Study' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(study).toHaveFocus()
    expect(onReturn).not.toHaveBeenCalled()

    const door = screen.getByRole('button', { name: /^Requirements door of the Study/ })
    fireEvent.click(door)
    const surface = await screen.findByRole('region', { name: 'Requirements door' })
    const nested = within(surface).getByRole('button', { name: 'Open the Study' })
    fireEvent.click(nested)
    expect(within(await screen.findByRole('region', { name: 'Study' })).getByRole('heading', { name: 'Study' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    // Only the nested surface closed; focus is on the control that opened it.
    expect(screen.getByRole('button', { name: 'Open the Study' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(door).toHaveFocus()
    expect(backend.posts).toEqual([])
  })

  it('falls back to the Room control when the opener is gone', async () => {
    await mount(mode)
    const ghost = screen.getByRole('button', { name: /^Archivist, ghost/ })
    fireEvent.click(ghost)
    await screen.findByRole('region', { name: 'Archivist' })
    // The opener leaves the page and nothing carries its key.
    ghost.removeAttribute('data-opener-key')
    ghost.remove()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(roomControl('study')).toHaveFocus()
  })

  it('takes the Needs You shortcut to the first decision, and does nothing at zero', async () => {
    const view = await mount(mode)
    const shortcut = screen.getByRole('button', { name: /^Needs you: 1 thing needs you/ })
    fireEvent.click(shortcut)
    const panel = await screen.findByRole('region', { name: 'Study' })
    await waitFor(() => expect(within(panel).getByRole('article', { name: 'Requirements door' })).toHaveFocus())
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(shortcut).toHaveFocus()
    expect(backend.posts).toEqual([])
    view.unmount()
    media?.restore()

    await mount(mode, false)
    const empty = screen.getByRole('button', { name: 'Needs you: Nothing needs you.' })
    empty.focus()
    fireEvent.click(empty)
    expect(empty).toHaveFocus()
    expect(document.querySelector('.hh-ui-panel')).toBeNull()
  })

  it('keeps controls that are off focusable, marked, and tied to their reason', async () => {
    media = installMatchMedia(mode === 'reduced motion')
    backend = new FakeRoomBackend({ ...REQUIREMENTS_WAITING, integrity: 'uncertain' }, requirementsWritten({ integrity: 'uncertain' }))
    backend.log = [...LOG]
    host.backend = backend
    render(<House mansion={MANSION_DESCRIPTOR} onReturn={onReturn} />)
    await screen.findByRole('button', { name: /^Study\./ })
    fireEvent.click(roomControl('study'))
    const panel = await screen.findByRole('region', { name: 'Study' })
    const approve = await within(panel).findByRole('button', { name: /^Approve Requirements door/ })
    expect(approve).toHaveAttribute('aria-disabled', 'true')
    expect(approve).not.toBeDisabled()
    expect(approve.tabIndex).toBe(0)
    expect(approve).toHaveAccessibleDescription(/not confirmed yet/)
    fireEvent.click(approve)
    expect(backend.posts).toEqual([])
    const locked = roomControl('seance-room')
    expect(locked).toHaveAttribute('aria-disabled', 'true')
    expect(locked).toHaveAccessibleDescription(/locked/)
  })
})

describe('focus indicators', () => {
  it('gives every kind of focusable control a visible focus rule in the shipped sheets', async () => {
    const { container } = await mount('motion on')
    fireEvent.click(roomControl('study'))
    await screen.findByRole('region', { name: 'Study' })
    const css = Array.from(container.querySelectorAll('style'), (style) => style.textContent ?? '').join('\n')
    const focusRules = Array.from(css.matchAll(/([^{}]+):focus-visible[^{]*\{([^}]*)\}/g))
    expect(focusRules.length).toBeGreaterThan(5)
    for (const [, , body] of focusRules) expect(body).toMatch(/outline:\s*\d+px solid/)
    for (const stop of tabStops(container)) {
      const classes = Array.from(stop.classList)
      const covered =
        classes.some((name) => new RegExp(`\\.${name}[^{},]*:focus-visible`).test(css)) ||
        new RegExp(`${stop.tagName.toLowerCase()}:focus-visible`).test(css) ||
        /summary:focus-visible/.test(css)
      expect(covered, `${stop.tagName}.${classes.join('.')}`).toBe(true)
    }
  })
})
