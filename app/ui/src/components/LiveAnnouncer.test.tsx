// The one polite live region (Spec 6 task 5.6).
// **Validates: Requirements 4.4, 4.5, 4.6**
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { liveRegions } from '../rooms/foyer/foyer-test-kit'
import { LiveAnnouncer } from './LiveAnnouncer'

describe('LiveAnnouncer', () => {
  it('is one polite, atomic region holding exactly the message', () => {
    const { container } = render(<LiveAnnouncer message="Tinker 2 is blocked." />)
    const regions = liveRegions(container)
    expect(regions).toHaveLength(1)
    expect(regions[0]).toHaveAttribute('aria-live', 'polite')
    expect(regions[0]).toHaveAttribute('aria-atomic', 'true')
    expect(regions[0]).toHaveTextContent(/^Tinker 2 is blocked\.$/)
    expect(regions[0]).not.toHaveAttribute('role')
  })

  it('is empty until something is said', () => {
    const { container } = render(<LiveAnnouncer message="" />)
    expect(liveRegions(container)[0]).toHaveTextContent('')
  })

  it('keeps the region element and replaces its text node on each turn, so repeated words are said again', () => {
    const { container, rerender } = render(<LiveAnnouncer message="Tinker 1 failed." turn={1} />)
    const region = liveRegions(container)[0]
    const first = region.firstElementChild
    rerender(<LiveAnnouncer message="Tinker 1 failed." turn={1} />)
    expect(region.firstElementChild).toBe(first)
    rerender(<LiveAnnouncer message="Tinker 1 failed." turn={2} />)
    expect(liveRegions(container)[0]).toBe(region)
    expect(region.firstElementChild).not.toBe(first)
    expect(region).toHaveTextContent('Tinker 1 failed.')
  })
})
