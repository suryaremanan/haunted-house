// Live_Event_Bridge acknowledgment and reconnect tests (task 7.3).
// Requests are held open by hand, so each test can look at the state while the
// backend has not answered yet.
// **Validates: Requirements 2.1, 10.1, 10.2, 10.3, 11.1 to 11.7**
import { describe, expect, it } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import callbackFixture from '../../../../spikes/fixtures/s2-a1-callback-envelope.json'
import { foldGhostEvents } from '../core/ghost-state'
import { appEventToJson, type AppEvent } from '../core/seance-event'
import { parseEventLog } from '../core/seance-log'
import {
  INITIAL_SEANCE_STATE,
  SUBSCRIBED_CREW_EVENTS,
  createSeanceLiveBridge,
  type SeanceLiveState,
  type SeanceTimers,
} from './seance-live'

const MANSION = 'demo-mansion'
const BASE = `/apps/haunted-house/api/mansions/${MANSION}/seance`
const LOG = parseEventLog(demo).events

interface Call {
  readonly method: 'GET' | 'POST'
  readonly path: string
  readonly body: unknown
  resolve(value: unknown): void
  reject(error: unknown): void
}

/** An API client whose every request stays pending until the test settles it. */
function heldApi() {
  const calls: Call[] = []
  let taken = 0
  const request = (method: Call['method'], path: string, body: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      calls.push({ method, path, body, resolve, reject })
    })
  return {
    calls,
    api: {
      get: (path: string) => request('GET', path, undefined),
      post: (path: string, body?: unknown) => request('POST', path, body),
    },
    /** The oldest request not yet taken by the test. */
    next(): Call {
      const call = calls[taken]
      if (call === undefined) throw new Error(`No request ${taken + 1}; saw ${calls.length}.`)
      taken += 1
      return call
    },
    get pending() {
      return calls.length - taken
    },
  }
}

/** Timers the test fires by hand. */
function manualTimers() {
  let nextId = 1
  const pending = new Map<number, { fn: () => void; delayMs: number }>()
  const timers: SeanceTimers = {
    set(fn, delayMs) {
      const id = nextId
      nextId += 1
      pending.set(id, { fn, delayMs })
      return id
    },
    clear(handle) {
      pending.delete(handle as number)
    },
  }
  return {
    timers,
    pending,
    delays: () => [...pending.values()].map((timer) => timer.delayMs),
    /** Fires the one pending timer with this delay. */
    fire(delayMs: number) {
      const found = [...pending].find(([, timer]) => timer.delayMs === delayMs)
      if (found === undefined) throw new Error(`No timer for ${delayMs} ms; have ${[...pending.values()].map((t) => t.delayMs)}`)
      pending.delete(found[0])
      found[1].fn()
    },
  }
}

const page = (events: readonly AppEvent[], highest: number, extra: Record<string, unknown> = {}) => ({
  events: events.map(appEventToJson),
  highest_sequence: highest,
  diagnostics: [],
  ...extra,
})

const httpError = (status: number) => Object.assign(new Error(`API ${status}`), { status, body: '{}' })

/** Lets every already-settled promise callback run. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve()
}

function setup(options: { pollMs?: number; retryDelaysMs?: readonly number[]; maxQueue?: number } = {}) {
  const held = heldApi()
  const clock = manualTimers()
  const bridge = createSeanceLiveBridge({ api: held.api, mansionId: MANSION, timers: clock.timers, ...options })
  const states: SeanceLiveState[] = []
  bridge.subscribe((state) => states.push(state))
  return { ...held, held, clock, bridge, states }
}

/** A bridge whose first canonical read already returned `events`. */
async function started(events: readonly AppEvent[] = [], options: Parameters<typeof setup>[0] = {}) {
  const context = setup(options)
  context.bridge.start()
  await settle()
  context.held.next().resolve(page(events, events.length))
  await settle()
  return context
}

const snapshotsOf = (state: SeanceLiveState) => [...state.snapshots.values()]
const foldOf = (events: readonly AppEvent[]) => foldGhostEvents(events)

