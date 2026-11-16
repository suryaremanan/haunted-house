// The Attic panel in the DOM (replay-and-submission task 4.3): every state,
// every control, the reading order, the non-color current cue, what is and is
// not announced, motion, and the read-only guarantees.
// **Validates: Requirements 1.4, 1.5, 2.1, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.3, 4.5, 4.8**
import { act, fireEvent, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { buildReplayModel, parseCanonicalLog, replayFoldFor } from '../../core/replay-timeline'
import { ATTIC_STYLES } from './attic-styles'
import { DEMO, FIXTURE_URL, LOG, MANSION, TOTAL, cleanupAttic, mountAttic } from './attic-test-kit'

afterEach(cleanupAttic)

const MODEL = buildReplayModel(parseCanonicalLog(DEMO))
const FOLD = replayFoldFor(MODEL)
const press = (element: HTMLElement) => act(() => fireEvent.click(element))
const seek = (range: HTMLInputElement, cursor: number) => act(() => fireEvent.change(range, { target: { value: String(cursor) } }))
const textOf = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

describe('Attic panel: states', () => {
  it('opens paused at the start of the recording and does not play by itself', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    expect(attic.replay()).toMatchObject({ mode: 'replay', readOnly: true, source: 'ready' })
    expect(attic.replay().state).toMatchObject({ status: 'paused', cursor: 0, speed: 1 })
    expect(textOf(attic.root().querySelector('.hh-attic-status'))).toBe(`Paused at the start. Start of replay. ${TOTAL} events recorded.`)
    expect(attic.playButton()).toHaveTextContent('Play')
    expect(attic.range()).toHaveAttribute('aria-valuetext', 'Start of replay')
    expect(attic.range()).toHaveAttribute('max', String(TOTAL))
    expect(attic.speed('1×')).toBeChecked()
    expect(attic.entries()).toHaveLength(TOTAL)
    expect(attic.current()).toBeNull()

    await attic.advance(10 * 60_000)
    expect(attic.replay().state).toMatchObject({ status: 'paused', cursor: 0 })
    expect(attic.announcements).toEqual([])
    expect(attic.fetchSpy).toHaveBeenCalledTimes(1)
    expect(attic.fetchSpy).toHaveBeenCalledWith(FIXTURE_URL)
    expect(attic.unexpected).toEqual([])
  })

  it('shows the fold of the prefix in the middle, with the current entry marked in words and shape', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    seek(attic.range(), 20)
    const state = attic.replay().state
    expect(state).toMatchObject({ status: 'paused', cursor: 20 })
    expect(state.projection).toEqual(FOLD(MODEL.records.slice(0, 20)))
    expect(attic.range()).toHaveAttribute('aria-valuetext', `Event 20 of ${TOTAL}`)
    expect(textOf(attic.root().querySelector('.hh-attic-status'))).toBe(`Paused. Event 20 of ${TOTAL}. ${TOTAL} events recorded.`)
    expect(attic.playButton()).toHaveTextContent('Resume')

    // Exactly one current entry: aria-current, the words, and an icon; color is not the cue.
    const current = attic.root().querySelectorAll('[aria-current]')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute('aria-current', 'step')
    expect(current[0]).toHaveAttribute('data-position', '20')
    expect(textOf(current[0])).toBe(`20. Now showing. ${MODEL.timeline[19].actorLabel}: ${MODEL.timeline[19].summary}`)
    expect(current[0].querySelector('svg')).not.toBeNull()
    expect(attic.root().querySelectorAll('svg[aria-hidden="true"]').length).toBe(attic.root().querySelectorAll('svg').length)
    expect(ATTIC_STYLES).toMatch(/\.hh-attic-entry\[aria-current='step'\] \{[^}]*font-weight: 700;[^}]*border-left: 6px double/)
    expect(attic.entries().filter((entry) => entry.dataset.played === 'true')).toHaveLength(20)

    // The summary names the record and the workflow state of that prefix.
    expect(textOf(attic.root().querySelector('[data-attic="current"]'))).toBe(
      `${MODEL.timeline[19].actorLabel}: ${MODEL.timeline[19].summary}`,
    )
    const workflow = state.projection.workflows[0]
    expect(
      Array.from(attic.root().querySelectorAll<HTMLElement>('[data-attic="summary"] [data-phase]'), (line) => [
        line.dataset.phase,
        line.dataset.status,
        line.dataset.door,
      ]),
    ).toEqual(workflow.phases.map((phase) => [phase.phase, phase.status, phase.door.status]))
  })

  it('completes at the last event with the full fold, and offers Restart', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    seek(attic.range(), TOTAL)
    expect(attic.replay().state).toMatchObject({ status: 'complete', cursor: TOTAL })
    expect(attic.replay().state.projection).toEqual(FOLD(MODEL.records))
    expect(textOf(attic.root().querySelector('.hh-attic-status'))).toContain('Replay complete.')
    // Play stays on at the end: it starts the replay again from the beginning.
    expect(attic.playButton()).toHaveAttribute('aria-disabled', 'false')
    expect(attic.playButton()).toHaveTextContent('Play')
    expect(attic.button('next')).toHaveAttribute('aria-disabled', 'true')
    expect(attic.button('restart')).toHaveAttribute('aria-disabled', 'false')
    // A control that is off does nothing.
    press(attic.button('next'))
    expect(attic.replay().state).toMatchObject({ status: 'complete', cursor: TOTAL })

    press(attic.button('restart'))
    expect(attic.replay().state).toMatchObject({ status: 'paused', cursor: 0 })
    expect(attic.current()).toBeNull()
  })

  it('shows an empty log as a valid paused start with every control off and no error', async () => {
    const attic = await mountAttic({ mode: 'replay', text: '' })
    expect(attic.replay()).toMatchObject({ source: 'ready', state: { status: 'paused', cursor: 0 } })
    expect(textOf(attic.root().querySelector('.hh-attic-status'))).toBe('Paused at the start. Start of replay. No events recorded.')
    expect(attic.root().querySelector('[data-attic="timeline-empty"]')).toHaveTextContent('nothing to replay')
    for (const action of ['restart', 'previous', 'next']) expect(attic.button(action)).toHaveAttribute('aria-disabled', 'true')
    expect(attic.playButton()).toHaveAttribute('aria-disabled', 'true')
    expect(attic.range()).toHaveAttribute('aria-disabled', 'true')
    expect(attic.root().querySelector('[data-attic="diagnostics-empty"]')).not.toBeNull()
    press(attic.playButton())
    expect(attic.replay().state.status).toBe('paused')
    expect(attic.announcements).toEqual([])
  })

  it('lists a malformed line by number and replays every valid record', async () => {
    const lines = DEMO.split('\n')
    lines.splice(4, 0, '{"password": "hunter2-PLANTED", "path": "/Users/someone/secret"}')
    const attic = await mountAttic({ mode: 'replay', text: lines.join('\n') })
    const diagnostics = attic.root().querySelector('[data-attic="diagnostics"]')!
    expect(textOf(diagnostics)).toBe('Line 5: A record could not be read and was left out.')
    expect(attic.root().textContent).not.toContain('PLANTED')
    expect(attic.root().textContent).not.toContain('/Users/')
    expect(attic.replay().upstream.integrity).not.toBe('valid')
    // The valid prefix still plays.
    expect(attic.entries().length).toBeGreaterThan(0)
    seek(attic.range(), attic.entries().length)
    expect(attic.replay().state.status).toBe('complete')
  })

  it('reports a recording that could not be loaded with fixed copy, an empty replay, and no second request', async () => {
    const attic = await mountAttic({ mode: 'replay', failWith: 404 })
    expect(attic.replay()).toMatchObject({ source: 'error', state: { status: 'paused', cursor: 0 } })
    expect(textOf(attic.root().querySelector('[data-attic="diagnostics"]'))).toBe('The replay recording could not be loaded.')
    expect(attic.announcements).toEqual(['The replay recording could not be loaded.'])
    expect(attic.entries()).toHaveLength(0)
    expect(attic.playButton()).toHaveAttribute('aria-disabled', 'true')
    await attic.advance(60_000)
    expect(attic.fetchSpy).toHaveBeenCalledTimes(1)
    expect(attic.unexpected).toEqual([])
  })

  it('keeps the last valid state and says why when a command is refused', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    seek(attic.range(), 7)
    const before = attic.replay().state
    act(() => attic.replay().command({ kind: 'seek', cursor: TOTAL + 5 }))
    expect(attic.replay().state).toMatchObject({ cursor: 7, status: 'paused', commandError: { code: 'invalid_cursor' } })
    expect(attic.replay().state.projection).toBe(before.projection)
    expect(textOf(attic.root().querySelector('[data-attic="diagnostics"]'))).toBe('That position is not an event of this replay.')
    expect(attic.announcements).toEqual(['That position is not an event of this replay.'])
    expect(attic.button('restart')).toHaveAttribute('aria-disabled', 'false')
    // The next accepted command clears it.
    press(attic.button('next'))
    expect(attic.root().querySelector('[data-attic="diagnostics"]')).toBeNull()
  })
})

