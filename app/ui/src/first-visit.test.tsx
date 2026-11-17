// The first visit through the whole page (Spec 8, Requirements 9 and 10): the
// Gate for a visitor with no mansion, the Warden's balloon in the Foyer hall,
// and the Idea Step. Only the host client is mocked, so every choice is seen
// to end in one of the Foyer's own requests, or in none.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HauntedHouseApp from './App'
import { SETTING_SAID } from './components/MansionShell'
import {
  BUILD_LABEL,
  EXAMPLE_IDEAS,
  GATE_NAME_HINT,
  GATE_QUESTION,
  GATE_STATUS,
  IDEA_FIELD_LABEL,
  IDEA_QUESTION,
  KNOCK_CONSEQUENCE,
  KNOCK_LABEL,
  buildConsequence,
} from './core/first-visit'
import { MANSION_REQUEST_FAILED } from './core/mansion-api'
import { initialWorkflowProjection, workflowProjectionToJson } from './core/workflow-projection'
import { openConsequence } from './rooms/foyer/IdeaStep'
import { MANSIONS, OPEN, httpError, listBody, liveRegions, mansion } from './rooms/foyer/foyer-test-kit'
import { IDEA_REQUIRED } from './rooms/foyer/use-idea-step'
import { MANSION_BRIEF_TOO_LONG } from './rooms/foyer/use-mansion-brief'
import { knock } from './test/first-visit-kit'

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), whoami: vi.fn(), mansions: vi.fn(), house: vi.fn(), notify: vi.fn(), badge: vi.fn() }))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({ get: client.get, post: client.post, put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: () => () => {},
  useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
  useNotify: () => client.notify,
  useNavBadge: () => client.badge,
}))

const WHOAMI = '/apps/haunted-house/api/whoami'
const WORD_COUNTER = EXAMPLE_IDEAS[0]

const main = () => document.querySelector<HTMLElement>('main')!
const hall = () => document.querySelector<HTMLElement>('.hh-foyer-hall')!
const words = () => document.querySelector<HTMLElement>('[data-guide-text]')!
const pose = () => document.querySelector<HTMLElement>('[data-guide-pose]')!
const offered = () => Array.from(document.querySelectorAll('[data-guide-primary] .hh-guide-option-label'), (item) => item.textContent)
const idea = () => screen.getByRole('textbox', { name: IDEA_FIELD_LABEL }) as HTMLTextAreaElement
const folder = () => document.querySelector<HTMLElement>('[data-idea-name]')!.textContent
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const posts = () => client.post.mock.calls.map(([path, body]) => [path, body])

beforeEach(() => {
  for (const mock of Object.values(client)) mock.mockReset()
  client.whoami.mockResolvedValue({ backend: 'ok', gateway: { version: '0.12.2' } })
  client.mansions.mockResolvedValue(listBody())
  client.house.mockImplementation(async (path: string) => {
    const mansionId = /\/mansions\/([^/]+)\//.exec(path)?.[1] ?? ''
    return path.endsWith('/workflow') ? workflowProjectionToJson(initialWorkflowProjection(mansionId)) : { events: [], highest_sequence: 0, diagnostics: [] }
  })
  client.get.mockImplementation((path: string) => (path === WHOAMI ? client.whoami(path) : path === MANSIONS ? client.mansions(path) : client.house(path)))
})

