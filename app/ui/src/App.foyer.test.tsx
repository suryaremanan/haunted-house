// The page and the Foyer together (tasks 8.3 and 8.4): the Foyer mounts only
// after the backend is reachable, the foundation states stay as they were, and
// the whole page keeps one polite live region. Only the host client is mocked.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HauntedHouseApp from './App'
import { initialWorkflowProjection, workflowProjectionToJson } from './core/workflow-projection'
import { MANSIONS, OPEN, deferred, httpError, listBody, liveRegions, mansion } from './rooms/foyer/foyer-test-kit'

// `house` answers the reads the opened mansion's house makes (its séance log and workflow).
const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), whoami: vi.fn(), mansions: vi.fn(), house: vi.fn() }))

vi.mock('@kirocrew/app-sdk', () => ({
  useAppApi: () => ({ get: client.get, post: client.post, put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: () => () => {},
  useTheme: () => ({ mode: 'light', accent: '', colorTheme: 'default' }),
  useNotify: () => () => {},
  useNavBadge: () => () => {},
}))

const WHOAMI = '/apps/haunted-house/api/whoami'
const REACHABLE = { backend: 'ok', gateway: { version: '0.12.2' } }
const SUMMARY = 'Backend reachable · Gateway 0.12.2'

/** The page's single live region: the status summary line. */
function summary(container: HTMLElement): HTMLElement {
  const regions = liveRegions(container)
  expect(regions).toHaveLength(1)
  expect(regions[0]).toHaveAttribute('aria-live', 'polite')
  expect(regions[0]).toHaveClass('hh-summary')
  return regions[0]
}

beforeEach(() => {
  for (const mock of Object.values(client)) mock.mockReset()
  client.whoami.mockResolvedValue(REACHABLE)
  client.mansions.mockResolvedValue(listBody(mansion('weather-station')))
  // A mansion nothing has happened in yet: an empty séance log and the initial workflow.
  client.house.mockImplementation(async (path: string) => {
    const mansionId = /\/mansions\/([^/]+)\//.exec(path)?.[1] ?? ''
    return path.endsWith('/workflow')
      ? workflowProjectionToJson(initialWorkflowProjection(mansionId))
      : { events: [], highest_sequence: 0, diagnostics: [] }
  })
  // Routed by path, so each kind of read is counted on its own.
  client.get.mockImplementation((path: string) =>
    path === WHOAMI ? client.whoami(path) : path === MANSIONS ? client.mansions(path) : client.house(path),
  )
})

describe('backend gating', () => {
  it('keeps the foundation loading state and mounts no Foyer until the backend answers', async () => {
    const pending = deferred()
    client.whoami.mockReturnValue(pending.promise)
    const { container } = render(<HauntedHouseApp />)

    expect(summary(container).textContent).toBe('Checking the backend…')
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['BackendChecking…', 'GatewayChecking…'])
    expect(screen.queryByRole('heading', { name: 'Foyer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    await act(async () => {})
    expect(client.mansions).not.toHaveBeenCalled()

    await act(async () => pending.resolve(REACHABLE))
    expect(await screen.findByRole('radio', { name: /^weather-station\b/ })).toBeInTheDocument()
    expect(client.mansions).toHaveBeenCalledTimes(1)
    expect(client.mansions).toHaveBeenCalledWith(MANSIONS)
    expect(summary(container).textContent).toBe(SUMMARY)
  })

  it('keeps the foundation unreachable state with its single Retry, then mounts the Foyer after retry', async () => {
    client.whoami.mockRejectedValueOnce({ status: 503, message: 'Service Unavailable' })
    const { container } = render(<HauntedHouseApp />)

    expect(await screen.findByText('Backend not reachable (HTTP 503)')).toBe(summary(container))
    expect(screen.getByText('Service Unavailable')).toBeInTheDocument()
    expect(screen.getByText('Unknown until the backend answers')).toBeInTheDocument()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Retry'])
    expect(screen.queryByRole('heading', { name: 'Foyer' })).not.toBeInTheDocument()
    expect(client.mansions).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Foyer' })).toBeInTheDocument()
    expect(await screen.findByRole('radio', { name: /^weather-station\b/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(client.whoami).toHaveBeenCalledTimes(2)
    expect(client.mansions).toHaveBeenCalledTimes(1)
  })

  it('mounts the Foyer when the backend answers but the gateway does not', async () => {
    client.whoami.mockResolvedValue({ backend: 'ok', gateway: { error: 'timeout' } })
    const { container } = render(<HauntedHouseApp />)
    expect(await screen.findByRole('heading', { name: 'Foyer' })).toBeInTheDocument()
    expect(summary(container).textContent).toBe('Backend reachable · Gateway did not answer in time.')
    expect(client.mansions).toHaveBeenCalledTimes(1)
  })

  it('treats an unexpected whoami reply as unreachable and mounts no Foyer', async () => {
    client.whoami.mockResolvedValue({ backend: 'someone-else' })
    render(<HauntedHouseApp />)
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Foyer' })).not.toBeInTheDocument()
    expect(client.mansions).not.toHaveBeenCalled()
  })
})

describe('page with the Foyer', () => {
  it('has one main landmark, the page heading, and the Foyer beneath the status panel', async () => {
    render(<HauntedHouseApp />)
    const main = screen.getByRole('main', { name: 'Haunted House' })
    expect(within(main).getByRole('heading', { level: 1, name: 'Haunted House' })).toBeInTheDocument()
    const foyer = await within(main).findByRole('region', { name: 'Foyer' })
    const status = within(main).getByRole('list', { name: 'Status' })
    expect(status.compareDocumentPosition(foyer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The status rows stay the page's only list items.
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual(['BackendReachable', 'GatewayVersion 0.12.2'])
  })

  it('keeps one polite live region for the whole journey and announces only completed results in it', async () => {
    const { container } = render(<HauntedHouseApp />)
    await screen.findByRole('radio', { name: /^weather-station\b/ })
    expect(summary(container).textContent).toBe(SUMMARY)

    // Create: progress stays inline, the result is announced.
    const creating = deferred()
    client.post.mockReturnValueOnce(creating.promise)
    fireEvent.change(screen.getByRole('textbox', { name: 'New mansion name' }), { target: { value: 'attic-radio' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create mansion' }))
    })
    expect(screen.getByText('Creating attic-radio…')).toBeInTheDocument()
    expect(summary(container).textContent).toBe(SUMMARY)
    await act(async () => creating.resolve({ outcome: 'created', mansion: mansion('attic-radio') }))
    expect(summary(container)).toHaveTextContent(`${SUMMARY} Mansion attic-radio created.`)
    expect(within(summary(container)).getByText('Mansion attic-radio created.')).toBeInTheDocument()
    expect(client.post).toHaveBeenCalledWith(MANSIONS, { name: 'attic-radio' })

    // A failed open is shown by the control and leaves the live region alone.
    client.post.mockRejectedValueOnce(httpError(409, 'mansion_missing'))
    fireEvent.click(screen.getByRole('radio', { name: /^attic-radio\b/ }))
    const open = screen.getByRole('button', { name: 'Open attic-radio' })
    open.focus()
    await act(async () => {
      fireEvent.click(open)
    })
    expect(await screen.findByText('Could not open attic-radio. This mansion is missing from storage.')).toBeInTheDocument()
    expect(summary(container)).toHaveTextContent(`${SUMMARY} Mansion attic-radio created.`)

    // Open, then return: the shell replaces the hall, and focus comes back.
    client.post.mockResolvedValueOnce({ mansion: mansion('attic-radio') })
    await act(async () => {
      fireEvent.click(open)
    })
    const shell = await screen.findByRole('region', { name: 'Mansion attic-radio' })
    expect(client.post).toHaveBeenLastCalledWith(OPEN, { name: 'attic-radio' })
    // In an open mansion the house's announcer is the page's one live region.
    // The status details are plain text in the toolbar's disclosure, after the heading.
    expect(liveRegions(container)).toHaveLength(1)
    expect(liveRegions(container)[0]).toHaveAttribute('data-announcer')
    expect(liveRegions(container)[0]).toHaveTextContent('Mansion attic-radio opened.')
    expect(within(shell).getByRole('heading', { level: 2, name: /^Mansion\s*attic-radio$/ })).toHaveFocus()
    expect(within(shell).getByRole('list', { name: 'Status' })).toHaveTextContent('BackendReachable')
    expect(within(shell).getByText(SUMMARY)).not.toHaveAttribute('aria-live')
    expect(screen.getByRole('heading', { level: 1, name: 'Haunted House' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Foyer' })).not.toBeInTheDocument()
    // The house map comes before room details and the status disclosure's content is collapsed.
    expect(within(shell).getByRole('navigation', { name: 'Mansion rooms' })).toBeInTheDocument()

    // The Foyer room of the house names the mansion and offers the way back.
    fireEvent.click(within(shell).getByRole('button', { name: /^Foyer\./ }))
    const foyerRoom = await within(shell).findByRole('region', { name: 'Foyer' })
    expect(foyerRoom).toHaveTextContent('Mansionattic-radioProject specattic-radio')
    expect(within(foyerRoom).getByRole('button', { name: 'Return to Foyer' })).toBeInTheDocument()
    // Escape closes the open room first, and only then leaves the mansion.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(within(shell).queryByRole('region', { name: 'Foyer' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Mansion attic-radio' })).toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('region', { name: 'Foyer' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Mansion attic-radio' })).toBeNull()
    expect(open).toHaveFocus()
    expect(liveRegions(container)).toHaveLength(1)
    expect(summary(container)).toHaveTextContent(SUMMARY)
    // whoami and the list were each asked once for the whole journey.
    expect(client.whoami).toHaveBeenCalledTimes(1)
    expect(client.mansions).toHaveBeenCalledTimes(1)
    // Every other read was the opened mansion's house asking about that mansion only.
    expect(client.house).toHaveBeenCalled()
    for (const [path] of client.house.mock.calls) {
      expect(path).toMatch(/^\/apps\/haunted-house\/api\/mansions\/attic-radio\/(seance\/events\?|workflow$|specs\/attic-radio\/room-ghosts$)/)
    }
  })

  it('shows a failed mansion list inside the Foyer without disturbing the reachable status', async () => {
    client.mansions.mockRejectedValueOnce(httpError(500, 'metadata_unavailable')).mockResolvedValueOnce(listBody())
    const { container } = render(<HauntedHouseApp />)
    expect(
      await screen.findByText('Could not load the mansion list. Mansion records are unavailable. Try again.'),
    ).toBeInTheDocument()
    expect(summary(container).textContent).toBe(SUMMARY)
    // The only Retry on the page is the Foyer's; it asks for the list, not whoami.
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'No mansions yet' })).toBeInTheDocument()
    expect(client.whoami).toHaveBeenCalledTimes(1)
    expect(client.mansions).toHaveBeenCalledTimes(2)
  })

  it('has no destructive or deferred control anywhere on the page', async () => {
    const { container } = render(<HauntedHouseApp />)
    await screen.findByRole('radio', { name: /^weather-station\b/ })
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Open mansion', 'Create mansion'])
    expect(container.querySelectorAll('a, select, input[type="file"]')).toHaveLength(0)
    // The one textarea is the optional feature brief (design decision 2026-11-16).
    expect([...container.querySelectorAll('textarea')].map((area) => area.name)).toEqual(['mansion-brief'])
    expect(container.textContent).not.toMatch(/delete|remove|rename|archive|import/i)
  })
})
