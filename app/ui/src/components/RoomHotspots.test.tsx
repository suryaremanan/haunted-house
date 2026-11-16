// State cues of one room on the House Map (Spec 6 task 5.5).
// **Validates: Requirements 2.5, 2.6, 2.7, 2.8, 3.9, 3.10, 4.2, 4.3, 5.3, 5.8**
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { doorAccessibleName, ghostAccessibleName, roomAccessibleName } from '../core/house-projection'
import { PRESENTATION_DOOR_STATES, PRESENTATION_GHOST_STATES, stateWord } from '../core/house-registry'
import { snapshot, type ComposeOptions } from '../test/house-projection-kit'
import { houseOf, quietHouse, waitingHouse, withRoomState, WAITING_SNAPSHOTS, WAITING_WORKFLOW } from '../test/shell-kit'
import { projection as workflowProjection } from '../test/workflow-arbitraries'
import { HOUSE_UI_STYLES } from './house-styles'
import { RoomHotspots } from './RoomHotspots'

function mountRoom(house = waitingHouse(), roomId = 'drafting-room', needsYou = 0) {
  const room = house.rooms.find((item) => item.roomId === roomId)!
  const onOpen = vi.fn()
  const view = render(
    <ol>
      <RoomHotspots room={room} needsYou={needsYou} openKey={null} panelId="p" onOpen={onOpen} onArrow={() => {}} />
    </ol>,
  )
  return { ...view, room, onOpen }
}

describe('Door state cues', () => {
  it.each(PRESENTATION_DOOR_STATES)('shows the Door state %s as its exact word and its own shape', (state) => {
    const { container, room } = mountRoom(withRoomState(quietHouse(), 'drafting-room', { door: state }))
    const control = screen.getByRole('button', { name: roomAccessibleName(room) })
    const line = control.querySelector('[data-field="door"]')!
    expect(line).toHaveTextContent(`Door: ${stateWord(state)}`)
    expect(line).toHaveAttribute('data-door', state)
    expect(line.querySelector(`svg[aria-hidden="true"][data-door="${state}"]`)).not.toBeNull()
    if (state === 'not_applicable') {
      expect(container.querySelector('[data-door-control]')).toBeNull()
      return
    }
    const door = container.querySelector('[data-door-control]')!
    expect(door).toHaveAccessibleName(doorAccessibleName(room, room.doors[0]))
    expect(door).toHaveAttribute('data-door', state)
    expect(door).toHaveTextContent(`Design door: ${stateWord(state)}`)
    expect(door.querySelector(`svg[aria-hidden="true"][data-door="${state}"]`)).not.toBeNull()
    // Each state has its own border treatment in the sheet, so it is not told apart by color.
    expect(HOUSE_UI_STYLES).toContain(`.hh-ui-door-control[data-door='${state}']`)
  })

  it('draws a different shape for every Door state', () => {
    const shapes = PRESENTATION_DOOR_STATES.map((state) => {
      const { container, unmount } = mountRoom(withRoomState(quietHouse(), 'drafting-room', { door: state }))
      const markup = container.querySelector('[data-field="door"] svg')!.innerHTML
      unmount()
      return markup
    })
    expect(new Set(shapes).size).toBe(PRESENTATION_DOOR_STATES.length)
  })
})