describe('the Gate', () => {
  it('is the first screen of a visitor with no mansion, with one question and one Knock', async () => {
    const { container } = render(<HauntedHouseApp />)
    const knockButton = await screen.findByRole('button', { name: KNOCK_LABEL })
    expect(main()).toHaveAttribute('data-place', 'gate')
    // The hall is mounted and has read its list, but it is put away: nothing of it can be reached.
    expect(client.mansions).toHaveBeenCalledTimes(1)
    expect(hall()).toHaveAttribute('hidden')
    expect(screen.queryByRole('heading', { name: 'Foyer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create mansion' })).toBeNull()
    // The Warden, his words and how he stands.
    expect(words().textContent).toBe(GATE_STATUS)
    expect(pose().textContent).toBe('The Warden is watching.')
    expect(document.querySelector('.hh-hall-warden')).toHaveAttribute('aria-hidden', 'true')
    // One labelled field that may be left empty, and one Knock that says what it does.
    const field = screen.getByLabelText(GATE_QUESTION)
    expect(field).toHaveAccessibleDescription(GATE_NAME_HINT)
    expect(field).not.toBeRequired()
    expect(knockButton).toHaveAccessibleDescription(KNOCK_CONSEQUENCE)
    // One decision: to knock. The other two controls are the guide's own.
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([KNOCK_LABEL, 'Something else…', 'Step back'])
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    // The page keeps its one polite live region, and the Gate adds none.
    expect(liveRegions(container)).toHaveLength(1)
    expect(liveRegions(container)[0]).toHaveClass('hh-summary')
  })

  it('admits the visitor on Knock and greets them by the name they gave, as one clean line', async () => {
    render(<HauntedHouseApp />)
    await knock('  Ada \n  Lovelace\u0007 ')
    expect(main()).toHaveAttribute('data-place', 'hall')
    expect(document.querySelector('[data-gate-screen]')).toBeNull()
    expect(hall()).not.toHaveAttribute('hidden')
    expect(screen.getByRole('heading', { name: 'Foyer' })).toBeInTheDocument()
    expect(words().textContent).toBe('Come in, Ada Lovelace. Nothing here opens unless you open it.')
    // The greeting is where focus lands, so it is read.
    expect(words()).toHaveFocus()
    // A first visit goes straight to the one question.
    expect(screen.getByText(IDEA_QUESTION)).toBeInTheDocument()
    expect(idea().value).toBe('')
  })

  it('accepts no name, and Enter in the field knocks', async () => {
    render(<HauntedHouseApp />)
    await screen.findByRole('button', { name: KNOCK_LABEL })
    fireEvent.submit(screen.getByLabelText(GATE_QUESTION).closest('form')!)
    expect(words().textContent).toBe('Come in. Nothing here opens unless you open it.')
  })

  it('lets the painted knocker knock for a pointer, and keeps it out of the way of everything else', async () => {
    render(<HauntedHouseApp />)
    await screen.findByRole('button', { name: KNOCK_LABEL })
    const knocker = document.querySelector<HTMLElement>('[data-knocker]')!
    // Decoration: hidden from assistive technology and not a focus stop. The Knock button is the control.
    expect(knocker.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(knocker.tabIndex).toBe(-1)
    fireEvent.change(screen.getByLabelText(GATE_QUESTION), { target: { value: 'Grace' } })
    fireEvent.click(knocker)
    expect(words().textContent).toBe('Come in, Grace. Nothing here opens unless you open it.')
    // From inside, the door has no knocker to press.
    expect(document.querySelector('[data-knocker]')).toBeNull()
  })

  it('keeps the name on the page: it is sent, stored, toasted and badged nowhere', async () => {
    const stored = vi.spyOn(Storage.prototype, 'setItem')
    render(<HauntedHouseApp />)
    await knock('Ada Lovelace')
    // Build something, so every request the first visit can make has been made.
    press(WORD_COUNTER.title)
    client.post.mockResolvedValueOnce({ outcome: 'created', mansion: mansion('word-counter') }).mockResolvedValueOnce({ mansion: mansion('word-counter') })
    await act(async () => press(BUILD_LABEL))
    await screen.findByRole('region', { name: 'Mansion word-counter' })
    const sent = JSON.stringify([client.get.mock.calls, client.post.mock.calls, client.notify.mock.calls, client.badge.mock.calls])
    expect(sent).not.toMatch(/Ada|Lovelace/)
    expect(stored).not.toHaveBeenCalled()
    expect(document.cookie).toBe('')
    stored.mockRestore()
  })

  it('is skipped for a visitor who already has a mansion', async () => {
    client.mansions.mockResolvedValue(listBody(mansion('weather-station')))
    render(<HauntedHouseApp />)
    await screen.findByRole('radio', { name: /^weather-station\b/ })
    expect(main()).toHaveAttribute('data-place', 'hall')
    expect(document.querySelector('[data-gate-screen]')).toBeNull()
    // No greeting for someone who did not knock, and no question about what to build.
    expect(words().textContent).toBe('One mansion stands here: weather-station.')
    expect(offered()).toEqual(['Go back into weather-station', 'Build something new', 'Step outside'])
    expect(document.querySelector('[data-idea-step]')).toBeNull()
    // Arriving moved no focus: nothing was pressed.
    expect(words()).not.toHaveFocus()
  })

  it('shows again on "Step outside", and has forgotten the name', async () => {
    render(<HauntedHouseApp />)
    await knock('Ada')
    press('Step outside')
    expect(main()).toHaveAttribute('data-place', 'gate')
    expect(hall()).toHaveAttribute('hidden')
    expect(words().textContent).toBe(GATE_STATUS)
    expect(words()).toHaveFocus()
    expect(screen.getByLabelText(GATE_QUESTION)).toHaveValue('')
    await knock()
    expect(words().textContent).toBe('Come in. Nothing here opens unless you open it.')
    expect(document.body.textContent).not.toContain('Ada')
  })

  it('is not shown while the backend is unreachable, or when the list cannot be read', async () => {
    client.whoami.mockRejectedValueOnce({ status: 503, message: 'Service Unavailable' })
    const first = render(<HauntedHouseApp />)
    await screen.findByRole('button', { name: 'Retry' })
    expect(document.querySelector('[data-gate-screen]')).toBeNull()
    expect(document.querySelector('[data-guide-balloon]')).toBeNull()
    first.unmount()

    // The backend answers but the list does not: the hall shows why and how to try again. No Gate, no guide.
    client.mansions.mockRejectedValueOnce(httpError(500, 'internal'))
    render(<HauntedHouseApp />)
    expect(await screen.findByRole('heading', { name: 'Foyer' })).toBeInTheDocument()
    expect(main()).toHaveAttribute('data-place', 'loading')
    expect(document.querySelector('[data-gate-screen]')).toBeNull()
    expect(document.querySelector('[data-guide-balloon]')).toBeNull()
    // The retry reads an empty list, and only then is there a Gate.
    await act(async () => press(/try again|retry/i))
    expect(await screen.findByRole('button', { name: KNOCK_LABEL })).toBeInTheDocument()
  })
})

describe('the idea step', () => {
  it('fills the field from an example, names the project folder before anything is made, and builds through the Foyer', async () => {
    render(<HauntedHouseApp />)
    await knock()
    expect(screen.getAllByRole('button', { name: /^A / }).map((button) => button.textContent)).toEqual(EXAMPLE_IDEAS.map((example) => example.title))
    press(WORD_COUNTER.title)
    // The example is in the field, where it can be changed, and the field has focus.
    expect(idea().value).toBe(WORD_COUNTER.brief)
    expect(idea()).toHaveFocus()
    expect(folder()).toBe('Project folder: word-counter')
    const build = screen.getByRole('button', { name: BUILD_LABEL })
    expect(build).toHaveAccessibleDescription(buildConsequence('word-counter'))
    // Nothing has been sent yet.
    expect(client.post).not.toHaveBeenCalled()

    client.post.mockResolvedValueOnce({ outcome: 'created', mansion: mansion('word-counter') }).mockResolvedValueOnce({ mansion: mansion('word-counter') })
    await act(async () => fireEvent.click(build))
    await screen.findByRole('region', { name: 'Mansion word-counter' })
    // The existing create, then the existing open, and nothing else.
    expect(posts()).toEqual([
      [MANSIONS, { name: 'word-counter', brief: WORD_COUNTER.brief }],
      [OPEN, { name: 'word-counter' }],
    ])
    expect(main()).toHaveAttribute('data-place', 'mansion')
    // The house opens in the room where the work is: nothing is written yet, so the Study.
    expect(document.querySelector('[data-stage-room]')).toHaveAttribute('data-stage-room', 'study')
  })

  it('names a typed idea from its telling words, and gives a listed name a number', async () => {
    client.mansions.mockResolvedValue(listBody(mansion('word-counter'), mansion('recipe-box')))
    render(<HauntedHouseApp />)
    await screen.findByRole('radio', { name: /^word-counter\b/ })
    press('Build something new')
    // The question opens under the balloon and takes focus, because the visitor asked for it.
    expect(idea()).toHaveFocus()
    fireEvent.change(idea(), { target: { value: 'I want to build a recipe box that scales servings' } })
    expect(folder()).toBe('Project folder: recipe-box-2')
    fireEvent.change(idea(), { target: { value: 'A tide table for my harbour' } })
    expect(folder()).toBe('Project folder: tide-table')
    // An example keeps its own name, numbered while that name is taken, also after its words are edited.
    press(WORD_COUNTER.title)
    expect(folder()).toBe('Project folder: word-counter-2')
    fireEvent.change(idea(), { target: { value: `${WORD_COUNTER.brief} Count sentences too.` } })
    expect(folder()).toBe('Project folder: word-counter-2')
  })

  it('refuses an empty idea and an over-long one with the existing copy, and sends nothing', async () => {
    render(<HauntedHouseApp />)
    await knock()
    await act(async () => press(BUILD_LABEL))
    expect(screen.getByText(IDEA_REQUIRED)).toBeInTheDocument()
    expect(idea()).toHaveAttribute('aria-invalid', 'true')
    expect(idea()).toHaveFocus()
    fireEvent.change(idea(), { target: { value: 'x'.repeat(5000) } })
    expect(screen.queryByText(IDEA_REQUIRED)).toBeNull()
    await act(async () => press(BUILD_LABEL))
    expect(screen.getByText(MANSION_BRIEF_TOO_LONG)).toBeInTheDocument()
    expect(client.post).not.toHaveBeenCalled()
    expect(main()).toHaveAttribute('data-place', 'hall')
  })

  it('keeps the idea and says once why making it failed, beside "Build this"', async () => {
    render(<HauntedHouseApp />)
    await knock()
    press(WORD_COUNTER.title)
    client.post.mockRejectedValueOnce(new Error('socket hang up'))
    await act(async () => press(BUILD_LABEL))
    const refusal = `Could not create word-counter. ${MANSION_REQUEST_FAILED}`
    // Said once, in the step that asked: the hall's own form does not repeat it.
    expect(screen.getAllByText(refusal)).toHaveLength(1)
    expect(document.querySelector('[data-idea-step]')!.contains(screen.getByText(refusal))).toBe(true)
    expect(idea().value).toBe(WORD_COUNTER.brief)
    expect(idea()).toHaveFocus()
    // Nothing else changed: no open was tried, and the visitor is still in the hall.
    expect(posts()).toEqual([[MANSIONS, { name: 'word-counter', brief: WORD_COUNTER.brief }]])
    expect(main()).toHaveAttribute('data-place', 'hall')
  })

  it('does not make the mansion twice when opening it fails: the next press only opens', async () => {
    render(<HauntedHouseApp />)
    await knock()
    press(WORD_COUNTER.title)
    client.post.mockResolvedValueOnce({ outcome: 'created', mansion: mansion('word-counter') }).mockRejectedValueOnce(httpError(409, 'mansion_missing'))
    await act(async () => press(BUILD_LABEL))
    expect(await screen.findAllByText('Could not open word-counter. This mansion is missing from storage.')).toHaveLength(1)
    // The folder exists now, and the step says so instead of offering a second one.
    expect(folder()).toBe('Project folder: word-counter')
    expect(screen.getByRole('button', { name: BUILD_LABEL })).toHaveAccessibleDescription(openConsequence('word-counter'))
    client.post.mockResolvedValueOnce({ mansion: mansion('word-counter') })
    await act(async () => press(BUILD_LABEL))
    await screen.findByRole('region', { name: 'Mansion word-counter' })
    expect(posts()).toEqual([
      [MANSIONS, { name: 'word-counter', brief: WORD_COUNTER.brief }],
      [OPEN, { name: 'word-counter' }],
      [OPEN, { name: 'word-counter' }],
    ])
  })

  it('hands over to the hall’s own form on "Choose the name myself", which is unchanged', async () => {
    render(<HauntedHouseApp />)
    await knock()
    press('Choose the name myself')
    expect(document.querySelector('[data-idea-step]')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'New mansion name' })).toHaveFocus()
    // The Foyer's own create still works as it always did.
    client.post.mockResolvedValueOnce({ outcome: 'created', mansion: mansion('attic-radio') })
    fireEvent.change(screen.getByRole('textbox', { name: 'New mansion name' }), { target: { value: 'attic-radio' } })
    await act(async () => press('Create mansion'))
    expect(posts()).toEqual([[MANSIONS, { name: 'attic-radio' }]])
    expect(await screen.findByRole('radio', { name: /^attic-radio\b/ })).toBeInTheDocument()
  })
})

