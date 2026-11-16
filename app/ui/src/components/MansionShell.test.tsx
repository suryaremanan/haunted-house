// The Mansion Shell as a whole (Spec 6 tasks 5.6 and 7.5 at the shell seam).
// **Validates: Requirements 1.2, 1.10, 4.4, 4.5, 4.6, 4.7, 5.4, 7.4, 7.8, 8.6, 8.7, 8.9**
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { liveRegions } from '../rooms/foyer/foyer-test-kit'
import { snapshot } from '../test/house-projection-kit'
import { Shell, hostFacts, houseOf, installMatchMedia, newRecorded, quietHouse, transition, waitingHouse, WAITING_WORKFLOW } from '../test/shell-kit'
import { MansionShell } from './MansionShell'

const host = vi.hoisted(() => ({
  theme: { mode: 'dark', accent: '', colorTheme: 'default' } as unknown,
  notify: vi.fn(),
  badge: vi.fn(),
}))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({}),
  useAppEvents: () => () => {},
  useTheme: () => host.theme,
  useNotify: () => host.notify,
  useNavBadge: () => host.badge,
}))

let media: ReturnType<typeof installMatchMedia> | null = null

beforeEach(() => {
  host.theme = { mode: 'dark', accent: '', colorTheme: 'default' }
  host.notify.mockReset()
  host.badge.mockReset()
})

afterEach(() => {
  media?.restore()
  media = null
  vi.useRealTimers()
})

const root = () => document.querySelector<HTMLElement>('.hh-ui')!
const announcer = () => document.querySelector<HTMLElement>('[data-announcer]')!

/** Counts mounts and unmounts of whatever it is rendered in. */
function Probe({ onMount, onUnmount }: { onMount: () => void; onUnmount: () => void }) {
  useEffect(() => {
    onMount()
    return onUnmount
  }, [onMount, onUnmount])
  return null
}

describe('document order and scope', () => {
  it('puts the toolbar, then the house map, then notes, the open panel and the live region', () => {
    render(<Shell projection={waitingHouse()} recorded={newRecorded()} notes={<p data-test-note>note</p>} status={<p>status</p>} />)
    fireEvent.click(document.querySelector<HTMLElement>('[data-room-control="study"]')!)
    const order = ['[data-toolbar]', 'nav', '[data-test-note]', '.hh-ui-panel', '[data-announcer]'].map((selector) => document.querySelector(selector)!)
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // Room details come after the map (Requirement 1.2).
    expect(screen.getByRole('navigation').compareDocumentPosition(screen.getByText('Details of room')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has no composer of its own: nothing to type into in the shell', () => {
    const { container } = render(<Shell projection={waitingHouse()} recorded={newRecorded()} />)
    expect(container.querySelector('textarea, input, [contenteditable], form')).toBeNull()
  })

  it('names the Mansion and says whether it is live or a recording', () => {
    const view = render(<Shell projection={quietHouse()} recorded={newRecorded()} />)
    expect(screen.getByRole('region', { name: 'Mansion demo-mansion' })).toHaveAttribute('data-mode', 'live')
    view.rerender(<Shell projection={quietHouse({ mode: 'replay' })} recorded={newRecorded()} />)
    expect(root()).toHaveAttribute('data-mode', 'replay')
  })

  it('leaves the Mansion on Escape only when no surface is open', () => {
    const onReturn = vi.fn()
    render(<Shell projection={quietHouse()} recorded={newRecorded()} onReturn={onReturn} />)
    fireEvent.click(document.querySelector<HTMLElement>('[data-room-control="attic"]')!)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onReturn).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onReturn).toHaveBeenCalledTimes(1)
  })

  it('leaves an Escape another surface already handled alone', () => {
    const onReturn = vi.fn()
    render(<Shell projection={quietHouse()} recorded={newRecorded()} onReturn={onReturn} />)
    const handled = (event: KeyboardEvent) => event.preventDefault()
    document.body.addEventListener('keydown', handled)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    document.body.removeEventListener('keydown', handled)
    expect(onReturn).not.toHaveBeenCalled()
  })
})

