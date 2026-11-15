// Feature: mansion-lifecycle, Property 9: Foyer transitions preserve one coherent selection and list
//
// For all valid Foyer states and event sequences, the Foyer reducer keeps
// selection null or equal to exactly one listed Mansion_Name, permits at most
// one pending create or open mutation, preserves the last successful list on
// mutation failure, and upserts a successful create descriptor through the
// same sorted transition in live and replay modes.
//
// **Validates: Requirements 1.4, 8.2, 8.3, 8.5, 9.3**
//
// Live and replay builds share this one reducer, so the sorted upsert checked
// here is the transition both modes run. Names come from a small pool so that
// events often hit listed, selected, and pending mansions.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  createInitialFoyerState,
  foyerReducer,
  upsertMansion,
  type FoyerEvent,
  type FoyerState,
  type MutationState,
} from './foyer-reducer'
import { MANSION_STATUSES, type MansionDescriptor, type MansionStatus } from './mansion-api'

const NAMES = ['attic', 'belfry', 'cellar', 'crypt-2', 'east-wing', 'z'] as const

function descriptor(name: string, status: MansionStatus): MansionDescriptor {
  return {
    name,
    projectSpec: name,
    displayPath: `~/workspace/haunted-house/mansions/${name}`,
    status,
  }
}

const nameArb = fc.constantFrom(...NAMES)
const statusArb = fc.constantFrom(...MANSION_STATUSES)
const descriptorArb = fc.record({ name: nameArb, status: statusArb }).map(({ name, status }) =>
  descriptor(name, status),
)
/** Ready descriptors are weighted up so creates and opens succeed often. */
const readyBiasedDescriptorArb = fc.oneof(
  { weight: 3, arbitrary: nameArb.map((name) => descriptor(name, 'ready')) },
  { weight: 1, arbitrary: descriptorArb },
)
const messageArb = fc.oneof(fc.constant('Mansion request failed.'), fc.string({ maxLength: 300 }))

/** A unique, name-sorted list: the only list shape a ready Foyer may hold. */
const listArb: fc.Arbitrary<MansionDescriptor[]> = fc
  .uniqueArray(nameArb, { maxLength: NAMES.length })
  .chain((names) =>
    fc.tuple(...names.sort().map((name) => statusArb.map((status) => descriptor(name, status)))),
  )

const mutationArb: fc.Arbitrary<MutationState> = fc.oneof(
  fc.constant<MutationState>({ kind: 'idle' }),
  nameArb.map((name): MutationState => ({ kind: 'creating', name })),
  nameArb.map((name): MutationState => ({ kind: 'opening', name })),
  fc
    .record({ operation: fc.constantFrom('create' as const, 'open' as const), name: nameArb, message: messageArb })
    .map((error): MutationState => ({ kind: 'error', ...error })),
)

/** Every state the invariants below call valid, not only states reachable from the start. */
const stateArb: fc.Arbitrary<FoyerState> = fc.oneof(
  fc.constant(createInitialFoyerState()),
  messageArb.map(
    (message): FoyerState => ({
      load: { kind: 'error', message },
      mutation: { kind: 'idle' },
      selectedName: null,
      view: { kind: 'foyer' },
    }),
  ),
  listArb.chain((mansions) => {
    const ready = mansions.filter(({ status }) => status === 'ready')
    const selectedArb =
      ready.length === 0
        ? fc.constant<string | null>(null)
        : fc.option(fc.constantFrom(...ready.map(({ name }) => name)), { nil: null })
    const inFoyer = fc.record({ selectedName: selectedArb, mutation: mutationArb }).map(
      ({ selectedName, mutation }): FoyerState => ({
        load: { kind: 'ready', mansions },
        mutation,
        selectedName,
        view: { kind: 'foyer' },
      }),
    )
    if (ready.length === 0) return inFoyer
    const inMansion = fc.constantFrom(...ready).map(
      (mansion): FoyerState => ({
        load: { kind: 'ready', mansions },
        mutation: { kind: 'idle' },
        selectedName: mansion.name,
        view: { kind: 'mansion', mansion },
      }),
    )
    return fc.oneof({ weight: 4, arbitrary: inFoyer }, { weight: 1, arbitrary: inMansion })
  }),
)

