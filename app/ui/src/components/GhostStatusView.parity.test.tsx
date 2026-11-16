// Rendered live/replay parity (task 9.2). The same canonical records reach the
// Ghost_Status_View two ways: as backend acknowledgments of forwarded Crew
// callbacks (live), and from the recorded Event_Log through the replay
// stand-in. Both must render the same names, states, counts and reasons.
// **Validates: Requirements 8.2, 8.3, 10.4, 10.7**
import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import { GHOST_STATES } from '../core/ghost-state'
import { GHOST_STATE_LABELS, ghostRows } from '../core/ghost-status'
import { appEventToJson } from '../core/seance-event'
import { parseEventLog, projectEvents } from '../core/seance-log'

const LOG = parseEventLog(demo).events
const MANSION = 'demo-mansion'

interface Rendered {
  readonly rows: readonly { name: string | null; stateText: string | null; pendingText: string | null; reason: string | null; state: string | null }[]
  readonly announcements: readonly string[]
  /** The row sets shown along the way, without immediate repeats. */
  readonly history: readonly string[]
}

function readRows(container: HTMLElement): Rendered['rows'] {
  return Array.from(container.querySelectorAll('.hh-ghost'), (row) => ({
    name: row.querySelector('.hh-ghost-name')?.textContent ?? null,
    stateText: row.querySelector('.hh-ghost-state-text')?.textContent ?? null,
    pendingText: row.querySelector('.hh-ghost-pending')?.textContent ?? null,
    reason: row.querySelector('.hh-ghost-reason')?.textContent ?? null,
    state: row.getAttribute('data-state'),
  }))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.doUnmock('@kirocrew/app-sdk')
  vi.resetModules()
})

/** Live: every record arrives as the acknowledgment of one forwarded Crew callback. */
async function renderLive(): Promise<Rendered> {
  const handlers = new Map<string, (data: unknown) => void>()
  let acknowledged = 0
  const get = vi.fn(async () => ({ events: [], highest_sequence: 0 }))
  // The backend answers each ingest with the next canonical record.
  const post = vi.fn(async () => {
    const event = LOG[acknowledged]
    acknowledged += 1
    return { events: [appEventToJson(event)], highest_sequence: event.sequence, diagnostics: [] }
  })
  vi.doMock('@kirocrew/app-sdk', () => ({
    useAppApi: () => ({ get, post, put: vi.fn(), patch: vi.fn(), del: vi.fn() }),
    useAppEvents: (event: string, cb: (data: unknown) => void) => {
      useEffect(() => {
        handlers.set(event, cb)
        return () => {
          handlers.delete(event)
        }
      }, [event, cb])
      return () => {}
    },
    useTheme: () => ({ mode: 'dark', accent: '', colorTheme: 'default' }),
  }))
  const { MansionGhostStatus } = await import('./GhostStatusView')
  const announcements: string[] = []
  const view = render(<MansionGhostStatus mansionId={MANSION} onAnnounce={(message) => announcements.push(message)} />)
  await act(async () => {})

  const history: string[] = []
  for (let index = 0; index < LOG.length; index += 1) {
    // The callback data is opaque to the browser; only the acknowledgment counts.
    await act(async () => {
      handlers.get('chat_status')!({ slot: 'opaque', n: index })
    })
    await act(async () => {})
    const text = JSON.stringify(readRows(view.container))
    if (history.at(-1) !== text) history.push(text)
  }
  expect(post).toHaveBeenCalledTimes(LOG.length)
  const rows = readRows(view.container)
  view.unmount()
  return { rows, announcements, history }
}

/** Replay: the same records come from the recorded Event_Log through the SDK stand-in. */
async function renderReplay(): Promise<Rendered> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const fetchSpy = vi.fn(async () => new Response(demo, { status: 200 }))
  vi.stubGlobal('fetch', fetchSpy)
  vi.doMock('@kirocrew/app-sdk', () => import('../adapters/sdk-shim'))
  const shim = await import('../adapters/sdk-shim')
  const { MansionGhostStatus } = await import('./GhostStatusView')
  const announcements: string[] = []
  const view = render(<MansionGhostStatus mansionId={MANSION} onAnnounce={(message) => announcements.push(message)} />)

  const history: string[] = []
  // The Attic's Cursor presents the recording one record at a time. Nothing
  // polls a recording, so after each step the page is told to look again the
  // way a live page is: it became visible.
  for (let cursor = 1; cursor <= LOG.length; cursor += 1) {
    shim.replayRecording.present(MANSION, cursor)
    for (const state of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const text = JSON.stringify(readRows(view.container))
    if (history.at(-1) !== text) history.push(text)
  }
  expect(fetchSpy).toHaveBeenCalledTimes(1)
  const rows = readRows(view.container)
  view.unmount()
  return { rows, announcements, history }
}

describe('Ghost_Status_View: live acknowledgments and replay render the same thing', () => {
  it('shows equal names, states, pending counts and reasons for all six states', async () => {
    const live = await renderLive()
    vi.doUnmock('@kirocrew/app-sdk')
    vi.resetModules()
    const replay = await renderReplay()

    expect(live.rows).toEqual(replay.rows)
    // Both equal the Spec 2 fold of the canonical log.
    const folded = ghostRows(projectEvents(LOG).snapshots)
    expect(live.rows).toEqual(
      folded.map(({ name, stateText, pendingText, reason, state }) => ({ name, stateText, pendingText, reason, state })),
    )
    // All six states are on the page, each with its exact text.
    expect(new Set(live.rows.map((row) => row.state))).toEqual(new Set(GHOST_STATES))
    for (const row of live.rows) expect(row.stateText).toBe(GHOST_STATE_LABELS[row.state as keyof typeof GHOST_STATE_LABELS])

    // The same derived transitions were announced, in the same order.
    expect(live.announcements).toEqual(replay.announcements)
    expect(live.announcements).toHaveLength(5)

    // Replay never shows a view the live run did not, and never one out of order.
    let cursor = 0
    for (const view of replay.history) {
      const at = live.history.indexOf(view, cursor)
      expect(at).toBeGreaterThanOrEqual(cursor)
      cursor = at
    }
    expect(replay.history.at(-1)).toBe(live.history.at(-1))
    expect(replay.history.length).toBeGreaterThan(10)
  })
})