describe('Attic panel: controls', () => {
  it('plays, pauses and resumes from one control that keeps the focus', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    const play = attic.playButton()
    play.focus()
    press(play)
    expect(attic.replay().state).toMatchObject({ status: 'playing', cursor: 0 })
    expect(attic.playButton()).toBe(play)
    expect(play).toHaveTextContent('Pause')
    expect(play).toHaveFocus()

    await attic.advance(0)
    expect(attic.replay().state.cursor).toBe(1)
    press(play)
    expect(attic.replay().state).toMatchObject({ status: 'paused', cursor: 1 })
    expect(play).toHaveTextContent('Resume')
    await attic.advance(60_000)
    expect(attic.replay().state.cursor).toBe(1)

    press(play)
    expect(attic.replay().state.status).toBe('playing')
    expect(play).toHaveFocus()
    await attic.playOut()
    expect(attic.replay().state.projection).toEqual(FOLD(MODEL.records))
  })

  it('steps one event back and forth and restarts', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    expect(attic.button('previous')).toHaveAttribute('aria-disabled', 'true')
    press(attic.button('previous'))
    expect(attic.replay().state.cursor).toBe(0)

    press(attic.button('next'))
    press(attic.button('next'))
    press(attic.button('next'))
    expect(attic.replay().state).toMatchObject({ cursor: 3, status: 'paused' })
    expect(attic.replay().state.projection).toEqual(FOLD(MODEL.records.slice(0, 3)))
    press(attic.button('previous'))
    expect(attic.replay().state.cursor).toBe(2)
    expect(attic.current()).toHaveAttribute('data-position', '2')
    press(attic.button('restart'))
    expect(attic.replay().state).toMatchObject({ cursor: 0, status: 'paused' })
  })

  it('selects exactly 0.5×, 1× and 2×, and the speed scales the next wait', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    const radios = Array.from(attic.root().querySelectorAll<HTMLInputElement>('.hh-attic-speed input[type="radio"]'))
    expect(radios.map((radio) => radio.value)).toEqual(['0.5', '1', '2'])
    expect(within(attic.root()).getByRole('group', { name: 'Playback speed' })).toContainElement(radios[0])
    // One native radio group: the browser's arrow keys move within it.
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1)

    press(attic.speed('2×'))
    expect(attic.replay().state.speed).toBe(2)
    expect(attic.speed('2×')).toBeChecked()
    press(attic.playButton())
    await attic.advance(0)
    const gap = MODEL.timeline[1].presentationOffsetMs - MODEL.timeline[0].presentationOffsetMs
    await attic.advance(gap / 2 - 1)
    expect(attic.replay().state.cursor).toBe(1)
    await attic.advance(1)
    expect(attic.replay().state.cursor).toBe(2)

    press(attic.speed('0.5×'))
    expect(attic.replay().state).toMatchObject({ speed: 0.5, status: 'playing', cursor: 2 })
  })

  it('seeks with the native range, to any event and back', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    const range = attic.range()
    expect(range).toHaveAttribute('min', '0')
    expect(range).toHaveAttribute('step', '1')
    expect(within(attic.root()).getByRole('slider', { name: /^Replay position/ })).toBe(range)
    for (const cursor of [TOTAL, 0, 33, 32, 34]) {
      seek(range, cursor)
      expect(attic.replay().state.cursor).toBe(cursor)
      expect(attic.replay().state.projection).toEqual(FOLD(MODEL.records.slice(0, cursor)))
      expect(range.value).toBe(String(cursor))
    }
    // Seeking while playing keeps playing, except at the end.
    press(attic.playButton())
    seek(range, 5)
    expect(attic.replay().state).toMatchObject({ status: 'playing', cursor: 5 })
    seek(range, TOTAL)
    expect(attic.replay().state.status).toBe('complete')
  })

  it('gives every control a native element, a name, and a place in the Tab order', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    seek(attic.range(), 3)
    const scope = within(attic.root())
    for (const name of ['Resume', 'Restart', 'Previous event', 'Next event']) {
      const control = scope.getByRole('button', { name })
      expect(control.tagName).toBe('BUTTON')
      expect(control).toHaveAttribute('type', 'button')
      expect(control.tabIndex).toBe(0)
    }
    for (const name of ['0.5×', '1×', '2×']) expect(scope.getByRole('radio', { name })).toBeInTheDocument()
    expect(scope.getByRole('slider', { name: `Replay position: Event 3 of ${TOTAL}` })).toBeInTheDocument()
    expect(scope.getByRole('group', { name: 'Timeline of recorded events' }).tabIndex).toBe(0)
    // Nothing is taken out of, or forced into, the natural order.
    expect(attic.root().querySelectorAll('[tabindex]:not([tabindex="0"])')).toHaveLength(0)
    // Timeline entries are text, not controls: Tab passes the list once.
    expect(attic.root().querySelectorAll('.hh-attic-entry button, .hh-attic-entry a, .hh-attic-entry [tabindex]')).toHaveLength(0)
  })

  it('leaves Escape and the arrow keys to the browser and the house', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    const targets = [attic.playButton(), attic.range(), attic.speed('1×'), attic.root().querySelector<HTMLElement>('[data-attic="timeline"]')!]
    for (const target of targets) {
      for (const key of ['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
        // fireEvent returns false when a handler called preventDefault.
        expect(fireEvent.keyDown(target, { key })).toBe(true)
        expect(fireEvent.keyUp(target, { key })).toBe(true)
      }
    }
    expect(attic.replay().state).toMatchObject({ cursor: 0, status: 'paused' })
  })
})

