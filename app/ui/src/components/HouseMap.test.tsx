// House Map semantics, order and keyboard (Spec 6 task 5.5).
// **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 2.8, 2.10, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 6.4**
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { roomAccessibleName, type HouseSurfaceTarget } from '../core/house-projection'
import { ARROW_DIRECTIONS, HOUSE_ROOMS, nextRoom, visibleRoomIds, type RoomId, type SeanceRoomSetting } from '../core/house-registry'
import { quietHouse, waitingHouse } from '../test/shell-kit'
import { HOUSE_MAP_LABEL, HouseMap } from './HouseMap'

const MVP = ['foyer', 'study', 'drafting-room', 'workshop', 'attic']
const roomControl = (id: string) => document.querySelector<HTMLElement>(`[data-room-control="${id}"]`)!

function mount(setting: SeanceRoomSetting = 'locked', projection = waitingHouse({ seanceRoom: setting })) {
  const openSurface = vi.fn<(target: HouseSurfaceTarget, opener: HTMLElement) => void>()
  const view = render(<HouseMap projection={projection} openSurface={openSurface} motion="none" panelId="panel" />)
  return { ...view, openSurface, projection }
}

describe('structure', () => {
  it('is one navigation landmark holding one ordered list in Room order', () => {
    const { container } = mount()
    const nav = screen.getByRole('navigation', { name: HOUSE_MAP_LABEL })
    expect(container.querySelectorAll('nav')).toHaveLength(1)
    const lists = within(nav).getAllByRole('list')
    expect(lists).toHaveLength(1)
    expect(lists[0].tagName).toBe('OL')
    expect(Array.from(lists[0].children, (item) => [item.tagName, item.getAttribute('data-room')])).toEqual(
      [...MVP, 'seance-room'].map((id) => ['LI', id]),
    )
    expect(within(nav).getByRole('heading', { level: 3, name: 'The house' })).toBeInTheDocument()
  })

  it.each([
    ['hidden', MVP],
    ['locked', [...MVP, 'seance-room']],
    ['enabled', [...MVP, 'seance-room']],
  ] as const)('shows the rooms of the %s Séance Room setting, with the Séance Room last', (setting, expected) => {
    const { container } = mount(setting)
    expect(Array.from(container.querySelectorAll('[data-room-control]'), (button) => button.getAttribute('data-room-control'))).toEqual(expected)
    expect(container.querySelector('.hh-ui-rooms')).toHaveAttribute('data-seance', setting === 'hidden' ? 'hidden' : 'shown')
  })

  it('names every Room control with room, phase, Door state and ghost state, from the one formatter', () => {
    const { projection } = mount()
    for (const room of projection.rooms) {
      const control = roomControl(room.roomId)
      expect(control).toHaveAccessibleName(roomAccessibleName(room))
      expect(control.tagName).toBe('BUTTON')
      expect(control).toHaveAttribute('type', 'button')
    }
    expect(roomControl('foyer')).toHaveAccessibleName('Foyer. Phase: navigation. Door: not applicable. Ghost: not applicable.')
    expect(roomControl('study')).toHaveAccessibleName('Study. Phase: requirements. Door: waiting. Ghost: done.')
    // What is shown says the same words.
    expect(roomControl('study')).toHaveTextContent('StudyPhase: requirementsDoor: waitingGhost: done')
  })

  it('labels a room without a Door or ghost as not applicable and gives it no Door or ghost control', () => {
    mount()
    const attic = roomControl('attic').closest('li')!
    expect(within(attic).getAllByRole('button')).toHaveLength(1)
    expect(roomControl('attic')).toHaveTextContent('Door: not applicableGhost: not applicable')
  })

  it('keeps Room, ghost and Door controls as separate native buttons, none inside another', () => {
    const { container } = mount()
    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons.length).toBeGreaterThan(8)
    for (const button of buttons) {
      expect(button.querySelector('button, a, input, [tabindex]')).toBeNull()
      expect(button.closest('li')).not.toBeNull()
      expect(button.tabIndex).toBe(0)
    }
    const study = roomControl('study').closest('li')!
    expect(within(study).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Study. Phase: requirements. Door: waiting. Ghost: done.',
      'Archivist, ghost in the Study. State: done.',
      'Requirements door of the Study. State: waiting.',
    ])
  })

  it('hides every drawing from assistive technology and keeps it out of the focus order', () => {
    const { container } = mount()
    const drawings = container.querySelectorAll('svg')
    expect(drawings.length).toBeGreaterThan(10)
    for (const svg of drawings) {
      expect(svg).toHaveAttribute('aria-hidden', 'true')
      expect(svg.getAttribute('focusable') ?? 'false').toBe('false')
      expect(svg.querySelector('title, desc, a, [tabindex]')).toBeNull()
    }
  })

  it('marks the locked Séance Room as off but focusable, with its reason beside it', () => {
    mount('locked')
    const seance = roomControl('seance-room')
    expect(seance).toHaveAttribute('aria-disabled', 'true')
    expect(seance).not.toBeDisabled()
    expect(seance).toHaveAccessibleDescription(/The Séance Room is locked/)
    expect(seance.closest('li')).toHaveAttribute('data-locked', 'true')
    // No other room is marked off just because it can be looked at.
    for (const id of MVP) expect(roomControl(id)).not.toHaveAttribute('aria-disabled')
  })
})