describe('Live_Event_Bridge: canonical catch-up', () => {
  it('reads after Sequence 0 on start and stays "catching up" until the backend has nothing newer', async () => {
    const { bridge, held } = setup()
    expect(bridge.getState()).toBe(INITIAL_SEANCE_STATE)

    bridge.start()
    await settle()
    expect(bridge.getState()).toMatchObject({ catchingUp: true, loaded: false })
    const first = held.next()
    expect(first).toMatchObject({ method: 'GET', path: `${BASE}/events?after_sequence=0&limit=500` })

    // First page of two: state is merged, but the stream is not current yet.
    first.resolve(page(LOG.slice(0, 5), 9))
    await settle()
    expect(bridge.getState()).toMatchObject({ catchingUp: true, loaded: false, highestSequence: 5 })
    const second = held.next()
    expect(second.path).toBe(`${BASE}/events?after_sequence=5&limit=500`)

    second.resolve(page(LOG.slice(5, 9), 9))
    await settle()
    const state = bridge.getState()
    expect(state).toMatchObject({ catchingUp: false, loaded: true, highestSequence: 9, diagnostic: null })
    expect(snapshotsOf(state)).toEqual(foldOf(LOG.slice(0, 9)).snapshots)
    expect(state.transitions).toEqual(foldOf(LOG.slice(0, 9)).transitions)
    expect(held.pending).toBe(0)
  })

  it('holds new envelopes until the catch-up read has completed', async () => {
    const { bridge, held } = setup()
    bridge.start()
    await settle()
    const read = held.next()

    bridge.forward('chat_status', { slot: 's', status: 'working' })
    await settle()
    // Only the read is in flight. Nothing can be acknowledged ahead of it.
    expect(held.pending).toBe(0)
    expect(bridge.getState()).toMatchObject({ catchingUp: true, pendingEnvelopes: 1 })

    read.resolve(page(LOG.slice(0, 2), 2))
    await settle()
    expect(bridge.getState()).toMatchObject({ catchingUp: false, highestSequence: 2 })
    expect(held.next()).toMatchObject({ method: 'POST', path: `${BASE}/ingest` })
  })

  it('keeps the last snapshots and reports a diagnostic when catch-up fails', async () => {
    const { bridge, held } = await started(LOG.slice(0, 12))
    const before = bridge.getState()
    expect(before.snapshots.size).toBeGreaterThan(0)

    const done = bridge.catchUp()
    await settle()
    expect(bridge.getState()).toMatchObject({ catchingUp: true, loaded: true })
    // Connection state alone changed no Ghost_State.
    expect(bridge.getState().snapshots).toBe(before.snapshots)

    held.next().reject(httpError(502))
    await done
    const after = bridge.getState()
    expect(after.catchingUp).toBe(false)
    expect(after.diagnostic).toMatchObject({ code: 'persistence_failed' })
    expect(after.snapshots).toBe(before.snapshots)
    expect(after.transitions).toBe(before.transitions)
    expect(after.highestSequence).toBe(12)

    // The next successful read clears the diagnostic.
    const again = bridge.catchUp()
    await settle()
    held.next().resolve(page([], 12))
    await again
    expect(bridge.getState()).toMatchObject({ catchingUp: false, diagnostic: null })
  })

  it('shows the backend integrity diagnostic and folds only the records it returned', async () => {
    const { bridge, held } = setup()
    bridge.start()
    await settle()
    held.next().resolve(
      page(LOG.slice(0, 6), 6, {
        valid_prefix_sequence: 6,
        diagnostics: [{ code: 'hash_mismatch', safe_detail: 'record_hash_mismatch', line: 7, path: 'hash' }],
      }),
    )
    await settle()
    expect(bridge.getState()).toMatchObject({
      loaded: true,
      highestSequence: 6,
      diagnostic: { code: 'hash_mismatch', safe_detail: 'record_hash_mismatch', line: 7 },
    })
    expect(snapshotsOf(bridge.getState())).toEqual(foldOf(LOG.slice(0, 6)).snapshots)
  })

  it('refuses a response that is not a canonical page and applies nothing from it', async () => {
    const { bridge, held } = setup()
    bridge.start()
    await settle()
    held.next().resolve({ events: 'nope' })
    await settle()
    expect(bridge.getState()).toMatchObject({ highestSequence: 0, diagnostic: { code: 'persistence_failed' } })
    expect(bridge.getState().snapshots.size).toBe(0)
  })

  it('drops an event that fails the canonical parser and reports it', async () => {
    const { bridge, held } = setup()
    bridge.start()
    await settle()
    const forged = { ...appEventToJson(LOG[1]), payload: { reason: 'edited in transit' } }
    held.next().resolve({ events: [appEventToJson(LOG[0]), forged], highest_sequence: 2 })
    await settle()
    // The backend claims Sequence 2 exists, so the bridge asks once more...
    const again = held.next()
    expect(again.path).toBe(`${BASE}/events?after_sequence=1&limit=500`)
    again.resolve({ events: [forged], highest_sequence: 2 })
    await settle()
    // ...and stops when the page brings no acceptable record, instead of looping.
    expect(held.pending).toBe(0)
    expect(bridge.getState()).toMatchObject({ highestSequence: 1, catchingUp: false, loaded: true })
    expect(bridge.getState().diagnostic).toMatchObject({ code: 'invalid_record' })
  })
})

