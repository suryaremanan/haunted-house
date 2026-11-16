// The Séance Room setting is isolated from the MVP house (Spec 6 task 9.4):
// hidden, locked and enabled differ only in the Séance Room itself.
// **Validates: Requirements 1.4, 1.5, 11.5, 11.6, 11.7**
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SeanceRoomSetting } from '../../core/house-registry'
import type { RoomGhosts } from '../../core/room-projection'
import { ghostEvent } from '../../test/house-kit'
import { MANSION_DESCRIPTOR } from '../../test/house-projection-kit'
import { FakeRoomBackend } from '../../test/room-house-kit'
import { REQUIREMENTS_WAITING, requirementsWritten, run } from '../../test/room-kit'
import { House } from '../house/House'

const host = vi.hoisted(() => ({
  backend: null as unknown as { get: (path: string) => Promise<unknown>; post: (path: string, body?: unknown) => Promise<unknown> },
  notify: vi.fn(),
  badge: vi.fn(),
}))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({ get: (path: string) => host.backend.get(path), post: (path: string, body?: unknown) => host.backend.post(path, body), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: () => undefined as unknown as () => void,
  useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
  useNotify: () => host.notify,
  useNavBadge: () => host.badge,
  useChatLauncher: () => ({ openChat: vi.fn() }),
}))

const review = {
  cycle: 1,
  status: 'changes_requested' as const,
  ghostId: 'medium',
  sessionLink: null,
  findings: [{ findingId: 'f-1', requirementIds: ['1.3'], paths: ['src/guestbook/store.py'], summary: 'Entries are sorted by name.' }],
  repairs: [{ taskId: '4.1', findingId: 'f-1', title: 'Keep insertion order', writes: ['src/guestbook/store.py'], status: 'proposed' as const }],
}
const LOG = [
  ghostEvent(1, 'archivist', 'run_started', { reason: 'Writing requirements', room: 'study' }),
  ghostEvent(2, 'archivist', 'run_completed', { reason: 'requirements.md is ready for review' }),
]
const answer = (overrides: Partial<RoomGhosts> = {}) =>
  requirementsWritten({ runs: [run({ runId: 'archivist-run', sessionSlot: 'hh-archivist', sessionLink: 'hh-archivist' })], seanceEnabled: true, review, ...overrides })

let backend: FakeRoomBackend

async function mount(seanceRoom: SeanceRoomSetting) {
  backend = new FakeRoomBackend(REQUIREMENTS_WAITING, answer())
  backend.log = [...LOG]
  host.backend = backend
  host.badge.mockReset()
  const view = render(<House mansion={MANSION_DESCRIPTOR} onReturn={() => {}} seanceRoom={seanceRoom} />)
  await screen.findByRole('button', { name: /^Study\./ })
  await waitFor(() => expect(view.container.querySelector('.hh-ui')).toHaveAttribute('aria-busy', 'false'))
  await waitFor(() => expect(backend.roomReads).toBeGreaterThan(0))
  return view
}

/** Everything the MVP rooms show on the map and in the Study panel, as text. */
async function mvpView(container: HTMLElement): Promise<string> {
  const cells = Array.from(container.querySelectorAll<HTMLElement>('.hh-ui-rooms > li'))
    .filter((cell) => cell.getAttribute('data-room') !== 'seance-room')
    .map((cell) => `${cell.getAttribute('data-room')}|${cell.getAttribute('data-integrity')}|${Array.from(cell.querySelectorAll('button'), (button) => button.getAttribute('aria-label')).join(';')}|${cell.textContent}`)
  fireEvent.click(screen.getByRole('button', { name: /^Study\./ }))
  const panel = await screen.findByRole('region', { name: 'Study' })
  await waitFor(() => expect(panel.querySelector('[data-output-note]')).toBeNull())
  const study = `${panel.textContent}|${within(panel).getAllByRole('button').map((button) => `${button.getAttribute('aria-label') ?? button.textContent}:${button.getAttribute('aria-disabled')}`).join(';')}`
  fireEvent.keyDown(panel, { key: 'Escape' })
  const needs = container.querySelector('.hh-ui-needs')?.textContent ?? ''
  return [...cells, study, needs].join('\n')
}

describe('Séance Room setting', () => {
  it('changes only the Séance Room: every MVP room, control, count and badge is the same in all three settings', async () => {
    const seen: Record<string, { mvp: string; badge: unknown; motion: string | null }> = {}
    for (const setting of ['hidden', 'locked', 'enabled'] as const) {
      const view = await mount(setting)
      seen[setting] = {
        mvp: await mvpView(view.container),
        badge: host.badge.mock.calls.at(-1)?.[0],
        motion: view.container.querySelector('.hh-ui')!.getAttribute('data-motion'),
      }
      expect(backend.posts).toEqual([])
      expect(backend.roomPosts).toEqual([])
      view.unmount()
    }
    expect(seen.locked).toEqual(seen.hidden)
    expect(seen.enabled).toEqual(seen.hidden)
    expect(seen.hidden.badge).toBe(1)
  })

  it('hidden: no Séance Room on the map, and Room order ends at the Attic', async () => {
    const { container } = await mount('hidden')
    expect(Array.from(container.querySelectorAll('.hh-ui-rooms > li'), (cell) => cell.getAttribute('data-room'))).toEqual(['foyer', 'study', 'drafting-room', 'workshop', 'attic'])
    expect(container.textContent).not.toMatch(/Séance Room|Medium/)
  })

  it('locked: after the Attic, focusable, explains itself, and has no review control even though the backend has a review', async () => {
    const { container } = await mount('locked')
    expect(Array.from(container.querySelectorAll('.hh-ui-rooms > li'), (cell) => cell.getAttribute('data-room')).at(-1)).toBe('seance-room')
    const control = screen.getByRole('button', { name: 'Séance Room. Phase: review. Door: not applicable. Ghost: not applicable.' })
    expect(control).toHaveAttribute('aria-disabled', 'true')
    control.focus()
    expect(control).toHaveFocus()
    fireEvent.click(control)
    const panel = await screen.findByRole('region', { name: 'Séance Room' })
    expect(panel.querySelector('[data-seance="locked"]')).not.toBeNull()
    expect(panel.querySelector('[data-review], [data-verdict]')).toBeNull()
    expect(within(panel).getAllByRole('button')).toHaveLength(1)
    expect(backend.roomPosts).toEqual([])
  })

  it('enabled: shows the bounded review Spec 5 projects, reads it only, and offers no decision of its own', async () => {
    await mount('enabled')
    const control = screen.getByRole('button', { name: /^Séance Room\./ })
    expect(control).not.toHaveAttribute('aria-disabled')
    fireEvent.click(control)
    const panel = await screen.findByRole('region', { name: 'Séance Room' })
    expect(panel.querySelector('[data-verdict]')).toHaveTextContent('Changes requested. Review cycle 1 of 3.')
    expect(within(panel).getByRole('list', { name: 'Review findings' })).toHaveTextContent('Repair task 4.1: Keep insertion order. Proposed: not started.')
    // Besides Close, only the secondary session link, which is off without a verified link.
    const controls = within(panel).getAllByRole('button').filter((button) => button.textContent?.trim() !== 'Close room')
    expect(controls.map((button) => button.getAttribute('aria-disabled'))).toEqual(['true'])
    for (const button of controls) fireEvent.click(button)
    expect(backend.posts).toEqual([])
    expect(backend.roomPosts).toEqual([])
  })
})