describe('keyboard', () => {
  it.each(['hidden', 'locked', 'enabled'] as const)('moves focus along the fixed map for every room and arrow (%s Séance Room)', (setting) => {
    mount(setting)
    const visible = visibleRoomIds(setting)
    for (const room of HOUSE_ROOMS.filter((item) => visible.has(item.id))) {
      for (const direction of ARROW_DIRECTIONS) {
        const origin = roomControl(room.id)
        origin.focus()
        fireEvent.keyDown(origin, { key: direction })
        const expected = nextRoom(room.id, direction, visible)
        // No room that way: focus stays on the room it was on.
        expect(document.activeElement, `${room.id} ${direction}`).toBe(roomControl(expected))
      }
    }
  })

  it('follows the map of the design for the MVP rooms', () => {
    mount('hidden')
    const press = (from: RoomId, key: string) => {
      roomControl(from).focus()
      fireEvent.keyDown(roomControl(from), { key })
      return document.activeElement?.getAttribute('data-room-control')
    }
    expect(press('foyer', 'ArrowUp')).toBe('drafting-room')
    expect(press('foyer', 'ArrowDown')).toBe('foyer')
    expect(press('foyer', 'ArrowLeft')).toBe('study')
    expect(press('foyer', 'ArrowRight')).toBe('workshop')
    expect(press('study', 'ArrowUp')).toBe('drafting-room')
    expect(press('study', 'ArrowLeft')).toBe('study')
    expect(press('attic', 'ArrowDown')).toBe('drafting-room')
    expect(press('drafting-room', 'ArrowUp')).toBe('attic')
    expect(press('workshop', 'ArrowRight')).toBe('workshop')
    // Upstairs from the Workshop is the Séance Room; with it hidden, the walk goes on up to the Attic.
    expect(press('workshop', 'ArrowUp')).toBe('attic')
  })

  it('does not move from a ghost or Door control, and ignores other keys and modified arrows', () => {
    mount()
    const ghost = screen.getByRole('button', { name: /^Archivist, ghost/ })
    ghost.focus()
    fireEvent.keyDown(ghost, { key: 'ArrowRight' })
    expect(ghost).toHaveFocus()
    const study = roomControl('study')
    study.focus()
    for (const key of ['a', ' ', 'PageDown', 'Tab']) fireEvent.keyDown(study, { key })
    fireEvent.keyDown(study, { key: 'ArrowRight', altKey: true })
    expect(study).toHaveFocus()
  })

  it('opens exactly the surface of the activated control and decides nothing', () => {
    const { openSurface } = mount()
    // Enter and Space on a native button arrive as a click.
    fireEvent.click(roomControl('workshop'))
    fireEvent.click(screen.getByRole('button', { name: /^Tinker 2, ghost/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Requirements door of the Study/ }))
    expect(openSurface.mock.calls.map(([target]) => target)).toEqual([
      { kind: 'room', roomId: 'workshop' },
      { kind: 'ghost', roomId: 'workshop', ghostId: 'tinker-2' },
      { kind: 'door', roomId: 'study', phase: 'requirements', proposalId: 'door-requirements-1' },
    ])
    expect(openSurface.mock.calls.map(([, opener]) => opener.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON'])
    // Focus and arrows alone ask for nothing.
    openSurface.mockClear()
    roomControl('study').focus()
    fireEvent.keyDown(roomControl('study'), { key: 'ArrowRight' })
    expect(openSurface).not.toHaveBeenCalled()
  })

  it('marks only the control whose surface is open as expanded', () => {
    const projection = quietHouse()
    const key = JSON.stringify(['room', 'study'])
    render(<HouseMap projection={projection} openSurface={() => {}} motion="none" openKey={key} panelId="the-panel" />)
    expect(roomControl('study')).toHaveAttribute('aria-expanded', 'true')
    expect(roomControl('study')).toHaveAttribute('aria-controls', 'the-panel')
    expect(roomControl('foyer')).toHaveAttribute('aria-expanded', 'false')
    expect(roomControl('foyer')).not.toHaveAttribute('aria-controls')
  })
})