describe('Live_Event_Bridge: raw forwarding and acknowledgment', () => {
  it('posts the exact {type, data} envelope and changes nothing until the backend acknowledges', async () => {
    const { bridge, held, states } = await started(LOG.slice(0, 2))
    const before = bridge.getState()
    states.length = 0

    // Callback data that names a ghost, a state and even a canonical event:
    // none of it may reach the UI state.
    const data = {
      slot: 'hh-archivist-requirements-1',
      status: 'failed',
      event_type: 'run_failed',
      scope: LOG[2].scope,
      nested: [{ approved: true }],
    }
    const untouched = structuredClone(data)
    bridge.forward('chat_status', data)
    await settle()

    const post = held.next()
    expect(post.method).toBe('POST')
    expect(post.path).toBe(`${BASE}/ingest`)
    expect(post.body).toEqual({ envelopes: [{ type: 'chat_status', data: untouched }] })
    // The same object, not a copy or a rewrite.
    expect((post.body as { envelopes: { data: unknown }[] }).envelopes[0].data).toBe(data)
    expect(data).toEqual(untouched)

    // Still unacknowledged: snapshots, transitions and Sequence are untouched.
    expect(bridge.getState().snapshots).toBe(before.snapshots)
    expect(bridge.getState().transitions).toBe(before.transitions)
    expect(bridge.getState().highestSequence).toBe(2)
    expect(bridge.getState().pendingEnvelopes).toBe(1)
    expect(states.every((state) => state.snapshots === before.snapshots)).toBe(true)

    post.resolve(page([LOG[2]], 3))
    await settle()
    expect(bridge.getState()).toMatchObject({ highestSequence: 3, pendingEnvelopes: 0, diagnostic: null })
    expect(snapshotsOf(bridge.getState())).toEqual(foldOf(LOG.slice(0, 3)).snapshots)
  })

  it('forwards every S2-A1 callback case unchanged, in arrival order', async () => {
    const { bridge, held } = await started()
    const cases = (callbackFixture as { callback_cases: { type: string; data: unknown }[] }).callback_cases
    // Every subscribed type has a probed callback shape. The probe also saw other
    // chat frames; the bridge passes whatever type it is handed through unchanged.
    expect(cases.map((entry) => entry.type)).toEqual(expect.arrayContaining([...SUBSCRIBED_CREW_EVENTS]))

    for (const entry of cases) bridge.forward(entry.type, entry.data)
    await settle()
    // The first envelope went out alone; the rest wait for its acknowledgment and go as one batch.
    const first = held.next()
    expect(first.body).toEqual({ envelopes: [cases[0]] })
    first.resolve(page([], 0))
    await settle()
    const rest = held.next()
    expect(rest.body).toEqual({ envelopes: cases.slice(1) })
    const sent = (rest.body as { envelopes: { data: unknown }[] }).envelopes
    sent.forEach((envelope, index) => expect(envelope.data).toBe(cases[index + 1].data))
  })

  it('sends at most 100 envelopes per request and one request at a time', async () => {
    const { bridge, held } = await started()
    for (let index = 0; index < 251; index += 1) bridge.forward('chat_chunk', { seq: index })
    await settle()

    const sizes: number[] = []
    for (let request = 0; request < 4; request += 1) {
      expect(held.pending).toBe(1)
      const post = held.next()
      const envelopes = (post.body as { envelopes: { data: { seq: number } }[] }).envelopes
      sizes.push(envelopes.length)
      expect(envelopes[0].data.seq).toBe(sizes.slice(0, -1).reduce((sum, size) => sum + size, 0))
      post.resolve(page([], 0))
      await settle()
    }
    expect(sizes).toEqual([1, 100, 100, 50])
    expect(held.pending).toBe(0)
    expect(bridge.getState().pendingEnvelopes).toBe(0)
  })

  it('applies each acknowledged Record_ID once across redelivery and overlapping pages', async () => {
    const { bridge, held } = await started(LOG.slice(0, 4))

    bridge.forward('tool_call', { tool_call_id: 't' })
    await settle()
    held.next().resolve(page([LOG[4], LOG[5]], 6))
    await settle()
    const once = bridge.getState()
    expect(once.highestSequence).toBe(6)

    // Crew redelivers; the backend acknowledges the stored records again.
    bridge.forward('tool_call', { tool_call_id: 't' })
    await settle()
    held.next().resolve(page([LOG[4], LOG[5]], 6, { duplicate_record_ids: [LOG[4].record_id, LOG[5].record_id] }))
    await settle()
    // A catch-up page overlaps what is already held.
    const read = bridge.catchUp()
    await settle()
    held.next().resolve(page(LOG.slice(2, 6), 6))
    await read

    const state = bridge.getState()
    expect(state.snapshots).toBe(once.snapshots)
    expect(state.transitions).toBe(once.transitions)
    expect(state.transitions).toEqual(foldOf(LOG.slice(0, 6)).transitions)
    expect(new Set(state.transitions.map((transition) => transition.transition_id)).size).toBe(state.transitions.length)
  })

  it('reads the gap when an acknowledgment skips records of other producers, without "catching up"', async () => {
    const { bridge, held } = await started(LOG.slice(0, 3))
    bridge.forward('chat_done', { slot: 's' })
    await settle()
    // Sequence 4 and 5 were appended by the house in the meantime.
    held.next().resolve(page([LOG[5]], 6))
    await settle()

    expect(bridge.getState()).toMatchObject({ highestSequence: 6, catchingUp: false })
    const read = held.next()
    expect(read).toMatchObject({ method: 'GET', path: `${BASE}/events?after_sequence=3&limit=500` })
    read.resolve(page(LOG.slice(3, 6), 6))
    await settle()
    expect(snapshotsOf(bridge.getState())).toEqual(foldOf(LOG.slice(0, 6)).snapshots)
    expect(held.pending).toBe(0)
  })

  it('ignores records of another Mansion', async () => {
    const { bridge, held } = setup()
    bridge.start()
    await settle()
    const foreign = LOG.slice(0, 3).map((event) => ({
      ...appEventToJson(event),
      scope: { ...event.scope, mansion_id: 'other-mansion' },
    }))
    held.next().resolve({ events: foreign, highest_sequence: 0 })
    await settle()
    expect(bridge.getState().snapshots.size).toBe(0)
    expect(bridge.getState().highestSequence).toBe(0)
  })
})