describe('Attic panel: order and text', () => {
  it('puts what it is, the controls, the state, the Timeline and the diagnostics in that order', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    const order = Array.from(attic.root().querySelectorAll<HTMLElement>('[data-attic], h4'), (node) => node.dataset.attic ?? `h4:${node.textContent}`)
    expect(order).toEqual([
      'mode',
      'h4:Playback',
      'controls',
      'h4:The house at this point',
      'summary',
      'current',
      'h4:Timeline',
      'timeline',
      'h4:Diagnostics',
      'diagnostics-empty',
    ])
    // Every focusable control comes before the Timeline region; nothing follows the diagnostics.
    const focusable = Array.from(attic.root().querySelectorAll<HTMLElement>('button, input, [tabindex="0"]'))
    const timeline = attic.root().querySelector('[data-attic="timeline"]')!
    expect(focusable.at(-1)).toBe(timeline)
    expect(attic.root().querySelectorAll('a[href]')).toHaveLength(0)
    // Headings start below the room heading the panel host supplies.
    expect(attic.root().querySelectorAll('h1, h2, h3')).toHaveLength(0)
  })

  it('shows position, event type copy, actor and outcome for each entry, and no payload text', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    seek(attic.range(), TOTAL)
    attic.entries().forEach((entry, index) => {
      const expected = `${index + 1}. ${index === TOTAL - 1 ? 'Now showing. ' : ''}${MODEL.timeline[index].actorLabel}: ${MODEL.timeline[index].summary}`
      expect(textOf(entry)).toBe(expected)
    })
    const copy = attic.root().cloneNode(true) as HTMLElement
    copy.querySelectorAll('style').forEach((sheet) => sheet.remove())
    const shown = copy.textContent ?? ''
    for (const planted of ['requirements.md is ready for review', 'tool-workshop-2', 'requirements-1', 'e1:', 'r1:']) {
      expect(DEMO).toContain(planted)
      expect(shown).not.toContain(planted)
    }
    expect(shown).not.toMatch(/[{}]/)
  })
})

