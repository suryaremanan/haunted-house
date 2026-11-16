// Toolbar: Needs You shortcut, Still House and the status disclosure (Spec 6 task 5.6).
// **Validates: Requirements 3.7, 3.8, 3.9, 7.1, 7.2, 7.3, 7.4, 8.7, 8.9**
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Shell, installMatchMedia, newRecorded, quietHouse, waitingHouse } from '../test/shell-kit'
import { STILL_HOUSE_REDUCED_TEXT } from './HouseToolbar'

let media: ReturnType<typeof installMatchMedia> | null = null
afterEach(() => {
  media?.restore()
  media = null
})

const root = () => document.querySelector<HTMLElement>('.hh-ui')!

describe('Needs You shortcut', () => {
  it('shows the count, lists what waits, and opens the first room in Room order on the decision itself', () => {
    const recorded = newRecorded()
    render(<Shell projection={waitingHouse()} recorded={recorded} />)
    const shortcut = screen.getByRole('button', { name: 'Needs you: 2 things need you. Go to the first.' })
    expect(shortcut).toHaveTextContent('2 things need you')
    expect(shortcut).toHaveAttribute('data-count', '2')
    expect(shortcut).toHaveAttribute('aria-disabled', 'false')
    expect(within(screen.getByRole('list', { name: 'Waiting on you' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'The requirements door needs your decision.',
      'Tinker 2 asks to run a command.',
    ])
    fireEvent.click(shortcut)
    const panel = screen.getByRole('region', { name: 'Study' })
    // Focus lands on the decision's own surface, one Tab before its first control.
    const decision = within(panel).getByRole('article', { name: 'Requirements door' })
    expect(decision).toHaveFocus()
    expect(recorded.decisions).toEqual([])
    // Closing returns to the shortcut that opened it.
    fireEvent.keyDown(decision, { key: 'Escape' })
    expect(shortcut).toHaveFocus()
  })

  it('stays visible at zero, says so, and does nothing when activated', () => {
    const recorded = newRecorded()
    render(<Shell projection={quietHouse()} recorded={recorded} />)
    const shortcut = screen.getByRole('button', { name: 'Needs you: Nothing needs you.' })
    expect(shortcut).toHaveAttribute('aria-disabled', 'true')
    expect(shortcut).not.toBeDisabled()
    expect(shortcut).toHaveAttribute('data-count', '0')
    shortcut.focus()
    fireEvent.click(shortcut)
    expect(document.querySelector('.hh-ui-panel')).toBeNull()
    expect(shortcut).toHaveFocus()
    expect(screen.queryByRole('list', { name: 'Waiting on you' })).toBeNull()
    expect(recorded.surfaces).toEqual([])
  })

  it('follows the projection: a resolved item leaves the count on the next projection', () => {
    const recorded = newRecorded()
    const view = render(<Shell projection={waitingHouse()} recorded={recorded} />)
    view.rerender(<Shell projection={quietHouse()} recorded={recorded} />)
    expect(screen.getByRole('button', { name: 'Needs you: Nothing needs you.' })).toBeInTheDocument()
  })
})

describe('Still House', () => {
  it('is a labelled toggle that turns optional motion off and on for this session', () => {
    media = installMatchMedia(false)
    render(<Shell projection={quietHouse()} recorded={newRecorded()} />)
    const toggle = screen.getByRole('button', { name: 'Still house: off' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(root()).toHaveAttribute('data-motion', 'low-frequency')
    expect(root()).toHaveAttribute('data-still', 'false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Still house: on' })).toHaveAttribute('aria-pressed', 'true')
    expect(root()).toHaveAttribute('data-motion', 'none')
    expect(root()).toHaveAttribute('data-still', 'true')
    fireEvent.click(toggle)
    expect(root()).toHaveAttribute('data-motion', 'low-frequency')
  })

  it('stays still while the browser asks for reduced motion, whatever the toggle says, and says why', () => {
    media = installMatchMedia(true)
    render(<Shell projection={quietHouse()} recorded={newRecorded()} />)
    const toggle = screen.getByRole('button', { name: 'Still house: off' })
    expect(root()).toHaveAttribute('data-motion', 'none')
    expect(toggle).toHaveAccessibleDescription(STILL_HOUSE_REDUCED_TEXT)
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(root()).toHaveAttribute('data-motion', 'none')
  })

  it('treats a browser that cannot answer as asking for stillness', () => {
    render(<Shell projection={quietHouse()} recorded={newRecorded()} />)
    expect(root()).toHaveAttribute('data-motion', 'none')
  })

  it('keeps nothing between mounts', () => {
    media = installMatchMedia(false)
    const first = render(<Shell projection={quietHouse()} recorded={newRecorded()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Still house: off' }))
    first.unmount()
    render(<Shell projection={quietHouse()} recorded={newRecorded()} />)
    expect(screen.getByRole('button', { name: 'Still house: off' })).toBeInTheDocument()
  })
})

describe('layout of the toolbar', () => {
  it('names the open Mansion in the heading that takes focus on entry', () => {
    render(<Shell projection={quietHouse()} recorded={newRecorded()} />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('Mansion demo-mansion')
    expect(heading).toHaveFocus()
  })

  it('keeps the status details in a closed disclosure, after the Mansion name and before nothing of the map', () => {
    render(<Shell projection={quietHouse()} recorded={newRecorded()} status={<p>Backend reachable</p>} />)
    const details = document.querySelector('details.hh-ui-status')!
    expect(details).not.toHaveAttribute('open')
    expect(within(details as HTMLElement).getByText('System status').tagName).toBe('SUMMARY')
    const map = screen.getByRole('navigation', { name: 'Mansion rooms' })
    expect(details.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has no disclosure on a page without status details', () => {
    render(<Shell projection={quietHouse()} recorded={newRecorded()} />)
    expect(document.querySelector('details')).toBeNull()
  })
})
