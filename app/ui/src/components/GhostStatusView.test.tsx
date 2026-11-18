// Ghost_Status_View accessibility and content tests (task 9.2).
// **Validates: Requirements 10.4, 10.5, 10.6, 10.8, 11.6**
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
// The six states show together at the recording's held moment (record 64).
import { heldMoment as demo } from '../test/held-moment'
import { INITIAL_SEANCE_STATE, type SeanceLiveState } from '../adapters/seance-live'
import { parseEventLog, projectEvents } from '../core/seance-log'
import viewSource from './GhostStatusView.tsx?raw'
import { GHOST_STATUS_STYLES, GhostStatusView } from './GhostStatusView'

const LOG = parseEventLog(demo).events

/** The state the bridge publishes after the first `count` records of the recording. */
function stateAt(count: number, patch: Partial<SeanceLiveState> = {}): SeanceLiveState {
  const projection = projectEvents(LOG.slice(0, count))
  return {
    ...INITIAL_SEANCE_STATE,
    loaded: true,
    highestSequence: count,
    snapshots: new Map(projection.snapshots.map((snapshot) => [snapshot.ghost_id, snapshot])),
    transitions: projection.transitions,
    ...patch,
  }
}

const rowsOf = (container: HTMLElement) =>
  within(container)
    .getAllByRole('listitem')
    .map((row) => ({
      ghost: row.getAttribute('data-ghost'),
      state: row.getAttribute('data-state'),
      name: row.querySelector('.hh-ghost-name')?.textContent,
      text: row.querySelector('.hh-ghost-state-text')?.textContent,
      pending: row.querySelector('.hh-ghost-pending')?.textContent ?? null,
      reason: row.querySelector('.hh-ghost-reason')?.textContent ?? null,
      icons: row.querySelectorAll('svg').length,
    }))

