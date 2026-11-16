// Signed workflow adapter (Spec 4 task 13.5; Requirements 4.8, 8.1 to 8.5,
// 8.7, 9.5 to 9.7). It reads the backend WorkflowProjection, sends explicit
// phase starts and exact decisions, and re-reads when the canonical log moves.
//
// The projection always comes from the backend: this file folds nothing,
// applies no decision locally, and never retries a decision on its own. A
// command leaves only through `authorizeCommand`, after an explicit press.
import { useCallback, useEffect, useRef, useState } from 'react'
import { INITIAL_HOUSE_STATE, authorizeCommand, reduceHouse, type HouseAction, type HouseUiState } from '../core/house-reducer'
import { commandTarget, needsYou, type Authority, type WorkflowCommand } from '../core/house-view'
import { parseWorkflowAck, successText, workflowFailure, workflowPath, workflowRequest } from '../core/workflow-api'
import { parseWorkflowProjection } from '../core/workflow-projection'
import { useAppApi } from './sdk'

/** The two client methods the adapter needs. Paths must be covered by `permissions.api`. */
export interface WorkflowApi {
  get(path: string): Promise<unknown>
  post(path: string, body?: unknown): Promise<unknown>
}

export interface WorkflowTimers {
  set(fn: () => void, delayMs: number): unknown
  clear(handle: unknown): void
}

export interface WorkflowControllerOptions {
  readonly api: WorkflowApi
  readonly mansionId: string
  /** Defaults to setTimeout and clearTimeout. */
  readonly timers?: WorkflowTimers
  /** Re-read interval while something waits on the Operator or state is uncertain. Default 5000. */
  readonly pollMs?: number
  /** Wait before the re-read a canonical change asks for, so a burst of records costs one read. Default 150. */
  readonly refreshDelayMs?: number
  /** A fresh command id per press. Defaults to a random UUID. */
  readonly newCommandId?: () => string
  /** Called after every command settles, so Spec 2 reads the records it produced. */
  readonly onCommandSettled?: () => void
}

/** UI actions a view may dispatch. Projection and command actions belong to the controller. */
export type HouseViewAction = Extract<
  HouseAction,
  { type: 'proposal_viewed' | 'notice_dismissed' }
>

export interface WorkflowController {
  getState(): HouseUiState
  /** Calls `listener` after every state change. Returns an unsubscribe function. */
  subscribe(listener: (state: HouseUiState) => void): () => void
  /** Reads the projection. Call on mount. */
  start(): void
  dispatch(action: HouseViewAction): void
  /** Reads the projection again. Concurrent calls share one request. */
  refresh(): Promise<void>
  /** Tells the adapter the highest canonical Sequence Spec 2 holds; a newer one triggers a re-read. */
  noteCanonical(highestSequence: number): void
  /**
   * Sends one explicit command if `authorizeCommand` passes it. Resolves when
   * the backend answered and the state reflects it.
   */
  send(command: WorkflowCommand, authority: Authority): Promise<void>
  /** Page became hidden (stop polling) or visible again (re-read). */
  setVisible(visible: boolean): void
  /** Stops timers and ignores every later response. */
  dispose(): void
}

const DEFAULT_POLL_MS = 5_000
const DEFAULT_REFRESH_DELAY_MS = 150
const UNREADABLE_ACK = 'The house answered in a way this page cannot read. Reading the state again before anything else.'