describe('Live_Event_Bridge: failures and the bounded retry queue', () => {
  it('keeps snapshots, shows a persistence diagnostic and resends in order after the retry delay', async () => {
    const { bridge, held, clock } = await started(LOG.slice(0, 3), { retryDelaysMs: [1_000, 4_000] })
    const before = bridge.getState()

    bridge.forward('chat_chunk', { seq: 1 })
    await settle()
    held.next().reject(httpError(503))
    await settle()
    bridge.forward('chat_chunk', { seq: 2 })
    await settle()

    expect(bridge.getState().diagnostic).toMatchObject({ code: 'persistence_failed' })
    expect(bridge.getState().snapshots).toBe(before.snapshots)
    expect(bridge.getState().pendingEnvelopes).toBe(2)
    // Nothing is sent before the delay.
    expect(held.pending).toBe(0)
    expect(clock.delays()).toContain(1_000)

    clock.fire(1_000)
    await settle()
    const retry = held.next()
    expect(retry.body).toEqual({
      envelopes: [
        { type: 'chat_chunk', data: { seq: 1 } },
        { type: 'chat_chunk', data: { seq: 2 } },
      ],
    })
    retry.reject(new TypeError('network down'))
    await settle()
    expect(clock.delays()).toContain(4_000)

    clock.fire(4_000)
    await settle()
    held.next().resolve(page([LOG[3]], 4))
    await settle()
    expect(bridge.getState()).toMatchObject({ diagnostic: null, pendingEnvelopes: 0, highestSequence: 4 })
  })

  it('stops automatic retries after the configured attempts and tries again on new activity', async () => {
    const { bridge, held, clock } = await started([], { retryDelaysMs: [1_000] })
    bridge.forward('chat_chunk', { seq: 1 })
    await settle()
    held.next().reject(httpError(500))
    await settle()
    clock.fire(1_000)
    await settle()
    held.next().reject(httpError(500))
    await settle()
    expect(clock.pending.size).toBe(0)
    expect(held.pending).toBe(0)
    expect(bridge.getState().pendingEnvelopes).toBe(1)

    bridge.forward('chat_chunk', { seq: 2 })
    await settle()
    expect((held.next().body as { envelopes: unknown[] }).envelopes).toHaveLength(2)
  })

  it('resends a refused batch one envelope at a time and drops only the refused one', async () => {
    const { bridge, held } = await started(LOG.slice(0, 2))
    bridge.forward('chat_status', { slot: 'registered-a' })
    await settle()
    const first = held.next()
    bridge.forward('chat_status', { slot: 'someone-elses-chat' })
    bridge.forward('chat_status', { slot: 'registered-b' })
    first.resolve(page([], 2))
    await settle()

    // The pair is refused as a whole (unregistered slot inside).
    const pair = held.next()
    expect((pair.body as { envelopes: unknown[] }).envelopes).toHaveLength(2)
    pair.reject(httpError(400))
    await settle()

    const unknown = held.next()
    expect(unknown.body).toEqual({ envelopes: [{ type: 'chat_status', data: { slot: 'someone-elses-chat' } }] })
    unknown.reject(httpError(400))
    await settle()
    expect(bridge.getState().diagnostic).toMatchObject({ code: 'invalid_envelope' })

    const known = held.next()
    expect(known.body).toEqual({ envelopes: [{ type: 'chat_status', data: { slot: 'registered-b' } }] })
    known.resolve(page([LOG[2]], 3))
    await settle()

    // The unknown slot produced no record, snapshot or retry.
    expect(bridge.getState()).toMatchObject({ pendingEnvelopes: 0, highestSequence: 3, diagnostic: null })
    expect(snapshotsOf(bridge.getState())).toEqual(foldOf(LOG.slice(0, 3)).snapshots)
    expect(held.pending).toBe(0)
  })

  it('drops exactly the envelopes the backend names and keeps unknown sessions silent', async () => {
    const refusal = (diagnostics: unknown[]) =>
      Object.assign(new Error('API 400'), {
        status: 400,
        body: JSON.stringify({ error: { code: 'invalid_envelope', message: 'fixed copy' }, diagnostics, highest_sequence: 2 }),
      })
    const { bridge, held } = await started(LOG.slice(0, 2))
    bridge.forward('chat_status', { slot: 'registered-a' })
    await settle()
    const first = held.next()
    bridge.forward('chat_chunk', { slot: 'someone-elses-chat', seq: 1 })
    bridge.forward('chat_status', { slot: 'registered-b' })
    bridge.forward('chat_chunk', { slot: 'someone-elses-chat', seq: 2 })
    first.resolve(page([], 2))
    await settle()

    const batch = held.next()
    expect((batch.body as { envelopes: unknown[] }).envelopes).toHaveLength(3)
    batch.reject(
      refusal([
        { code: 'unknown_session', index: 0, field: 'data.slot', reason: 'slot_not_registered' },
        { code: 'unknown_session', index: 2, field: 'data.slot', reason: 'slot_not_registered' },
      ]),
    )
    await settle()

    // One more request, holding only the envelope that was not named.
    const retry = held.next()
    expect(retry.body).toEqual({ envelopes: [{ type: 'chat_status', data: { slot: 'registered-b' } }] })
    // Another person's chat is not a persistence problem of this Mansion.
    expect(bridge.getState().diagnostic).toBeNull()
    retry.resolve(page([LOG[2]], 3))
    await settle()
    expect(bridge.getState()).toMatchObject({ pendingEnvelopes: 0, highestSequence: 3, diagnostic: null })
    expect(held.pending).toBe(0)

    // A malformed envelope of our own is reported.
    bridge.forward('tool_call', { slot: 'registered-a' })
    await settle()
    held.next().reject(refusal([{ code: 'invalid_envelope', index: 0, field: 'data.tool_call_id', reason: 'missing' }]))
    await settle()
    expect(bridge.getState()).toMatchObject({ pendingEnvelopes: 0, diagnostic: { code: 'invalid_envelope' } })
    expect(held.pending).toBe(0)
  })

  it('bounds the queue while the backend is down, dropping the oldest envelopes', async () => {
    const { bridge, held } = await started([], { maxQueue: 5, retryDelaysMs: [] })
    bridge.forward('chat_chunk', { seq: 0 })
    await settle()
    held.next().reject(httpError(503))
    await settle()
    // No automatic retry is configured; each new envelope triggers one attempt.
    for (let seq = 1; seq <= 9; seq += 1) {
      bridge.forward('chat_chunk', { seq })
      await settle()
      held.next().reject(httpError(503))
      await settle()
    }
    expect(bridge.getState().pendingEnvelopes).toBe(5)
    expect(bridge.getState().diagnostic).toMatchObject({ code: 'persistence_failed' })

    bridge.forward('chat_chunk', { seq: 10 })
    await settle()
    const envelopes = (held.next().body as { envelopes: { data: { seq: number } }[] }).envelopes
    expect(envelopes.map((envelope) => envelope.data.seq)).toEqual([6, 7, 8, 9, 10])
  })
})

