import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HauntedHouseApp from './App'

// Mocks one level below App.states.test.tsx: the Crew SDK client itself, so
// the real useBackendStatus() and parseWhoami() run end to end. The SDK only
// exists inside the Crew dashboard, so the factory supplies the whole module.
// `get` routes by path: `whoami` answers the status check, `mansions` answers
// the Foyer's list request, which follows once the backend is reachable.
const client = vi.hoisted(() => ({ get: vi.fn(), whoami: vi.fn(), mansions: vi.fn() }))

vi.mock('@kirocrew/app-sdk', () => ({
  // A new client object per render, as the host may hand out, so the tests
  // also catch a hook that asks again on every render.
  useAppApi: () => ({ get: client.get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: () => () => {},
  useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
}))

const WHOAMI = '/apps/haunted-house/api/whoami'
const MANSIONS = '/apps/haunted-house/api/mansions'
const REACHABLE_LINE = 'Backend reachable · Gateway 0.12.1'

beforeEach(() => {
  client.whoami.mockReset()
  client.mansions.mockReset()
  client.mansions.mockResolvedValue({ schemaVersion: 1, mansions: [] })
  client.get.mockReset()
  client.get.mockImplementation((path: string) => (path === WHOAMI ? client.whoami(path) : client.mansions(path)))
})

describe('status page with the real status hook', () => {
  it('shows "Backend reachable · Gateway 0.12.1" when whoami answers with the gateway version', async () => {
    client.whoami.mockResolvedValueOnce({ backend: 'ok', gateway: { version: '0.12.1' } })
    render(<HauntedHouseApp />)

    const line = await screen.findByText(REACHABLE_LINE)
    expect(line.textContent).toBe(REACHABLE_LINE)
    expect(line).toHaveAttribute('aria-live', 'polite')
    expect(client.whoami).toHaveBeenCalledTimes(1)
    expect(client.whoami).toHaveBeenCalledWith(WHOAMI)
    // Reachable: the Foyer mounts and asks for the mansion list, once.
    expect(await screen.findByRole('heading', { name: 'Foyer' })).toBeInTheDocument()
    expect(client.mansions).toHaveBeenCalledTimes(1)
    expect(client.mansions).toHaveBeenCalledWith(MANSIONS)
    expect(client.get).toHaveBeenCalledTimes(2)
  })

  it('shows "Backend not reachable (HTTP 502)" and a Retry button that asks again', async () => {
    client.whoami
      .mockRejectedValueOnce({ status: 502, message: 'Bad Gateway' })
      .mockResolvedValueOnce({ backend: 'ok', gateway: { version: '0.12.1' } })
    render(<HauntedHouseApp />)

    const line = await screen.findByText('Backend not reachable (HTTP 502)')
    expect(line).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Bad Gateway')).toBeInTheDocument()
    expect(client.whoami).toHaveBeenCalledTimes(1)
    // Unreachable: no Foyer and no mansion request, so there is one retry path.
    expect(screen.queryByRole('heading', { name: 'Foyer' })).not.toBeInTheDocument()
    expect(client.mansions).not.toHaveBeenCalled()
    expect(client.get).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText(REACHABLE_LINE)).toHaveAttribute('aria-live', 'polite')
    expect(client.whoami).toHaveBeenCalledTimes(2)
    expect(client.whoami).toHaveBeenNthCalledWith(2, WHOAMI)
    expect(client.get).toHaveBeenNthCalledWith(2, WHOAMI)
    expect(await screen.findByRole('heading', { name: 'No mansions yet' })).toBeInTheDocument()
    expect(client.mansions).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })
})
