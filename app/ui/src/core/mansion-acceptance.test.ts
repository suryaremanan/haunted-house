// Cross-layer acceptance: real Mansion_API responses, recorded by the Python
// test app/backend/tests/integration/test_mansion_lifecycle_acceptance.py over
// temporary roots, are parsed and reduced into Foyer state here. The Python
// test fails if the backend's responses drift from this fixture, so both
// layers are held to one transcript.
// **Validates: Requirements 1.1, 1.4, 1.5, 1.6, 7.1, 7.2, 7.3**
import { describe, expect, it } from 'vitest'
import transcriptJson from '../../../../fixtures/mansions/api-acceptance.json'
import { createInitialFoyerState, foyerReducer, type FoyerState } from './foyer-reducer'
import {
  parseCreateMansionResponse,
  parseMansionApiError,
  parseMansionListResponse,
  parseOpenMansionResponse,
  type MansionApiErrorCode,
  type MansionDescriptor,
} from './mansion-api'

interface Exchange {
  readonly step: string
  readonly method: string
  readonly path: string
  readonly request: { readonly name?: unknown } | null
  readonly status: number
  readonly body: unknown
}

const exchanges = (transcriptJson as { exchanges: Exchange[] }).exchanges

const descriptor = (name: string, status: MansionDescriptor['status'] = 'ready'): MansionDescriptor => ({
  name,
  projectSpec: name,
  displayPath: `~/workspace/haunted-house/mansions/${name}`,
  status,
})

interface Walk {
  readonly states: Map<string, FoyerState>
  readonly errors: Map<string, MansionApiErrorCode>
}

/** Feeds every recorded exchange through the parsers and the reducer, as the Foyer does. */
function walkTranscript(): Walk {
  const states = new Map<string, FoyerState>()
  const errors = new Map<string, MansionApiErrorCode>()
  let state = createInitialFoyerState()
  const dispatch = (event: Parameters<typeof foyerReducer>[1]) => {
    state = foyerReducer(state, event)
  }

  for (const exchange of exchanges) {
    const ok = exchange.status >= 200 && exchange.status < 300
    const requested = exchange.request?.name
    const name = typeof requested === 'string' ? requested : ''
    const failure = ok ? null : parseMansionApiError(exchange.body).error
    if (failure) errors.set(exchange.step, failure.code)

    if (exchange.method === 'GET' && exchange.path === '/api/mansions') {
      dispatch({ type: 'load_started' })
      if (failure) dispatch({ type: 'load_failed', message: failure.message })
      else dispatch({ type: 'load_succeeded', mansions: parseMansionListResponse(exchange.body).mansions })
    } else if (exchange.method === 'POST' && exchange.path === '/api/mansions') {
      if (state.view.kind === 'mansion') dispatch({ type: 'returned_to_foyer' })
      dispatch({ type: 'create_started', name })
      if (failure) dispatch({ type: 'create_failed', name, message: failure.message })
      else dispatch({ type: 'create_succeeded', mansion: parseCreateMansionResponse(exchange.body).mansion })
    } else if (exchange.method === 'POST' && exchange.path === '/api/mansions/open') {
      if (state.view.kind === 'mansion') dispatch({ type: 'returned_to_foyer' })
      dispatch({ type: 'mansion_selected', name })
      dispatch({ type: 'open_started', name })
      if (failure) dispatch({ type: 'open_failed', name, message: failure.message })
      else dispatch({ type: 'open_succeeded', mansion: parseOpenMansionResponse(exchange.body).mansion })
    } else {
      throw new Error(`unexpected exchange ${exchange.method} ${exchange.path}`)
    }
    states.set(exchange.step, state)
  }
  return { states, errors }
}

