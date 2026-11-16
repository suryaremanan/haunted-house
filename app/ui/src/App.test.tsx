import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HauntedHouseApp from './App'

// @kirocrew/app-sdk only exists inside the Crew dashboard, so the adapter is
// replaced here. Per-state DOM tests of the status page live in task 9.3.
vi.mock('./adapters/sdk', () => ({
  useBackendStatus: () => ({ state: { kind: 'loading' }, retry: () => {} }),
  // The live app: no replay recording.
  REPLAY_RECORDING: null,
}))

describe('HauntedHouseApp', () => {
  it('renders the status panel with Backend and Gateway rows while checking', () => {
    render(<HauntedHouseApp />)
    expect(screen.getByRole('heading', { name: 'Haunted House' })).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual(['BackendChecking…', 'GatewayChecking…'])
    expect(screen.getByText('Checking the backend…')).toHaveAttribute('aria-live', 'polite')
  })
})