const defaultTimers: WorkflowTimers = {
  set: (fn, delayMs) => setTimeout(fn, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

function randomCommandId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Framework-free controller. `useWorkflow` wires it to the SDK client. */
export function createWorkflowController(options: WorkflowControllerOptions): WorkflowController {
  const { api, mansionId } = options
  const timers = options.timers ?? defaultTimers
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const refreshDelayMs = options.refreshDelayMs ?? DEFAULT_REFRESH_DELAY_MS
  const newCommandId = options.newCommandId ?? randomCommandId

  let state = INITIAL_HOUSE_STATE
  const listeners = new Set<(state: HouseUiState) => void>()
  let disposed = false
  let visible = true
  let reading: Promise<void> | null = null
  let readAgain = false
  let pollTimer: unknown = null
  let refreshTimer: unknown = null
  // The highest canonical Sequence a re-read was already asked for.
  let notedSequence = 0

  function apply(action: HouseAction): void {
    if (disposed) return
    const next = reduceHouse(state, action)
    if (next === state) return
    state = next
    for (const listener of [...listeners]) listener(state)
  }

  function clearTimer(handle: unknown): null {
    if (handle !== null) timers.clear(handle)
    return null
  }

  /** Polling is for doubt and for waiting only: a settled, quiet house is not polled. */
  function wantsPoll(): boolean {
    if (state.projectionStatus !== 'ready' || state.projection === null) return true
    const projection = state.projection
    if (projection.readOnly) return false
    return (
      // The log holds records this projection has not folded, and a re-read did not close the gap.
      notedSequence > projection.version ||
      projection.integrity === 'uncertain' ||
      needsYou(projection).length > 0 ||
      projection.phases.some((phase) => phase.status === 'starting')
    )
  }

  function schedulePoll(): void {
    pollTimer = clearTimer(pollTimer)
    if (disposed || !visible || !wantsPoll()) return
    pollTimer = timers.set(() => {
      pollTimer = null
      void refresh()
    }, pollMs)
  }

  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (reading !== null) {
      readAgain = true
      return reading
    }
    pollTimer = clearTimer(pollTimer)
    refreshTimer = clearTimer(refreshTimer)
    reading = Promise.resolve()
      .then(() => api.get(workflowPath(mansionId)))
      .then(
        (body) => {
          const parsed = parseWorkflowProjection(body, mansionId)
          apply(parsed.ok ? { type: 'projection_received', projection: parsed.projection } : { type: 'projection_refused' })
        },
        () => apply({ type: 'projection_unavailable' }),
      )
      .finally(() => {
        reading = null
        if (disposed) return
        if (readAgain) {
          readAgain = false
          void refresh()
          return
        }
        schedulePoll()
      })
    return reading
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
      void refresh()
    },
    dispatch(action) {
      apply(action)
    },
    refresh,
    noteCanonical(highestSequence) {
      // Before the first projection arrives the first read is already on its way.
      if (disposed || state.projection === null) return
      if (highestSequence <= state.projection.version || highestSequence <= notedSequence) return
      // Canonical records the projection has not folded: read it again, once per burst.
      // Each Sequence asks once; if the gap stays, low-frequency polling takes over.
      notedSequence = highestSequence
      if (refreshTimer !== null) return
      refreshTimer = timers.set(() => {
        refreshTimer = null
        void refresh()
      }, refreshDelayMs)
    },
    send(command, authority) {
      if (disposed) return Promise.resolve()
      const allowed = authorizeCommand(state, authority, command)
      if (allowed === null) return Promise.resolve()
      const request = workflowRequest(mansionId, allowed, newCommandId())
      apply({ type: 'command_sent', target: commandTarget(allowed) })
      return Promise.resolve()
        .then(() => api.post(request.path, request.body))
        .then(
          (body) => {
            const ack = parseWorkflowAck(body, mansionId)
            if (ack === null) {
              apply({ type: 'command_settled', notice: UNREADABLE_ACK })
              return refresh()
            }
            apply({ type: 'projection_received', projection: ack.projection })
            apply({ type: 'command_settled', notice: successText(allowed) })
            schedulePoll()
            return undefined
          },
          (error: unknown) => {
            const failure = workflowFailure(error, mansionId)
            // A refusal that carries the current projection (a conflict, a failed start): show it,
            // and let the Operator decide again.
            if (failure.projection !== null) apply({ type: 'projection_received', projection: failure.projection })
            apply({ type: 'command_settled', notice: failure.text })
            if (failure.projection === null && failure.kind !== 'read_only') return refresh()
            schedulePoll()
            return undefined
          },
        )
        .finally(() => {
          if (!disposed) options.onCommandSettled?.()
        })
    },
    setVisible(next) {
      if (disposed || visible === next) return
      visible = next
      if (!visible) {
        pollTimer = clearTimer(pollTimer)
        return
      }
      void refresh()
    },
    dispose() {
      disposed = true
      pollTimer = clearTimer(pollTimer)
      refreshTimer = clearTimer(refreshTimer)
      listeners.clear()
    },
  }
}

export interface WorkflowLive {
  readonly state: HouseUiState
  readonly dispatch: (action: HouseViewAction) => void
  readonly send: (command: WorkflowCommand, authority: Authority) => Promise<void>
  readonly refresh: () => Promise<void>
}

const noop = () => {}
const settled = () => Promise.resolve()

/**
 * The workflow of one Mansion. `canonicalSequence` is the highest Sequence the
 * Spec 2 bridge holds; when it passes the projection's version the projection
 * is read again. Pass null while no Mansion is open.
 */
export function useWorkflow(mansionId: string | null, canonicalSequence: number, onCommandSettled?: () => void): WorkflowLive {
  const api = useAppApi()
  // The host may hand out a new client object on every render.
  const apiRef = useRef(api)
  apiRef.current = api
  const settledRef = useRef(onCommandSettled)
  settledRef.current = onCommandSettled
  const controllerRef = useRef<WorkflowController | null>(null)
  const [state, setState] = useState(INITIAL_HOUSE_STATE)

  useEffect(() => {
    if (mansionId === null) {
      setState(INITIAL_HOUSE_STATE)
      return undefined
    }
    const controller = createWorkflowController({
      mansionId,
      api: {
        get: (path) => apiRef.current.get(path),
        post: (path, body) => apiRef.current.post(path, body),
      },
      onCommandSettled: () => settledRef.current?.(),
    })
    controllerRef.current = controller
    setState(controller.getState())
    const unsubscribe = controller.subscribe(setState)
    const onVisibility = () => controller.setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    controller.start()
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribe()
      controller.dispose()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [mansionId])

  useEffect(() => {
    controllerRef.current?.noteCanonical(canonicalSequence)
  }, [canonicalSequence, state.projection])

  const dispatch = useCallback((action: HouseViewAction) => controllerRef.current?.dispatch(action) ?? noop(), [])
  const send = useCallback(
    (command: WorkflowCommand, authority: Authority) => controllerRef.current?.send(command, authority) ?? settled(),
    [],
  )
  const refresh = useCallback(() => controllerRef.current?.refresh() ?? settled(), [])
  return { state, dispatch, send, refresh }
}
