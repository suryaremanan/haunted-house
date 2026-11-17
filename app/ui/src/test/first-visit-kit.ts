// Helpers for page-level tests that start at the Gate (Spec 8, Requirement 9).
// A visitor with no mansion yet, and every visitor of a recording, sees the
// Gate first: the Foyer hall is mounted and reading its list, but put away
// until they knock. Not shipped.
import { fireEvent, screen } from '@testing-library/react'
import { GATE_QUESTION, KNOCK_LABEL } from '../core/first-visit'

/** Waits for the Gate and knocks, with a name if one is given. The Foyer hall is on show afterwards. */
export async function knock(name = ''): Promise<void> {
  const button = await screen.findByRole('button', { name: KNOCK_LABEL })
  if (name !== '') fireEvent.change(screen.getByLabelText(GATE_QUESTION), { target: { value: name } })
  fireEvent.click(button)
}

/** True while the Gate is on show. */
export function atGate(container: ParentNode = document): boolean {
  return container.querySelector('[data-gate-screen]') !== null
}
