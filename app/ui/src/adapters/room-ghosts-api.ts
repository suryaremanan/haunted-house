// Room Ghosts adapter (Spec 5 task 9.1; Requirements 10.4, 10.6, 11.1, 11.2,
// 11.5, 12.1, 12.5). It reads the Room Ghosts answer of one spec, re-reads it
// when the workflow projection moves, and sends the four Room Ghosts
// mutations: revision feedback, Workshop start, cancel and retry.
//
// The answer always comes from the backend: this file folds nothing, applies
// no mutation locally, and never repeats a mutation on its own. A command
// leaves only through `authorizeRoomCommand`, after an explicit press. Phase
// starts and Door or risky decisions are not sent from here.
import { useCallback, useEffect, useRef, useState } from 'react'
import { roomFailure, roomGhostsPath, roomRequest, roomSuccessText } from '../core/room-api'
import { parseRoomGhosts, type RoomGhosts } from '../core/room-projection'
import { authorizeRoomCommand, roomCommandTarget, type RoomCommand, type RoomGate, type RoomGhostsStatus } from '../core/room-view'
import type { WorkflowProjection } from '../core/workflow-projection'
import { useAppApi } from './sdk'

/** The two client methods the adapter needs. Paths must be covered by `permissions.api`. */
export interface RoomGhostsApi {
  get(path: string): Promise<unknown>
  post(path: string, body?: unknown): Promise<unknown>
}

export interface RoomGhostsTimers {
  set(fn: () => void, delayMs: number): unknown
  clear(handle: unknown): void
}

export interface RoomGhostsUiState {
  readonly status: RoomGhostsStatus
  /** The newest answer the backend sent, exactly as parsed. Kept for reading when a later read fails. */
  readonly roomGhosts: RoomGhosts | null
  /** `roomCommandTarget` of the command on its way, or null. One command at a time. */
  readonly inFlight: string | null
  /** The result of the last command, in plain words. */
  readonly notice: string | null
}

export const INITIAL_ROOM_GHOSTS_STATE: RoomGhostsUiState = {
  status: 'loading',
  roomGhosts: null,
  inFlight: null,
  notice: null,
}

export interface RoomGhostsControllerOptions {
  readonly api: RoomGhostsApi
  readonly mansionId: string
  readonly specName: string
  /** Defaults to setTimeout and clearTimeout. */
  readonly timers?: RoomGhostsTimers
  /** Re-read interval while a cancellation or a backpressured task is pending. Default 5000. */
  readonly pollMs?: number
  /** Wait before the re-read a workflow change asks for, so a burst costs one read. Default 150. */
  readonly refreshDelayMs?: number
  /** A fresh command id per press. Defaults to a random UUID. */
  readonly newCommandId?: () => string
  /** Called after every command settles, so the workflow and the canonical log are read again. */
  readonly onCommandSettled?: () => void
}

/** What the last check needs to know about the rest of the house at the moment of a press. */
export interface RoomSendContext {
  readonly projection: WorkflowProjection | null
  readonly gate: RoomGate
  /** True while a Spec 4 command is on its way: one command at a time across the house. */
  readonly workflowBusy: boolean
}

export interface RoomGhostsController {
  getState(): RoomGhostsUiState
  /** Calls `listener` after every state change. Returns an unsubscribe function. */
  subscribe(listener: (state: RoomGhostsUiState) => void): () => void
  /** Reads the answer. Call on mount. */
  start(): void
  /** Reads the answer again. Concurrent calls share one request. */
  refresh(): Promise<void>
  /**
   * Tells the adapter the workflow Projection_Version on screen; a different one triggers one re-read.
   * `disagrees` is the gate's verdict that the sources do not match although the versions do: also one re-read.
   */
  noteWorkflowVersion(version: number, disagrees?: boolean): void
  /** Sends one explicit command if `authorizeRoomCommand` passes it. Resolves when the state reflects the answer. */
  send(command: RoomCommand, context: RoomSendContext): Promise<void>
  /** Page became hidden (stop polling) or visible again (re-read). */
  setVisible(visible: boolean): void
  /** Stops timers and ignores every later response. */
  dispose(): void
}

const DEFAULT_POLL_MS = 5_000
const DEFAULT_REFRESH_DELAY_MS = 150

