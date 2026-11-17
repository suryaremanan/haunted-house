// Reveal as a component (Spec 8, Requirement 8): one label of real text on
// every working object of the room, each a button with a full name and the
// object's own press plan; nothing at all on furniture.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GUIDE_RESERVE, STAGE_BOXES, workingObjects, type WorkingObject } from '../core/guide-layout'
import { guideView, type GuideContext, type PressStep } from '../core/house-guide'
import type { RoomId } from '../core/house-registry'
import { waitingHouse } from '../test/shell-kit'
import { OBJECT_LABELS_NAME, ObjectLabels, labelPlace } from './ObjectLabels'

function objectsOf(roomId: RoomId, words: GuideContext['words'] = 'plain'): readonly WorkingObject[] {
  const house = waitingHouse()
  const view = guideView(house, { roomId, surface: null, task: null, quiet: false, words, reveal: true, mapOpen: false, canLeave: true })!
  const room = house.rooms.find((candidate) => candidate.roomId === roomId)!
  return workingObjects(room, view, words, house.needsYou.length)
}

describe('the labels of a room', () => {
  it('are one named list of buttons, in reading order, each with its visible words and a fuller name', () => {
    const objects = objectsOf('study')
    render(<ObjectLabels objects={objects} onPress={() => {}} />)
    const list = screen.getByRole('list', { name: OBJECT_LABELS_NAME })
    const buttons = within(list).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(objects.map((object) => object.label))
    expect(buttons.map((button) => button.textContent)).toEqual([
      'To the Foyer',
      'Archivist: done',
      'Door for what it must do: waiting',
      "Ledger: this room's sheet",
      'Bell: 2 things need you',
    ])
    for (const [index, button] of buttons.entries()) {
      // Real text, reachable by Tab, and the name starts with what is on show (WCAG 2.5.3) and adds what a press does.
      expect(button.tabIndex).toBe(0)
      expect(button).toHaveAccessibleName(objects[index].name)
      expect(objects[index].name.startsWith(objects[index].label)).toBe(true)
      expect(objects[index].name.length).toBeGreaterThan(objects[index].label.length)
      expect(button.querySelector('svg, img')).toBeNull()
    }
  })

  it("show Kiro's word beside the plain one when asked", () => {
    render(<ObjectLabels objects={objectsOf('study', 'with-kiro')} onPress={() => {}} />)
    expect(screen.getByRole('button', { name: /^Door for what it must do \(requirements\): waiting/ })).toBeInTheDocument()
  })

  it('hand up the press plan of their object and the button pressed, and nothing else', () => {
    const objects = objectsOf('study')
    const onPress = vi.fn<(steps: readonly PressStep[], from?: HTMLElement | null) => void>()
    render(<ObjectLabels objects={objects} onPress={onPress} />)
    for (const object of objects) {
      const button = document.querySelector<HTMLElement>(`[data-object-label="${object.key}"]`)!
      fireEvent.click(button)
      expect(onPress).toHaveBeenLastCalledWith(object.steps, button)
    }
    expect(onPress).toHaveBeenCalledTimes(objects.length)
    // Every plan presses a control of the house map or of the shell: a label decides nothing.
    for (const object of objects) expect(object.steps.every((step) => step.kind === 'map' || step.kind === 'shell')).toBe(true)
  })

  it('label working things only: a room with nothing but furniture gets an empty list', () => {
    render(<ObjectLabels objects={[]} onPress={() => {}} />)
    expect(within(screen.getByRole('list', { name: OBJECT_LABELS_NAME })).queryAllByRole('button')).toHaveLength(0)
  })

  it('sit above their object, pulled inward at the side walls, and never over the Guide Reserve', () => {
    expect(labelPlace(STAGE_BOXES.previous)).toEqual({ anchor: 'left', style: { left: `${STAGE_BOXES.previous.left}%`, bottom: `${100 - STAGE_BOXES.previous.top}%` } })
    expect(labelPlace(STAGE_BOXES.door)).toEqual({
      anchor: 'right',
      style: { right: `${100 - STAGE_BOXES.door.left - STAGE_BOXES.door.width}%`, bottom: `${100 - STAGE_BOXES.door.top}%` },
    })
    const bell = STAGE_BOXES.bell
    expect(labelPlace(bell)).toEqual({ anchor: 'centre', style: { left: `${bell.left + bell.width / 2}%`, bottom: `${100 - bell.top}%` } })
    // A label ends where its object begins, so it lies above the reserve's top edge or left of its left edge.
    for (const box of Object.values(STAGE_BOXES)) {
      const above = box.top <= GUIDE_RESERVE.top
      const leftOf = box.left + box.width <= GUIDE_RESERVE.left
      expect(above || leftOf).toBe(true)
    }
  })
})
