// Replay stand-in for the Crew app SDK. The replay build (vite.replay.config.ts)
// aliases the SDK module to this file, so src/adapters/sdk.ts and everything
// above it run unchanged. It never talks to a gateway: the only network request
// is one fetch of the recorded Event_Log, made on the first read of it.
// Nothing here opens a socket, and no call can change anything.
import { useSyncExternalStore } from 'react'
import { WHOAMI_PATH } from '../../core/backend-status'
// Type-only, so it is erased from the build and creates no import cycle.
import type { AppApiClient, AppApiError, AppTheme } from '../sdk'
import { createReplayMansionRoutes } from './mansions'
import { checkOwnSeance } from '../../core/own-seance'
import { REPLAY_MANSIONS_PATH } from '../../core/replay-mansion'
import { createReplaySource, type ReplaySource } from './replay-source'
import { createRoomGhostsReplayRoutes } from './room-ghosts-replay'
import { createSeanceReplayRoutes } from './seance-replay'
import { createWorkflowReplayRoutes } from './workflow-replay'

/** The recorded Event_Log, next to the replay page. The build copies fixtures/replay/demo.jsonl here. */
export { FIXTURE_URL } from './seance-replay'

/**
 * This page's one recording: `./fixture.jsonl`, fetched once and never from
 * anywhere else; or, once the visitor opens one, their own séance log, held
 * in memory only. The routes below read whichever is current through this
 * one object.
 */
let current = createReplaySource()
const replaySource: ReplaySource = {
  loadText: () => current.loadText(),
  recording: () => current.recording(),
  present: (mansionId, cursor) => current.present(mansionId, cursor),
  presentedCount: (mansionId) => current.presentedCount(mansionId),
  presented: (mansionId) => current.presented(mansionId),
}

/** How many times the visitor has opened a log of their own; the page starts again on each. */
let ownVersion = 0
const ownListeners = new Set<() => void>()

/** Where an opened log's mansions are said to be: not on this computer, which the page also says. */
export const OWN_SEANCE_FOLDER = '~/your-seance-log'

/**
 * The Attic's seam to the recording (replay-and-submission task 3.2). Only the
 * stand-in exports it, so its presence is what tells `adapters/sdk.ts` that
 * the page is the static replay. `load` returns the canonical Event_Log text;
 * `present` tells the read routes below how long a prefix of a Mansion's
 * Canonical_Order the Attic's Cursor has reached.
 */
export const replayRecording = {
  load: (): Promise<string> => replaySource.loadText(),
  present: (mansionId: string, cursor: number): void => replaySource.present(mansionId, cursor),
  /**
   * Replays a séance log the visitor opened from their own computer (Spec 11,
   * own-seance). The text is checked whole and kept in memory only: nothing
   * is uploaded, stored or fetched. On success the page starts again on it.
   */
  replace: (text: string, bytes: number): { readonly ok: boolean; readonly message: string } => {
    const check = checkOwnSeance(text, bytes)
    if (!check.ok) return { ok: false, message: check.message }
    const fixture = {
      schemaVersion: 1,
      mansions: check.mansionIds.map((name) => ({ name, projectSpec: name, displayPath: `${OWN_SEANCE_FOLDER}/${name}`, status: 'ready' })),
    }
    const routes = createReplayMansionRoutes(fixture)
    const listed = routes('GET', REPLAY_MANSIONS_PATH)
    if (listed === null || listed.status !== 200) return { ok: false, message: 'That séance log names a mansion this page cannot show.' }
    current = createReplaySource({ text })
    mansionRoutes = routes
    ownVersion += 1
    for (const listener of ownListeners) listener()
    const names = check.mansionIds.join(', ')
    return { ok: true, message: `Opened your séance log: ${check.records.length} records of ${names}. It stays on this page and is gone when you leave.` }
  },
  subscribe: (listener: () => void): (() => void) => {
    ownListeners.add(listener)
    return () => ownListeners.delete(listener)
  },
  version: (): number => ownVersion,
}

/** This page's canonical séance read route, answered from the recording (Spec 2, task 8.1). */
const seanceRoutes = createSeanceReplayRoutes(replaySource)

/** This page's workflow read route, folded from the same recording (Spec 4, task 15.1). */
const workflowRoutes = createWorkflowReplayRoutes(seanceRoutes)

/** This page's Room Ghosts read route: the read-only answer for the same recording (Spec 5, task 9.6). */
const roomGhostsRoutes = createRoomGhostsReplayRoutes(seanceRoutes)

function apiError(status: number, body: string): AppApiError {
  return Object.assign(new Error(`API ${status}: ${body}`), {
    name: 'AppApiError',
    status,
    body,
  })
}

function readOnly(method: string) {
  return async (path: string): Promise<never> => {
    throw apiError(405, `The replay is read-only: ${method} ${path} is not available.`)
  }
}