describe('motion and theme without a remount', () => {
  it('applies a reduced-motion change at runtime and keeps the shell mounted', () => {
    media = installMatchMedia(false)
    const onMount = vi.fn()
    const onUnmount = vi.fn()
    render(<Shell projection={quietHouse()} recorded={newRecorded()} notes={<Probe onMount={onMount} onUnmount={onUnmount} />} />)
    const before = root()
    expect(before).toHaveAttribute('data-motion', 'low-frequency')
    act(() => media!.set(true))
    expect(root()).toBe(before)
    expect(before).toHaveAttribute('data-motion', 'none')
    act(() => media!.set(false))
    expect(before).toHaveAttribute('data-motion', 'low-frequency')
    expect(onMount).toHaveBeenCalledTimes(1)
    expect(onUnmount).not.toHaveBeenCalled()
  })

  it('stops watching the media query on unmount', () => {
    media = installMatchMedia(false)
    const view = render(<Shell projection={quietHouse()} recorded={newRecorded()} />)
    expect(media.listeners.size).toBe(1)
    view.unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('follows the host theme from dark to light, keeping an open panel and its focus', () => {
    const recorded = newRecorded()
    const view = render(<Shell projection={quietHouse()} recorded={recorded} />)
    expect(root()).toHaveAttribute('data-theme', 'dark')
    fireEvent.click(document.querySelector<HTMLElement>('[data-room-control="study"]')!)
    const heading = screen.getByRole('heading', { name: 'Study' })
    host.theme = { mode: 'light', accent: '#123456', colorTheme: 'paper' }
    view.rerender(<Shell projection={quietHouse()} recorded={recorded} />)
    expect(root()).toHaveAttribute('data-theme', 'light')
    expect(screen.getByRole('heading', { name: 'Study' })).toBe(heading)
    expect(heading).toHaveFocus()
  })

  it('uses the light fallback palette when the host gives no theme', () => {
    host.theme = undefined
    render(<Shell projection={quietHouse()} recorded={newRecorded()} />)
    expect(root()).toHaveAttribute('data-theme', 'light')
  })

  it('works the same with motion on, Still House, and reduced motion', () => {
    for (const reduced of [false, true]) {
      media?.restore()
      media = installMatchMedia(reduced)
      const view = render(<Shell projection={waitingHouse()} recorded={newRecorded()} />)
      if (!reduced) fireEvent.click(screen.getByRole('button', { name: /^Still house/ }))
      fireEvent.click(document.querySelector<HTMLElement>('[data-room-control="study"]')!)
      expect(screen.getByRole('heading', { name: 'Study' })).toHaveFocus()
      fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(document.querySelector('[data-room-control="study"]')).toHaveFocus()
      view.unmount()
    }
  })
})

describe('one live region', () => {
  it.each([
    ['a quiet house', () => quietHouse()],
    ['a house that needs the Operator', () => waitingHouse()],
    ['a recording', () => houseOf({ workflow: WAITING_WORKFLOW, readOnly: true }, { mode: 'replay' })],
    ['a corrupt log', () => houseOf({ workflow: { ...WAITING_WORKFLOW, integrity: 'corrupt' } })],
    ['no state at all', () => houseOf({ workflow: null, workflowStatus: 'unavailable' })],
    ['the Séance Room hidden', () => quietHouse({ seanceRoom: 'hidden' })],
    ['the Séance Room enabled', () => quietHouse({ seanceRoom: 'enabled' })],
  ])('has exactly one in %s, with and without an open panel', (_name, house) => {
    const { container } = render(<Shell projection={house()} recorded={newRecorded()} status={<p>status</p>} />)
    expect(liveRegions(container)).toHaveLength(1)
    for (const control of Array.from(container.querySelectorAll<HTMLElement>('.hh-ui-map button'))) {
      fireEvent.click(control)
      expect(liveRegions(container)).toHaveLength(1)
    }
    expect(liveRegions(container)[0]).toBe(announcer())
  })

  it('says a result the Operator asked for once, and again when the same words come back later', () => {
    const recorded = newRecorded()
    const view = render(<Shell projection={quietHouse()} recorded={recorded} message="Mansion demo-mansion opened." />)
    expect(announcer()).toHaveTextContent('Mansion demo-mansion opened.')
    const first = announcer().firstElementChild
    view.rerender(<Shell projection={quietHouse()} recorded={recorded} message="Mansion demo-mansion opened." />)
    expect(announcer().firstElementChild).toBe(first)
    view.rerender(<Shell projection={quietHouse()} recorded={recorded} message="Design started." />)
    expect(announcer()).toHaveTextContent('Design started.')
    expect(announcer().firstElementChild).not.toBe(first)
  })
})

describe('interruptions at the shell', () => {
  it('sends one summary to the host toast and the identical words to the live region, then leaves it for ambient changes', () => {
    vi.useFakeTimers()
    const blocked = transition('tinker-2', 'working', 'blocked')
    const projection = waitingHouse()
    const shell = (transitions = [blocked], state: 'blocked' | 'working' | 'done' = 'blocked') => (
      <MansionShell projection={projection} renderSurface={() => null} host={hostFacts(transitions, [snapshot('tinker-2', state)])} />
    )
    const view = render(shell())
    expect(host.badge).toHaveBeenLastCalledWith(2)
    expect(announcer()).toHaveTextContent('')
    act(() => vi.advanceTimersByTime(10_000))
    expect(host.notify.mock.calls).toEqual([['Tinker 2 is blocked.']])
    expect(announcer()).toHaveTextContent(/^Tinker 2 is blocked\.$/)

    // Ambient: the ghost goes back to work and finishes. Nothing new is said or toasted.
    const working = transition('tinker-2', 'blocked', 'working')
    view.rerender(shell([blocked, working], 'working'))
    const done = transition('tinker-2', 'working', 'done')
    view.rerender(shell([blocked, working, done], 'done'))
    act(() => vi.advanceTimersByTime(60_000))
    expect(host.notify).toHaveBeenCalledTimes(1)
    expect(announcer()).toHaveTextContent(/^Tinker 2 is blocked\.$/)
    expect(vi.getTimerCount()).toBe(0)
    view.unmount()
  })

  it('cancels its timer and clears the badge on unmount', () => {
    vi.useFakeTimers()
    const view = render(
      <MansionShell
        projection={waitingHouse()}
        renderSurface={() => null}
        host={hostFacts([transition('tinker-2', 'working', 'failed')], [snapshot('tinker-2', 'failed')])}
      />,
    )
    const cleared = vi.spyOn(globalThis, 'clearTimeout')
    host.badge.mockClear()
    view.unmount()
    // The one burst timer was cancelled, so the open burst is never summarized.
    expect(cleared).toHaveBeenCalled()
    cleared.mockRestore()
    expect(host.badge.mock.calls).toEqual([[0]])
    vi.advanceTimersByTime(60_000)
    expect(host.notify).not.toHaveBeenCalled()
  })

  it('keeps the page and the live summary when the host toast and badge both fail', () => {
    vi.useFakeTimers()
    host.notify.mockImplementation(() => {
      throw new Error('toast')
    })
    host.badge.mockImplementation(() => {
      throw new Error('badge')
    })
    const view = render(
      <MansionShell
        projection={waitingHouse()}
        renderSurface={() => null}
        host={hostFacts([transition('tinker-2', 'working', 'failed')], [snapshot('tinker-2', 'failed')])}
      />,
    )
    act(() => vi.advanceTimersByTime(10_000))
    expect(announcer()).toHaveTextContent('Tinker 2 failed.')
    expect(screen.getByRole('button', { name: /^Needs you: 2 things need you/ })).toBeInTheDocument()
    view.unmount()
  })
})
