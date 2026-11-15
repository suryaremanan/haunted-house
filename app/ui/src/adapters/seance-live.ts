// Live_Event_Bridge (Spec 2, Requirements 2.1, 10.1 to 10.3, 11.4 to 11.7).
//
// The browser is a transport, not an interpreter. For every subscribed Crew
// callback this file posts the raw `{type, data}` envelope to the backend and
// does nothing else with it. Ghost state changes only from canonical App_Events
// the backend acknowledged or returned from the read route, merged at most once
// per Record_ID and folded through the Spec 2 core. There is no mapping from
// Crew event types to canonical event types here or anywhere in the UI, and no
// WebSocket of our own.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GhostSnapshot, GhostTransition } from '../core/ghost-state'
import {
  MAX_PAGE_LIMIT,
  MAX_RECONCILE_SLOTS,
  errorCodeOf,
  httpStatusOf,
  isRefusal,
  parseCanonicalPage,
  rejectedEnvelopesOf,
  seanceEventsPath,
  seanceIngestPath,
  seanceReconcilePath,
  type CanonicalPage,
} from '../core/seance-api'
import { MAX_INGEST_BATCH_SIZE, type EventDiagnostic } from '../core/seance-event'
import { EMPTY_LOG, mergeAcknowledged, projectLog, type CanonicalLog } from '../core/seance-log'
import { useAppApi, useAppEvents } from './sdk'

/**
 * The Crew event names this app subscribes to: exactly the supported envelope
 * types the Backend_Normalizer maps. The list only selects subscriptions; the
 * name is forwarded as the envelope `type` and never interpreted in the browser.
 */
export const SUBSCRIBED_CREW_EVENTS = [
  'approval_resolved',
  'chat_chunk',
  'chat_done',
  'chat_error',
  'chat_message',
  'chat_message_update',
  'chat_segment',
  'chat_status',
  'shared_crew.decision',
  'tool_call',
  'tool_result',
] as const

/** A Crew callback exactly as observed: the subscribed type and the untouched callback data. */
export interface CrewEnvelope {
  readonly type: string
  readonly data: unknown
}

export interface SeanceLiveState {
  /** Highest canonical Sequence merged so far. */
  readonly highestSequence: number
  /** Current snapshot per ghost of this Mansion, keyed by `ghost_id`. */
  readonly snapshots: ReadonlyMap<string, GhostSnapshot>
  /** True from mount, reconnect or visibility return until the canonical read completes. */
  readonly catchingUp: boolean
  /** The persistence, read or integrity problem to show, if any. Snapshots stay as they were. */
  readonly diagnostic: EventDiagnostic | null
  /** False until the first canonical read has completed. */
  readonly loaded: boolean
  /** Every derived transition of this Mansion in Canonical_Order. Derived, never persisted. */
  readonly transitions: readonly GhostTransition[]
  /** Raw envelopes received but not yet acknowledged by the backend. */
  readonly pendingEnvelopes: number
}

export const INITIAL_SEANCE_STATE: SeanceLiveState = {
  highestSequence: 0,
  snapshots: new Map(),
  catchingUp: false,
  diagnostic: null,
  loaded: false,
  transitions: [],
  pendingEnvelopes: 0,
}

/** The two client methods the bridge needs. Paths must be covered by `permissions.api`. */
export interface SeanceApi {
  get(path: string): Promise<unknown>
  post(path: string, body?: unknown): Promise<unknown>
}

export interface SeanceTimers {
  set(fn: () => void, delayMs: number): unknown
  clear(handle: unknown): void
}

export interface SeanceLiveOptions {
  readonly api: SeanceApi
  readonly mansionId: string
  /** Defaults to setTimeout and clearTimeout. */
  readonly timers?: SeanceTimers
  /** Canonical re-read interval while a ghost is working or waiting. Default 5000. */
  readonly pollMs?: number
  /** Waits before each automatic resend of an unacknowledged batch. Default 1 s, 2 s, 5 s, 15 s. */
  readonly retryDelaysMs?: readonly number[]
  /** Most envelopes kept while the backend is unreachable. The oldest are dropped first. Default 500. */
  readonly maxQueue?: number
}