describe('Attic panel: announcements', () => {
  it('announces nothing while a replay plays, and says once that it completed', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    press(attic.playButton())
    await attic.advance(0)
    for (let step = 0; step < 12; step += 1) await attic.advance(4_000)
    expect(attic.replay().state.cursor).toBeGreaterThan(5)
    press(attic.playButton()) // Pause
    press(attic.speed('2×'))
    press(attic.playButton()) // Resume
    seek(attic.range(), 30)
    expect(attic.announcements).toEqual([])

    await attic.playOut()
    expect(attic.announcements).toEqual([`Replay complete. Event ${TOTAL} of ${TOTAL}.`])
    // The panel has no live region, status role, toast or sound of its own.
    expect(attic.root().querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"], [role="timer"], output, progress, audio, video')).toHaveLength(0)
    expect(attic.hostCalls).toEqual([])
  })

  it('says the new position after an explicit Previous, Next or Restart press', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    press(attic.button('next'))
    press(attic.button('next'))
    press(attic.button('previous'))
    press(attic.button('restart'))
    expect(attic.announcements).toEqual([
      `Event 1 of ${TOTAL}. ${MODEL.timeline[0].actorLabel}: ${MODEL.timeline[0].summary}.`,
      `Event 2 of ${TOTAL}. ${MODEL.timeline[1].actorLabel}: ${MODEL.timeline[1].summary}.`,
      `Event 1 of ${TOTAL}. ${MODEL.timeline[0].actorLabel}: ${MODEL.timeline[0].summary}.`,
      'Start of replay. No event has been shown yet.',
    ])
  })

  it('does not announce reaching the end by a seek: the slider speaks its own value', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    seek(attic.range(), TOTAL)
    expect(attic.announcements).toEqual([])
  })
})

