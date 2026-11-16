// The optional feature brief in the create form (design decision 2026-11-16).
// The real SDK adapter, parsers, reducer, and components run; only the host
// client is mocked.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Foyer } from './Foyer'
import { MANSIONS, httpError, listBody, liveRegions, mansion } from './foyer-test-kit'
import { MANSION_BRIEF_HINT, MANSION_BRIEF_INVALID, MANSION_BRIEF_TOO_LONG } from './use-mansion-brief'

const host = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({ get: host.get, post: host.post, put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: () => () => {},
  useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
}))

const nameField = () => screen.getByRole('textbox', { name: 'New mansion name' }) as HTMLInputElement
const briefField = () => screen.getByRole('textbox', { name: 'What should this mansion become?' }) as HTMLTextAreaElement
const createButton = () => screen.getByRole('button', { name: 'Create mansion' })

async function renderFoyer() {
  host.get.mockResolvedValue(listBody())
  const view = render(<Foyer />)
  await waitFor(() => expect(screen.queryByText('Loading mansions…')).not.toBeInTheDocument())
  return view
}

async function submit(name: string, brief: string) {
  fireEvent.change(nameField(), { target: { value: name } })
  fireEvent.change(briefField(), { target: { value: brief } })
  await act(async () => {
    fireEvent.click(createButton())
  })
}

beforeEach(() => {
  host.get.mockReset()
  host.post.mockReset()
})

describe('Foyer feature brief', () => {
  it('is an optional labelled textarea described by its hint and counter', async () => {
    await renderFoyer()
    const field = briefField()
    expect(field.tagName).toBe('TEXTAREA')
    expect(field).not.toBeRequired()
    expect(field).not.toHaveAttribute('maxlength')
    expect(field).toHaveAttribute('aria-invalid', 'false')
    expect(field).toHaveAccessibleDescription(`${MANSION_BRIEF_HINT} 0 / 2000 characters`)
  })

  it('counts code points of the trimmed, normalised text without adding a live region', async () => {
    const { container } = await renderFoyer()
    fireEvent.change(briefField(), { target: { value: '  \u{1F47B} ghost\r\n  ' } })
    expect(briefField()).toHaveAccessibleDescription(expect.stringContaining('7 / 2000 characters'))
    fireEvent.change(briefField(), { target: { value: 'a'.repeat(2001) } })
    expect(briefField()).toHaveAccessibleDescription(expect.stringContaining('2001 / 2000 characters, too long'))
    expect(liveRegions(container)).toHaveLength(1)
  })

  it('sends exactly {name} when the brief is blank', async () => {
    await renderFoyer()
    host.post.mockResolvedValueOnce({ outcome: 'created', mansion: mansion('alpha') })
    await submit('alpha', '  \n ')
    expect(host.post.mock.calls).toEqual([[MANSIONS, { name: 'alpha' }]])
  })

  it('sends the normalised brief and clears both fields after success', async () => {
    await renderFoyer()
    host.post.mockResolvedValueOnce({ outcome: 'created', mansion: mansion('alpha') })
    await submit('alpha', '  A tide clock.\r\nWith alarms.  ')
    expect(host.post.mock.calls).toEqual([[MANSIONS, { name: 'alpha', brief: 'A tide clock.\nWith alarms.' }]])
    expect(nameField().value).toBe('')
    expect(briefField().value).toBe('')
  })

  it.each([
    ['a'.repeat(2001), MANSION_BRIEF_TOO_LONG],
    ['ring\u0007bell', MANSION_BRIEF_INVALID],
  ])('refuses %# beside the field without sending it', async (brief, message) => {
    await renderFoyer()
    await submit('alpha', brief)
    expect(host.post).not.toHaveBeenCalled()
    const field = briefField()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(expect.stringContaining(message))
    expect(field).toHaveFocus()
    expect(field.value).toBe(brief)

    fireEvent.change(field, { target: { value: 'fixed' } })
    expect(screen.queryByText(message)).not.toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'false')
  })

  it('checks the name first and keeps the brief for correction after a refused create', async () => {
    await renderFoyer()
    await submit('Bad Name', 'a'.repeat(2001))
    expect(nameField()).toHaveFocus()
    expect(screen.queryByText(MANSION_BRIEF_TOO_LONG)).not.toBeInTheDocument()

    host.post.mockRejectedValueOnce(httpError(409, 'mansion_conflict'))
    await submit('taken', 'Keep me.')
    expect(host.post.mock.calls).toEqual([[MANSIONS, { name: 'taken', brief: 'Keep me.' }]])
    expect(briefField().value).toBe('Keep me.')
  })
})
