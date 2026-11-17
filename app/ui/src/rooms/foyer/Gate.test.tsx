// The Gate's form (Spec 8, Requirement 9): one question, one optional name,
// one Knock, and a name that goes nowhere but up to the page.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GATE_NAME_HINT, GATE_QUESTION, KNOCK_CONSEQUENCE, KNOCK_LABEL } from '../../core/first-visit'
import { Gate } from './Gate'

describe('the Gate', () => {
  it('asks one question with one labelled field and one Knock', () => {
    render(<Gate onKnock={() => {}} />)
    const field = screen.getByLabelText(GATE_QUESTION)
    expect(field).toHaveAccessibleDescription(GATE_NAME_HINT)
    expect(field).not.toBeRequired()
    const knock = screen.getByRole('button', { name: KNOCK_LABEL })
    expect(knock).toHaveAccessibleDescription(KNOCK_CONSEQUENCE)
    // One decision: one button, one field, nothing else to operate.
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(document.querySelector('a[href], select, textarea, [contenteditable]')).toBeNull()
  })

  it('knocks with the name as typed, on the button and on Enter', () => {
    const onKnock = vi.fn<(name: string) => void>()
    render(<Gate onKnock={onKnock} />)
    const field = screen.getByLabelText(GATE_QUESTION)
    fireEvent.change(field, { target: { value: '  Ada Lovelace ' } })
    fireEvent.click(screen.getByRole('button', { name: KNOCK_LABEL }))
    expect(onKnock).toHaveBeenLastCalledWith('  Ada Lovelace ')
    // Enter in the field submits the same form.
    fireEvent.submit(field.closest('form')!)
    expect(onKnock).toHaveBeenCalledTimes(2)
  })

  it('accepts no name at all', () => {
    const onKnock = vi.fn<(name: string) => void>()
    render(<Gate onKnock={onKnock} />)
    fireEvent.click(screen.getByRole('button', { name: KNOCK_LABEL }))
    expect(onKnock).toHaveBeenCalledWith('')
  })

  it('keeps the name out of anything a browser would send or keep', () => {
    render(<Gate onKnock={() => {}} formId="gate-form" />)
    const field = screen.getByLabelText(GATE_QUESTION) as HTMLInputElement
    const form = field.closest('form')!
    // No field name, no action and no method: nothing here can be submitted to a server or autofilled back.
    expect(field.name).toBe('')
    expect(field.getAttribute('autocomplete')).toBe('off')
    expect(form.getAttribute('action')).toBeNull()
    expect(form.getAttribute('method')).toBeNull()
    // The id is only so the painted knocker can find the form.
    expect(form.id).toBe('gate-form')
  })
})
