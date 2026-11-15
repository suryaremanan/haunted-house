// Example and edge tests for the Foyer reducer (task 7.3): sorted upsert,
// stale selection, retry transitions, late or mismatched results, bounded
// messages, and the return state. Baseline journeys live in foyer-reducer.test.ts.
import { describe, expect, it } from 'vitest'
import {
  INITIAL_FOYER_STATE,
  createInitialFoyerState,
  foyerReducer,
  upsertMansion,
  type FoyerEvent,
  type FoyerState,
} from './foyer-reducer'
import {
  MANSION_REQUEST_FAILED,
  MAX_MANSION_MESSAGE_LENGTH,
  type MansionDescriptor,
  type MansionStatus,
} from './mansion-api'

function mansion(name: string, status: MansionStatus = 'ready'): MansionDescriptor {
  return { name, projectSpec: name, displayPath: `~/workspace/haunted-house/mansions/${name}`, status }
}

function readyState(mansions: MansionDescriptor[], overrides: Partial<FoyerState> = {}): FoyerState {
  return {
    load: { kind: 'ready', mansions },
    mutation: { kind: 'idle' },
    selectedName: null,
    view: { kind: 'foyer' },
    ...overrides,
  }
}

function reduce(state: FoyerState, ...events: FoyerEvent[]): FoyerState {
  return events.reduce(foyerReducer, state)
}

describe('sorted upsert', () => {
  it('inserts into an empty list', () => {
    expect(upsertMansion([], mansion('only'))).toEqual([mansion('only')])
  })

  it.each([
    ['first', 'a', ['a', 'b', 'd']],
    ['in the middle', 'c', ['b', 'c', 'd']],
    ['last', 'e', ['b', 'd', 'e']],
  ])('inserts %s by name', (_label, name, expected) => {
    expect(upsertMansion([mansion('b'), mansion('d')], mansion(name)).map((m) => m.name)).toEqual(expected)
  })

  it('orders by code unit, so digits precede letters and a prefix precedes its extension', () => {
    const names = ['b', 'a-b', 'a', '10', '9', 'a0']
    const sorted = names.reduce<MansionDescriptor[]>((list, name) => upsertMansion(list, mansion(name)), [])
    expect(sorted.map((m) => m.name)).toEqual(['10', '9', 'a', 'a-b', 'a0', 'b'])
  })

  it('replaces a same-name descriptor instead of adding a second one', () => {
    const next = upsertMansion([mansion('a', 'conflict'), mansion('b')], mansion('a'))
    expect(next).toEqual([mansion('a'), mansion('b')])
  })

  it('is idempotent and never returns or edits the source array', () => {
    const source = Object.freeze([mansion('b'), mansion('a')]) as readonly MansionDescriptor[]
    const once = upsertMansion(source, mansion('c'))
    expect(upsertMansion(once, mansion('c'))).toEqual(once)
    expect(once).not.toBe(source)
    expect(source.map((m) => m.name)).toEqual(['b', 'a'])
  })
})

describe('list loading', () => {
  it('exposes an initial state equal to a freshly created one', () => {
    expect(INITIAL_FOYER_STATE).toEqual(createInitialFoyerState())
    expect(createInitialFoyerState()).not.toBe(createInitialFoyerState())
  })

  it('enters the ready state with an empty list', () => {
    const loaded = foyerReducer(createInitialFoyerState(), { type: 'load_succeeded', mansions: [] })
    expect(loaded).toEqual(readyState([]))
  })

  it('keeps the last descriptor when a list repeats a name, and sorts the result', () => {
    const loaded = foyerReducer(createInitialFoyerState(), {
      type: 'load_succeeded',
      mansions: [mansion('b'), mansion('a', 'missing'), mansion('a')],
    })
    expect(loaded.load).toEqual({ kind: 'ready', mansions: [mansion('a'), mansion('b')] })
  })

  it('does not keep a reference to the event array', () => {
    const mansions = [mansion('a')]
    const loaded = foyerReducer(createInitialFoyerState(), { type: 'load_succeeded', mansions })
    mansions.push(mansion('b'))
    expect(loaded.load).toEqual({ kind: 'ready', mansions: [mansion('a')] })
  })

  it('bounds a load failure message and falls back for an empty one', () => {
    const long = foyerReducer(createInitialFoyerState(), {
      type: 'load_failed',
      message: `first line\n${'x'.repeat(500)}`,
    })
    expect(long.load.kind).toBe('error')
    const message = long.load.kind === 'error' ? long.load.message : ''
    expect(message).toHaveLength(MAX_MANSION_MESSAGE_LENGTH)
    expect(message).not.toContain('\n')

    const empty = foyerReducer(createInitialFoyerState(), { type: 'load_failed', message: '   ' })
    expect(empty.load).toEqual({ kind: 'error', message: MANSION_REQUEST_FAILED })
  })

  it('fabricates no list after a failure: selection, create, and open are refused', () => {
    const failed = foyerReducer(readyState([mansion('a')], { selectedName: 'a' }), {
      type: 'load_failed',
      message: 'Could not list mansions.',
    })
    expect(failed.selectedName).toBeNull()
    expect(foyerReducer(failed, { type: 'mansion_selected', name: 'a' })).toBe(failed)
    expect(foyerReducer(failed, { type: 'create_started', name: 'b' })).toBe(failed)
    expect(foyerReducer(failed, { type: 'open_started', name: 'a' })).toBe(failed)
  })

  it('refuses selection, create, and open while the list is loading', () => {
    const loading = createInitialFoyerState()
    expect(foyerReducer(loading, { type: 'mansion_selected', name: 'a' })).toBe(loading)
    expect(foyerReducer(loading, { type: 'create_started', name: 'a' })).toBe(loading)
    expect(foyerReducer(loading, { type: 'open_started', name: 'a' })).toBe(loading)
  })

  it('retries from an error through loading to ready', () => {
    const failed = foyerReducer(createInitialFoyerState(), { type: 'load_failed', message: 'No.' })
    const retrying = foyerReducer(failed, { type: 'load_started' })
    expect(retrying).toEqual(createInitialFoyerState())
    const loaded = foyerReducer(retrying, { type: 'load_succeeded', mansions: [mansion('a')] })
    expect(loaded).toEqual(readyState([mansion('a')]))
  })

  it('can fail again on retry and replaces the earlier message', () => {
    const state = reduce(
      createInitialFoyerState(),
      { type: 'load_failed', message: 'First failure.' },
      { type: 'load_started' },
      { type: 'load_failed', message: 'Second failure.' },
    )
    expect(state.load).toEqual({ kind: 'error', message: 'Second failure.' })
  })
})

