// Pure Foyer state transitions. This module owns no React, SDK, network,
// filesystem, or clock behavior.
import {
  boundedMansionMessage,
  type MansionDescriptor,
} from './mansion-api'

export type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; mansions: MansionDescriptor[] }
  | { kind: 'error'; message: string }

export type MutationState =
  | { kind: 'idle' }
  | { kind: 'creating' | 'opening'; name: string }
  | {
      kind: 'error'
      operation: 'create' | 'open'
      name: string
      message: string
    }

export type ViewState =
  | { kind: 'foyer' }
  | { kind: 'mansion'; mansion: MansionDescriptor }

export interface FoyerState {
  load: LoadState
  mutation: MutationState
  selectedName: string | null
  view: ViewState
}

export type FoyerEvent =
  | { type: 'load_started' }
  | { type: 'load_succeeded'; mansions: readonly MansionDescriptor[] }
  | { type: 'load_failed'; message: string }
  | { type: 'mansion_selected'; name: string | null }
  | { type: 'create_started'; name: string }
  | { type: 'create_succeeded'; mansion: MansionDescriptor }
  | { type: 'create_failed'; name: string; message: string }
  | { type: 'open_started'; name: string }
  | { type: 'open_succeeded'; mansion: MansionDescriptor }
  | { type: 'open_failed'; name: string; message: string }
  | { type: 'returned_to_foyer' }

export function createInitialFoyerState(): FoyerState {
  return {
    load: { kind: 'loading' },
    mutation: { kind: 'idle' },
    selectedName: null,
    view: { kind: 'foyer' },
  }
}

export const INITIAL_FOYER_STATE: FoyerState = createInitialFoyerState()

function compareMansionNames(left: MansionDescriptor, right: MansionDescriptor): number {
  if (left.name < right.name) return -1
  if (left.name > right.name) return 1
  return 0
}

/** Replaces one same-name descriptor, or inserts it, and returns name-sorted data. */
export function upsertMansion(
  mansions: readonly MansionDescriptor[],
  mansion: MansionDescriptor,
): MansionDescriptor[] {
  return [...mansions.filter(({ name }) => name !== mansion.name), mansion].sort(compareMansionNames)
}

function normalizeMansions(mansions: readonly MansionDescriptor[]): MansionDescriptor[] {
  const byName = new Map<string, MansionDescriptor>()
  for (const mansion of mansions) byName.set(mansion.name, mansion)
  return [...byName.values()].sort(compareMansionNames)
}

function selectedIfAvailable(
  selectedName: string | null,
  mansions: readonly MansionDescriptor[],
): string | null {
  if (selectedName === null) return null
  return mansions.some(({ name, status }) => name === selectedName && status === 'ready')
    ? selectedName
    : null
}

function readyMansions(state: FoyerState): MansionDescriptor[] | null {
  return state.load.kind === 'ready' ? state.load.mansions : null
}

function isMutationPending(mutation: MutationState): boolean {
  return mutation.kind === 'creating' || mutation.kind === 'opening'
}

function matchingMutation(
  mutation: MutationState,
  operation: 'creating' | 'opening',
  name: string,
): boolean {
  return mutation.kind === operation && mutation.name === name
}

/** Reduces one Foyer event while preserving a unique, available selection. */
export function foyerReducer(state: FoyerState, event: FoyerEvent): FoyerState {
  switch (event.type) {
    case 'load_started':
      return createInitialFoyerState()

    case 'load_succeeded': {
      const mansions = normalizeMansions(event.mansions)
      return {
        load: { kind: 'ready', mansions },
        mutation: { kind: 'idle' },
        selectedName: selectedIfAvailable(state.selectedName, mansions),
        view: { kind: 'foyer' },
      }
    }

    case 'load_failed':
      return {
        load: { kind: 'error', message: boundedMansionMessage(event.message) },
        mutation: { kind: 'idle' },
        selectedName: null,
        view: { kind: 'foyer' },
      }

    case 'mansion_selected': {
      if (state.view.kind !== 'foyer' || state.load.kind !== 'ready') return state
      if (event.name === null) {
        return state.selectedName === null ? state : { ...state, selectedName: null }
      }
      const selectedName = selectedIfAvailable(event.name, state.load.mansions)
      if (selectedName === null || selectedName === state.selectedName) return state
      return { ...state, selectedName }
    }

    case 'create_started':
      if (state.view.kind !== 'foyer' || state.load.kind !== 'ready' || isMutationPending(state.mutation)) {
        return state
      }
      return { ...state, mutation: { kind: 'creating', name: event.name } }

    case 'create_succeeded': {
      if (!matchingMutation(state.mutation, 'creating', event.mansion.name)) return state
      const current = readyMansions(state)
      if (current === null || event.mansion.status !== 'ready') return state
      const mansions = upsertMansion(current, event.mansion)
      return {
        ...state,
        load: { kind: 'ready', mansions },
        mutation: { kind: 'idle' },
        selectedName: selectedIfAvailable(state.selectedName, mansions),
      }
    }

    case 'create_failed':
      if (!matchingMutation(state.mutation, 'creating', event.name)) return state
      return {
        ...state,
        mutation: {
          kind: 'error',
          operation: 'create',
          name: event.name,
          message: boundedMansionMessage(event.message),
        },
      }

    case 'open_started': {
      if (
        state.view.kind !== 'foyer' ||
        state.load.kind !== 'ready' ||
        isMutationPending(state.mutation) ||
        state.selectedName !== event.name ||
        !state.load.mansions.some(({ name, status }) => name === event.name && status === 'ready')
      ) {
        return state
      }
      return { ...state, mutation: { kind: 'opening', name: event.name } }
    }

    case 'open_succeeded': {
      if (
        !matchingMutation(state.mutation, 'opening', event.mansion.name) ||
        event.mansion.status !== 'ready'
      ) {
        return state
      }
      const current = readyMansions(state)
      if (current === null) return state
      const mansions = upsertMansion(current, event.mansion)
      return {
        load: { kind: 'ready', mansions },
        mutation: { kind: 'idle' },
        selectedName: event.mansion.name,
        view: { kind: 'mansion', mansion: event.mansion },
      }
    }

    case 'open_failed':
      if (!matchingMutation(state.mutation, 'opening', event.name)) return state
      return {
        ...state,
        mutation: {
          kind: 'error',
          operation: 'open',
          name: event.name,
          message: boundedMansionMessage(event.message),
        },
      }

    case 'returned_to_foyer':
      if (state.view.kind !== 'mansion') return state
      return { ...state, mutation: { kind: 'idle' }, view: { kind: 'foyer' } }
  }
}