describe('Live_Event_Bridge: a Mansion without a usable log', () => {
  const coded = (status: number, code: string) =>
    Object.assign(new Error(`API ${status}`), { status, body: JSON.stringify({ error: { code, message: 'fixed copy' } }) })

  it('treats "no séance log yet" as an empty log, not a failure', async () => {
    const { bridge, held } = setup()
    bridge.start()
    await settle()
    held.next().reject(coded(404, 'log_not_found'))
    await settle()
    expect(bridge.getState()).toMatchObject({ loaded: true, catchingUp: false, diagnostic: null, highestSequence: 0 })
    expect(bridge.getState().snapshots.size).toBe(0)
  })

  it('reports a missing Mansion instead of calling it empty', async () => {
    const { bridge, held } = setup()
    bridge.start()
    await settle()
    held.next().reject(coded(404, 'mansion_not_found'))
    await settle()
    expect(bridge.getState()).toMatchObject({ loaded: false, catchingUp: false, diagnostic: { code: 'persistence_failed' } })
  })

  it.each([
    [404, 'log_not_found'],
    [409, 'log_integrity_failed'],
  ])('drops a batch the backend cannot append (HTTP %i) without resending it piece by piece', async (status, code) => {
    const { bridge, held, clock } = await started(LOG.slice(0, 1))
    bridge.forward('chat_chunk', { seq: 0 })
    await settle()
    const first = held.next()
    for (let seq = 1; seq <= 30; seq += 1) bridge.forward('chat_chunk', { seq })
    first.reject(coded(status, code))
    await settle()
    // The 30 that queued meanwhile go as one batch, and are dropped the same way.
    const rest = held.next()
    expect((rest.body as { envelopes: unknown[] }).envelopes).toHaveLength(30)
    rest.reject(coded(status, code))
    await settle()

    expect(held.pending).toBe(0)
    expect(clock.pending.size).toBe(0)
    expect(bridge.getState()).toMatchObject({ pendingEnvelopes: 0, highestSequence: 1 })
    expect(bridge.getState().diagnostic).toMatchObject({ code: 'persistence_failed' })
    expect(bridge.getState().snapshots.size).toBe(1)
  })
})

