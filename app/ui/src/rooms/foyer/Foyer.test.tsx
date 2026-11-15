// Foyer DOM, keyboard, accessibility, and theme tests (task 8.4). The real SDK
// adapter, parsers, reducer, and components run; only the host client is mocked.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MANSION_NAME_INVALID, MANSION_NAME_REQUIRED } from './CreateMansionForm'
import { Foyer } from './Foyer'
import { FOYER_STYLES } from './foyer-styles'
import { MANSIONS, OPEN, ROOT, deferred, httpError, listBody, liveRegions, mansion } from './foyer-test-kit'

const host = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  theme: { mode: 'dark' as 'dark' | 'light', accent: '#c58b45', colorTheme: 'midnight' },
}))

vi.mock('@kirocrew/app-sdk', () => ({
  // A new client per render, as the host may hand out.
  useAppApi: () => ({ get: host.get, post: host.post, put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: () => () => {},
  useTheme: () => host.theme,
}))

type Body = ReturnType<typeof listBody>

async function renderFoyer(body: Body = listBody(), props: Parameters<typeof Foyer>[0] = {}) {
  host.get.mockResolvedValue(body)
  const view = render(<Foyer {...props} />)
  await waitFor(() => expect(screen.queryByText('Loading mansions…')).not.toBeInTheDocument())
  return view
}

function radio(name: string): HTMLInputElement {
  return screen.getByRole('radio', { name: new RegExp(`^${name}\\b`) })
}

function openButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Open\b/ })
}

function createButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Create mansion' })
}

function nameField(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'New mansion name' })
}

function announcer(container: HTMLElement): HTMLElement {
  const regions = liveRegions(container)
  expect(regions).toHaveLength(1)
  expect(regions[0]).toHaveAttribute('aria-live', 'polite')
  return regions[0]
}

async function submitName(name: string) {
  fireEvent.change(nameField(), { target: { value: name } })
  await act(async () => {
    fireEvent.click(createButton())
  })
}

beforeEach(() => {
  host.get.mockReset()
  host.post.mockReset()
  host.theme = { mode: 'dark', accent: '#c58b45', colorTheme: 'midnight' }
})