export interface SeanceLiveBridge {
  getState(): SeanceLiveState
  /** Calls `listener` after every state change. Returns an unsubscribe function. */
  subscribe(listener: (state: SeanceLiveState) => void): () => void
  /** Reads the canonical log after the highest acknowledged Sequence. Call on mount. */
  start(): void
  /** Queues one raw Crew envelope for the ingest route. `data` is sent as given. */
  forward(type: string, data: unknown): void
  /** Reads canonical records again and marks the stream as catching up meanwhile. */
  catchUp(): Promise<void>
  /**
   * Asks the backend to recover facts for these registered session slots (at
   * most 8) from Crew history, then reads what it persisted.
   */
  reconcile(slots: readonly string[]): Promise<void>
  /** Page became hidden (stop polling) or visible again (catch up). */
  setVisible(visible: boolean): void
  /** Stops timers and ignores every later response. */
  dispose(): void
}

const DEFAULT_POLL_MS = 5_000
const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 15_000] as const
const DEFAULT_MAX_QUEUE = 500
const MIN_HINT_MS = 50
const MAX_HINT_MS = 30_000
const MAX_PAGES_PER_READ = 200
const RECONCILE_COOLDOWN_MS = 5_000

const defaultTimers: SeanceTimers = {
  set: (fn, delayMs) => setTimeout(fn, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

const INGEST_FAILED: EventDiagnostic = {
  code: 'persistence_failed',
  safe_detail: 'The backend did not confirm the latest ghost activity. Trying again.',
}
const INGEST_REFUSED: EventDiagnostic = {
  code: 'invalid_envelope',
  safe_detail: 'The backend refused a Crew event, so it was not recorded.',
}
const INGEST_UNAVAILABLE: EventDiagnostic = {
  code: 'persistence_failed',
  safe_detail: 'The séance log of this mansion is not available, so new ghost activity was not recorded.',
}
const QUEUE_OVERFLOW: EventDiagnostic = {
  code: 'persistence_failed',
  safe_detail: 'Too much ghost activity is waiting for the backend. The oldest events were dropped.',
}
const READ_FAILED: EventDiagnostic = {
  code: 'persistence_failed',
  safe_detail: 'Could not read the séance log. Showing the last confirmed state.',
}
const RECONCILE_FAILED: EventDiagnostic = {
  code: 'history_partial',
  safe_detail: 'Could not recover missed activity from Crew history.',
}

/** Framework-free bridge. `useSeanceLive` wires it to the SDK hooks. */
export function createSeanceLiveBridge(options: SeanceLiveOptions): SeanceLiveBridge {
  const { api, mansionId } = options
  const timers = options.timers ?? defaultTimers
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const maxQueue = options.maxQueue ?? DEFAULT_MAX_QUEUE

  let state = INITIAL_SEANCE_STATE
  let log: CanonicalLog = EMPTY_LOG
  const listeners = new Set<(state: SeanceLiveState) => void>()
  let disposed = false
  let visible = true

  // Raw envelopes in arrival order. A batch leaves only when the backend
  // acknowledged or refused it, so order is kept across retries.
  const queue: CrewEnvelope[] = []
  let sending = false
  // After the backend refuses a batch, that many envelopes go one per request
  // so a single bad envelope cannot take the others with it.
  let singles = 0
  let retryAttempt = 0
  let retryTimer: unknown = null
  let pollTimer: unknown = null

  let reading: Promise<void> | null = null
  let readAgain = false
  // A catch-up asked for while a read was in flight: the follow-up read keeps the stream marked.
  let announceAgain = false
  let reconciling = false
  let reconcileBlockedUntilTimer: unknown = null

  let ingestDiagnostic: EventDiagnostic | null = null
  let readDiagnostic: EventDiagnostic | null = null

  function publish(patch: Partial<SeanceLiveState>): void {
    if (disposed) return
    state = {
      ...state,
      ...patch,
      diagnostic: ingestDiagnostic ?? readDiagnostic,
      pendingEnvelopes: queue.length,
    }
    for (const listener of [...listeners]) listener(state)
  }

  /** Merges canonical records at most once per Record_ID and refolds. The only path to ghost state. */
  function apply(page: CanonicalPage): void {
    const merged = mergeAcknowledged(
      log,
      page.events.filter((event) => event.scope.mansion_id === mansionId),
    )
    if (merged.applied.length === 0) return
    log = merged.log
    const projection = projectLog(log)
    publish({
      highestSequence: log.highestSequence,
      snapshots: new Map(projection.snapshots.map((snapshot) => [snapshot.ghost_id, snapshot])),
      transitions: projection.transitions,
    })
  }

  function clearTimer(handle: unknown): null {
    if (handle !== null) timers.clear(handle)
    return null
  }

  function hasActiveRun(): boolean {
    for (const snapshot of state.snapshots.values()) {
      if (snapshot.state === 'working' || snapshot.state === 'waiting') return true
    }
    return false
  }

  /** Bounded background re-read: at the recording's hint, or while a Run is active. */
  function schedulePoll(hintMs: number | null): void {
    pollTimer = clearTimer(pollTimer)
    if (disposed || !visible) return
    const delay =
      hintMs !== null ? Math.min(Math.max(hintMs, MIN_HINT_MS), MAX_HINT_MS) : hasActiveRun() ? pollMs : null
    if (delay === null) return
    pollTimer = timers.set(() => {
      pollTimer = null
      void read(false)
    }, delay)
  }

  /**
   * Pages the read route after the contiguous Sequence until the backend has
   * nothing newer. `announce` marks the stream as catching up while it runs.
   */
  function read(announce: boolean): Promise<void> {
    if (disposed) return Promise.resolve()
    if (announce && !state.catchingUp) publish({ catchingUp: true })
    if (reading !== null) {
      readAgain = true
      announceAgain ||= announce
      return reading
    }
    pollTimer = clearTimer(pollTimer)

    const run = async (): Promise<void> => {
      let hint: number | null = null
      let slots: readonly string[] = []
      try {
        let pageDiagnostic: EventDiagnostic | null = null
        for (let pages = 0; pages < MAX_PAGES_PER_READ; pages += 1) {
          const body = await api.get(seanceEventsPath(mansionId, log.contiguousSequence, MAX_PAGE_LIMIT))
          if (disposed) return
          const parsed = parseCanonicalPage(body)
          if (!parsed.ok) {
            pageDiagnostic = parsed.diagnostic
            break
          }
          const before = log.contiguousSequence
          apply(parsed.page)
          pageDiagnostic ??= parsed.page.diagnostics[0] ?? null
          hint = parsed.page.nextEventInMs
          slots = parsed.page.reconcileSlots
          // Stop when the backend has nothing newer, or a page brought no progress.
          if (log.contiguousSequence >= parsed.page.highestSequence || log.contiguousSequence === before) break
        }
        readDiagnostic = pageDiagnostic
        publish({ catchingUp: announceAgain, loaded: true })
      } catch (error) {
        if (disposed) return
        if (httpStatusOf(error) === 404 && errorCodeOf(error) === 'log_not_found') {
          // A mansion nothing has happened in yet has no log: that is an empty one, not a failure.
          readDiagnostic = null
          publish({ catchingUp: announceAgain, loaded: true })
        } else {
          // Requirement 11.7: report, keep the latest replayable snapshots.
          readDiagnostic = READ_FAILED
          publish({ catchingUp: announceAgain })
        }
      }
      if (slots.length > 0) void reconcile(slots)
      schedulePoll(hint)
    }

    reading = Promise.resolve()
      .then(run)
      .finally(() => {
        reading = null
        if (disposed) return
        if (readAgain) {
          const announceNext = announceAgain
          readAgain = false
          announceAgain = false
          void read(announceNext)
        }
        pump()
      })
    return reading
  }

  function scheduleRetry(): void {
    if (retryAttempt >= retryDelays.length) return // Waits for the next envelope or read to try again.
    const delay = retryDelays[retryAttempt]
    retryAttempt += 1
    retryTimer = timers.set(() => {
      retryTimer = null
      pump()
    }, delay)
  }

  /** Sends the next batch when nothing else is in flight. One request at a time keeps envelope order. */
  function pump(): void {
    if (disposed || sending || retryTimer !== null || queue.length === 0) return
    // Catch-up precedes current state: nothing new is acknowledged until the read ends.
    if (reading !== null) return

    const size = singles > 0 ? 1 : Math.min(queue.length, MAX_INGEST_BATCH_SIZE)
    const batch = queue.slice(0, size)
    sending = true
    Promise.resolve()
      .then(() => api.post(seanceIngestPath(mansionId), { envelopes: batch }))
      .then(
        (body) => {
          sending = false
          if (disposed) return
          // The batch may have been dropped from a full queue while in flight.
          if (queue[0] === batch[0]) queue.splice(0, batch.length)
          if (singles > 0) singles -= 1
          retryAttempt = 0
          const parsed = parseCanonicalPage(body)
          if (!parsed.ok) {
            ingestDiagnostic = parsed.diagnostic
            publish({})
          } else {
            ingestDiagnostic = null
            apply(parsed.page)
            publish({})
            if (parsed.page.reconcileSlots.length > 0) void reconcile(parsed.page.reconcileSlots)
            // Records by other producers sit between ours: read the gap.
            if (log.contiguousSequence < Math.max(log.highestSequence, parsed.page.highestSequence)) {
              void read(false)
            } else {
              schedulePoll(null)
            }
          }
          pump()
        },
        (error: unknown) => {
          sending = false
          if (disposed) return
          const status = httpStatusOf(error)
          if (status === 404 || status === 409) {
            // No log to append to (missing Mansion, or a log that failed its integrity
            // check). Sending these envelopes again, whole or one by one, cannot succeed.
            if (queue[0] === batch[0]) queue.splice(0, batch.length)
            singles = 0
            ingestDiagnostic = INGEST_UNAVAILABLE
            publish({})
            pump()
            return
          }
          if (isRefusal(status)) {
            const rejected = rejectedEnvelopesOf(error, batch.length)
            if (rejected !== null && queue[0] === batch[0]) {
              // The backend named the envelopes it will not take. Drop exactly those; the rest go again.
              for (const { index } of [...rejected].reverse()) queue.splice(index, 1)
              // An envelope of a session this Mansion does not own was never ours to record:
              // it stays absent and is not a problem to show.
              if (rejected.some(({ code }) => code !== 'unknown_session')) ingestDiagnostic = INGEST_REFUSED
              publish({})
              pump()
              return
            }
            if (batch.length > 1) {
              singles = batch.length
            } else {
              if (queue[0] === batch[0]) queue.shift()
              if (singles > 0) singles -= 1
              ingestDiagnostic = INGEST_REFUSED
            }
            publish({})
            pump()
            return
          }
          // Requirement 10.3: keep the prior snapshots, show a persistence diagnostic, retry within bounds.
          ingestDiagnostic = INGEST_FAILED
          publish({})
          scheduleRetry()
        },
      )
  }

  function reconcile(slots: readonly string[]): Promise<void> {
    if (disposed || reconciling || reconcileBlockedUntilTimer !== null || slots.length === 0) {
      return Promise.resolve()
    }
    reconciling = true
    const body = { slots: slots.slice(0, MAX_RECONCILE_SLOTS) }
    return Promise.resolve()
      .then(() => api.post(seanceReconcilePath(mansionId), body))
      .then(
        (response) => {
          if (disposed) return
          const parsed = parseCanonicalPage(response)
          if (parsed.ok) {
            apply(parsed.page)
            readDiagnostic = parsed.page.diagnostics[0] ?? readDiagnostic
          } else {
            readDiagnostic = RECONCILE_FAILED
          }
          publish({})
        },
        () => {
          if (disposed) return
          readDiagnostic = RECONCILE_FAILED
          publish({})
        },
      )
      .finally(() => {
        reconciling = false
        if (disposed) return
        // A backend that keeps asking cannot make the browser loop.
        reconcileBlockedUntilTimer = timers.set(() => {
          reconcileBlockedUntilTimer = null
        }, RECONCILE_COOLDOWN_MS)
        // Catch-up ends only after the recovered canonical records are read.
        return read(false)
      })
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start() {
      void read(true)
    },
    forward(type, data) {
      if (disposed) return
      queue.push({ type, data })
      if (queue.length > maxQueue) {
        queue.splice(0, queue.length - maxQueue)
        ingestDiagnostic = QUEUE_OVERFLOW
      }
      publish({})
      // New activity is a reason to try again after automatic retries ran out.
      if (retryTimer === null && retryAttempt >= retryDelays.length) retryAttempt = Math.max(retryDelays.length - 1, 0)
      pump()
    },
    catchUp: () => read(true),
    reconcile,
    setVisible(next) {
      if (disposed || visible === next) return
      visible = next
      if (!visible) {
        pollTimer = clearTimer(pollTimer)
        return
      }
      retryAttempt = 0
      void read(true)
    },
    dispose() {
      disposed = true
      pollTimer = clearTimer(pollTimer)
      retryTimer = clearTimer(retryTimer)
      reconcileBlockedUntilTimer = clearTimer(reconcileBlockedUntilTimer)
      listeners.clear()
      queue.length = 0
    },
  }
}

/**
 * Live ghost state for one Mansion. Subscribes to the supported Crew events,
 * forwards each as a raw envelope, and returns state built only from canonical
 * events. Pass null while no Mansion is open.
 */
export function useSeanceLive(mansionId: string | null): SeanceLiveState {
  return useSeanceLiveControls(mansionId).state
}

export interface SeanceLiveControls {
  readonly state: SeanceLiveState
  /** Reads canonical records again now, for a caller that knows the backend just appended some. */
  readonly catchUp: () => void
}

/** `useSeanceLive` plus the bridge's canonical re-read. The state is the same object either way. */
export function useSeanceLiveControls(mansionId: string | null): SeanceLiveControls {
  const api = useAppApi()
  // The host may hand out a new client object on every render.
  const apiRef = useRef(api)
  apiRef.current = api
  const bridgeRef = useRef<SeanceLiveBridge | null>(null)
  const [state, setState] = useState(INITIAL_SEANCE_STATE)

  useEffect(() => {
    if (mansionId === null) {
      setState(INITIAL_SEANCE_STATE)
      return undefined
    }
    const bridge = createSeanceLiveBridge({
      mansionId,
      api: {
        get: (path) => apiRef.current.get(path),
        post: (path, body) => apiRef.current.post(path, body),
      },
    })
    bridgeRef.current = bridge
    setState(bridge.getState())
    const unsubscribe = bridge.subscribe(setState)
    const onVisibility = () => bridge.setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    bridge.start()
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
      bridge.dispose()
      if (bridgeRef.current === bridge) bridgeRef.current = null
    }
  }, [mansionId])

  // One stable callback per subscribed type: it wraps the callback data in an
  // envelope and hands it over untouched. The list is a constant, so the hooks
  // below run in the same order on every render.
  const forwarders = useMemo(
    () => SUBSCRIBED_CREW_EVENTS.map((type) => (data: unknown) => bridgeRef.current?.forward(type, data)),
    [],
  )
  SUBSCRIBED_CREW_EVENTS.forEach((type, index) => {
    // The host hook owns its cleanup; Crew 0.12.2 returns no unsubscribe function to call.
    useAppEvents(type, forwarders[index])
  })

  const catchUp = useCallback(() => {
    void bridgeRef.current?.catchUp()
  }, [])
  return useMemo(() => ({ state, catchUp }), [state, catchUp])
}