/** This page's in-memory mansion registry, seeded from the bundled recording. */
let mansionRoutes = createReplayMansionRoutes()

/**
 * Answers a mansion call from the in-memory registry the way the live client
 * would: the JSON body on 2xx, an AppApiError carrying the JSON text otherwise.
 * Returns undefined when the call is not a mansion route.
 */
function mansionReply(method: string, path: string, body?: unknown): { body: unknown } | undefined {
  const reply = mansionRoutes(method, path, body)
  if (reply === null) return undefined
  if (reply.status < 200 || reply.status > 299) throw apiError(reply.status, JSON.stringify(reply.body))
  return { body: reply.body }
}

const replayApi: AppApiClient = {
  async get<T = unknown>(path: string): Promise<T> {
    if (path === WHOAMI_PATH) {
      return { backend: 'replay', gateway: { version: 'replay' } } as T
    }
    const mansions = mansionReply('GET', path)
    if (mansions) return mansions.body as T
    const seance = seanceRoutes.get(path)
    if (seance !== null) return (await seance) as T
    const workflow = workflowRoutes.get(path)
    if (workflow !== null) return (await workflow) as T
    const roomGhosts = roomGhostsRoutes.get(path)
    if (roomGhosts !== null) return (await roomGhosts) as T
    throw apiError(404, `The replay has no recording for GET ${path}.`)
  },
  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const mansions = mansionReply('POST', path, body)
    if (mansions) return mansions.body as T
    return readOnly('POST')(path)
  },
  put: readOnly('PUT'),
  patch: readOnly('PATCH'),
  del: readOnly('DELETE'),
}

/** Same shape as the live client. Answers the status check and the mansion routes; every other call rejects. */
export function useAppApi(): AppApiClient {
  return replayApi
}

// Host theme stand-in. The static page is its own host, so it follows the
// browser's color-scheme preference, as Crew's theme follows Crew's setting.
// Without a readable preference (tests, old browsers) it is deterministic:
// dark. Reactive like the host hook, so a change reaches the page without a remount.
const schemeQuery: MediaQueryList | null =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
let replayTheme: AppTheme = { mode: schemeQuery?.matches === false ? 'light' : 'dark', accent: '', colorTheme: 'default' }
const themeListeners = new Set<() => void>()
schemeQuery?.addEventListener?.('change', (event) => setReplayTheme({ mode: event.matches ? 'dark' : 'light' }))

function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener)
  return () => {
    themeListeners.delete(listener)
  }
}

const currentTheme = () => replayTheme

/** Changes the stand-in theme. The replay page has no theme switch of its own; tests use this. */
export function setReplayTheme(change: Partial<AppTheme>): void {
  replayTheme = { ...replayTheme, ...change }
  for (const listener of [...themeListeners]) listener()
}

/** Reactive host-theme stand-in for the static replay build. */
export function useTheme(): AppTheme {
  return useSyncExternalStore(subscribeTheme, currentTheme, currentTheme)
}

const noSubscription = () => {}

/**
 * The replay has no live Crew events: its recording is the canonical Event_Log,
 * which the UI reads through the séance read route above. Subscribing is
 * accepted and never calls `cb`. Returns an unsubscribe function, like the live hook.
 */
export function useAppEvents(_event: string, _cb: (data: unknown) => void): () => void {
  return noSubscription
}

/** What a test may ask the stand-in to write down. The replay page itself never records. */
export interface ReplayHostRecorder {
  readonly notifications: string[]
  readonly badges: number[]
}

let recorder: ReplayHostRecorder | null = null

/** Test seam: synthetic toast and badge calls are appended to `target`. Pass null to stop. */
export function recordReplayHostEffects(target: ReplayHostRecorder | null): void {
  recorder = target
}

const replayToast = (text: string, _opts?: Record<string, unknown>) => {
  recorder?.notifications.push(text)
}
const replayBadge = (count: number) => {
  recorder?.badges.push(count)
}

/** A recording interrupts nobody: the replay page has no dashboard to toast in. No request, no storage. */
export function useNotify(): (text: string, opts?: Record<string, unknown>) => void {
  return replayToast
}

/** The replay page has no sidebar, so there is no badge to set. */
export function useNavBadge(): (count: number) => void {
  return replayBadge
}

/** Every `openChat` call made on the replay page. A recording has no Crew session, so this stays empty. */
export const replayChatLauncherCalls: unknown[] = []

const replayChatLauncher = {
  openChat(options?: { slotKey?: string }): void {
    replayChatLauncherCalls.push(options)
  },
}

/** The replay page opens no Crew session: the call is recorded and nothing else happens. */
export function useChatLauncher(): { openChat(options?: { slotKey?: string }): void } {
  return replayChatLauncher
}
