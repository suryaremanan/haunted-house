// SDK adapter: the only file in the UI that imports @kirocrew/app-sdk.
// The live build leaves the import to the dashboard's import map; the replay
// build aliases it to a stand-in. Everything else imports from here.
import { useAppApi, useAppEvents, useNavBadge, useNotify, useTheme } from '@kirocrew/app-sdk'
// The namespace is read only for exports an older host may lack: a named import of
// a missing export would stop the whole page from loading.
import * as hostSdk from '@kirocrew/app-sdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseWhoami, statusFromError, WHOAMI_PATH, type BackendStatus } from '../core/backend-status'
import {
  MANSION_REQUEST_FAILED,
  UNEXPECTED_MANSION_RESPONSE,
  parseCreateMansionResponse,
  parseMansionApiError,
  parseMansionListResponse,
  parseOpenMansionResponse,
  type CreateMansionResponse,
  type MansionApiErrorCode,
  type MansionListResponse,
  type OpenMansionResponse,
} from '../core/mansion-api'

export { useAppApi, useAppEvents, useNavBadge, useNotify, useTheme, WHOAMI_PATH }
export type { AppApiClient, AppApiError, AppTheme } from '@kirocrew/app-sdk'
export type { BackendStatus, GatewayErrorKind, GatewayStatus } from '../core/backend-status'

export const MANSIONS_PATH = '/apps/haunted-house/api/mansions'
export const OPEN_MANSION_PATH = '/apps/haunted-house/api/mansions/open'

export interface MansionApi {
  list: () => Promise<MansionListResponse>
  create: (name: string) => Promise<CreateMansionResponse>
  open: (name: string) => Promise<OpenMansionResponse>
}

/** A failed mansion request with safe copy suitable for inline Foyer feedback. */
export class MansionApiRequestError extends Error {
  readonly code: MansionApiErrorCode | undefined
  readonly status: number | undefined

  constructor(
    message: string,
    details: { code?: MansionApiErrorCode; status?: number } = {},
  ) {
    super(message)
    this.name = 'MansionApiRequestError'
    this.code = details.code
    this.status = details.status
  }
}

export interface BackendStatusResult {
  state: BackendStatus
  /** Asks the backend again. Shows the loading state until it answers. */
  retry: () => void
}

function isErrorRecord(value: unknown): value is Record<string, unknown> | Error {
  return (typeof value === 'object' && value !== null) || value instanceof Error
}

function httpStatusOf(error: unknown): number | undefined {
  if (!isErrorRecord(error)) return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : undefined
}

/** Parses the host SDK's string body, then lets core select fixed copy by stable code. */
function mansionErrorFromSdk(error: unknown): MansionApiRequestError {
  const status = httpStatusOf(error)
  if (!isErrorRecord(error) || typeof (error as { body?: unknown }).body !== 'string') {
    return new MansionApiRequestError(MANSION_REQUEST_FAILED, { status })
  }

  try {
    const response = parseMansionApiError(JSON.parse((error as { body: string }).body))
    return new MansionApiRequestError(response.error.message, {
      code: response.error.code,
      status,
    })
  } catch {
    return new MansionApiRequestError(UNEXPECTED_MANSION_RESPONSE, { status })
  }
}

function parsedSdkRequest<T>(request: () => Promise<unknown>, parse: (body: unknown) => T): Promise<T> {
  // Starting from a resolved promise also maps a synchronous permission-scope
  // refusal from the host client. Parser failures remain MansionApiParseError.
  return Promise.resolve().then(request).then(parse, (error: unknown) => {
    throw mansionErrorFromSdk(error)
  })
}

/**
 * Typed Mansion API over the permission-scoped host client. The returned object
 * stays stable when the host supplies a new client object on a later render.
 */
export function useMansionApi(): MansionApi {
  const api = useAppApi()
  const apiRef = useRef(api)
  apiRef.current = api

  return useMemo(
    () => ({
      list: () =>
        parsedSdkRequest(
          () => apiRef.current.get<unknown>(MANSIONS_PATH),
          parseMansionListResponse,
        ),
      create: (name: string) =>
        parsedSdkRequest(
          () => apiRef.current.post<unknown>(MANSIONS_PATH, { name }),
          parseCreateMansionResponse,
        ),
      open: (name: string) =>
        parsedSdkRequest(
          () => apiRef.current.post<unknown>(OPEN_MANSION_PATH, { name }),
          parseOpenMansionResponse,
        ),
    }),
    [],
  )
}

/** Checks once on mount whether our backend and, through it, the gateway answer. */
export function useBackendStatus(): BackendStatusResult {
  const api = useAppApi()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<BackendStatus>({ kind: 'loading' })

  // Runs on mount and on each retry only. `api` is deliberately not a
  // dependency: the host may hand out a new client object on every render.
  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    // Promise.resolve().then also catches a synchronous throw, which is how
    // the client may refuse a path outside permissions.api.
    Promise.resolve()
      .then(() => api.get(WHOAMI_PATH))
      .then(
        (body) => {
          if (!cancelled) setState(parseWhoami(body))
        },
        (err: unknown) => {
          if (!cancelled) setState(statusFromError(err))
        },
      )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, retry }
}

/** The host's chat launcher hook, or undefined on a host that does not supply one. */
function hostChatLauncher(): (() => { openChat?: (options: { slotKey: string }) => void } | undefined) | undefined {
  try {
    const hook = (hostSdk as { useChatLauncher?: unknown }).useChatLauncher
    return typeof hook === 'function' ? (hook as () => { openChat?: (options: { slotKey: string }) => void }) : undefined
  } catch {
    return undefined
  }
}

// Resolved once, so the hook below calls the same host hooks on every render.
const HOST_CHAT_LAUNCHER = hostChatLauncher()

/**
 * Opens an existing app-owned Crew session by its slot key (RG-S4), or null
 * when the host offers no way to. The call carries the slot key and nothing
 * else: no message, agent or new-chat option, so it can never create a chat or
 * send a turn. A caller without a slot key must not call it at all.
 */
export function useSessionOpener(): ((slotKey: string) => void) | null {
  const launcher = HOST_CHAT_LAUNCHER?.()
  const launcherRef = useRef(launcher)
  launcherRef.current = launcher
  const open = useCallback((slotKey: string) => {
    if (slotKey === '') return
    launcherRef.current?.openChat?.({ slotKey })
  }, [])
  return typeof launcher?.openChat === 'function' ? open : null
}
