// The Sound Feature in the shell: off on every visit, on only after the
// Operator's press, silent again when turned off (Spec 6 Requirement 9).
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HouseSound } from '../adapters/house-sound'
import type { HouseProjection } from '../core/house-projection'
import { Shell, newRecorded, waitingHouse } from '../test/shell-kit'
import { SOUND_UNAVAILABLE_TEXT } from './HouseToolbar'
import { useHouseSound } from './use-house-sound'

function fakeEngine() {
  const played: string[] = []
  let closed = 0
  const engine: HouseSound = { play: (cue) => played.push(cue), close: () => (closed += 1) }
  return { engine, played, closed: () => closed }
}

const opened = (house: HouseProjection): HouseProjection => ({
  ...house,
  rooms: house.rooms.map((room) => ({ ...room, doors: room.doors.map((door) => ({ ...door, state: 'open' as const })) })),
})

describe('useHouseSound', () => {
  it('creates nothing and plays nothing until it is turned on', () => {
    let created = 0
    const fake = fakeEngine()
    const house = waitingHouse()
    const { result, rerender } = renderHook(({ projection, open }) => useHouseSound(projection, open, () => ((created += 1), fake.engine)), {
      initialProps: { projection: house, open: null as string | null },
    })
    expect(result.current.on).toBe(false)
    rerender({ projection: opened(house), open: 'room:study' })
    expect(created).toBe(0)
    expect(fake.played).toEqual([])
  })

  it('plays the cues of a change and of the open surface once on, and closes when turned off', () => {
    const fake = fakeEngine()
    const house = waitingHouse()
    const { result, rerender, unmount } = renderHook(({ projection, open }) => useHouseSound(projection, open, () => fake.engine), {
      initialProps: { projection: house, open: null as string | null },
    })
    act(() => result.current.toggle())
    expect(result.current.on).toBe(true)
    // Turning it on is heard at once.
    expect(fake.played).toEqual(['panel-open'])
    rerender({ projection: opened(house), open: null })
    expect(fake.played).toContain('door-open')
    rerender({ projection: opened(house), open: 'room:study' })
    expect(fake.played.at(-1)).toBe('panel-open')
    rerender({ projection: opened(house), open: null })
    expect(fake.played.at(-1)).toBe('panel-close')
    act(() => result.current.toggle())
    expect(result.current.on).toBe(false)
    expect(fake.closed()).toBe(1)
    const count = fake.played.length
    rerender({ projection: house, open: 'room:study' })
    expect(fake.played).toHaveLength(count)
    unmount()
  })

  it('says so when the browser cannot make sound, and stays off', () => {
    const { result } = renderHook(() => useHouseSound(waitingHouse(), null, () => null))
    act(() => result.current.toggle())
    expect(result.current).toMatchObject({ on: false, available: false })
  })
})

describe('the toolbar toggles', () => {
  it('shows Sound off and the front view at first; jsdom has no Web Audio, so pressing Sound explains itself', () => {
    render(<Shell projection={waitingHouse()} recorded={newRecorded()} />)
    const sound = screen.getByRole('button', { name: 'Sound: off' })
    expect(sound).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(sound)
    expect(screen.getByText(SOUND_UNAVAILABLE_TEXT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sound: off' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('turns the model with the Side view toggle, as a pressed state on a button', () => {
    render(<Shell projection={waitingHouse()} recorded={newRecorded()} />)
    const house = document.querySelector('.hh-ui-house')!
    expect(house).toHaveAttribute('data-view', 'front')
    fireEvent.click(screen.getByRole('button', { name: 'Side view: off' }))
    expect(house).toHaveAttribute('data-view', 'turned')
    expect(screen.getByRole('button', { name: 'Side view: on' })).toHaveAttribute('aria-pressed', 'true')
  })
})