describe('Attic panel: motion', () => {
  it('shows no transition unless the Motion Policy allows low-frequency motion', async () => {
    const still = await mountAttic({ mode: 'replay' })
    expect(still.root()).toHaveAttribute('data-motion', 'none')
    // Still House changes nothing functional: every control works and playback advances.
    press(still.playButton())
    await still.advance(0)
    expect(still.replay().state.cursor).toBe(1)
    seek(still.range(), 9)
    expect(still.current()).toHaveAttribute('data-position', '9')

    // The sheet: one decorative transition, only under low-frequency and no reduced-motion preference.
    const rules = ATTIC_STYLES.match(/[^{}]*\{[^{}]*(?:transition|animation)[^{}]*\}/g) ?? []
    expect(rules.map((rule) => rule.replace(/\s+/g, ' ').trim())).toEqual([
      ".hh-attic[data-motion='low-frequency'] .hh-attic-entry { transition: background-color 0.4s ease-out; }",
      ".hh-attic[data-motion='none'] *, .hh-attic:not([data-motion]) * { animation: none !important; transition: none !important; }",
      '.hh-attic * { animation: none !important; transition: none !important; }',
    ])
    expect(ATTIC_STYLES).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.hh-attic\[data-motion='low-frequency'\]/)
    expect(ATTIC_STYLES).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.hh-attic \*/)
    expect(ATTIC_STYLES).not.toMatch(/@keyframes|infinite|scroll-behavior/)
  })

  it('passes the policy verdict through when motion is allowed', async () => {
    const attic = await mountAttic({ mode: 'replay', motion: 'low-frequency' })
    expect(attic.root()).toHaveAttribute('data-motion', 'low-frequency')
  })
})