describe('stale selection', () => {
  it('keeps the selection across a reload that still lists it as ready', () => {
    const state = foyerReducer(readyState([mansion('a'), mansion('b')], { selectedName: 'b' }), {
      type: 'load_succeeded',
      mansions: [mansion('b'), mansion('c')],
    })
    expect(state.selectedName).toBe('b')
  })

  it.each([
    ['is no longer listed', [mansion('a')]],
    ['became missing', [mansion('a'), mansion('b', 'missing')]],
    ['became a conflict', [mansion('a'), mansion('b', 'conflict')]],
  ])('clears the selection when the selected mansion %s', (_label, mansions) => {
    const state = foyerReducer(readyState([mansion('a'), mansion('b')], { selectedName: 'b' }), {
      type: 'load_succeeded',
      mansions,
    })
    expect(state.selectedName).toBeNull()
  })

  it('moves the single selection from one mansion to another', () => {
    const state = reduce(
      readyState([mansion('a'), mansion('b')]),
      { type: 'mansion_selected', name: 'a' },
      { type: 'mansion_selected', name: 'b' },
    )
    expect(state.selectedName).toBe('b')
  })

  it('clears the selection on request and is a no-op when nothing is selected', () => {
    const selected = readyState([mansion('a')], { selectedName: 'a' })
    const cleared = foyerReducer(selected, { type: 'mansion_selected', name: null })
    expect(cleared.selectedName).toBeNull()
    expect(foyerReducer(cleared, { type: 'mansion_selected', name: null })).toBe(cleared)
  })

  it('returns the same state when the selected mansion is selected again', () => {
    const selected = readyState([mansion('a')], { selectedName: 'a' })
    expect(foyerReducer(selected, { type: 'mansion_selected', name: 'a' })).toBe(selected)
  })
})

describe('create results', () => {
  it('ignores a create result when no create is pending', () => {
    const state = readyState([mansion('a')])
    expect(foyerReducer(state, { type: 'create_succeeded', mansion: mansion('b') })).toBe(state)
    expect(foyerReducer(state, { type: 'create_failed', name: 'b', message: 'No.' })).toBe(state)
  })

  it('ignores a create result for a different name than the pending one', () => {
    const pending = foyerReducer(readyState([]), { type: 'create_started', name: 'a' })
    expect(foyerReducer(pending, { type: 'create_succeeded', mansion: mansion('b') })).toBe(pending)
    expect(foyerReducer(pending, { type: 'create_failed', name: 'b', message: 'No.' })).toBe(pending)
  })

  it('ignores a create success whose descriptor is not ready', () => {
    const pending = foyerReducer(readyState([]), { type: 'create_started', name: 'a' })
    expect(foyerReducer(pending, { type: 'create_succeeded', mansion: mansion('a', 'conflict') })).toBe(pending)
  })

  it('refuses an open while a create is pending, and a create while an open is pending', () => {
    const base = readyState([mansion('a')], { selectedName: 'a' })
    const creating = foyerReducer(base, { type: 'create_started', name: 'b' })
    expect(foyerReducer(creating, { type: 'open_started', name: 'a' })).toBe(creating)
    const opening = foyerReducer(base, { type: 'open_started', name: 'a' })
    expect(foyerReducer(opening, { type: 'create_started', name: 'b' })).toBe(opening)
  })

  it('adopting an already listed mansion replaces its descriptor and keeps one entry', () => {
    const state = reduce(
      readyState([mansion('a', 'missing'), mansion('b')], { selectedName: 'b' }),
      { type: 'create_started', name: 'a' },
      { type: 'create_succeeded', mansion: mansion('a') },
    )
    expect(state.load).toEqual({ kind: 'ready', mansions: [mansion('a'), mansion('b')] })
    expect(state.selectedName).toBe('b')
  })

  it('retries a failed create: the error clears when the next attempt starts', () => {
    const failed = reduce(
      readyState([mansion('a')]),
      { type: 'create_started', name: 'b' },
      { type: 'create_failed', name: 'b', message: 'Mansion records are unavailable. Try again.' },
    )
    expect(failed.mutation.kind).toBe('error')
    const retrying = foyerReducer(failed, { type: 'create_started', name: 'b' })
    expect(retrying.mutation).toEqual({ kind: 'creating', name: 'b' })
    const done = foyerReducer(retrying, { type: 'create_succeeded', mansion: mansion('b') })
    expect(done).toEqual(readyState([mansion('a'), mansion('b')]))
  })

  it('bounds a create failure message', () => {
    const failed = reduce(
      readyState([]),
      { type: 'create_started', name: 'a' },
      { type: 'create_failed', name: 'a', message: `no\n${'y'.repeat(400)}` },
    )
    const message = failed.mutation.kind === 'error' ? failed.mutation.message : ''
    expect(message).toHaveLength(MAX_MANSION_MESSAGE_LENGTH)
    expect(message).not.toContain('\n')
  })
})

