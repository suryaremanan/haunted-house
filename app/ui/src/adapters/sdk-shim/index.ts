// Replay stand-in for the Crew app SDK. The replay build (vite.replay.config.ts)
// aliases the SDK module to this file, so src/adapters/sdk.ts and everything
// above it run unchanged. It never talks to a gateway: the only network request
// is one fetch of the recorded event file, made on the first event subscription.
import { useCallback, useEffect, useRef } from 'react'
import { WHOAMI_PATH } from '../../core/backend-status'
import { createPlayer, parseFrames } from '../../core/replay-player'
// Type-only, so it is erased from the build and creates no import cycle.
import type { AppApiClient, AppApiError } from '../sdk'

/** The recorded event file, next to the replay page. The build copies fixtures/replay/demo.jsonl here. */
export const FIXTURE_URL = './fixture.jsonl'

/** Plays frames at their recorded pace. */
const REPLAY_SPEED = 1

const player = createPlayer({ speed: REPLAY_SPEED })
let loading: Promise<void> | null = null

/** Fetches and starts the recording once. A failure is logged and not retried. */
function startReplay(): void {
  if (loading) return
  loading = fetch(FIXTURE_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Could not load the replay recording (HTTP ${res.status}).`)
      return res.text()
    })
    .then((text) => player.play(parseFrames(text)))
    .catch((err: unknown) => {
      console.error('Replay stopped:', err)
    })
}

function apiError(status: number, message: string): AppApiError {
  return Object.assign(new Error(message), { name: 'AppApiError', status })
}

function readOnly(method: string) {
  return async (path: string): Promise<never> => {
    throw apiError(405, `The replay is read-only: ${method} ${path} is not available.`)
  }
}

const replayApi: AppApiClient = {
  async get(path) {
    if (path === WHOAMI_PATH) return { backend: 'replay', gateway: { version: 'replay' } }
    throw apiError(404, `The replay has no recording for GET ${path}.`)
  },
  post: readOnly('POST'),
  put: readOnly('PUT'),
  patch: readOnly('PATCH'),
  del: readOnly('DELETE'),
}

/** Same shape as the live client. Answers the status check; every other call rejects. */
export function useAppApi(): AppApiClient {
  return replayApi
}

/**
 * Calls `cb` with `frame.data` for each recorded frame of type `event` played
 * while the component is mounted. Returns an unsubscribe function, like the live hook.
 */
export function useAppEvents(event: string, cb: (data: unknown) => void): () => void {
  const unsubscribe = useRef<() => void>(() => {})
  useEffect(() => {
    const off = player.subscribe(event, cb)
    unsubscribe.current = off
    startReplay()
    return off
  }, [event, cb])
  return useCallback(() => unsubscribe.current(), [])
}