describe('Ghost state cues', () => {
  it.each(PRESENTATION_GHOST_STATES)('shows the ghost state %s as its exact word and its own pose', (state) => {
    const { container, room } = mountRoom(withRoomState(quietHouse(), 'drafting-room', { ghost: state }))
    const line = screen.getByRole('button', { name: roomAccessibleName(room) }).querySelector('[data-field="ghost"]')!
    expect(line).toHaveTextContent(`Ghost: ${stateWord(state)}`)
    expect(line.querySelector(`svg[aria-hidden="true"][data-ghost="${state}"]`)).not.toBeNull()
    if (state === 'not_applicable') {
      expect(container.querySelector('[data-ghost-control]')).toBeNull()
      return
    }
    const ghost = container.querySelector('[data-ghost-control]')!
    expect(ghost).toHaveAccessibleName(ghostAccessibleName(room, room.ghosts[0]))
    expect(ghost).toHaveTextContent(`Draughtsman: ${stateWord(state)}`)
    expect(ghost.querySelector(`svg[aria-hidden="true"][data-ghost="${state}"][data-variant="draughtsman"]`)).not.toBeNull()
    expect(HOUSE_UI_STYLES).toContain(`.hh-ui-ghost-control[data-ghost='${state}']`)
  })

  it('draws a different pose for every ghost state', () => {
    const poses = PRESENTATION_GHOST_STATES.map((state) => {
      const { container, unmount } = mountRoom(withRoomState(quietHouse(), 'drafting-room', { ghost: state }))
      const markup = container.querySelector('[data-field="ghost"] svg')!.innerHTML
      unmount()
      return markup
    })
    expect(new Set(poses).size).toBe(PRESENTATION_GHOST_STATES.length)
  })

  it('shows how many approvals wait on a ghost, in words', () => {
    const house = houseOf({ workflow: WAITING_WORKFLOW, snapshots: [snapshot('tinker-2', 'waiting', { pending_approvals: ['a', 'b'] as never })] })
    mountRoom(house, 'workshop')
    expect(screen.getByRole('button', { name: /^Tinker 2, ghost/ })).toHaveTextContent('Tinker 2: waiting, 2 approvals pending')
  })
})

describe('reasons and needs', () => {
  it('says in the room how many things need the Operator, and adds it to the room description', () => {
    mountRoom(waitingHouse(), 'study', 1)
    const control = screen.getByRole('button', { name: /^Study\./ })
    expect(control).toHaveAccessibleDescription(/^1 thing needs you/)
    expect(control.closest('li')).toHaveAttribute('data-needs', 'true')
    expect(within(control.closest('li')!).getByText('1 thing needs you').closest('p')!.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it.each<[string, Partial<ComposeOptions>, string, RegExp]>([
    ['a recording', { readOnly: true }, 'read-only', /This is a recording/],
    ['a corrupt log', { workflow: { ...WAITING_WORKFLOW, integrity: 'corrupt' as const } }, 'diagnostic', /integrity check/],
    ['an unconfirmed state', { workflow: { ...WAITING_WORKFLOW, integrity: 'uncertain' as const } }, 'diagnostic', /not confirmed/],
  ])('shows why controls are off for %s, as text with an icon, tied to the Room control', (_name, change, kind, text) => {
    const house = houseOf({ workflow: WAITING_WORKFLOW, snapshots: WAITING_SNAPSHOTS, ...change }, change.readOnly === true ? { mode: 'replay' } : {})
    const { container } = mountRoom(house, 'study')
    const reason = container.querySelector('[data-room-reason]')!
    expect(reason).toHaveAttribute('data-room-reason', kind)
    expect(reason).toHaveTextContent(text)
    expect(reason.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: /^Study\./ })).toHaveAccessibleDescription(text)
  })

  it('marks a room whose state could not be read, without inventing a Door or ghost state', () => {
    const house = houseOf({ workflow: null, workflowStatus: 'unavailable' })
    const { container } = mountRoom(house, 'study')
    expect(container.querySelector('li')).toHaveAttribute('data-integrity', 'uncertain')
    expect(screen.getByRole('button', { name: 'Study. Phase: requirements. Door: unavailable. Ghost: not applicable.' })).toBeInTheDocument()
  })

  it('has no decision control and calls nothing until a control is pressed', () => {
    const { onOpen, container } = mountRoom(houseOf({ workflow: workflowProjection({ version: 20 }) }), 'workshop')
    expect(onOpen).not.toHaveBeenCalled()
    expect(container.textContent).not.toMatch(/Approve|Reject|Start/)
  })
})
