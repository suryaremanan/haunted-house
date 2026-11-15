// Replay stand-in for the Crew app SDK. The replay build (vite.replay.config.ts)
// aliases the SDK module to this file, so src/adapters/sdk.ts and everything
// above it run unchanged. It never talks to a gateway: the only network request
// is one fetch of the recorded Event_Log, made on the first séance read.
import { WHOAMI_PATH } from '../../core/backend-status'
// Type-only, so it is erased from the build and creates no import cycle.
import type { AppApiClient, AppApiError, AppTheme } from '../sdk'
import { createReplayMansionRoutes } from './mansions'
import { createRoomGhostsReplayRoutes } from './room-ghosts-replay'
import { createSeanceReplayRoutes } from './seance-replay'
import { createWorkflowReplayRoutes } from './workflow-replay'

/** The recorded Event_Log, next to the replay page. The build copies fixtures/replay/demo.jsonl here. */
export { FIXTURE_URL } from './seance-replay'

/** This page's canonical séance read route, answered from the recording (Spec 2, task 8.1). */
const seanceRoutes = createSeanceReplayRoutes()

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
const mansionRoutes = createReplayMansionRoutes()

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

const REPLAY_THEME: AppTheme = {
  mode: 'dark',
  accent: '',
  colorTheme: 'default',
}

/** Deterministic host-theme stand-in for the static replay build. */
export function useTheme(): AppTheme {
  return REPLAY_THEME
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

const noToast = (_text: string, _opts?: Record<string, unknown>) => {}
const noBadge = (_count: number) => {}

/** A recording interrupts nobody: the replay page has no dashboard to toast in. */
export function useNotify(): (text: string, opts?: Record<string, unknown>) => void {
  return noToast
}

/** The replay page has no sidebar, so there is no badge to set. */
export function useNavBadge(): (count: number) => void {
  return noBadge
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