describe('Live_Event_Bridge: reconcile, polling and cleanup', () => {
  it('reads backend diagnostics that carry `reason`, and never reconciles without slots', async () => {
    const { bridge, held } = setup()
    bridge.start()
    await settle()
    held.next().resolve(
      page(LOG.slice(0, 2), 2, {
        integrity: 'failed',
        has_more: false,
        diagnostics: [{ code: 'missing_sequence', reason: 'sequence_not_contiguous', line: 3, field: 'sequence' }],
      }),
    )
    await settle()
    expect(bridge.getState().diagnostic).toEqual({ code: 'missing_sequence', safe_detail: 'sequence_not_contiguous', line: 3 })

    await bridge.reconcile([])
    expect(held.pending).toBe(0)
    // At most eight slots per request, as the route allows.
    void bridge.reconcile(Array.from({ length: 12 }, (_, index) => `slot-${index}`))
    await settle()
    expect((held.next().body as { slots: string[] }).slots).toHaveLength(8)
  })


  it('asks the backend to reconcile the slots it names, then reads what was recovered', async () => {
    const { bridge, held } = await started(LOG.slice(0, 3))
    bridge.forward('shared_crew.decision', { decision: { decision_id: 'd' } })
    await settle()
    held.next().resolve(page([], 3, { reconcile_slots: ['hh-archivist-requirements-1'] }))
    await settle()

    const reconcile = held.next()
    expect(reconcile).toMatchObject({
      method: 'POST',
      path: `${BASE}/reconcile`,
      body: { slots: ['hh-archivist-requirements-1'] },
    })
    reconcile.resolve(
      page([LOG[3]], 5, { diagnostics: [{ code: 'history_partial', safe_detail: 'history_partial' }] }),
    )
    await settle()
    const read = held.next()
    expect(read.path).toBe(`${BASE}/events?after_sequence=4&limit=500`)
    read.resolve(page([LOG[4]], 5))
    await settle()
    expect(bridge.getState().highestSequence).toBe(5)

    // A backend that asks again straight away is not obeyed in a loop.
    bridge.forward('shared_crew.decision', { decision: { decision_id: 'd' } })
    await settle()
    held.next().resolve(page([], 5, { reconcile_slots: ['hh-archivist-requirements-1'] }))
    await settle()
    expect(held.pending).toBe(0)
  })

  it('re-reads on a bounded interval only while a ghost is working or waiting', async () => {
    // After 3 records the Archivist is working.
    const active = await started(LOG.slice(0, 3), { pollMs: 5_000 })
    expect(snapshotsOf(active.bridge.getState()).some((snapshot) => snapshot.state === 'working')).toBe(true)
    expect(active.clock.delays()).toEqual([5_000])
    active.clock.fire(5_000)
    await settle()
    const poll = active.held.next()
    expect(poll.path).toBe(`${BASE}/events?after_sequence=3&limit=500`)
    // A background poll never marks the stream as catching up.
    expect(active.bridge.getState().catchingUp).toBe(false)
    poll.resolve(page([], 3))
    await settle()
    expect(active.clock.delays()).toEqual([5_000])

    // Only an idle ghost: nothing to poll for.
    const idle = await started(LOG.slice(0, 1), { pollMs: 5_000 })
    expect(snapshotsOf(idle.bridge.getState()).map((snapshot) => snapshot.state)).toEqual(['idle'])
    expect(idle.clock.pending.size).toBe(0)
  })

  it('follows the read route\'s next-event hint, within bounds', async () => {
    const { bridge, held, clock } = setup()
    bridge.start()
    await settle()
    held.next().resolve(page(LOG.slice(0, 1), 1, { next_event_in_ms: 420 }))
    await settle()
    expect(clock.delays()).toEqual([420])
    clock.fire(420)
    await settle()
    held.next().resolve(page(LOG.slice(1, 2), 2, { next_event_in_ms: 9_000_000 }))
    await settle()
    expect(clock.delays()).toEqual([30_000])
    expect(bridge.getState()).toMatchObject({ highestSequence: 2, catchingUp: false })
  })

  it('stops polling while hidden and catches up, marked, on return', async () => {
    const { bridge, held, clock } = await started(LOG.slice(0, 3))
    expect(clock.pending.size).toBe(1)
    bridge.setVisible(false)
    expect(clock.pending.size).toBe(0)

    bridge.setVisible(true)
    await settle()
    expect(bridge.getState().catchingUp).toBe(true)
    held.next().resolve(page(LOG.slice(3, 5), 5))
    await settle()
    expect(bridge.getState()).toMatchObject({ catchingUp: false, highestSequence: 5 })
  })

  it('clears every timer on dispose and ignores responses that arrive afterwards', async () => {
    const { bridge, held, clock, states } = await started(LOG.slice(0, 3), { retryDelaysMs: [1_000] })
    bridge.forward('chat_chunk', { seq: 1 })
    await settle()
    held.next().reject(httpError(503))
    await settle()
    bridge.forward('chat_chunk', { seq: 2 })
    expect(clock.pending.size).toBeGreaterThan(0)
    const read = bridge.catchUp()
    await settle()
    const inFlight = held.next()
    const before = bridge.getState()
    states.length = 0

    bridge.dispose()
    expect(clock.pending.size).toBe(0)

    inFlight.resolve(page(LOG.slice(3, 9), 9))
    await read
    await settle()
    bridge.forward('chat_chunk', { seq: 3 })
    await settle()

    expect(bridge.getState()).toBe(before)
    expect(states).toEqual([])
    expect(held.pending).toBe(0)
    expect(clock.pending.size).toBe(0)
  })
})
