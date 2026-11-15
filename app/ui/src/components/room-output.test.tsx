// Shared room output components in the DOM (Spec 5 tasks 9.2 and 9.7).
// **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.8, 12.1, 12.5, 12.6**
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GHOST_STATES } from '../core/ghost-state'
import { GHOST_STATE_LABELS } from '../core/ghost-status'
import { VALIDATION_TEXT, type RunView } from '../core/room-view'
import { liveRegions } from '../rooms/foyer/foyer-test-kit'
import {
  CANNOT_DECIDE,
  REQUIREMENTS_WAITING,
  artifact,
  document,
  joinRoom,
  requirementsWritten,
  roomGhosts,
  run,
  snapshot,
  workshopAtWork,
} from '../test/room-kit'
import { SHA_A, SHA_B } from '../test/workflow-arbitraries'
import { ArtifactView } from './ArtifactView'
import { GhostOutputSummary } from './GhostOutputSummary'
import { MarkdownView } from './MarkdownView'
import { ROOM_OUTPUT_STYLES } from './room-output-styles'
import { RunRecoveryControls } from './RunRecoveryControls'
import { SESSION_LINK_NO_HOST, SessionLink } from './SessionLink'

const study = (options: Parameters<typeof joinRoom>[1] = {}) => joinRoom('study', { workflow: REQUIREMENTS_WAITING, answer: requirementsWritten(), ...options })

