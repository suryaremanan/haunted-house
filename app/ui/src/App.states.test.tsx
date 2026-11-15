import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HauntedHouseApp from './App'
import type { BackendStatus } from './adapters/sdk'

// The status page reads everything through useBackendStatus(), so these tests
// replace that one hook and drive the page through each state it can show.
// App.live.test.tsx runs the real hook against a mocked SDK client instead.
const backend = vi.hoisted(() => ({
  state: { kind: 'loading' } as BackendStatus,
  retry: vi.fn(),
}))

vi.mock('./adapters/sdk', () => ({
  useBackendStatus: () => ({ state: backend.state, retry: backend.retry }),
}))

// These tests cover the status panel alone. The Foyer, which mounts beside it
// once the backend is reachable, has its own DOM tests (rooms/foyer/Foyer.test.tsx)
// and is tested together with this page in App.foyer.test.tsx.
vi.mock('./rooms/foyer/Foyer', () => ({ Foyer: () => null }))

const REACHABLE: BackendStatus = { kind: 'ok', gateway: { version: '0.12.1' } }
const UNREACHABLE_502: BackendStatus = { kind: 'unreachable', status: 502, message: 'Bad Gateway' }
const UNREACHABLE_NO_STATUS: BackendStatus = { kind: 'unreachable', message: 'Failed to fetch' }

const TIMEOUT_COPY = 'Gateway did not answer in time.'
const DENIED_COPY =
  'Gateway refused the app token. Re-enable the app or approve its permissions on the app page.'

function renderPage(state: BackendStatus) {
  backend.state = state
  return render(<HauntedHouseApp />)
}

/** Every element that announces changes to a screen reader, explicitly or through its role. */
function liveRegions(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      '[aria-live], [role="status"], [role="alert"], [role="log"], [role="marquee"], [role="timer"], output',
    ),
  ]
}

/** The single polite live region that carries the summary line. */
function summary(container: HTMLElement): HTMLElement {
  const regions = liveRegions(container)
  expect(regions).toHaveLength(1)
  expect(regions[0]).toHaveAttribute('aria-live', 'polite')
  return regions[0]
}

/** The status row whose name label is exactly `name`. */
function row(name: 'Backend' | 'Gateway'): HTMLElement {
  const match = screen.getAllByRole('listitem').find((item) => within(item).queryByText(name) !== null)
  if (!match) throw new Error(`No status row named ${name}`)
  return match
}

beforeEach(() => {
  backend.retry.mockReset()
})

