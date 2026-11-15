// Foyer controller: connects the pure Foyer reducer to the Mansion API. All
// state decisions stay in core/foyer-reducer.ts; this hook only sequences
// requests, feeds their parsed results to the reducer, and reports completed
// create and open results for the one polite live region.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MansionApiRequestError, useMansionApi } from '../../adapters/sdk'
import { createInitialFoyerState, foyerReducer, type FoyerEvent, type FoyerState } from '../../core/foyer-reducer'
import {
  MANSION_REQUEST_FAILED,
  MansionApiParseError,
  UNEXPECTED_MANSION_RESPONSE,
  type CreateMansionOutcome,
} from '../../core/mansion-api'

export interface FoyerController {
  state: FoyerState
  /** Asks for the mansion list again after a failed load. */
  retryLoad: () => void
  select: (name: string) => void
  /** Resolves true when the mansion was created or adopted, false when refused or failed. */
  create: (name: string) => Promise<boolean>
  /** Selects `name`, then asks the backend to revalidate and open it. */
  open: (name: string) => void
  returnToFoyer: () => void
}

export interface UseFoyerOptions {
  /** Called once for each completed create or open. Never called for progress or errors. */
  onAnnounce?: (message: string) => void
}

const CREATE_ANNOUNCEMENT: Record<CreateMansionOutcome, (name: string) => string> = {
  created: (name) => `Mansion ${name} created.`,
  existing_compatible: (name) => `Mansion ${name} already exists. Nothing was changed.`,
}

/** Only the adapter's own errors carry copy that is safe to show. */
function failureMessage(error: unknown): string {
  return error instanceof MansionApiRequestError || error instanceof MansionApiParseError
    ? error.message
    : MANSION_REQUEST_FAILED
}

export function useFoyer({ onAnnounce }: UseFoyerOptions = {}): FoyerController {
  const api = useMansionApi()
  const apiRef = useRef(api)
  apiRef.current = api
  const announceRef = useRef(onAnnounce)
  announceRef.current = onAnnounce

  const [state, setState] = useState<FoyerState>(createInitialFoyerState)
  // The reducer runs against this ref so a handler knows at once whether its
  // event was accepted, without waiting for a render.
  const stateRef = useRef(state)
  const mounted = useRef(false)
  const [attempt, setAttempt] = useState(0)

  const dispatch = useCallback((event: FoyerEvent): FoyerState => {
    const next = foyerReducer(stateRef.current, event)
    if (next !== stateRef.current) {
      stateRef.current = next
      if (mounted.current) setState(next)
    }
    return next
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Requirement 1.1: the list is requested when the Foyer mounts, which the
  // app allows only once the backend is reachable, and again on each retry.
  useEffect(() => {
    let cancelled = false
    dispatch({ type: 'load_started' })
    apiRef.current.list().then(
      ({ mansions }) => {
        if (!cancelled) dispatch({ type: 'load_succeeded', mansions })
      },
      (error: unknown) => {
        if (!cancelled) dispatch({ type: 'load_failed', message: failureMessage(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt, dispatch])

  const retryLoad = useCallback(() => setAttempt((n) => n + 1), [])

  const select = useCallback(
    (name: string) => {
      dispatch({ type: 'mansion_selected', name })
    },
    [dispatch],
  )

  const create = useCallback(
    async (name: string): Promise<boolean> => {
      const before = stateRef.current
      // The reducer refuses a start while any mutation is pending or the list is not ready.
      if (dispatch({ type: 'create_started', name }) === before) return false
      try {
        const { outcome, mansion } = await apiRef.current.create(name)
        if (mansion.name !== name) throw new MansionApiParseError()
        dispatch({ type: 'create_succeeded', mansion })
        announceRef.current?.(CREATE_ANNOUNCEMENT[outcome](name))
        return true
      } catch (error) {
        dispatch({ type: 'create_failed', name, message: failureMessage(error) })
        return false
      }
    },
    [dispatch],
  )

  const open = useCallback(
    (name: string) => {
      dispatch({ type: 'mansion_selected', name })
      const before = stateRef.current
      if (dispatch({ type: 'open_started', name }) === before) return
      apiRef.current.open(name).then(
        ({ mansion }) => {
          if (mansion.name !== name) {
            dispatch({ type: 'open_failed', name, message: UNEXPECTED_MANSION_RESPONSE })
            return
          }
          dispatch({ type: 'open_succeeded', mansion })
          announceRef.current?.(`Mansion ${name} opened.`)
        },
        (error: unknown) => {
          dispatch({ type: 'open_failed', name, message: failureMessage(error) })
        },
      )
    },
    [dispatch],
  )

  const returnToFoyer = useCallback(() => {
    dispatch({ type: 'returned_to_foyer' })
  }, [dispatch])

  return useMemo(
    () => ({ state, retryLoad, select, create, open, returnToFoyer }),
    [state, retryLoad, select, create, open, returnToFoyer],
  )
}
