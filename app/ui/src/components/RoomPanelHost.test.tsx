// The panel host and its surface stack (Spec 6 task 5.6).
// **Validates: Requirements 1.6, 3.4, 3.5, 3.6, 4.8, 4.9**
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { snapshot } from '../test/house-projection-kit'
import { Shell, houseOf, newRecorded, waitingHouse, WAITING_WORKFLOW } from '../test/shell-kit'

const roomControl = (id: string) => document.querySelector<HTMLElement>(`[data-room-control="${id}"]`)!
const panel = () => document.querySelector<HTMLElement>('.hh-ui-panel')

function mount(props: Partial<Parameters<typeof Shell>[0]> = {}) {
  const recorded = newRecorded()
  const view = render(<Shell projection={waitingHouse()} recorded={recorded} {...props} />)
  return { ...view, recorded }
}

describe('region mode', () => {
  it('opens a labelled region whose heading names the room and takes focus', () => {
    mount()
    expect(panel()).toBeNull()
    fireEvent.click(roomControl('study'))
    const region = screen.getByRole('region', { name: 'Study' })
    expect(region).toHaveAttribute('data-mode', 'region')
    expect(region).toHaveAttribute('data-room-panel', 'study')
    expect(region).not.toHaveAttribute('aria-modal')
    const heading = within(region).getByRole('heading', { level: 4, name: 'Study' })
    expect(heading).toHaveFocus()
    expect(roomControl('study')).toHaveAttribute('aria-expanded', 'true')
    expect(roomControl('study')).toHaveAttribute('aria-controls', region.id)
    // The map stays reachable beside a region.
    expect(document.querySelector('.hh-ui-behind')).not.toHaveAttribute('inert')
    expect(document.querySelector('[data-backdrop]')).toBeNull()
  })

  it('closes on Escape or Close, removes the panel content, and returns focus to the control that opened it', () => {
    mount()
    fireEvent.click(roomControl('workshop'))
    fireEvent.keyDown(screen.getByRole('heading', { name: 'Workshop' }), { key: 'Escape' })
    expect(panel()).toBeNull()
    expect(screen.queryByText('Details of room')).toBeNull()
    expect(roomControl('workshop')).toHaveFocus()
    expect(roomControl('workshop')).toHaveAttribute('aria-expanded', 'false')

    const ghost = screen.getByRole('button', { name: /^Tinker 2, ghost/ })
    fireEvent.click(ghost)
    expect(screen.getByRole('region', { name: 'Tinker 2' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close ghost details' }))
    expect(panel()).toBeNull()
    expect(ghost).toHaveFocus()

    const door = screen.getByRole('button', { name: /^Requirements door of the Study/ })
    fireEvent.click(door)
    expect(screen.getByRole('region', { name: 'Requirements door' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close door details' }))
    expect(door).toHaveFocus()
  })

  it('shows one surface at a time: a map control replaces what was open', () => {
    mount()
    fireEvent.click(roomControl('study'))
    fireEvent.click(roomControl('attic'))
    expect(document.querySelectorAll('.hh-ui-panel')).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Attic' })).toHaveAttribute('data-depth', '1')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(panel()).toBeNull()
    expect(roomControl('attic')).toHaveFocus()
  })
})

describe('nested surfaces', () => {
  it('opens a nested surface on top, and Escape closes only it and returns to its opener', () => {
    mount()
    const ghost = screen.getByRole('button', { name: /^Tinker 2, ghost/ })
    fireEvent.click(ghost)
    fireEvent.click(screen.getByRole('button', { name: 'Open its room' }))
    const room = screen.getByRole('region', { name: 'Workshop' })
    expect(room).toHaveAttribute('data-depth', '2')
    expect(within(room).getByRole('heading', { name: 'Workshop' })).toHaveFocus()
    expect(screen.queryByRole('region', { name: 'Tinker 2' })).toBeNull()

    fireEvent.keyDown(room, { key: 'Escape' })
    // Back on the ghost surface, on the very control that opened the room.
    expect(screen.getByRole('region', { name: 'Tinker 2' })).toHaveAttribute('data-depth', '1')
    expect(screen.getByRole('button', { name: 'Open its room' })).toHaveFocus()

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(panel()).toBeNull()
    expect(ghost).toHaveFocus()
  })

  it('finds the opener again by its stable key when a rerender replaced the element', () => {
    const recorded = newRecorded()
    const view = render(<Shell key="a" projection={waitingHouse()} recorded={recorded} />)
    const before = roomControl('study')
    fireEvent.click(before)
    // A new projection object rerenders the map; the element is the same control by key either way.
    view.rerender(<Shell key="a" projection={waitingHouse()} recorded={recorded} />)
    // Force a truly different element: detach the old one and put a copy with the same key in its place.
    const copy = before.cloneNode(true) as HTMLElement
    before.replaceWith(copy)
    expect(before.isConnected).toBe(false)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(copy).toHaveFocus()
  })
})

describe('stale surfaces', () => {
  it('closes a ghost surface whose ghost is gone and focuses its Room control, sending nothing', () => {
    const recorded = newRecorded()
    const withGhost = houseOf({ workflow: WAITING_WORKFLOW, snapshots: [snapshot('tinker-2', 'working')] })
    const without = houseOf({ workflow: WAITING_WORKFLOW, snapshots: [] })
    const view = render(<Shell projection={withGhost} recorded={recorded} />)
    fireEvent.click(screen.getByRole('button', { name: /^Tinker 2, ghost/ }))
    expect(screen.getByRole('region', { name: 'Tinker 2' })).toBeInTheDocument()
    view.rerender(<Shell projection={without} recorded={recorded} />)
    expect(panel()).toBeNull()
    expect(roomControl('workshop')).toHaveFocus()
    expect(recorded.decisions).toEqual([])
  })

  it('closes the panel of a room that is no longer shown and focuses the map heading', () => {
    const recorded = newRecorded()
    const view = render(<Shell projection={waitingHouse({ seanceRoom: 'locked' })} recorded={recorded} />)
    fireEvent.click(roomControl('seance-room'))
    expect(screen.getByRole('region', { name: 'Séance Room' })).toBeInTheDocument()
    view.rerender(<Shell projection={waitingHouse({ seanceRoom: 'hidden' })} recorded={recorded} />)
    expect(panel()).toBeNull()
    expect(document.querySelector('[data-map-title]')).toHaveFocus()
  })

  it('gives focus to the heading when a command settles and the focused control is gone', () => {
    const recorded = newRecorded()
    const view = render(<Shell projection={waitingHouse()} recorded={recorded} inFlight={null} />)
    fireEvent.click(roomControl('study'))
    const approve = screen.getByRole('button', { name: 'Approve' })
    approve.focus()
    view.rerender(<Shell projection={waitingHouse()} recorded={recorded} inFlight="proposal:door-requirements-1" />)
    act(() => {
      approve.blur()
    })
    view.rerender(<Shell projection={waitingHouse()} recorded={recorded} inFlight={null} />)
    expect(screen.getByRole('heading', { name: 'Study' })).toHaveFocus()
  })
})

describe('dialog mode', () => {
  it('opens a labelled modal dialog over an inert page, with the same focus contract', () => {
    mount({ panelMode: 'dialog' })
    fireEvent.click(roomControl('study'))
    const dialog = screen.getByRole('dialog', { name: 'Study' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('data-mode', 'dialog')
    expect(within(dialog).getByRole('heading', { name: 'Study' })).toHaveFocus()
    expect(document.querySelector('.hh-ui-behind')).toHaveAttribute('inert')
    expect(document.querySelector('[data-backdrop]')).not.toBeNull()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('.hh-ui-behind')).not.toHaveAttribute('inert')
    expect(roomControl('study')).toHaveFocus()
  })

  it('keeps Tab inside the dialog in both directions', () => {
    mount({ panelMode: 'dialog' })
    fireEvent.click(roomControl('study'))
    const dialog = screen.getByRole('dialog', { name: 'Study' })
    const close = within(dialog).getByRole('button', { name: 'Close room' })
    const approve = within(dialog).getByRole('button', { name: 'Approve' })
    approve.focus()
    fireEvent.keyDown(approve, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(approve).toHaveFocus()
  })

  it('closes from the backdrop without deciding anything', () => {
    const { recorded } = mount({ panelMode: 'dialog' })
    fireEvent.click(roomControl('study'))
    fireEvent.click(document.querySelector('[data-backdrop]')!)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(recorded.decisions).toEqual([])
  })
})

describe('viewing is not deciding', () => {
  it('opens and closes every kind of surface without a decision', () => {
    const { recorded } = mount()
    for (const control of Array.from(document.querySelectorAll<HTMLElement>('.hh-ui-map button'))) {
      fireEvent.click(control)
      fireEvent.keyDown(document.body, { key: 'Escape' })
    }
    expect(recorded.surfaces.length).toBeGreaterThan(8)
    expect(recorded.decisions).toEqual([])
  })
})