const eventArb: fc.Arbitrary<FoyerEvent> = fc.oneof(
  { weight: 1, arbitrary: fc.constant<FoyerEvent>({ type: 'load_started' }) },
  {
    weight: 3,
    // Deliberately unsorted and possibly duplicated: the reducer must normalize.
    arbitrary: fc.array(descriptorArb, { maxLength: 8 }).map((mansions): FoyerEvent => ({ type: 'load_succeeded', mansions })),
  },
  { weight: 1, arbitrary: messageArb.map((message): FoyerEvent => ({ type: 'load_failed', message })) },
  {
    weight: 4,
    arbitrary: fc.option(nameArb, { nil: null }).map((name): FoyerEvent => ({ type: 'mansion_selected', name })),
  },
  { weight: 4, arbitrary: nameArb.map((name): FoyerEvent => ({ type: 'create_started', name })) },
  {
    weight: 4,
    arbitrary: readyBiasedDescriptorArb.map((mansion): FoyerEvent => ({ type: 'create_succeeded', mansion })),
  },
  {
    weight: 3,
    arbitrary: fc.record({ name: nameArb, message: messageArb }).map((e): FoyerEvent => ({ type: 'create_failed', ...e })),
  },
  { weight: 4, arbitrary: nameArb.map((name): FoyerEvent => ({ type: 'open_started', name })) },
  {
    weight: 4,
    arbitrary: readyBiasedDescriptorArb.map((mansion): FoyerEvent => ({ type: 'open_succeeded', mansion })),
  },
  {
    weight: 3,
    arbitrary: fc.record({ name: nameArb, message: messageArb }).map((e): FoyerEvent => ({ type: 'open_failed', ...e })),
  },
  { weight: 2, arbitrary: fc.constant<FoyerEvent>({ type: 'returned_to_foyer' }) },
)

function isPending(mutation: MutationState): mutation is { kind: 'creating' | 'opening'; name: string } {
  return mutation.kind === 'creating' || mutation.kind === 'opening'
}