describe('GhostStatusView rows', () => {
  it('shows each of the six states as a name, an icon and the exact state text', () => {
    const { container } = render(<GhostStatusView state={stateAt(LOG.length)} />)

    expect(screen.getByRole('heading', { name: 'Ghosts' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Ghost states' })
    expect(rowsOf(list)).toEqual([
      { ghost: 'archivist', state: 'done', name: 'Archivist', text: 'Done', pending: null, reason: 'requirements.md is ready for review', icons: 1 },
      { ghost: 'draughtsman', state: 'done', name: 'Draughtsman', text: 'Done', pending: null, reason: 'design.md is ready for review', icons: 1 },
      { ghost: 'foreman', state: 'working', name: 'Foreman', text: 'Working', pending: null, reason: null, icons: 1 },
      { ghost: 'medium', state: 'idle', name: 'Medium', text: 'Idle', pending: null, reason: null, icons: 1 },
      { ghost: 'tinker-1', state: 'blocked', name: 'Tinker 1', text: 'Blocked', pending: null, reason: 'A door upstream is still sealed.', icons: 1 },
      { ghost: 'tinker-2', state: 'waiting', name: 'Tinker 2', text: 'Waiting', pending: '1 approval pending', reason: null, icons: 1 },
      { ghost: 'tinker-3', state: 'failed', name: 'Tinker 3', text: 'Failed', pending: null, reason: 'Crew error', icons: 1 },
    ])

    // State is never carried by color alone: each state has its own icon
    // shape, and the icon is decorative because the words say the same.
    const shapes = new Map<string, string>()
    for (const row of within(list).getAllByRole('listitem')) {
      const icon = row.querySelector('svg')!
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      shapes.set(row.getAttribute('data-state')!, icon.innerHTML)
    }
    expect(shapes.size).toBe(6)
    expect(new Set(shapes.values()).size).toBe(6)
    expect(container.querySelectorAll('[style]')).toHaveLength(0)
  })

  it('uses the names it is given', () => {
    render(<GhostStatusView state={stateAt(3)} ghostNames={{ archivist: 'The Archivist' }} />)
    expect(screen.getByText('The Archivist')).toBeInTheDocument()
    expect(screen.queryByText('Archivist')).not.toBeInTheDocument()
  })

  it('renders ghost text as text, never as markup', () => {
    const state = stateAt(3)
    const archivist = state.snapshots.get('archivist')!
    const hostile = { ...archivist, reason: '<img src=x onerror=alert(1)> <b>bold</b>' }
    const { container } = render(
      <GhostStatusView
        state={{ ...state, snapshots: new Map([['archivist', hostile]]) }}
        ghostNames={{ archivist: '<script>alert(1)</script>' }}
      />,
    )
    expect(container.querySelector('img, script, b')).toBeNull()
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
  })
})

describe('GhostStatusView loading, catching-up, diagnostic and empty states', () => {
  it('says it is loading before the first canonical read, and shows no rows or empty claim', () => {
    const { container } = render(<GhostStatusView state={{ ...INITIAL_SEANCE_STATE, catchingUp: true }} />)
    expect(screen.getByText('Loading the séance log…')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText(/No ghost has stirred/)).not.toBeInTheDocument()
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'true')
  })

  it('says a loaded mansion with no events is empty', () => {
    const { container } = render(<GhostStatusView state={{ ...INITIAL_SEANCE_STATE, loaded: true }} />)
    expect(screen.getByText('No ghost has stirred in this mansion yet.')).toBeInTheDocument()
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument()
    expect(container.querySelector('section')).toHaveAttribute('aria-busy', 'false')
  })

  it('marks the stream as catching up without changing any ghost state', () => {
    const current = render(<GhostStatusView state={stateAt(20)} />)
    const before = rowsOf(current.container)
    current.unmount()

    const { container } = render(<GhostStatusView state={stateAt(20, { catchingUp: true })} />)
    expect(screen.getByText('Catching up with the séance log…')).toBeInTheDocument()
    expect(rowsOf(container)).toEqual(before)
  })

  it('shows a persistence diagnostic in plain words and keeps the last rows', () => {
    const diagnostic = { code: 'persistence_failed', safe_detail: 'The backend did not confirm the latest ghost activity. Trying again.' } as const
    const { container } = render(<GhostStatusView state={stateAt(20, { diagnostic })} />)
    expect(screen.getByText(diagnostic.safe_detail)).toBeInTheDocument()
    expect(rowsOf(container)).toHaveLength(stateAt(20).snapshots.size)
  })

  it('shows only the diagnostic when the first read failed', () => {
    render(
      <GhostStatusView
        state={{ ...INITIAL_SEANCE_STATE, diagnostic: { code: 'hash_mismatch', safe_detail: 'record_hash_mismatch', line: 7 } }}
      />,
    )
    expect(
      screen.getByText('The séance log failed its integrity check at line 7. Showing only the records before it.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/record_hash_mismatch/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No ghost has stirred/)).not.toBeInTheDocument()
  })
})

describe('GhostStatusView announcements', () => {
  /** Applies the recording one record at a time and collects what was announced. */
  function narrate(onAnnounce?: (message: string) => void) {
    const view = render(<GhostStatusView state={{ ...INITIAL_SEANCE_STATE, loaded: true }} onAnnounce={onAnnounce} />)
    const regionTexts: string[] = []
    for (let count = 1; count <= LOG.length; count += 1) {
      view.rerender(<GhostStatusView state={stateAt(count)} onAnnounce={onAnnounce} />)
      const region = view.container.querySelector('[aria-live]')
      if (region && region.textContent !== '' && regionTexts.at(-1) !== region.textContent) {
        regionTexts.push(region.textContent ?? '')
      }
    }
    return { view, regionTexts }
  }

  const EXPECTED = [
    'Archivist is waiting for your approval.',
    'Foreman failed: Artifact invalid',
    'Tinker 1 is blocked: A door upstream is still sealed.',
    'Tinker 2 is waiting for your approval.',
    'Tinker 3 failed: Crew error',
  ]

  it('hands the page one announcement per transition into waiting, blocked or failed', () => {
    const onAnnounce = vi.fn()
    const { view } = narrate(onAnnounce)

    expect(onAnnounce.mock.calls.map(([message]) => message)).toEqual(EXPECTED)
    // With the page's region in use, the view adds none of its own.
    expect(view.container.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]')).toHaveLength(0)

    // Re-rendering the same state, or a state object rebuilt from the same records, repeats nothing.
    view.rerender(<GhostStatusView state={stateAt(LOG.length)} onAnnounce={onAnnounce} />)
    view.rerender(<GhostStatusView state={stateAt(LOG.length, { catchingUp: true })} onAnnounce={onAnnounce} />)
    expect(onAnnounce).toHaveBeenCalledTimes(EXPECTED.length)
  })

  it('never announces a transition into working, done or idle', () => {
    const onAnnounce = vi.fn()
    narrate(onAnnounce)
    for (const [message] of onAnnounce.mock.calls) {
      expect(message).not.toMatch(/working|done|idle|Draughtsman|Medium/i)
    }
    // The Archivist finishing (record 18) and the Draughtsman's whole run (records 21 to 35),
    // with the Door and phase records between them, are ambient.
    const quiet = vi.fn()
    const view = render(<GhostStatusView state={stateAt(17)} onAnnounce={quiet} />)
    quiet.mockClear()
    for (let count = 18; count <= 35; count += 1) {
      view.rerender(<GhostStatusView state={stateAt(count)} onAnnounce={quiet} />)
    }
    expect(quiet).not.toHaveBeenCalled()
    expect(stateAt(17).snapshots.get('archivist')?.state).toBe('working')
    expect(stateAt(18).snapshots.get('archivist')?.state).toBe('done')
    expect(stateAt(35).snapshots.get('draughtsman')?.state).toBe('done')
  })

  it('uses exactly one polite live region of its own when the page gives it none', () => {
    const { view, regionTexts } = narrate()
    const regions = view.container.querySelectorAll('[aria-live]')
    expect(regions).toHaveLength(1)
    expect(regions[0]).toHaveAttribute('aria-live', 'polite')
    expect(view.container.querySelectorAll('[role="alert"], [role="status"], [role="log"], [aria-live="assertive"]')).toHaveLength(0)
    expect(regionTexts).toEqual(EXPECTED)
  })

  it('reads out, once and merged, the ghosts that already need the owner when a mansion opens', () => {
    const onAnnounce = vi.fn()
    render(<GhostStatusView state={stateAt(LOG.length)} onAnnounce={onAnnounce} />)
    expect(onAnnounce).toHaveBeenCalledTimes(1)
    expect(onAnnounce.mock.calls[0][0]).toBe(
      '3 ghosts need you. Tinker 1 is blocked: A door upstream is still sealed. ' +
        'Tinker 2 is waiting for your approval. Tinker 3 failed: Crew error',
    )
  })
})

describe('GhostStatusView stays provisional', () => {
  it('contains only rows and status notes: no toast, sound, room map or chat panel', () => {
    const { container } = render(<GhostStatusView state={stateAt(LOG.length, { catchingUp: true })} />)

    expect(
      container.querySelectorAll(
        'audio, video, canvas, nav, iframe, form, input, textarea, button, a, dialog, [role="dialog"], [role="navigation"], [role="log"], [role="alert"], [role="tablist"], [contenteditable]',
      ),
    ).toHaveLength(0)
    // One section, one heading, one list, the notes, and the hidden region.
    expect(container.querySelectorAll('section')).toHaveLength(1)
    expect(container.querySelectorAll('ul')).toHaveLength(1)

    // No toast, badge or sound API, no room or chat component, no SDK use.
    expect(viewSource).not.toMatch(/useNotify|useNavBadge|new Audio|AudioContext|\.play\(|speechSynthesis/)
    expect(viewSource).not.toMatch(/from '.*(rooms|chat|map)/i)
    expect(viewSource).not.toMatch(/@kirocrew|adapters\/sdk'/)
  })

  it('styles with Crew theme variables and one slow, optional animation', () => {
    expect(GHOST_STATUS_STYLES).toContain('var(--card-fg')
    expect(GHOST_STATUS_STYLES).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
    // The only motion is the working spinner: 2 s per turn, off under reduced motion or Still house.
    expect(GHOST_STATUS_STYLES.match(/animation:/g)).toHaveLength(1)
    expect(GHOST_STATUS_STYLES).toMatch(/prefers-reduced-motion: no-preference/)
    expect(GHOST_STATUS_STYLES).toMatch(/hh-ghost-spin 2s linear infinite/)
    const { container } = render(<GhostStatusView state={stateAt(3)} stillHouse />)
    expect(container.querySelector('section')).toHaveAttribute('data-still', 'true')
  })
})