const defaultTimers: RoomGhostsTimers = {
  set: (fn, delayMs) => setTimeout(fn, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

function randomCommandId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Framework-free controller. `useRoomGhosts` wires it to the SDK client. */
export function createRoomGhostsController(options: RoomGhostsControllerOptions): RoomGhostsController {
  const { api, mansionId, specName } = options
  const timers = options.timers ?? defaultTimers
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  const refreshDelayMs = options.refreshDelayMs ?? DEFAULT_REFRESH_DELAY_MS
  const newCommandId = options.newCommandId ?? randomCommandId

  let state = INITIAL_ROOM_GHOSTS_STATE
  const listeners = new Set<(state: RoomGhostsUiState) => void>()
  let disposed = false
  let visible = true
  let reading: Promise<void> | null = null
  let readAgain = false
  let pollTimer: unknown = null
  let refreshTimer: unknown = null
  // The disagreement a re-read was already asked for, so a gap that stays costs one read.
  let notedKey = ''

  function update(patch: Partial<RoomGhostsUiState>): void {
    if (disposed) return
    const next = { ...state, ...patch }
    if (next.status === state.status && next.roomGhosts === state.roomGhosts && next.inFlight === state.inFlight && next.notice === state.notice) {
      return
    }
    state = next
    for (const listener of [...listeners]) listener(state)
  }

  function clearTimer(handle: unknown): null {
    if (handle !== null) timers.clear(handle)
    return null
  }

  /** Polling is only for what no canonical record announces: a pending cancellation, a backpressure retry. */
  function wantsPoll(): boolean {
    const current = state.roomGhosts
    if (state.status !== 'ready' || current === null || current.readOnly) return false
    return (
      current.runs.some((run) => run.cancelRequested) ||
      (current.taskPlan?.tasks.some((task) => task.backpressure !== null) ?? false)
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
      .then(() => api.get(roomGhostsPath(mansionId, specName)))
      .then(
        (body) => {
          const parsed = parseRoomGhosts(body, mansionId, specName)
          // What was on screen stays for reading; a refused answer only takes the controls away.
          if (!parsed.ok) return update({ status: 'malformed' })
          const current = state.roomGhosts
          // A late answer to an older read never replaces newer state.
          if (current !== null && parsed.roomGhosts.version < current.version) return update({ status: 'ready' })
          return update({ status: 'ready', roomGhosts: parsed.roomGhosts })
        },
        () => update({ status: 'unavailable' }),
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

  /** A read that started after this call: waits out a read already on its way, then the one it queued. */
  async function freshRead(): Promise<void> {
    await refresh()
    while (reading !== null && !disposed) await reading
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
    refresh,
    noteWorkflowVersion(version, disagrees = false) {
      // Before the first answer arrives the first read is already on its way.
      if (disposed || state.status === 'loading') return
      const current = state.status === 'ready' && state.roomGhosts?.version === version
      if (current && !disagrees) return
      // Each disagreement asks once: if it stays, the controls stay off and nothing loops.
      const key = `${version}:${state.roomGhosts?.version ?? 'none'}:${state.status}`
      if (key === notedKey) return
      notedKey = key
      if (refreshTimer !== null) return
      refreshTimer = timers.set(() => {
        refreshTimer = null
        void refresh()
      }, refreshDelayMs)
    },
    send(command, context) {
      if (disposed || context.workflowBusy) return Promise.resolve()
      const allowed = authorizeRoomCommand(state.roomGhosts, context.projection, context.gate, state.inFlight, command)
      if (allowed === null) return Promise.resolve()
      const request = roomRequest(mansionId, specName, allowed, newCommandId())
      update({ inFlight: roomCommandTarget(allowed), notice: null })
      return Promise.resolve()
        .then(() => api.post(request.path, request.body))
        .then(
          () => roomSuccessText(allowed),
          (error: unknown) => roomFailure(error).text,
        )
        // Accepted or refused, what the room shows now comes from a fresh read, never from this answer.
        // The command stays in flight until that read is in, so its control and its result change together.
        .then((notice) => freshRead().then(() => update({ inFlight: null, notice })))
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

export interface RoomGhostsLive {
  readonly state: RoomGhostsUiState
  readonly send: (command: RoomCommand, context: RoomSendContext) => Promise<void>
  readonly refresh: () => Promise<void>
  /** The gate found the sources disagree at this workflow version: read the answer once more. */
  readonly noteDisagreement: (workflowVersion: number) => void
}

const settled = () => Promise.resolve()

/**
 * The Room Ghosts answer of one spec. `workflowVersion` is the
 * Projection_Version on screen; when the answer is of another version it is
 * read again. Pass a null Mansion while none is open.
 */
export function useRoomGhosts(
  mansionId: string | null,
  specName: string,
  workflowVersion: number | null,
  onCommandSettled?: () => void,
): RoomGhostsLive {
  const api = useAppApi()
  // The host may hand out a new client object on every render.
  const apiRef = useRef(api)
  apiRef.current = api
  const settledRef = useRef(onCommandSettled)
  settledRef.current = onCommandSettled
  const controllerRef = useRef<RoomGhostsController | null>(null)
  const [state, setState] = useState(INITIAL_ROOM_GHOSTS_STATE)

  useEffect(() => {
    if (mansionId === null) {
      setState(INITIAL_ROOM_GHOSTS_STATE)
      return undefined
    }
    const controller = createRoomGhostsController({
      mansionId,
      specName,
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
  }, [mansionId, specName])

  useEffect(() => {
    if (workflowVersion !== null) controllerRef.current?.noteWorkflowVersion(workflowVersion)
  }, [workflowVersion, state.roomGhosts, state.status])

  const send = useCallback(
    (command: RoomCommand, context: RoomSendContext) => controllerRef.current?.send(command, context) ?? settled(),
    [],
  )
  const refresh = useCallback(() => controllerRef.current?.refresh() ?? settled(), [])
  const noteDisagreement = useCallback((version: number) => controllerRef.current?.noteWorkflowVersion(version, true), [])
  return { state, send, refresh, noteDisagreement }
}
