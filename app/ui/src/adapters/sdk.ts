// SDK adapter: the only file in the UI that imports @kirocrew/app-sdk.
// The live build leaves the import to the dashboard's import map; the replay
// build aliases it to a stand-in. Everything else imports from here.
import { useAppApi, useAppEvents } from '@kirocrew/app-sdk'
import { useCallback, useEffect, useState } from 'react'
import { parseWhoami, statusFromError, WHOAMI_PATH, type BackendStatus } from '../core/backend-status'

export { useAppApi, useAppEvents, WHOAMI_PATH }
export type { AppApiClient, AppApiError } from '@kirocrew/app-sdk'
export type { BackendStatus, GatewayErrorKind, GatewayStatus } from '../core/backend-status'

export interface BackendStatusResult {
  state: BackendStatus
  /** Asks the backend again. Shows the loading state until it answers. */
  retry: () => void
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
