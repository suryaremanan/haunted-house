// SDK adapter: the only file in the UI that imports @kirocrew/app-sdk.
// The live build leaves the import to the dashboard's import map; the replay
// build aliases it to a stand-in. Everything else imports from here.
import { useAppApi, useAppEvents } from '@kirocrew/app-sdk'
// The namespace is read for every export a host may lack or shape differently
// (theme, toast, badge, chat launcher): a named import of a missing export
// would stop the whole page from loading.
import * as hostSdk from '@kirocrew/app-sdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseWhoami, statusFromError, WHOAMI_PATH, type BackendStatus } from '../core/backend-status'
import {
  MANSION_REQUEST_FAILED,
  UNEXPECTED_MANSION_RESPONSE,
  createMansionRequestBody,
  parseCreateMansionResponse,
  parseMansionApiError,
  parseMansionListResponse,
  parseOpenMansionResponse,
  type CreateMansionResponse,
  type MansionApiErrorCode,
  type MansionListResponse,
  type OpenMansionResponse,
} from '../core/mansion-api'

export { useAppApi, useAppEvents, WHOAMI_PATH }
export type { AppApiClient, AppApiError, AppTheme } from '@kirocrew/app-sdk'
export type { BackendStatus, GatewayErrorKind, GatewayStatus } from '../core/backend-status'

export const MANSIONS_PATH = '/apps/haunted-house/api/mansions'
export const OPEN_MANSION_PATH = '/apps/haunted-house/api/mansions/open'