describe('Foyer list states', () => {
  it('shows a text-labelled loading state with no usable open or create action', async () => {
    const pending = deferred()
    host.get.mockReturnValue(pending.promise)
    const { container } = render(<Foyer />)

    expect(screen.getByRole('heading', { level: 2, name: 'Foyer' })).toBeInTheDocument()
    const loading = screen.getByText('Loading mansions…')
    expect(loading.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    // Routine progress is inline, outside the live region, which stays empty.
    expect(announcer(container)).not.toContainElement(loading)
    expect(announcer(container)).toBeEmptyDOMElement()

    expect(openButton()).toHaveAttribute('aria-disabled', 'true')
    expect(createButton()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(openButton())
    fireEvent.change(nameField(), { target: { value: 'too-early' } })
    fireEvent.click(createButton())
    await act(async () => {})
    expect(host.post).not.toHaveBeenCalled()
    expect(host.get).toHaveBeenCalledTimes(1)
    expect(host.get).toHaveBeenCalledWith(MANSIONS)

    await act(async () => pending.resolve(listBody(mansion('attic'))))
    expect(screen.queryByText('Loading mansions…')).not.toBeInTheDocument()
    expect(radio('attic')).toBeInTheDocument()
  })

  it('shows a named empty state and the create action', async () => {
    await renderFoyer(listBody())
    expect(screen.getByRole('heading', { level: 3, name: 'No mansions yet' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Open\b/ })).not.toBeInTheDocument()
    expect(nameField()).toBeInTheDocument()
    expect(createButton()).toHaveAttribute('aria-disabled', 'false')
  })

  it('lists every mansion sorted by name with its path and status in words', async () => {
    await renderFoyer(listBody(mansion('zeta'), mansion('lost', 'missing'), mansion('alpha'), mansion('odd', 'conflict')))
    const group = screen.getByRole('radiogroup', { name: 'Mansions' })
    expect(group.tagName).toBe('FIELDSET')
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((input) => input.value)).toEqual(['alpha', 'lost', 'odd', 'zeta'])

    const expectations: [string, string, boolean][] = [
      ['alpha', 'Ready to open', false],
      ['lost', 'Missing: its folder is no longer in storage, so it cannot be opened.', true],
      ['odd', 'Conflict: its folder no longer looks like a mansion, so it cannot be opened.', true],
      ['zeta', 'Ready to open', false],
    ]
    for (const [name, status, disabled] of expectations) {
      const input = radio(name)
      const card = input.closest('label')
      expect(card).not.toBeNull()
      expect(within(card!).getByText(name)).toBeInTheDocument()
      expect(within(card!).getByText(`${ROOT}/${name}`)).toBeInTheDocument()
      // Status is words plus one decorative icon, never color alone.
      const statusText = within(card!).getByText(status)
      expect(statusText.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)
      expect(input.disabled).toBe(disabled)
      // The radio's own name carries the path and status for screen readers.
      expect(input).toHaveAccessibleName(`${name} ${ROOT}/${name} ${status}`)
    }
    expect(radios.filter((input) => input.checked)).toEqual([])
    expect(openButton()).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('Select a ready mansion to open it.')).toBeInTheDocument()
  })

  it('shows an inline list error with safe copy and Retry, then loads on retry', async () => {
    host.get
      .mockRejectedValueOnce(httpError(500, 'metadata_unavailable', 'JSONDecodeError in /Users/someone/data/mansions-v1.json'))
      .mockResolvedValueOnce(listBody(mansion('attic')))
    const { container } = render(<Foyer />)

    const error = await screen.findByText('Could not load the mansion list. Mansion records are unavailable. Try again.')
    expect(error.closest('p')?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(container).not.toHaveTextContent('/Users/')
    expect(container).not.toHaveTextContent('JSONDecodeError')
    // Errors are ordinary content beside the control, not live-region text.
    expect(announcer(container)).toBeEmptyDOMElement()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(createButton()).toHaveAttribute('aria-disabled', 'true')

    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(retry).toHaveAttribute('type', 'button')
    retry.focus()
    fireEvent.click(retry)
    // Focus stays inside the Foyer when the Retry button leaves.
    expect(document.activeElement).not.toBe(document.body)
    expect(await screen.findByRole('radio', { name: /^attic\b/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(host.get).toHaveBeenCalledTimes(2)
  })

  it('refuses a malformed list instead of rendering part of it', async () => {
    host.get.mockResolvedValue(listBody(mansion('fine'), { ...mansion('bad'), displayPath: '/etc/bad' }))
    render(<Foyer />)
    expect(
      await screen.findByText('Could not load the mansion list. Mansion service sent an unexpected reply.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('fine')).not.toBeInTheDocument()
  })
})

describe('Foyer selection and keyboard', () => {
  it('identifies exactly one selected mansion', async () => {
    await renderFoyer(listBody(mansion('alpha'), mansion('beta'), mansion('gamma')))
    const checked = () => (screen.getAllByRole('radio') as HTMLInputElement[]).filter((input) => input.checked)

    fireEvent.click(radio('beta'))
    expect(checked().map((input) => input.value)).toEqual(['beta'])
    expect(openButton()).toHaveAccessibleName('Open beta')
    expect(openButton()).toHaveAttribute('aria-disabled', 'false')

    fireEvent.click(radio('gamma'))
    expect(checked().map((input) => input.value)).toEqual(['gamma'])
    expect(openButton()).toHaveAccessibleName('Open gamma')
    expect(radio('gamma').closest('label')).toHaveAttribute('data-selected', 'true')
    expect(radio('beta').closest('label')).toHaveAttribute('data-selected', 'false')
  })

  it('uses one native radio group, so the browser supplies Arrow-key selection', async () => {
    await renderFoyer(listBody(mansion('alpha'), mansion('lost', 'missing'), mansion('zeta')))
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    for (const input of radios) {
      expect(input.tagName).toBe('INPUT')
      expect(input.type).toBe('radio')
      // No roving tabindex or custom role: the platform owns Arrow keys and Tab.
      expect(input).not.toHaveAttribute('tabindex')
      expect(input).not.toHaveAttribute('role')
    }
    expect(new Set(radios.map((input) => input.name)).size).toBe(1)
    expect(radios[0].name).not.toBe('')
    // Unavailable mansions are natively disabled, so Arrow keys skip them.
    expect(radios.map((input) => input.disabled)).toEqual([false, true, false])

    // Arrow keys are left to the browser: nothing cancels them.
    radios[0].focus()
    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
      expect(fireEvent.keyDown(radios[0], { key })).toBe(true)
    }
    // The browser answers an Arrow key by checking the next radio; that selects it.
    fireEvent.click(radios[2])
    expect(radios.map((input) => input.checked)).toEqual([false, false, true])
    expect(host.post).not.toHaveBeenCalled()
  })

  it('opens the focused mansion on Enter, like the Open button', async () => {
    await renderFoyer(listBody(mansion('alpha'), mansion('beta')))
    host.post.mockResolvedValue({ mansion: mansion('beta') })

    const beta = radio('beta')
    beta.focus()
    // Enter is handled here, so it must not also submit or click anything.
    let notCancelled = true
    await act(async () => {
      notCancelled = fireEvent.keyDown(beta, { key: 'Enter' })
    })
    expect(notCancelled).toBe(false)

    expect(await screen.findByRole('heading', { level: 2, name: 'beta' })).toBeInTheDocument()
    expect(host.post).toHaveBeenCalledTimes(1)
    expect(host.post).toHaveBeenCalledWith(OPEN, { name: 'beta' })
  })

  it('does not open on other keys', async () => {
    await renderFoyer(listBody(mansion('alpha')))
    fireEvent.click(radio('alpha'))
    for (const key of [' ', 'Tab', 'Escape', 'a']) fireEvent.keyDown(radio('alpha'), { key })
    await act(async () => {})
    expect(host.post).not.toHaveBeenCalled()
  })
})

describe('Foyer create', () => {
  it('labels the name field and gives pattern guidance', async () => {
    await renderFoyer()
    const field = nameField()
    expect(field).toHaveAttribute('maxlength', '40')
    expect(field).toHaveAttribute('pattern', '[a-z0-9]+(-[a-z0-9]+)*')
    expect(field).toHaveAccessibleDescription(
      'Lowercase letters, numbers, and single hyphens, up to 40 characters. For example: weather-station.',
    )
    expect(field).toHaveAttribute('aria-invalid', 'false')
    expect(createButton()).toHaveAttribute('type', 'submit')
  })

  it.each([
    ['', MANSION_NAME_REQUIRED],
    ['Weather Station', MANSION_NAME_INVALID],
    ['weather--station', MANSION_NAME_INVALID],
    ['../escape', MANSION_NAME_INVALID],
    [' padded ', MANSION_NAME_INVALID],
  ])('rejects %j beside the field without sending it', async (value, message) => {
    const { container } = await renderFoyer()
    await submitName(value)
    expect(host.post).not.toHaveBeenCalled()
    const field = nameField()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(expect.stringContaining(message))
    expect(field).toHaveFocus()
    // Nothing was trimmed or rewritten.
    expect(field.value).toBe(value)
    expect(screen.getByText(message).closest('p')?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(announcer(container)).toBeEmptyDOMElement()

    fireEvent.change(field, { target: { value: 'fixed-name' } })
    expect(screen.queryByText(message)).not.toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'false')
  })

  it('identifies the pending name, blocks a second submit, then lists and announces the new mansion', async () => {
    const { container } = await renderFoyer(listBody(mansion('zeta')))
    const pending = deferred()
    host.post.mockReturnValue(pending.promise)

    await submitName('alpha')
    const progress = screen.getByText('Creating alpha…')
    expect(announcer(container)).not.toContainElement(progress)
    expect(announcer(container)).toBeEmptyDOMElement()
    expect(createButton()).toHaveAttribute('aria-disabled', 'true')
    expect(openButton()).toHaveAttribute('aria-disabled', 'true')
    expect(nameField()).toHaveAttribute('readonly')

    await act(async () => {
      fireEvent.click(createButton())
      fireEvent.submit(nameField().closest('form')!)
    })
    expect(host.post).toHaveBeenCalledTimes(1)
    expect(host.post).toHaveBeenCalledWith(MANSIONS, { name: 'alpha' })

    await act(async () => pending.resolve({ outcome: 'created', mansion: mansion('alpha') }))
    expect(screen.queryByText('Creating alpha…')).not.toBeInTheDocument()
    expect((screen.getAllByRole('radio') as HTMLInputElement[]).map((input) => input.value)).toEqual(['alpha', 'zeta'])
    expect(announcer(container)).toHaveTextContent('Mansion alpha created.')
    expect(nameField().value).toBe('')
    expect(createButton()).toHaveAttribute('aria-disabled', 'false')
    // The list request is not repeated: the reducer upserts the result.
    expect(host.get).toHaveBeenCalledTimes(1)
  })

  it('says so when the mansion already existed and keeps one entry', async () => {
    const { container } = await renderFoyer(listBody(mansion('alpha')))
    host.post.mockResolvedValue({ outcome: 'existing_compatible', mansion: mansion('alpha') })
    await submitName('alpha')
    expect(announcer(container)).toHaveTextContent('Mansion alpha already exists. Nothing was changed.')
    expect(screen.getAllByRole('radio')).toHaveLength(1)
  })

  it.each([
    [409, 'mansion_conflict', 'Could not create taken. Existing content conflicts with this mansion. Nothing was changed.'],
    [422, 'invalid_mansion_name', 'Could not create taken. Use 1–40 lowercase letters, numbers, and single hyphens.'],
    [500, 'filesystem_error', 'Could not create taken. Mansion storage could not be accessed.'],
    [500, 'unsafe_mansion_root', 'Could not create taken. Mansion storage is not configured safely.'],
  ])('keeps the list and selection on HTTP %i %s and shows the documented error by the form', async (status, code, copy) => {
    const { container } = await renderFoyer(listBody(mansion('kept'), mansion('other')))
    fireEvent.click(radio('kept'))
    host.post.mockRejectedValue(httpError(status, code))

    await submitName('taken')
    const error = screen.getByText(copy)
    const form = nameField().closest('form')!
    expect(form).toContainElement(error)
    expect(nameField()).toHaveAccessibleDescription(expect.stringContaining(copy))
    expect(nameField()).toHaveAttribute('aria-invalid', 'true')
    expect(nameField()).toHaveFocus()
    expect(nameField().value).toBe('taken')
    expect(container).not.toHaveTextContent('/Users/')
    expect(announcer(container)).toBeEmptyDOMElement()

    expect((screen.getAllByRole('radio') as HTMLInputElement[]).map((input) => input.value)).toEqual(['kept', 'other'])
    expect(radio('kept').checked).toBe(true)
    expect(createButton()).toHaveAttribute('aria-disabled', 'false')
  })

  it('can retry a failed create', async () => {
    await renderFoyer()
    host.post
      .mockRejectedValueOnce(httpError(500, 'metadata_unavailable'))
      .mockResolvedValueOnce({ outcome: 'created', mansion: mansion('second-try') })
    await submitName('second-try')
    expect(screen.getByText(/^Could not create second-try\./)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(createButton())
    })
    expect(screen.queryByText(/^Could not create/)).not.toBeInTheDocument()
    expect(radio('second-try')).toBeInTheDocument()
    expect(host.post).toHaveBeenCalledTimes(2)
  })
})

describe('Foyer open, Mansion Shell, and return', () => {
  it('revalidates through the open route, identifies the pending name, and blocks a second open', async () => {
    const { container } = await renderFoyer(listBody(mansion('alpha'), mansion('beta')))
    const pending = deferred()
    host.post.mockReturnValue(pending.promise)

    fireEvent.click(radio('alpha'))
    await act(async () => {
      fireEvent.click(openButton())
    })
    const progress = screen.getByText('Opening alpha…')
    expect(announcer(container)).not.toContainElement(progress)
    expect(openButton()).toHaveAttribute('aria-disabled', 'true')
    expect(createButton()).toHaveAttribute('aria-disabled', 'true')

    await act(async () => {
      fireEvent.click(openButton())
      fireEvent.keyDown(radio('alpha'), { key: 'Enter' })
      fireEvent.keyDown(radio('beta'), { key: 'Enter' })
    })
    expect(host.post).toHaveBeenCalledTimes(1)
    expect(host.post).toHaveBeenCalledWith(OPEN, { name: 'alpha' })
    // The UI sends a name and nothing else: never a path.
    expect(JSON.stringify(host.post.mock.calls)).not.toContain('~')

    await act(async () => pending.resolve({ mansion: mansion('alpha') }))
    const shell = screen.getByRole('region', { name: 'alpha' })
    expect(within(shell).getByRole('heading', { level: 2, name: 'alpha' })).toHaveFocus()
    expect(within(shell).getByText('Project spec').nextElementSibling).toHaveTextContent('alpha')
    expect(within(shell).getByText('Folder').nextElementSibling).toHaveTextContent(`${ROOT}/alpha`)
    expect(within(shell).getByRole('button', { name: 'Return to Foyer' })).toHaveAttribute('type', 'button')
    expect(announcer(container)).toHaveTextContent('Mansion alpha opened.')
    // The Foyer hall is hidden, not shown beside the shell.
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create mansion' })).not.toBeInTheDocument()
  })

  it('returns with the button and restores focus to the Open button that was used', async () => {
    await renderFoyer(listBody(mansion('alpha'), mansion('beta')))
    host.post.mockResolvedValue({ mansion: mansion('beta') })
    fireEvent.click(radio('beta'))
    const open = openButton()
    open.focus()
    await act(async () => {
      fireEvent.click(open)
    })
    expect(await screen.findByRole('region', { name: 'beta' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Return to Foyer' }))
    expect(screen.queryByRole('region', { name: 'beta' })).not.toBeInTheDocument()
    expect(openButton()).toBe(open)
    expect(open).toHaveFocus()
    expect(radio('beta').checked).toBe(true)
    expect(screen.getByRole('radiogroup', { name: 'Mansions' })).toBeVisible()
  })

  it('returns on Escape and restores focus to the radio that opened the shell with Enter', async () => {
    await renderFoyer(listBody(mansion('alpha'), mansion('beta')))
    host.post.mockResolvedValue({ mansion: mansion('alpha') })
    const alpha = radio('alpha')
    alpha.focus()
    await act(async () => {
      fireEvent.keyDown(alpha, { key: 'Enter' })
    })
    expect(await screen.findByRole('region', { name: 'alpha' })).toBeInTheDocument()

    // Escape works wherever focus is, including after it left the shell.
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'alpha' })).not.toBeInTheDocument()
    expect(radio('alpha')).toBe(alpha)
    expect(alpha).toHaveFocus()
    expect(alpha.checked).toBe(true)

    // Escape in the Foyer itself does nothing.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('radiogroup', { name: 'Mansions' })).toBeInTheDocument()
    expect(host.post).toHaveBeenCalledTimes(1)
  })

  it('leaves Escape to an inner panel that already handled it', async () => {
    await renderFoyer(listBody(mansion('alpha')), {
      renderMansion: (opened) => (
        <div data-testid="rooms" onKeyDown={(event) => event.preventDefault()}>
          Rooms of {opened.name}
        </div>
      ),
    })
    host.post.mockResolvedValue({ mansion: mansion('alpha') })
    fireEvent.click(radio('alpha'))
    await act(async () => {
      fireEvent.click(openButton())
    })
    const rooms = await screen.findByTestId('rooms')
    expect(rooms).toHaveTextContent('Rooms of alpha')
    fireEvent.keyDown(rooms, { key: 'Escape' })
    expect(screen.getByRole('region', { name: 'alpha' })).toBeInTheDocument()
  })

  it.each([
    [409, 'mansion_missing', 'Could not open alpha. This mansion is missing from storage.'],
    [409, 'mansion_conflict', 'Could not open alpha. Existing content conflicts with this mansion. Nothing was changed.'],
    [404, 'mansion_not_registered', 'Could not open alpha. This mansion is not registered. Refresh the list and try again.'],
    [500, 'filesystem_error', 'Could not open alpha. Mansion storage could not be accessed.'],
  ])('stays in the Foyer on HTTP %i %s with the documented error by the Open button', async (status, code, copy) => {
    const { container } = await renderFoyer(listBody(mansion('alpha'), mansion('beta')))
    host.post.mockRejectedValue(httpError(status, code))
    fireEvent.click(radio('alpha'))
    const open = openButton()
    open.focus()
    await act(async () => {
      fireEvent.click(open)
    })

    expect(await screen.findByText(copy)).toBeInTheDocument()
    expect(open).toHaveAccessibleDescription(expect.stringContaining(copy))
    expect(open).toHaveFocus()
    expect(screen.queryByRole('region', { name: 'alpha' })).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent('/Users/')
    expect(announcer(container)).toBeEmptyDOMElement()
    // The list and the selection are preserved, and the open can be retried.
    expect((screen.getAllByRole('radio') as HTMLInputElement[]).map((input) => input.value)).toEqual(['alpha', 'beta'])
    expect(radio('alpha').checked).toBe(true)
    expect(open).toHaveAttribute('aria-disabled', 'false')
  })
})

describe('Foyer accessibility, theme, and motion', () => {
  it('keeps exactly one polite live region through every state, used only for completed results', async () => {
    const { container } = await renderFoyer(listBody(mansion('alpha')))
    expect(announcer(container)).toBeEmptyDOMElement()
    host.post.mockResolvedValueOnce({ outcome: 'created', mansion: mansion('beta') })
    await submitName('beta')
    expect(announcer(container)).toHaveTextContent('Mansion beta created.')
    host.post.mockResolvedValueOnce({ mansion: mansion('alpha') })
    fireEvent.click(radio('alpha'))
    await act(async () => {
      fireEvent.click(openButton())
    })
    await screen.findByRole('region', { name: 'alpha' })
    expect(announcer(container).textContent).toBe('Mansion alpha opened.')
    fireEvent.click(screen.getByRole('button', { name: 'Return to Foyer' }))
    expect(liveRegions(container)).toHaveLength(1)
  })

  it('hands results to a host announcer instead of adding a second live region', async () => {
    const onAnnounce = vi.fn()
    const { container } = await renderFoyer(listBody(), { onAnnounce })
    expect(liveRegions(container)).toHaveLength(0)
    host.post.mockResolvedValueOnce({ outcome: 'created', mansion: mansion('alpha') })
    await submitName('alpha')
    expect(onAnnounce.mock.calls).toEqual([['Mansion alpha created.']])
  })

  it('hides every icon from assistive technology and pairs it with words', async () => {
    host.get.mockRejectedValueOnce(httpError(500, 'filesystem_error')).mockResolvedValue(
      listBody(mansion('alpha'), mansion('lost', 'missing'), mansion('odd', 'conflict')),
    )
    const { container } = render(<Foyer />)
    await screen.findByRole('button', { name: 'Retry' })
    const check = () => {
      const icons = [...container.querySelectorAll('svg')]
      expect(icons.length).toBeGreaterThan(0)
      for (const icon of icons) {
        expect(icon).toHaveAttribute('aria-hidden', 'true')
        expect(icon.parentElement?.textContent?.trim()).not.toBe('')
      }
    }
    check()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('radiogroup')
    check()
    host.post.mockRejectedValue(httpError(409, 'mansion_missing'))
    fireEvent.click(radio('alpha'))
    await act(async () => {
      fireEvent.click(openButton())
    })
    await screen.findByText(/^Could not open alpha\./)
    check()
  })

  it('gives every control a programmatic name and a real, focusable element', async () => {
    await renderFoyer(listBody(mansion('alpha')))
    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('radio'), ...screen.getAllByRole('textbox')]
    for (const control of controls) {
      expect(control).toHaveAccessibleName()
      expect(['BUTTON', 'INPUT']).toContain(control.tagName)
      // aria-disabled keeps a control focusable, so focus is never dropped mid-action.
      expect(control).not.toBeDisabled()
    }
    expect(screen.getByRole('region', { name: 'Foyer' })).toBeInTheDocument()
  })

  it('offers list, create, select, open, retry, and return, and nothing destructive or deferred', async () => {
    const forbidden = /delete|remove|destroy|trash|erase|rename|archive|import|discover|scan|browse|choose folder|custom root|change root|location/i
    const names = (container: HTMLElement) =>
      [...container.querySelectorAll('button, a, input, select, textarea, [role]')].map(
        (el) => `${el.getAttribute('aria-label') ?? ''} ${el.textContent ?? ''} ${el.getAttribute('name') ?? ''}`,
      )

    const { container } = await renderFoyer(listBody(mansion('alpha'), mansion('lost', 'missing')))
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Open mansion', 'Create mansion'])
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(container.querySelectorAll('a, select, textarea, input[type="file"], [contenteditable]')).toHaveLength(0)
    for (const name of names(container)) expect(name).not.toMatch(forbidden)

    host.post.mockResolvedValue({ mansion: mansion('alpha') })
    fireEvent.click(radio('alpha'))
    await act(async () => {
      fireEvent.click(openButton())
    })
    const shell = await screen.findByRole('region', { name: 'alpha' })
    expect(within(shell).getAllByRole('button').map((button) => button.textContent)).toEqual(['Return to Foyer'])
    expect(screen.getAllByRole('button')).toHaveLength(1)
    for (const name of names(container)) expect(name).not.toMatch(forbidden)
  })

  it.each(['dark', 'light'] as const)('follows the host %s theme from useTheme()', async (mode) => {
    host.theme = { mode, accent: '#336699', colorTheme: 'default' }
    const { container } = await renderFoyer()
    const root = container.querySelector<HTMLElement>('.hh-foyer')!
    expect(root).toHaveAttribute('data-theme-mode', mode)
    expect(root.style.colorScheme).toBe(mode)
  })

  it('styles with Crew theme variables and no fixed colors', async () => {
    const { container } = await renderFoyer()
    expect(container.querySelector('style')?.textContent).toBe(FOYER_STYLES)
    for (const variable of ['--card', '--card-fg', '--border', '--border-strong', '--muted', '--accent', '--accent-fg', '--ring', '--ok', '--warn']) {
      expect(FOYER_STYLES).toContain(`var(${variable},`)
    }
    // Every color comes from the host theme (or inherits), so host contrast holds in both modes.
    expect(FOYER_STYLES).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/)
    const colorValues = [...FOYER_STYLES.matchAll(/(?:^|[;{\s])(?:color|background|border-color|outline-color|accent-color):\s*([^;}]+)/g)].map((m) => m[1].trim())
    expect(colorValues.length).toBeGreaterThan(5)
    for (const value of colorValues) expect(value).toMatch(/^(var\(--[a-z-]+, .+\)|inherit|transparent)$/)
  })

  it('shows a visible focus ring on every kind of focusable element', () => {
    for (const selector of ['.hh-button:focus-visible', '.hh-field input:focus-visible', '.hh-mansion:focus-within', '.hh-foyer h2:focus-visible']) {
      const rule = FOYER_STYLES.slice(FOYER_STYLES.indexOf(selector))
      expect(FOYER_STYLES).toContain(selector)
      expect(rule.slice(0, rule.indexOf('}'))).toContain('outline: 2px solid var(--ring, currentColor)')
    }
    expect(FOYER_STYLES).not.toMatch(/outline:\s*(none|0)\b/)
  })

  it('animates only when motion is allowed and Still House is off', async () => {
    // The one animation lives inside the no-preference media query, behind the motion attribute.
    const media = '@media (prefers-reduced-motion: no-preference) {'
    const outside = FOYER_STYLES.slice(0, FOYER_STYLES.indexOf(media))
    const inside = FOYER_STYLES.slice(FOYER_STYLES.indexOf(media))
    expect(FOYER_STYLES.split(media)).toHaveLength(2)
    expect(outside).not.toMatch(/\banimation(-name)?\s*:|\btransition\s*:/)
    const animations = [...inside.matchAll(/([^{}]+)\{[^{}]*\banimation:\s*([^;}]+)/g)]
    expect(animations).toHaveLength(1)
    expect(animations[0][1]).toContain(".hh-foyer[data-motion='low-frequency']")
    // Nothing loops faster than once every 2 seconds.
    const seconds = Number(/(\d+(?:\.\d+)?)s\b/.exec(animations[0][2])?.[1])
    expect(seconds).toBeGreaterThanOrEqual(2)
    expect(FOYER_STYLES).not.toMatch(/\btransition\s*:/)

    const still = await renderFoyer(listBody(), { stillHouse: true })
    expect(still.container.querySelector('.hh-foyer')).toHaveAttribute('data-motion', 'none')
    still.unmount()
    const moving = await renderFoyer(listBody())
    expect(moving.container.querySelector('.hh-foyer')).toHaveAttribute('data-motion', 'low-frequency')
  })
})
