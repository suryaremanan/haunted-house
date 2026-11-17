// The Idea Step as a component (Spec 8, Requirement 10): the examples, the
// field under the existing brief rules, the folder name shown before anything
// is made, and one action handed up. It has no request of its own.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BUILD_LABEL, EXAMPLE_CONSEQUENCE, EXAMPLE_IDEAS, IDEA_FIELD_LABEL, IDEA_HINT, buildConsequence } from '../../core/first-visit'
import type { MutationState } from '../../core/foyer-reducer'
import { MAX_MANSION_BRIEF_LENGTH } from '../../core/mansion-api'
import { IDEA_EXAMPLES_NAME, IdeaStep, openConsequence, type IdeaStepProps } from './IdeaStep'
import { IDEA_REQUIRED } from './use-idea-step'
import { MANSION_BRIEF_INVALID, MANSION_BRIEF_TOO_LONG } from './use-mansion-brief'

const IDLE: MutationState = { kind: 'idle' }
const [COUNTER, TODO] = EXAMPLE_IDEAS

function mount(props: Partial<IdeaStepProps> = {}) {
  const onBuild = vi.fn<IdeaStepProps['onBuild']>(async () => true)
  const view = render(<IdeaStep mansions={[]} ready mutation={IDLE} made={null} onBuild={onBuild} {...props} />)
  return { onBuild, ...view }
}

const field = () => screen.getByRole('textbox', { name: IDEA_FIELD_LABEL }) as HTMLTextAreaElement
const build = () => screen.getByRole('button', { name: BUILD_LABEL })
const folder = () => document.querySelector('[data-idea-name]')!.textContent

describe('the Idea Step', () => {
  it('offers three examples and one field, and nothing else to decide', () => {
    mount()
    const examples = screen.getByRole('list', { name: IDEA_EXAMPLES_NAME })
    expect(Array.from(examples.querySelectorAll('button'), (button) => button.textContent)).toEqual(EXAMPLE_IDEAS.map((idea) => idea.title))
    for (const button of examples.querySelectorAll('button')) expect(button).toHaveAccessibleDescription(EXAMPLE_CONSEQUENCE)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(field()).toHaveAccessibleDescription(expect.stringContaining(IDEA_HINT))
    // One decision: three ways to fill the field, and one button that sends it.
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([...EXAMPLE_IDEAS.map((idea) => idea.title), BUILD_LABEL])
    expect(document.querySelector('h1, h2, h3, h4, a[href]')).toBeNull()
  })

  it('puts an example in the field, where it stays editable, and shows the folder name and the counter at once', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: TODO.title }))
    expect(field().value).toBe(TODO.brief)
    expect(field()).toHaveFocus()
    expect(field()).not.toHaveAttribute('readonly')
    expect(folder()).toBe('Project folder: to-do-list')
    expect(screen.getByText(`${[...TODO.brief].length} / ${MAX_MANSION_BRIEF_LENGTH} characters`)).toBeInTheDocument()
    expect(build()).toHaveAccessibleDescription(buildConsequence('to-do-list'))
    fireEvent.change(field(), { target: { value: 'A tide table for my harbour' } })
    expect(folder()).toBe('Project folder: to-do-list')
    // An emptied field starts over: the next idea is named for itself.
    fireEvent.change(field(), { target: { value: '' } })
    fireEvent.change(field(), { target: { value: 'A tide table for my harbour' } })
    expect(folder()).toBe('Project folder: tide-table')
  })

  it('hands up the name, the idea and the button once, and only when the idea may be sent', async () => {
    const { onBuild } = mount({ mansions: [{ name: 'word-counter' }] })
    await act(async () => fireEvent.click(build()))
    expect(screen.getByText(IDEA_REQUIRED)).toBeInTheDocument()
    expect(field()).toHaveFocus()
    fireEvent.change(field(), { target: { value: 'x'.repeat(MAX_MANSION_BRIEF_LENGTH + 1) } })
    await act(async () => fireEvent.click(build()))
    expect(screen.getByText(MANSION_BRIEF_TOO_LONG)).toBeInTheDocument()
    fireEvent.change(field(), { target: { value: 'bell\u0007' } })
    await act(async () => fireEvent.click(build()))
    expect(screen.getByText(MANSION_BRIEF_INVALID)).toBeInTheDocument()
    expect(onBuild).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: COUNTER.title }))
    expect(folder()).toBe('Project folder: word-counter-2')
    await act(async () => fireEvent.click(build()))
    expect(onBuild).toHaveBeenCalledTimes(1)
    expect(onBuild).toHaveBeenCalledWith('word-counter-2', COUNTER.brief, build())
  })

  it('keeps the idea and takes focus back when making it was refused', async () => {
    const onBuild = vi.fn<IdeaStepProps['onBuild']>(async () => false)
    mount({ onBuild })
    fireEvent.click(screen.getByRole('button', { name: COUNTER.title }))
    build().focus()
    await act(async () => fireEvent.click(build()))
    expect(field().value).toBe(COUNTER.brief)
    expect(field()).toHaveFocus()
  })

  it('says what is on its way and refuses a second press meanwhile', async () => {
    const { onBuild, rerender } = mount({ mutation: { kind: 'creating', name: 'word-counter' } })
    expect(build()).toHaveAttribute('aria-disabled', 'true')
    expect(build()).toHaveAccessibleDescription('Making word-counter…')
    expect(field()).toHaveAttribute('readonly')
    await act(async () => fireEvent.click(build()))
    expect(onBuild).not.toHaveBeenCalled()
    rerender(<IdeaStep mansions={[]} ready mutation={{ kind: 'opening', name: 'word-counter' }} made={null} onBuild={onBuild} />)
    expect(build()).toHaveAccessibleDescription('Opening word-counter…')
    // Before the list has loaded nothing can be made either.
    rerender(<IdeaStep mansions={[]} ready={false} mutation={IDLE} made={null} onBuild={onBuild} />)
    expect(build()).toHaveAttribute('aria-disabled', 'true')
  })

  it("shows the Foyer's own refusal beside the button, as the field's description", () => {
    mount({ mutation: { kind: 'error', operation: 'create', name: 'word-counter', message: 'The mansion request could not be completed.' } })
    const refusal = 'Could not create word-counter. The mansion request could not be completed.'
    expect(document.querySelector('[data-idea-error]')!.textContent).toBe(refusal)
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(field()).toHaveAccessibleDescription(expect.stringContaining(refusal))
  })

  it('offers only to open a folder that this very idea has already made', () => {
    const made = { name: 'word-counter', brief: COUNTER.brief }
    mount({ made, mansions: [{ name: 'word-counter' }] })
    fireEvent.click(screen.getByRole('button', { name: COUNTER.title }))
    expect(folder()).toBe('Project folder: word-counter')
    expect(build()).toHaveAccessibleDescription(openConsequence('word-counter'))
    // A changed idea is a new one, and gets its own folder.
    fireEvent.change(field(), { target: { value: `${COUNTER.brief} Count sentences too.` } })
    expect(folder()).toBe('Project folder: word-counter-2')
    expect(build()).toHaveAccessibleDescription(buildConsequence('word-counter-2'))
  })
})
