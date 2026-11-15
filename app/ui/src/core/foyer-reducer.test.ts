import { describe, expect, it } from 'vitest'
import {
  createInitialFoyerState,
  foyerReducer,
  upsertMansion,
  type FoyerState,
} from './foyer-reducer'
import type { MansionDescriptor, MansionStatus } from './mansion-api'

function mansion(name: string, status: MansionStatus = 'ready'): MansionDescriptor {
  return {
    name,
    projectSpec: name,
    displayPath: `~/workspace/haunted-house/mansions/${name}`,
    status,
  }
}

function readyState(mansions: MansionDescriptor[], selectedName: string | null = null): FoyerState {
  return {
    load: { kind: 'ready', mansions },
    mutation: { kind: 'idle' },
    selectedName,
    view: { kind: 'foyer' },
  }
}

describe('Foyer list and selection transitions', () => {
  it('starts in the labelled loading state and enters a sorted ready state', () => {
    const initial = createInitialFoyerState()
    expect(initial).toEqual({
      load: { kind: 'loading' },
      mutation: { kind: 'idle' },
      selectedName: null,
      view: { kind: 'foyer' },
    })

    const loaded = foyerReducer(initial, {
      type: 'load_succeeded',
      mansions: [mansion('zeta-house'), mansion('alpha-house')],
    })
    expect(loaded.load).toEqual({
      kind: 'ready',
      mansions: [mansion('alpha-house'), mansion('zeta-house')],
    })
  })

  it('selects one ready mansion and refuses unavailable or unknown names', () => {
    const state = readyState([mansion('ready-house'), mansion('lost-house', 'missing')])
    const selected = foyerReducer(state, { type: 'mansion_selected', name: 'ready-house' })
    expect(selected.selectedName).toBe('ready-house')
    expect(foyerReducer(selected, { type: 'mansion_selected', name: 'lost-house' })).toBe(selected)
    expect(foyerReducer(selected, { type: 'mansion_selected', name: 'unknown-house' })).toBe(selected)
  })

  it('moves a failed load to an error and retry back to loading', () => {
    const failed = foyerReducer(createInitialFoyerState(), {
      type: 'load_failed',
      message: 'Could not list mansions.',
    })
    expect(failed.load).toEqual({ kind: 'error', message: 'Could not list mansions.' })
    expect(foyerReducer(failed, { type: 'load_started' })).toEqual(createInitialFoyerState())
  })
})

describe('Foyer create transitions', () => {
  it('identifies one pending create, ignores another start, then sorted-upserts the result', () => {
    const state = readyState([mansion('zeta-house')])
    const pending = foyerReducer(state, { type: 'create_started', name: 'alpha-house' })
    expect(pending.mutation).toEqual({ kind: 'creating', name: 'alpha-house' })
    expect(foyerReducer(pending, { type: 'create_started', name: 'other-house' })).toBe(pending)

    const complete = foyerReducer(pending, {
      type: 'create_succeeded',
      mansion: mansion('alpha-house'),
    })
    expect(complete.load).toEqual({
      kind: 'ready',
      mansions: [mansion('alpha-house'), mansion('zeta-house')],
    })
    expect(complete.mutation).toEqual({ kind: 'idle' })
  })

  it('preserves the list and selection when create fails', () => {
    const state = readyState([mansion('kept-house')], 'kept-house')
    const pending = foyerReducer(state, { type: 'create_started', name: 'new-house' })
    const failed = foyerReducer(pending, {
      type: 'create_failed',
      name: 'new-house',
      message: 'Existing content was left unchanged.',
    })
    expect(failed.load).toBe(state.load)
    expect(failed.selectedName).toBe('kept-house')
    expect(failed.mutation).toEqual({
      kind: 'error',
      operation: 'create',
      name: 'new-house',
      message: 'Existing content was left unchanged.',
    })
  })

  it('replaces a same-name descriptor without mutating the source list', () => {
    const source = [mansion('zeta-house'), mansion('alpha-house', 'missing')]
    expect(upsertMansion(source, mansion('alpha-house'))).toEqual([
      mansion('alpha-house'),
      mansion('zeta-house'),
    ])
    expect(source[1].status).toBe('missing')
  })
})

describe('Foyer open and return transitions', () => {
  it('opens only the selected ready mansion, enters its shell, and returns with selection intact', () => {
    const state = readyState([mansion('one-house'), mansion('two-house')], 'one-house')
    expect(foyerReducer(state, { type: 'open_started', name: 'two-house' })).toBe(state)

    const pending = foyerReducer(state, { type: 'open_started', name: 'one-house' })
    expect(pending.mutation).toEqual({ kind: 'opening', name: 'one-house' })

    const openedDescriptor = {
      ...mansion('one-house'),
      displayPath: '~/workspace/haunted-house/mansions/one-house',
    }
    const opened = foyerReducer(pending, {
      type: 'open_succeeded',
      mansion: openedDescriptor,
    })
    expect(opened.view).toEqual({ kind: 'mansion', mansion: openedDescriptor })
    expect(opened.selectedName).toBe('one-house')
    expect(opened.mutation).toEqual({ kind: 'idle' })

    const returned = foyerReducer(opened, { type: 'returned_to_foyer' })
    expect(returned.view).toEqual({ kind: 'foyer' })
    expect(returned.selectedName).toBe('one-house')
    expect(returned.load).toBe(opened.load)
  })

  it('preserves the current list and selection when open fails', () => {
    const state = readyState([mansion('one-house')], 'one-house')
    const pending = foyerReducer(state, { type: 'open_started', name: 'one-house' })
    const failed = foyerReducer(pending, {
      type: 'open_failed',
      name: 'one-house',
      message: 'This mansion is missing from storage.',
    })
    expect(failed.load).toBe(state.load)
    expect(failed.selectedName).toBe('one-house')
    expect(failed.mutation).toEqual({
      kind: 'error',
      operation: 'open',
      name: 'one-house',
      message: 'This mansion is missing from storage.',
    })
  })
})