describe('status page states', () => {
  it('shows a reachable backend and the gateway version', () => {
    const { container } = renderPage(REACHABLE)
    expect(summary(container).textContent).toBe('Backend reachable · Gateway 0.12.1')
    expect(within(row('Backend')).getByText('Reachable')).toBeInTheDocument()
    expect(within(row('Gateway')).getByText('Version 0.12.1')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows an unreachable backend with its HTTP status and the error message', () => {
    const { container } = renderPage(UNREACHABLE_502)
    expect(summary(container).textContent).toBe('Backend not reachable (HTTP 502)')
    expect(within(row('Backend')).getByText('Not reachable (HTTP 502)')).toBeInTheDocument()
    expect(within(row('Backend')).getByText('Bad Gateway')).toBeInTheDocument()
    expect(within(row('Gateway')).getByText('Unknown until the backend answers')).toBeInTheDocument()
  })

  it('shows an unreachable backend without an HTTP status when none was given', () => {
    const { container } = renderPage(UNREACHABLE_NO_STATUS)
    expect(summary(container).textContent).toBe('Backend not reachable')
    expect(within(row('Backend')).getByText('Not reachable')).toBeInTheDocument()
    expect(within(row('Backend')).getByText('Failed to fetch')).toBeInTheDocument()
    expect(container).not.toHaveTextContent('HTTP')
  })

  it.each([
    ['with', UNREACHABLE_502],
    ['without', UNREACHABLE_NO_STATUS],
  ])('offers a Retry button that asks again when the backend is unreachable %s a status', (_label, state) => {
    renderPage(state)
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(retry.tagName).toBe('BUTTON')
    expect(retry).toHaveAttribute('type', 'button')
    retry.focus()
    expect(retry).toHaveFocus()
    fireEvent.click(retry)
    expect(backend.retry).toHaveBeenCalledTimes(1)
  })

  it('says the gateway did not answer in time', () => {
    const { container } = renderPage({ kind: 'ok', gateway: { error: 'timeout' } })
    expect(summary(container).textContent).toBe(`Backend reachable · ${TIMEOUT_COPY}`)
    expect(within(row('Backend')).getByText('Reachable')).toBeInTheDocument()
    expect(within(row('Gateway')).getByText('No answer in time')).toBeInTheDocument()
  })

  it('says the gateway refused the app token and what to do about it', () => {
    const { container } = renderPage({ kind: 'ok', gateway: { error: 'denied' } })
    expect(summary(container).textContent).toBe(`Backend reachable · ${DENIED_COPY}`)
    expect(within(row('Backend')).getByText('Reachable')).toBeInTheDocument()
    expect(within(row('Gateway')).getByText('Refused the app token')).toBeInTheDocument()
  })

  it('says the backend could not reach the gateway', () => {
    const { container } = renderPage({ kind: 'ok', gateway: { error: 'unreachable' } })
    expect(summary(container)).toHaveTextContent('Backend could not reach the gateway.')
    expect(within(row('Gateway')).getByText('Not reachable')).toBeInTheDocument()
  })

  it('says the gateway settings are missing or not local', () => {
    const { container } = renderPage({ kind: 'ok', gateway: { error: 'config' } })
    expect(summary(container)).toHaveTextContent(
      'Gateway settings for this app are missing or not local, so the backend did not call it.',
    )
    expect(within(row('Gateway')).getByText('Not set up')).toBeInTheDocument()
  })

  it('shows both rows as checking while the backend has not answered', () => {
    const { container } = renderPage({ kind: 'loading' })
    expect(summary(container).textContent).toBe('Checking the backend…')
    expect(within(row('Backend')).getByText('Checking…')).toBeInTheDocument()
    expect(within(row('Gateway')).getByText('Checking…')).toBeInTheDocument()
  })
})

describe('status page accessibility', () => {
  const ALL_STATES: [string, BackendStatus][] = [
    ['loading', { kind: 'loading' }],
    ['reachable', REACHABLE],
    ['backend unreachable with a status', UNREACHABLE_502],
    ['backend unreachable without a status', UNREACHABLE_NO_STATUS],
    ['gateway timeout', { kind: 'ok', gateway: { error: 'timeout' } }],
    ['gateway denied', { kind: 'ok', gateway: { error: 'denied' } }],
    ['gateway unreachable', { kind: 'ok', gateway: { error: 'unreachable' } }],
    ['gateway config', { kind: 'ok', gateway: { error: 'config' } }],
  ]

  it.each(ALL_STATES)('labels each row in text, not by icon alone (%s)', (_label, state) => {
    renderPage(state)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    for (const name of ['Backend', 'Gateway'] as const) {
      const item = row(name)
      expect(item.querySelectorAll('svg')).toHaveLength(1)
      // The row says its state in words beyond its name.
      const stateText = (item.textContent ?? '').replace(name, '').trim()
      expect(stateText).not.toBe('')
    }
  })

  it.each(ALL_STATES)('hides every icon from assistive technology (%s)', (_label, state) => {
    const { container } = renderPage(state)
    const icons = [...container.querySelectorAll('svg')]
    expect(icons.length).toBeGreaterThan(0)
    for (const icon of icons) expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it.each(ALL_STATES)('has exactly one polite live region, holding the summary (%s)', (_label, state) => {
    const { container } = renderPage(state)
    expect(summary(container).textContent?.trim()).not.toBe('')
  })
})