export interface MansionApi {
  list: () => Promise<MansionListResponse>
  /** Sends `{name}`, or `{name, brief}` when `brief` is non-blank after normalising. */
  create: (name: string, brief?: string) => Promise<CreateMansionResponse>
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
      create: (name: string, brief?: string) =>
        parsedSdkRequest(
          () => apiRef.current.post<unknown>(MANSIONS_PATH, createMansionRequestBody(name, brief)),
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

// ---------------------------------------------------------------------------
// Host theme, toast and sidebar badge (Spec 6 task 3.1).
//
// Crew's docs name `useTheme`, `useNotify` and `useNavBadge` but do not define
// their value shapes, toast replacement, or cleanup. HUI-S1, the probe that
// would read them inside a running dashboard, has not been run. So nothing
// undocumented leaves this file: each hook is looked up once, called
// defensively, and its value is normalized. A host without a hook, or one that
// throws, leaves the page working with its own fallback palette, its in-page
// Needs You count and its live region.

export type HostThemeMode = 'light' | 'dark'

/** The host theme as this app uses it. Never the host's own object. */
export interface HostThemeSnapshot {
  readonly mode: HostThemeMode
  /** The host accent as given, or null when absent or not a short plain string. */
  readonly accent: string | null
  readonly colorTheme: string | null
}

/** Used when the host supplies no theme: the light fallback palette, which the house sheet also defaults to. */
export const FALLBACK_HOST_THEME: HostThemeSnapshot = { mode: 'light', accent: null, colorTheme: null }

const MAX_THEME_TEXT = 64

function themeText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  // A color or theme name: short, one line, nothing that could close a CSS declaration.
  return text !== '' && text.length <= MAX_THEME_TEXT && /^[\w#(),.%\s-]+$/.test(text) ? text : null
}

/** Reads only the three documented fields, each by type; anything else is ignored. */
export function normalizeHostTheme(raw: unknown): HostThemeSnapshot {
  if (typeof raw !== 'object' || raw === null) return FALLBACK_HOST_THEME
  const value = raw as { mode?: unknown; accent?: unknown; colorTheme?: unknown }
  const mode: HostThemeMode = value.mode === 'dark' ? 'dark' : value.mode === 'light' ? 'light' : FALLBACK_HOST_THEME.mode
  return { mode, accent: themeText(value.accent), colorTheme: themeText(value.colorTheme) }
}

/** A host hook by name, or undefined when this host does not export a function under it. */
function hostHook(name: string): ((...args: unknown[]) => unknown) | undefined {
  try {
    const hook = (hostSdk as Record<string, unknown>)[name]
    return typeof hook === 'function' ? (hook as (...args: unknown[]) => unknown) : undefined
  } catch {
    return undefined
  }
}

// Resolved once, so each wrapper calls the same host hooks in the same order on every render.
const HOST_USE_THEME = hostHook('useTheme')
const HOST_USE_NOTIFY = hostHook('useNotify')
const HOST_USE_NAV_BADGE = hostHook('useNavBadge')

/** Which host effects this host exports at all. False means the wrapper below is inert. */
export const HOST_HOOKS_PRESENT = {
  theme: HOST_USE_THEME !== undefined,
  notify: HOST_USE_NOTIFY !== undefined,
  navBadge: HOST_USE_NAV_BADGE !== undefined,
} as const

function callHook(hook: ((...args: unknown[]) => unknown) | undefined): unknown {
  if (hook === undefined) return undefined
  try {
    return hook()
  } catch {
    return undefined
  }
}

/** The reactive host theme, normalized. The same object is returned until a field changes. */
export function useHostTheme(): HostThemeSnapshot {
  const theme = normalizeHostTheme(callHook(HOST_USE_THEME))
  return useMemo(() => theme, [theme.mode, theme.accent, theme.colorTheme])
}

/** A promise a host function may return is watched, so a rejection never becomes an unhandled one. */
function settleQuietly(result: unknown): void {
  if (typeof result === 'object' && result !== null && typeof (result as { then?: unknown }).then === 'function') {
    ;(result as Promise<unknown>).then(undefined, () => {})
  }
}

/**
 * Shows one dashboard toast with exactly the given text and no option (no
 * option is documented). Returns false when the host has no toast or refused;
 * the caller's own live region and Needs You count carry the same information.
 * Never retries.
 */
export function useHostNotify(): (text: string) => boolean {
  const notify = callHook(HOST_USE_NOTIFY)
  const notifyRef = useRef(notify)
  notifyRef.current = notify
  return useCallback((text: string) => {
    const send = notifyRef.current
    if (typeof send !== 'function' || text === '') return false
    try {
      settleQuietly((send as (text: string) => unknown)(text))
      return true
    } catch {
      return false
    }
  }, [])
}

/**
 * Sets this app's sidebar badge to a whole, non-negative count. Zero is the
 * only clear operation the docs give. Returns false when the host has no
 * badge or refused. Never retries.
 */
export function useHostNavBadge(): (count: number) => boolean {
  const setBadge = callHook(HOST_USE_NAV_BADGE)
  const badgeRef = useRef(setBadge)
  badgeRef.current = setBadge
  return useCallback((count: number) => {
    const set = badgeRef.current
    if (typeof set !== 'function') return false
    const whole = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
    try {
      settleQuietly((set as (count: number) => unknown)(whole))
      return true
    } catch {
      return false
    }
  }, [])
}

// ---------------------------------------------------------------------------
// Static replay seam (replay-and-submission task 3.1).

/**
 * The recording of the static replay build. Only the replay stand-in exports
 * it; Crew's SDK has no such export, so in the live app this is null.
 */
export interface ReplayRecordingSeam {
  /** The text of `./fixture.jsonl`, the canonical Event_Log. One request per page, never another URL. */
  load(): Promise<string>
  /** Tells the stand-in's read routes how long a prefix of a Mansion's Canonical_Order the Attic has reached. */
  present(mansionId: string, cursor: number): void
  /** Replays a séance log the visitor opened, held in memory only (Spec 11). Absent on a stand-in without it. */
  replace?(text: string, bytes: number): { readonly ok: boolean; readonly message: string }
  /** Called when the visitor's own log replaces the recording; the page starts again on it. */
  subscribe?(listener: () => void): () => void
  version?(): number
}

function hostReplayRecording(): ReplayRecordingSeam | null {
  try {
    const seam = (hostSdk as { replayRecording?: unknown }).replayRecording
    if (typeof seam !== 'object' || seam === null) return null
    const { load, present } = seam as { load?: unknown; present?: unknown }
    return typeof load === 'function' && typeof present === 'function' ? (seam as ReplayRecordingSeam) : null
  } catch {
    return null
  }
}

/** The static replay's recording, or null in the live app. Resolved once: a page never changes mode. */
export const REPLAY_RECORDING: ReplayRecordingSeam | null = hostReplayRecording()