describe('Attic panel: read-only and sources', () => {
  it('labels the static replay read-only, offers no live action, and tells the stand-in only the Cursor', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    expect(attic.root()).toHaveAttribute('data-mode', 'replay')
    expect(attic.root().querySelector('[data-attic="mode"]')).toHaveTextContent(/This is a recording\. It is read-only/)
    // Every button is a playback control; none starts, approves, rejects, retries or opens a session.
    expect(Array.from(attic.root().querySelectorAll('button'), (button) => button.textContent)).toEqual([
      'Play',
      'Restart',
      'Previous event',
      'Next event',
    ])
    expect(attic.root().querySelectorAll('a, form, textarea, input:not([type="radio"]):not([type="range"])')).toHaveLength(0)

    // The stand-in's read route serves exactly the prefix the Cursor reached.
    const { useAppApi } = await import('../../adapters/sdk')
    const read = async () =>
      ((await useAppApi().get(`/apps/haunted-house/api/mansions/${MANSION}/seance/events?after_sequence=0&limit=500`)) as {
        events: unknown[]
      }).events.length
    expect(await read()).toBe(0)
    seek(attic.range(), 12)
    expect(await read()).toBe(12)
    seek(attic.range(), 4)
    expect(await read()).toBe(4)

    // In the static build the house follows the same prefix.
    expect(attic.replay().house).toMatchObject({ highestSequence: LOG[3].sequence, workflow: { readOnly: true, mansionId: MANSION } })
    expect(attic.fetchSpy).toHaveBeenCalledTimes(1)
    expect(attic.unexpected).toEqual([])
  })

  it('keeps playing after the panel closes and shows the same state when it reopens', async () => {
    const attic = await mountAttic({ mode: 'replay' })
    press(attic.playButton())
    await attic.advance(0)
    act(() => attic.setOpen(false))
    expect(attic.view.container.querySelector('[data-attic-panel]')).toBeNull()
    for (let step = 0; step < 4; step += 1) await attic.advance(4_000)
    const cursor = attic.replay().state.cursor
    expect(cursor).toBeGreaterThan(1)
    act(() => attic.setOpen(true))
    expect(attic.current()).toHaveAttribute('data-position', String(cursor))
    expect(attic.playButton()).toHaveTextContent('Pause')
    // Nothing was announced while it was closed, and reopening fetched nothing.
    expect(attic.announcements).toEqual([])
    expect(attic.fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('replays the live log from the signed read route only, with the same panel and no host effect', async () => {
    const attic = await mountAttic({ mode: 'live' })
    expect(attic.replay()).toMatchObject({ mode: 'live', readOnly: false, source: 'ready', house: null })
    expect(attic.root()).toHaveAttribute('data-mode', 'live')
    expect(attic.root().querySelector('[data-attic="mode"]')).toHaveTextContent(/Replaying changes nothing/)
    expect(attic.entries()).toHaveLength(TOTAL)
    expect(attic.replay().model).toEqual(MODEL)

    seek(attic.range(), TOTAL)
    expect(attic.replay().state.projection).toEqual(FOLD(MODEL.records))
    press(attic.button('restart'))
    press(attic.playButton())
    await attic.playOut()
    expect(attic.replay().state.projection).toEqual(FOLD(MODEL.records))

    // Only the canonical read route was asked; no fetch, socket, write, toast, badge or subscription.
    expect(attic.requests.length).toBeGreaterThan(0)
    expect(new Set(attic.requests)).toEqual(
      new Set([`GET /apps/haunted-house/api/mansions/${MANSION}/seance/events?after_sequence=0&limit=500`]),
    )
    expect(attic.fetchSpy).not.toHaveBeenCalled()
    expect(attic.unexpected).toEqual([])
    expect(attic.hostCalls).toEqual([])
    expect(Array.from(attic.root().querySelectorAll('button'), (button) => button.textContent)).toEqual([
      'Play',
      'Restart',
      'Previous event',
      'Next event',
    ])
  })

  it('reads the live log again when the Attic reopens, without disturbing a replay of the same log', async () => {
    const attic = await mountAttic({ mode: 'live' })
    const reads = attic.requests.length
    press(attic.playButton())
    await attic.advance(0)
    act(() => attic.setOpen(false))
    await attic.advance(4_000)
    act(() => attic.setOpen(true))
    await attic.advance(0)
    // One more read of the one route; the same records, so playback was not paused or reset.
    expect(attic.requests.length).toBe(reads + 1)
    expect(attic.replay().state.status).toBe('playing')
    expect(attic.replay().state.cursor).toBeGreaterThan(1)
    expect(attic.playButton()).toHaveTextContent('Pause')
    expect(attic.announcements).toEqual([])
  })

  it('reports a live log that cannot be read with fixed copy and asks nowhere else', async () => {
    const attic = await mountAttic({ mode: 'live', failWith: 500 })
    expect(attic.replay()).toMatchObject({ source: 'error', state: { cursor: 0, status: 'paused' } })
    expect(textOf(attic.root().querySelector('[data-attic="diagnostics"]'))).toBe('The replay recording could not be loaded.')
    expect(new Set(attic.requests).size).toBe(1)
    expect(attic.unexpected).toEqual([])
  })
})