describe('ArtifactView', () => {
  it('shows the document text first, then validation, findings, exact digest and write scope', () => {
    const findings = [{ code: 'ears_pattern_missing', location: 'criterion:1.2', message: 'This criterion matches no EARS pattern.' }]
    const room = study({ answer: requirementsWritten({ documents: [document('requirements', { artifact: artifact({ validated: false, findings }) }), document('design'), document('tasks')] }) })
    const { container } = render(<ArtifactView view={room.documents[0]} />)
    const article = screen.getByRole('article', { name: 'Requirements document' })
    expect(article).toHaveAttribute('data-validation', 'invalid')

    const text = within(article).getByRole('region', { name: 'Requirements document text' })
    expect(text).toHaveAttribute('tabindex', '0')
    expect(within(text).getByRole('heading', { name: 'Requirements Document' })).toBeInTheDocument()
    expect(text).toHaveTextContent('THE Guest_Book SHALL keep entries in insertion order.')

    const validation = article.querySelector('[data-validation-line]')!
    expect(validation).toHaveTextContent("Not valid: it failed the house's checks. 1 finding:")
    expect(validation.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    const list = within(article).getByRole('list', { name: 'Requirements document findings' })
    expect(within(list).getByRole('listitem')).toHaveTextContent('criterion:1.2: This criterion matches no EARS pattern. (ears_pattern_missing)')

    expect(article.querySelector('[data-digest]')).toHaveTextContent(SHA_A)
    expect(article).toHaveTextContent('Revision 1 (1,200 bytes)')
    const scope = within(article).getByRole('list', { name: /may write/i })
    expect(within(scope).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['.kiro/specs/demo/requirements.md'])

    // Document order: text, then validation, then findings, then facts.
    const order = [text, validation, list, article.querySelector('dl')!]
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // Nothing to press, nothing to type, and no live region of its own.
    expect(within(article).queryAllByRole('button')).toEqual([])
    expect(within(article).queryAllByRole('textbox')).toEqual([])
    expect(liveRegions(container)).toEqual([])
  })

  it.each(Object.entries(VALIDATION_TEXT))('says the %s state in words next to an icon', (state, text) => {
    const answers = {
      unwritten: { workflow: undefined, answer: roomGhosts() },
      valid: { workflow: REQUIREMENTS_WAITING, answer: requirementsWritten() },
      invalid: { workflow: undefined, answer: requirementsWritten({ documents: [document('requirements', { artifact: artifact({ validated: false }) }), document('design'), document('tasks')] }) },
      unknown: { workflow: REQUIREMENTS_WAITING, answer: null },
    }[state as keyof typeof VALIDATION_TEXT]
    const room = joinRoom('study', answers)
    render(<ArtifactView view={room.documents[0]} />)
    const line = screen.getByRole('article').querySelector('[data-validation-line]')!
    expect(line).toHaveTextContent(text)
    expect(line.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)
  })

  it('says why there is no text instead of showing an empty box', () => {
    render(<ArtifactView view={joinRoom('study').documents[0]} />)
    const article = screen.getByRole('article', { name: 'Requirements document' })
    expect(article).toHaveTextContent('Nothing has been written here yet.')
    expect(within(article).queryByRole('region')).toBeNull()
    expect(article.querySelector('[data-digest]')).toBeNull()
    expect(article).toHaveTextContent('.kiro/specs/demo/requirements.md')
  })

  it('warns when the text shown is not the revision the door proposal covers', () => {
    const other = requirementsWritten({ documents: [document('requirements', { artifact: artifact({ artifactRevision: { revision: 2, sha256: SHA_B, sizeBytes: 1300 } }) }), document('design'), document('tasks')] })
    render(<ArtifactView view={study({ answer: other }).documents[0]} />)
    expect(screen.getByRole('article').querySelector('[data-door-note]')).toHaveTextContent('The text shown is revision 2. The door proposal covers revision 1')
  })
})

describe('MarkdownView', () => {
  it('renders document markup as text, never as elements', () => {
    const hostile = '# Title\n\n<img src=x onerror="window.__pwned = 1"> <script>window.__pwned = 1</script>\n\n[click me](javascript:alert(1))\n'
    const { container } = render(
      <div className="hh-document">
        <MarkdownView text={hostile} />
      </div>,
    )
    expect(container.querySelectorAll('img, script, a, iframe, object, embed, form, input, button')).toHaveLength(0)
    expect(container).toHaveTextContent('<img src=x onerror="window.__pwned = 1">')
    expect(container).toHaveTextContent('[click me](javascript:alert(1))')
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('places document headings below the panel headings and reads checkboxes in words', () => {
    render(<MarkdownView text={'# Plan\n\n## Tasks\n\n- [x] 1.1 Model\n- [ ]* 1.3 Property test\n- plain\n1. first'} />)
    expect(screen.getByRole('heading', { name: 'Plan' })).toHaveAttribute('aria-level', '6')
    expect(screen.getByRole('heading', { name: 'Tasks' })).toHaveAttribute('aria-level', '7')
    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Done: 1.1 Model', 'Open, optional: 1.3 Property test (optional)', '•plain', '1.1. first'])
    expect(items[0]).toHaveAttribute('data-checked', 'true')
    // The checkbox is drawn, not operable: reading a document changes nothing.
    expect(screen.queryAllByRole('checkbox')).toEqual([])
  })

  it('says when a document is longer than it shows', () => {
    const long = Array.from({ length: 1600 }, (_, index) => `# H${index}`).join('\n')
    render(<MarkdownView text={long} />)
    expect(screen.getByText(/longer than this view shows/)).toBeInTheDocument()
  })
})

describe('GhostOutputSummary', () => {
  it.each(GHOST_STATES)('shows the %s state as its label next to one icon', (state) => {
    const room = study({ snapshots: [snapshot('archivist', state, 'requirements-1')] })
    const { container } = render(<GhostOutputSummary run={room.runs[0]} />)
    const line = container.querySelector('.hh-room-line')!
    expect(line).toHaveTextContent(`Archivist: ${GHOST_STATE_LABELS[state]}. Attempt 1 of 3.`)
    expect(line.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)
    expect(container.querySelector('.hh-run')).toHaveAttribute('data-state', state)
    expect(liveRegions(container)).toEqual([])
  })

  it('shows the Ghost_Result summary, the failure reason and the task claim', () => {
    const answer = { ...workshopAtWork(), runs: [run({ ...workshopAtWork().runs[0], summary: 'Stored entries in a list.', reasonCode: 'artifact_invalid' })] }
    const room = joinRoom('workshop', { answer, snapshots: [snapshot('tinker-1', 'failed', 'task-1-2-a1')] })
    const { container } = render(<GhostOutputSummary run={room.runs[0]} />)
    expect(container).toHaveTextContent('Tinker 1: Failed, task 1.2. Attempt 1 of 3.')
    expect(container.querySelector('[data-summary]')).toHaveTextContent('Stored entries in a list.')
    expect(container.querySelector('[data-reason]')).toHaveTextContent('Artifact invalid')
    expect(container.querySelector('[data-claim]')).toHaveTextContent('This run may write only: src/guestbook/store.py')
  })

  it('marks an earlier run without borrowing a newer state', () => {
    const room = study({ snapshots: [snapshot('archivist', 'working', 'requirements-2')] })
    const { container } = render(<GhostOutputSummary run={room.runs[0]} />)
    expect(container).toHaveTextContent('Archivist: Earlier run. Attempt 1 of 3.')
    expect(container.querySelector('.hh-spin')).toBeNull()
  })
})

describe('SessionLink', () => {
  const linked = (overrides: Partial<Parameters<typeof run>[0]> = {}) =>
    study({ answer: requirementsWritten({ runs: [run({ sessionLink: 'hh-archivist-requirements-1', ...overrides })] }), snapshots: [snapshot('archivist', 'done', 'requirements-1')] }).runs[0]

  it('is labeled with the ghost and run status and opens exactly that existing slot', () => {
    const onOpen = vi.fn()
    render(<SessionLink view={linked().sessionLink} onOpen={onOpen} />)
    const button = screen.getByRole('button', { name: "Open Archivist's Crew session (Done)" })
    expect(button).toHaveAttribute('aria-disabled', 'false')
    expect(button).toHaveAttribute('data-slot', 'hh-archivist-requirements-1')
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith('hh-archivist-requirements-1')
  })

  it('stays visible and off, with the reason, while the contract is unavailable', () => {
    const onOpen = vi.fn()
    render(<SessionLink view={linked({ sessionLink: null }).sessionLink} onOpen={onOpen} />)
    const button = screen.getByRole('button', { name: "Open Archivist's Crew session (Done)" })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription(/not available yet/)
    expect(button).not.toHaveAttribute('data-slot')
    fireEvent.click(button)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('is off on a host without the launcher, and never falls back to another way of opening a chat', () => {
    const { container } = render(<SessionLink view={linked().sessionLink} onOpen={null} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription(SESSION_LINK_NO_HOST)
    fireEvent.click(button)
    expect(container.querySelectorAll('a[href]')).toHaveLength(0)
  })

  it('is off on a recording', () => {
    const onOpen = vi.fn()
    const view = study({ answer: requirementsWritten({ readOnly: true, runs: [run({ sessionLink: 'hh-archivist-requirements-1' })] }) }).runs[0].sessionLink
    render(<SessionLink view={view} onOpen={onOpen} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAccessibleDescription(/recording/)
    fireEvent.click(button)
    expect(onOpen).not.toHaveBeenCalled()
  })
})

describe('RunRecoveryControls', () => {
  const working = (options: Parameters<typeof joinRoom>[1] = {}): RunView =>
    joinRoom('workshop', { answer: workshopAtWork(), snapshots: [snapshot('tinker-1', 'working', 'task-1-2-a1')], ...options }).runs[0]
  const failed = (attempt: number, canRetry: boolean, options: Parameters<typeof joinRoom>[1] = {}): RunView =>
    joinRoom('study', { answer: roomGhosts({ runs: [run({ attempt, canRetry })] }), snapshots: [snapshot('archivist', 'failed', 'requirements-1')], ...options }).runs[0]

  it('renders nothing for a run with nothing to recover', () => {
    const { container } = render(<RunRecoveryControls run={study().runs[0]} onSend={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('cancels only on a press, with the exact run and version', () => {
    const onSend = vi.fn()
    render(<RunRecoveryControls run={working()} onSend={onSend} />)
    const cancel = screen.getByRole('button', { name: "Cancel Tinker 1's run" })
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.click(cancel)
    expect(onSend).toHaveBeenCalledWith({ kind: 'cancel_run', runId: 'task-1-2-a1', expectedVersion: 10 })
  })

  it('retries only on a press, and offers no cancel for an ended run', () => {
    const onSend = vi.fn()
    render(<RunRecoveryControls run={failed(2, true)} onSend={onSend} />)
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry with a fresh session' }))
    expect(onSend).toHaveBeenCalledWith({ kind: 'retry_run', runId: 'requirements-1', expectedVersion: 10 })
  })

  it('keeps a control focusable but off, with its reason, when the gate is closed', () => {
    const onSend = vi.fn()
    render(<RunRecoveryControls run={working({ authority: CANNOT_DECIDE })} onSend={onSend} />)
    const cancel = screen.getByRole('button', { name: "Cancel Tinker 1's run" })
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    expect(cancel).not.toBeDisabled()
    expect(cancel).toHaveAccessibleDescription(CANNOT_DECIDE.text!)
    fireEvent.click(cancel)
    fireEvent.keyDown(cancel, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows a requested cancellation as pending and sends no second one', () => {
    const onSend = vi.fn()
    const answer = { ...workshopAtWork(), runs: [run({ ...workshopAtWork().runs[0], canCancel: false, cancelRequested: true })] }
    render(<RunRecoveryControls run={working({ answer })} onSend={onSend} />)
    const pending = screen.getByRole('button', { name: 'Cancelling…' })
    expect(pending).toHaveAccessibleDescription(/Waiting for Crew to confirm/)
    fireEvent.click(pending)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows the control as busy while its own command is on its way', () => {
    render(<RunRecoveryControls run={working({ inFlight: 'run:task-1-2-a1' })} onSend={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Sending…' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('says that a run out of attempts will not retry on its own', () => {
    render(<RunRecoveryControls run={failed(3, false)} onSend={vi.fn()} />)
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.getByText('All 3 attempts are used. Nothing retries on its own.')).toBeInTheDocument()
  })
})

describe('room output styles', () => {
  it('uses Crew theme variables with fallbacks, a focus ring, and no animation of its own', () => {
    expect(ROOM_OUTPUT_STYLES).toContain('var(--border, currentColor)')
    expect(ROOM_OUTPUT_STYLES).toContain('.hh-document:focus-visible { outline: 2px solid var(--ring, currentColor)')
    expect(ROOM_OUTPUT_STYLES).not.toMatch(/animation|transition|@keyframes/)
    // No color of our own: only theme variables, currentColor, inherit or transparent.
    expect(ROOM_OUTPUT_STYLES).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/)
  })
})