describe('mansion lifecycle acceptance transcript', () => {
  it('covers the recorded journey in order', () => {
    expect(exchanges.map(({ step }) => step)).toEqual([
      'list-empty',
      'create',
      'list-after-create',
      'open',
      'list-after-restart',
      'open-after-restart',
      'create-repeat',
      'open-unregistered',
      'adopt',
      'open-adopted',
      'create-conflict',
      'open-conflict',
      'invalid-name',
      'invalid-request',
      'list-final',
      'open-broken',
      // Design decision 2026-11-16: create may carry an optional feature brief.
      'create-with-brief',
      'create-with-brief-repeat',
    ])
  })

  it('every recorded response parses under the strict UI contract', () => {
    for (const exchange of exchanges) {
      const ok = exchange.status >= 200 && exchange.status < 300
      if (!ok) {
        expect(() => parseMansionApiError(exchange.body), exchange.step).not.toThrow()
      } else if (exchange.method === 'GET') {
        expect(() => parseMansionListResponse(exchange.body), exchange.step).not.toThrow()
      } else if (exchange.path === '/api/mansions') {
        expect(() => parseCreateMansionResponse(exchange.body), exchange.step).not.toThrow()
      } else {
        expect(() => parseOpenMansionResponse(exchange.body), exchange.step).not.toThrow()
      }
      expect(JSON.stringify(exchange.body), exchange.step).not.toMatch(/\/Users\/|\/home\/|\/private\/|\/var\/|\/tmp\//)
    }
  })

  it('reduces list, create, select and open into the Mansion Shell state', () => {
    const { states } = walkTranscript()

    expect(states.get('list-empty')).toEqual({
      load: { kind: 'ready', mansions: [] },
      mutation: { kind: 'idle' },
      selectedName: null,
      view: { kind: 'foyer' },
    })
    expect(states.get('create')).toEqual({
      load: { kind: 'ready', mansions: [descriptor('weather-station')] },
      mutation: { kind: 'idle' },
      selectedName: null,
      view: { kind: 'foyer' },
    })
    // The list the backend returns equals the list the reducer built by upsert.
    expect(states.get('list-after-create')).toEqual(states.get('create'))
    expect(states.get('open')).toEqual({
      load: { kind: 'ready', mansions: [descriptor('weather-station')] },
      mutation: { kind: 'idle' },
      selectedName: 'weather-station',
      view: { kind: 'mansion', mansion: descriptor('weather-station') },
    })
  })

  it('reaches the same state after a backend restart', () => {
    const { states } = walkTranscript()

    expect(states.get('list-after-restart')).toEqual(states.get('list-after-create'))
    expect(states.get('open-after-restart')).toEqual(states.get('open'))
    const repeated = states.get('create-repeat')
    expect(repeated?.load).toEqual({ kind: 'ready', mansions: [descriptor('weather-station')] })
    expect(repeated?.mutation).toEqual({ kind: 'idle' })
  })

  it('adopts a compatible project through the same sorted upsert and keeps the list on refusal', () => {
    const { states, errors } = walkTranscript()
    const both = [descriptor('adopted-project'), descriptor('weather-station')]

    expect(errors.get('open-unregistered')).toBe('mansion_not_registered')
    expect(states.get('adopt')?.load).toEqual({ kind: 'ready', mansions: both })
    expect(states.get('open-adopted')?.view).toEqual({
      kind: 'mansion',
      mansion: descriptor('adopted-project'),
    })

    expect(errors.get('create-conflict')).toBe('mansion_conflict')
    const refused = states.get('create-conflict')
    expect(refused?.load).toEqual({ kind: 'ready', mansions: both })
    expect(refused?.mutation).toEqual({
      kind: 'error',
      operation: 'create',
      name: 'legacy-code',
      message: 'Existing content conflicts with this mansion. Nothing was changed.',
    })
    expect(errors.get('open-conflict')).toBe('mansion_not_registered')
    expect(errors.get('invalid-name')).toBe('invalid_mansion_name')
    expect(errors.get('invalid-request')).toBe('invalid_request')
    expect(states.get('invalid-request')?.load).toEqual({ kind: 'ready', mansions: both })
  })

  it('shows a registered project that broke as a conflict that cannot be selected or opened', () => {
    const { states, errors } = walkTranscript()

    expect(states.get('list-final')).toEqual({
      load: {
        kind: 'ready',
        mansions: [descriptor('adopted-project', 'conflict'), descriptor('weather-station')],
      },
      mutation: { kind: 'idle' },
      selectedName: null,
      view: { kind: 'foyer' },
    })
    expect(errors.get('open-broken')).toBe('mansion_conflict')
    const last = states.get('open-broken')
    expect(last?.selectedName).toBeNull()
    expect(last?.view).toEqual({ kind: 'foyer' })
  })

  it('creates a mansion with a feature brief through the same response contract', () => {
    const { states } = walkTranscript()
    const withBrief = [
      descriptor('adopted-project', 'conflict'),
      descriptor('guest-book'),
      descriptor('weather-station'),
    ]

    expect(states.get('create-with-brief')?.load).toEqual({ kind: 'ready', mansions: withBrief })
    expect(states.get('create-with-brief')?.mutation).toEqual({ kind: 'idle' })
    expect(states.get('create-with-brief-repeat')?.load).toEqual({ kind: 'ready', mansions: withBrief })
  })
})