describe('a returning visitor', () => {
  it('goes back into their mansion through the Foyer’s own open, and comes back to the choice they pressed', async () => {
    client.mansions.mockResolvedValue(listBody(mansion('weather-station')))
    render(<HauntedHouseApp />)
    await screen.findByRole('radio', { name: /^weather-station\b/ })
    const back = screen.getByRole('button', { name: 'Go back into weather-station' })
    expect(back).toHaveAccessibleDescription('Opens it in the room where the work is.')
    client.post.mockResolvedValueOnce({ mansion: mansion('weather-station') })
    await act(async () => fireEvent.click(back))
    const shell = await screen.findByRole('region', { name: 'Mansion weather-station' })
    expect(posts()).toEqual([[OPEN, { name: 'weather-station' }]])
    // Leaving returns them to the hall, with focus on the choice that took them in.
    await act(async () => fireEvent.click(within(shell).getByRole('button', { name: 'Exit to the Foyer' })))
    expect(main()).toHaveAttribute('data-place', 'hall')
    expect(screen.getByRole('button', { name: 'Go back into weather-station' })).toHaveFocus()
  })

  it('is offered the mansion they selected when several stand there', async () => {
    client.mansions.mockResolvedValue(listBody(mansion('attic-radio'), mansion('weather-station')))
    render(<HauntedHouseApp />)
    await screen.findByRole('radio', { name: /^weather-station\b/ })
    expect(words().textContent).toBe('2 mansions stand here.')
    expect(offered()).toEqual(['Build something new', 'Step outside'])
    fireEvent.click(screen.getByRole('radio', { name: /^weather-station\b/ }))
    expect(offered()).toEqual(['Go back into weather-station', 'Build something new', 'Step outside'])
  })
})

describe('the Warden before a mansion is open', () => {
  it('steps back and comes back at the Gate, saying so once, and the Gate still works without him', async () => {
    const { container } = render(<HauntedHouseApp />)
    await screen.findByRole('button', { name: KNOCK_LABEL })
    press('Step back')
    expect(document.querySelector('[data-guide-balloon]')).toBeNull()
    expect(pose().textContent).toBe('The Warden has stepped back.')
    expect(liveRegions(container)[0]).toHaveTextContent(SETTING_SAID.quiet(true))
    const call = screen.getByRole('button', { name: 'Call the Warden' })
    expect(call).toHaveFocus()
    // The screen's own question and Knock stay.
    expect(screen.getByLabelText(GATE_QUESTION)).toBeInTheDocument()
    fireEvent.click(call)
    expect(words()).toHaveFocus()
    expect(liveRegions(container)[0]).toHaveTextContent(SETTING_SAID.quiet(false))
    // Stepped back, he stays back across the knock; the hall and its form are all there.
    press('Step back')
    await knock('Ada')
    expect(document.querySelector('[data-guide-balloon]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Call the Warden' })).toHaveFocus()
    expect(idea()).toBeInTheDocument()
    expect(liveRegions(container)).toHaveLength(1)
  })
})
