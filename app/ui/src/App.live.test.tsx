import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HauntedHouseApp from './App'

// Mocks one level below App.states.test.tsx: the Crew SDK client itself, so
// the real useBackendStatus() and parseWhoami() run end to end. The SDK only
// exists inside the Crew dashboard, so the factory supplies the whole module.
const client = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@kirocrew/app-sdk', () => ({
  // A new client object per render, as the host may hand out, so the tests
  // also catch a hook that asks again on every render.
  useAppApi: () => ({ get: client.get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
  useAppEvents: () => () => {},
}))

const WHOAMI = '/apps/haunted-house/api/whoami'
const REACHABLE_LINE = 'Backend reachable · Gateway 0.12.1'

beforeEach(() => {
  client.get.mockReset()
})

describe('status page with the real status hook', () => {
  it('shows "Backend reachable · Gateway 0.12.1" when whoami answers with the gateway version', async () => {
    client.get.mockResolvedValueOnce({ backend: 'ok', gateway: { version: '0.12.1' } })
    render(<HauntedHouseApp />)

    const line = await screen.findByText(REACHABLE_LINE)
    expect(line.textContent).toBe(REACHABLE_LINE)
    expect(line).toHaveAttribute('aria-live', 'polite')
    expect(client.get).toHaveBeenCalledTimes(1)
    expect(client.get).toHaveBeenCalledWith(WHOAMI)
  })

  it('shows "Backend not reachable (HTTP 502)" and a Retry button that asks again', async () => {
    client.get
      .mockRejectedValueOnce({ status: 502, message: 'Bad Gateway' })
      .mockResolvedValueOnce({ backend: 'ok', gateway: { version: '0.12.1' } })
    render(<HauntedHouseApp />)

    const line = await screen.findByText('Backend not reachable (HTTP 502)')
    expect(line).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByText('Bad Gateway')).toBeInTheDocument()
    expect(client.get).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText(REACHABLE_LINE)).toHaveAttribute('aria-live', 'polite')
    expect(client.get).toHaveBeenCalledTimes(2)
    expect(client.get).toHaveBeenNthCalledWith(2, WHOAMI)
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })
})