describe('open results and return', () => {
  it.each([
    ['nothing is selected', readyState([mansion('a')])],
    ['another mansion is selected', readyState([mansion('a'), mansion('b')], { selectedName: 'b' })],
  ])('refuses to open when %s', (_label, state) => {
    expect(foyerReducer(state, { type: 'open_started', name: 'a' })).toBe(state)
  })

  it('ignores an open result when no open is pending or the name differs', () => {
    const idle = readyState([mansion('a'), mansion('b')], { selectedName: 'a' })
    expect(foyerReducer(idle, { type: 'open_succeeded', mansion: mansion('a') })).toBe(idle)
    const opening = foyerReducer(idle, { type: 'open_started', name: 'a' })
    expect(foyerReducer(opening, { type: 'open_succeeded', mansion: mansion('b') })).toBe(opening)
    expect(foyerReducer(opening, { type: 'open_failed', name: 'b', message: 'No.' })).toBe(opening)
  })

  it('stays in the Foyer when an open result is not ready', () => {
    const opening = foyerReducer(readyState([mansion('a')], { selectedName: 'a' }), {
      type: 'open_started',
      name: 'a',
    })
    const state = foyerReducer(opening, { type: 'open_succeeded', mansion: mansion('a', 'missing') })
    expect(state).toBe(opening)
    expect(state.view).toEqual({ kind: 'foyer' })
  })

  it('retries a failed open and enters the shell on success', () => {
    const state = reduce(
      readyState([mansion('a')], { selectedName: 'a' }),
      { type: 'open_started', name: 'a' },
      { type: 'open_failed', name: 'a', message: 'This mansion is missing from storage.' },
      { type: 'open_started', name: 'a' },
      { type: 'open_succeeded', mansion: mansion('a') },
    )
    expect(state.view).toEqual({ kind: 'mansion', mansion: mansion('a') })
    expect(state.mutation).toEqual({ kind: 'idle' })
  })

  it('refuses selection, create, and open while the shell is open', () => {
    const inShell = readyState([mansion('a'), mansion('b')], {
      selectedName: 'a',
      view: { kind: 'mansion', mansion: mansion('a') },
    })
    expect(foyerReducer(inShell, { type: 'mansion_selected', name: 'b' })).toBe(inShell)
    expect(foyerReducer(inShell, { type: 'create_started', name: 'c' })).toBe(inShell)
    expect(foyerReducer(inShell, { type: 'open_started', name: 'a' })).toBe(inShell)
  })

  it('returns to the Foyer with the list and selection intact, and only from the shell', () => {
    const inShell = readyState([mansion('a'), mansion('b')], {
      selectedName: 'a',
      view: { kind: 'mansion', mansion: mansion('a') },
    })
    const returned = foyerReducer(inShell, { type: 'returned_to_foyer' })
    expect(returned).toEqual(readyState([mansion('a'), mansion('b')], { selectedName: 'a' }))
    expect(returned.load).toBe(inShell.load)
    expect(foyerReducer(returned, { type: 'returned_to_foyer' })).toBe(returned)
  })

  it('can open another mansion after returning', () => {
    const state = reduce(
      readyState([mansion('a'), mansion('b')], { selectedName: 'a', view: { kind: 'mansion', mansion: mansion('a') } }),
      { type: 'returned_to_foyer' },
      { type: 'mansion_selected', name: 'b' },
      { type: 'open_started', name: 'b' },
      { type: 'open_succeeded', mansion: mansion('b') },
    )
    expect(state.view).toEqual({ kind: 'mansion', mansion: mansion('b') })
    expect(state.selectedName).toBe('b')
  })
})
