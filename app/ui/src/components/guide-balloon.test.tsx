// The Warden's balloon as a component (Spec 8, Requirements 3, 5 and 7): the
// fixed order of its parts, what each choice is called and described as, the
// disclosures that open in place, and where focus goes when choices change.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { guideView, type GuideContext, type GuideOption } from '../core/house-guide'
import type { RoomId } from '../core/house-registry'
import { TERMS } from '../core/house-words'
import { waitingHouse } from '../test/shell-kit'
import { GuideBalloon, SOMETHING_ELSE_LABEL, STEP_BACK_LABEL, WORD_BOOK_TITLE } from './GuideBalloon'

function at(roomId: RoomId, overrides: Partial<GuideContext> = {}): GuideContext {
  return { roomId, surface: null, task: null, quiet: false, words: 'plain', reveal: false, mapOpen: false, canLeave: true, ...overrides }
}

const study = (overrides: Partial<GuideContext> = {}) => guideView(waitingHouse(), at('study', overrides))!

/** True when `first` comes before `second` in the document. */
function before(first: Element, second: Element): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

describe('the balloon', () => {
  it('has its five parts in one order: status, question, choices, something else, step back', () => {
    render(<GuideBalloon view={study()} words="plain" onPress={() => {}} onStepBack={() => {}} />)
    const balloon = document.querySelector('[data-guide-balloon]')!
    const status = balloon.querySelector('[data-guide-text]')!
    const question = screen.getByText('What do you want to do?')
    const choices = balloon.querySelector('[data-guide-primary]')!
    const more = screen.getByRole('button', { name: SOMETHING_ELSE_LABEL })
    const stepBack = screen.getByRole('button', { name: STEP_BACK_LABEL })
    expect(status.textContent).toBe('The Archivist has finished what it must do. The door waits for you.')
    for (const [first, second] of [
      [status, question],
      [question, choices],
      [choices, more],
      [more, stepBack],
    ] as const) {
      expect(before(first, second)).toBe(true)
    }
    // It is not a dialog and holds no live region of its own.
    expect(balloon.closest('[role="dialog"], [aria-modal]')).toBeNull()
    expect(balloon.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull()
  })

  it('names each choice by its label and describes it by what pressing does', () => {
    const view = study()
    render(<GuideBalloon view={view} words="plain" onPress={() => {}} onStepBack={() => {}} />)
    expect(view.options).toHaveLength(4)
    for (const option of view.options) {
      const button = screen.getByRole('button', { name: option.label })
      expect(button).toHaveAccessibleDescription(option.consequence)
      expect(button.getAttribute('data-guide-option')).toBe(option.id)
      expect(button.getAttribute('data-kind')).toBe(option.kind)
    }
  })

  it('hands a pressed choice up and decides nothing itself', () => {
    const onPress = vi.fn<(option: GuideOption) => void>()
    const onStepBack = vi.fn()
    const view = study()
    render(<GuideBalloon view={view} words="plain" onPress={onPress} onStepBack={onStepBack} />)
    fireEvent.click(screen.getByRole('button', { name: 'Go to the door' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onPress.mock.calls[0][0]).toBe(view.options[2])
    fireEvent.click(screen.getByRole('button', { name: STEP_BACK_LABEL }))
    expect(onStepBack).toHaveBeenCalledTimes(1)
  })

  it("shows Kiro's word beside a choice when asked", () => {
    render(<GuideBalloon view={study({ words: 'with-kiro' })} words="with-kiro" onPress={() => {}} onStepBack={() => {}} />)
    expect(screen.getByRole('button', { name: 'Read what it must do (requirements)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask for a change (revision request)' })).toBeInTheDocument()
    // A choice with no term stays as it is.
    expect(screen.getByRole('button', { name: 'Go to the door' })).toBeInTheDocument()
    expect(document.querySelector('[data-guide-text]')!.textContent).toBe('The Archivist has finished what it must do (requirements). The door waits for you.')
  })

  it('opens "Something else" in place with the rest of the choices and the whole Word Book', () => {
    const view = study()
    render(<GuideBalloon view={view} words="plain" onPress={() => {}} onStepBack={() => {}} />)
    const more = screen.getByRole('button', { name: SOMETHING_ELSE_LABEL })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('[data-guide-everything]')).toBeNull()
    fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    const everything = document.querySelector<HTMLElement>('[data-guide-everything]')!
    expect(more.getAttribute('aria-controls')).toBe(everything.id)
    // Every choice of the view is now on the page, each once.
    for (const option of view.everything) expect(document.querySelectorAll(`[data-guide-option="${option.id}"]`)).toHaveLength(1)
    // The book: each plain word, its Kiro word and its two sentences.
    // Its title is a plain line, not a heading: the balloon sits under different heading levels in the room and in the hall.
    expect(within(everything).getByText(WORD_BOOK_TITLE).tagName).toBe('P')
    const book = everything.querySelector('[data-word-book]')!
    expect(book.querySelectorAll('[data-term]')).toHaveLength(TERMS.length)
    for (const entry of TERMS) {
      const row = book.querySelector(`[data-term="${entry.id}"]`)!
      expect(row.textContent).toContain(entry.plain)
      expect(row.textContent).toContain(entry.kiro)
      expect(row.textContent).toContain(entry.about[0])
      expect(row.textContent).toContain(entry.about[1])
    }
    fireEvent.click(more)
    expect(document.querySelector('[data-guide-everything]')).toBeNull()
  })

  it('explains a term named in the status line, in place', () => {
    render(<GuideBalloon view={study()} words="plain" onPress={() => {}} onStepBack={() => {}} />)
    const what = screen.getByRole('button', { name: 'What is “what it must do”?' })
    expect(what).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(what)
    expect(what).toHaveAttribute('aria-expanded', 'true')
    const about = document.getElementById(what.getAttribute('aria-controls')!)!
    expect(about.textContent).toBe('Requirements say what the software must do, one testable statement at a time. Kiro keeps them in requirements.md.')
  })

  it('says why a press did nothing, and why some choices are missing', () => {
    // A live room whose controls are off: the room's own sentence is the note.
    const house = waitingHouse()
    const off = { ...house, rooms: house.rooms.map((room) => (room.roomId === 'study' ? { ...room, mutatingActionsEnabled: false, diagnostic: 'The house is catching up.' } : room)) }
    const view = guideView(off, at('study'))!
    render(<GuideBalloon view={view} words="plain" onPress={() => {}} onStepBack={() => {}} refusal="That is not available right now." />)
    expect(document.querySelector('[data-guide-note]')!.textContent).toBe('The house is catching up.')
    expect(document.querySelector('[data-guide-refusal]')!.textContent).toBe('That is not available right now.')
    // Neither is announced by the balloon: the page's one live region says what the visitor asked about.
    expect(document.querySelector('[aria-live], [role="alert"], [role="status"]')).toBeNull()
  })

  it('puts focus on the status line when the pressed choice goes away, and never on its replacement', () => {
    const first = study()
    const { rerender } = render(<GuideBalloon view={first} words="plain" onPress={() => {}} onStepBack={() => {}} />)
    const pressed = screen.getByRole('button', { name: 'Go to the door' })
    pressed.focus()
    fireEvent.click(pressed)
    // The room's sheet opened: the choices change and the pressed one is gone.
    rerender(<GuideBalloon view={study({ surface: { kind: 'room', roomId: 'study' } })} words="plain" onPress={() => {}} onStepBack={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Go to the door' })).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('[data-guide-text]'))
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Open the door' }))
  })

  it('leaves focus alone when the page already put it somewhere', () => {
    const { rerender } = render(
      <>
        <GuideBalloon view={study()} words="plain" onPress={() => {}} onStepBack={() => {}} />
        <h4 tabIndex={-1}>Panel</h4>
      </>,
    )
    const pressed = screen.getByRole('button', { name: 'Go to the door' })
    pressed.focus()
    fireEvent.click(pressed)
    screen.getByRole('heading', { name: 'Panel' }).focus()
    rerender(
      <>
        <GuideBalloon view={study({ surface: { kind: 'room', roomId: 'study' } })} words="plain" onPress={() => {}} onStepBack={() => {}} />
        <h4 tabIndex={-1}>Panel</h4>
      </>,
    )
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Panel' }))
  })
})