/** The coherence every Foyer state must have, whatever produced it. */
function expectCoherent(state: FoyerState): void {
  if (state.load.kind === 'ready') {
    const names = state.load.mansions.map(({ name }) => name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual([...names].sort())
  }

  if (state.selectedName !== null) {
    expect(state.load.kind).toBe('ready')
    const listed = state.load.kind === 'ready' ? state.load.mansions : []
    const matches = listed.filter(({ name }) => name === state.selectedName)
    // Exactly one listed mansion is the selection, and it is available.
    expect(matches).toHaveLength(1)
    expect(matches[0].status).toBe('ready')
  }

  // A mutation is only ever pending over a successfully loaded list.
  if (isPending(state.mutation)) expect(state.load.kind).toBe('ready')

  if (state.view.kind === 'mansion') {
    expect(state.load.kind).toBe('ready')
    expect(state.mutation).toEqual({ kind: 'idle' })
    expect(state.selectedName).toBe(state.view.mansion.name)
    expect(state.view.mansion.status).toBe('ready')
    const listed = state.load.kind === 'ready' ? state.load.mansions : []
    expect(listed).toContainEqual(state.view.mansion)
  }
}

function expectTransition(before: FoyerState, event: FoyerEvent, after: FoyerState): void {
  const pendingBefore = isPending(before.mutation)

  switch (event.type) {
    case 'create_started':
    case 'open_started':
      // At most one pending mutation: a start while one is pending changes nothing.
      if (pendingBefore) expect(after).toBe(before)
      // A start never touches the list or the selection.
      expect(after.load).toBe(before.load)
      expect(after.selectedName).toBe(before.selectedName)
      if (after !== before) {
        expect(after.mutation).toEqual({
          kind: event.type === 'create_started' ? 'creating' : 'opening',
          name: event.name,
        })
      }
      if (event.type === 'open_started' && after !== before) {
        // Only the single selected mansion can be opened.
        expect(before.selectedName).toBe(event.name)
      }
      break

    case 'create_failed':
    case 'open_failed': {
      // Failure preserves the last successful list, the selection, and the view.
      expect(after.load).toBe(before.load)
      expect(after.selectedName).toBe(before.selectedName)
      expect(after.view).toBe(before.view)
      const operation = event.type === 'create_failed' ? 'creating' : 'opening'
      const matched = before.mutation.kind === operation && before.mutation.name === event.name
      if (!matched) {
        expect(after).toBe(before)
      } else {
        expect(after.mutation.kind).toBe('error')
        expect(isPending(after.mutation)).toBe(false)
      }
      break
    }

    case 'create_succeeded': {
      const matched = before.mutation.kind === 'creating' && before.mutation.name === event.mansion.name
      if (!matched || before.load.kind !== 'ready' || event.mansion.status !== 'ready') {
        expect(after).toBe(before)
        break
      }
      // The one sorted upsert shared by live and replay.
      const expected = upsertMansion(before.load.mansions, event.mansion)
      expect(after.load).toEqual({ kind: 'ready', mansions: expected })
      expect(after.mutation).toEqual({ kind: 'idle' })
      expect(after.selectedName).toBe(before.selectedName)
      expect(after.view).toBe(before.view)
      // Every other descriptor survives untouched.
      for (const mansion of before.load.mansions) {
        if (mansion.name !== event.mansion.name) expect(expected).toContain(mansion)
      }
      expect(expected.filter(({ name }) => name === event.mansion.name)).toEqual([event.mansion])
      break
    }

    case 'open_succeeded': {
      const matched = before.mutation.kind === 'opening' && before.mutation.name === event.mansion.name
      if (!matched || before.load.kind !== 'ready' || event.mansion.status !== 'ready') {
        expect(after).toBe(before)
        break
      }
      expect(after.view).toEqual({ kind: 'mansion', mansion: event.mansion })
      expect(after.selectedName).toBe(event.mansion.name)
      expect(after.load).toEqual({
        kind: 'ready',
        mansions: upsertMansion(before.load.mansions, event.mansion),
      })
      break
    }

    case 'mansion_selected':
      expect(after.load).toBe(before.load)
      expect(after.mutation).toBe(before.mutation)
      expect(after.view).toBe(before.view)
      break

    case 'returned_to_foyer':
      expect(after.view.kind).toBe('foyer')
      expect(after.load).toBe(before.load)
      expect(after.selectedName).toBe(before.selectedName)
      break

    case 'load_started':
    case 'load_succeeded':
    case 'load_failed':
      expect(isPending(after.mutation)).toBe(false)
      break
  }
}

describe('Property 9: Foyer transitions preserve one coherent selection and list', () => {
  it('keeps every reachable state coherent from any valid state under any event sequence', () => {
    fc.assert(
      fc.property(stateArb, fc.array(eventArb, { maxLength: 40 }), (start, events) => {
        expectCoherent(start)
        const snapshot = structuredClone(start)
        let state = start
        for (const event of events) {
          const before = state
          const frozenBefore = structuredClone(before)
          state = foyerReducer(before, event)
          // The reducer is pure: the previous state is never edited in place.
          expect(before).toEqual(frozenBefore)
          expectCoherent(state)
          expectTransition(before, event, state)
        }
        expect(start).toEqual(snapshot)
      }),
      { numRuns: 300 },
    )
  })

  it('is deterministic: the same state and events always yield the same states', () => {
    fc.assert(
      fc.property(stateArb, fc.array(eventArb, { maxLength: 25 }), (start, events) => {
        const run = () => {
          const seen: FoyerState[] = []
          let state = structuredClone(start)
          for (const event of events) {
            state = foyerReducer(state, structuredClone(event))
            seen.push(state)
          }
          return seen
        }
        expect(run()).toEqual(run())
      }),
      { numRuns: 100 },
    )
  })
})
