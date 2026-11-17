// Property 8: The visit never moves without a press
//
// For all finite sequences of visit events, the place is one of loading, gate,
// hall and mansion; the Gate is shown first exactly when the list is empty or
// the page is the Replay Build; a live page that loads with a mansion is never
// shown the Gate unless the visitor steps outside; the place is `mansion` only
// after a `mansion_opened` event; and the name is not empty only after a
// `knocked` event with a non-empty name and is empty again after stepping
// outside from the hall.
//
// **Validates: Requirements 9.1, 9.3, 9.9, 9.10**
//
// The reference is the intended rules written place by place: for each place,
// the events that act there and what they leave behind. The module is written
// event by event, so the two share no code. The whole state is compared after
// every event, and the property's own clauses are then checked over the trace.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { VISIT_PLACES, initialVisit, visitReducer, visitorName, type VisitEvent, type VisitState } from './first-visit'

/** What the reference expects of one event: the state it leaves, or nothing at all. */
type Expected = VisitState | 'nothing'

/** Independent reference: the intended rules, place by place. */
function expectedAfter(state: VisitState, event: VisitEvent): Expected {
  const live = !state.replay
  switch (state.place) {
    case 'loading':
      // Only the mansion list moves a page that is still loading: to the Gate
      // when it is empty or the page is the recording, else to the hall.
      if (event.type !== 'list_loaded') return 'nothing'
      return { ...state, place: !live || event.mansionCount <= 0 ? 'gate' : 'hall' }
    case 'gate':
      // A knock admits the visitor, named or not, and a live hall then asks what to build.
      if (event.type === 'knocked') {
        return { place: 'hall', visitorName: visitorName(event.name), firstTime: true, idea: live, replay: state.replay, cameFrom: state.cameFrom }
      }
      // The Foyer's own open can still land here; leaving that mansion returns the visitor to the Gate.
      if (event.type === 'mansion_opened') return { ...state, place: 'mansion', idea: false, cameFrom: 'gate' }
      return 'nothing'
    case 'hall':
      switch (event.type) {
        case 'stepped_outside':
          return { place: 'gate', visitorName: '', firstTime: false, idea: false, replay: state.replay, cameFrom: state.cameFrom }
        case 'idea_opened':
          // A recording has nothing to build, so it never asks.
          return live ? { ...state, idea: true } : 'nothing'
        case 'idea_closed':
          return { ...state, idea: false }
        case 'mansion_opened':
          return { ...state, place: 'mansion', idea: false, cameFrom: 'hall' }
        default:
          return 'nothing'
      }
    case 'mansion':
      // Leaving returns the visitor to where they stood when the mansion opened.
      return event.type === 'mansion_left' ? { ...state, place: state.cameFrom } : 'nothing'
  }
}

function sameValues(left: VisitState, right: VisitState): boolean {
  return (
    left.place === right.place &&
    left.visitorName === right.visitorName &&
    left.firstTime === right.firstTime &&
    left.idea === right.idea &&
    left.replay === right.replay &&
    left.cameFrom === right.cameFrom
  )
}

/**
 * Folds the events through the reducer from the first state of a page. After
 * every event it compares the whole state with the reference and checks the
 * clauses of the property against what the trace has held so far. `cells`
 * collects each "mode place event" that was exercised.
 */
function walk(replay: boolean, events: readonly VisitEvent[], cells?: Set<string>): VisitState {
  let state = initialVisit(replay)
  expect(state).toStrictEqual({ place: 'loading', visitorName: '', firstTime: false, idea: false, replay, cameFrom: 'hall' })

  let firstCount: number | null = null
  let opened = false
  let steppedOutside = false
  let namedKnock = false

  for (const event of events) {
    // Frozen, so an edit in place would throw; copied, so one that did not throw would still show.
    const before = Object.freeze(state)
    const beforeValues = { ...before }
    const eventValues = { ...event }
    const after = visitReducer(before, Object.freeze(event))
    expect(before).toStrictEqual(beforeValues)
    expect(event).toStrictEqual(eventValues)
    cells?.add(`${replay ? 'replay' : 'live'} ${before.place} ${event.type}`)

    const expected = expectedAfter(beforeValues, event)
    if (expected === 'nothing') {
      // An event that does not apply returns the very same state object.
      expect(after).toBe(before)
    } else {
      expect(after).toStrictEqual(expected)
      // Asking again while already asking, or closing what is closed, is no change either.
      if (sameValues(expected, beforeValues)) expect(after).toBe(before)
    }

    if (event.type === 'list_loaded' && firstCount === null) {
      firstCount = event.mansionCount
      // The Gate is shown first exactly when the list is empty or the page is the Replay Build.
      expect(after.place).toBe(replay || event.mansionCount <= 0 ? 'gate' : 'hall')
    }
    if (event.type === 'mansion_opened') opened = true
    if (event.type === 'stepped_outside') steppedOutside = true
    if (event.type === 'knocked' && visitorName(event.name) !== '') namedKnock = true

    expect(VISIT_PLACES).toContain(after.place)
    // Live stays live and a recording stays a recording.
    expect(after.replay).toBe(replay)
    // Nothing moves a page before its list has loaded.
    if (firstCount === null) expect(after.place).toBe('loading')
    // Only the Foyer's own open reaches a mansion.
    if (after.place === 'mansion') expect(opened).toBe(true)
    // A live page that loaded with a mansion shows no Gate until the visitor steps outside.
    if (!replay && firstCount !== null && firstCount > 0 && !steppedOutside) expect(after.place).not.toBe('gate')
    // A name is held only after a knock that gave one, and is gone again after stepping outside from the hall.
    if (after.visitorName !== '') expect(namedKnock).toBe(true)
    if (event.type === 'stepped_outside' && beforeValues.place === 'hall') expect(after.visitorName).toBe('')
    // The Gate leads into the hall by a knock and by nothing else.
    if (beforeValues.place === 'gate' && after.place === 'hall') expect(event.type).toBe('knocked')

    state = after
  }
  return state
}

/**
 * A name with a diaeresis, then three things a name must not keep: a
 * right-to-left override, NUL and an unpaired surrogate. Written by code
 * point, so nothing invisible sits in this file.
 */
const ODD_NAMES = [`Zo${String.fromCodePoint(0xeb)}`, String.fromCodePoint(0x202e), String.fromCodePoint(0x0000), String.fromCodePoint(0xd800)]

/** Empty, blank, plain, padded, hostile and arbitrary names. */
const nameArb = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom('', ' ', '\t\n', 'Ada', '  Ada Lovelace \n', ...ODD_NAMES) },
  { weight: 2, arbitrary: fc.string({ maxLength: 50, size: 'max' }) },
  { weight: 2, arbitrary: fc.string({ unit: 'binary', maxLength: 50, size: 'max' }) },
  { weight: 1, arbitrary: fc.string({ unit: 'grapheme', maxLength: 50, size: 'max' }) },
)

/** An empty list, one mansion, a count that should never arrive, small counts, and any integer. */
const countArb = fc.oneof(
  { weight: 2, arbitrary: fc.constantFrom(0, 1, -1) },
  { weight: 2, arbitrary: fc.integer({ min: -3, max: 12 }) },
  { weight: 1, arbitrary: fc.integer() },
)

const listLoadedArb: fc.Arbitrary<VisitEvent> = countArb.map((mansionCount): VisitEvent => ({ type: 'list_loaded', mansionCount }))
const knockedArb: fc.Arbitrary<VisitEvent> = nameArb.map((name): VisitEvent => ({ type: 'knocked', name }))

const eventArb: fc.Arbitrary<VisitEvent> = fc.oneof(
  { weight: 2, arbitrary: listLoadedArb },
  { weight: 3, arbitrary: knockedArb },
  { weight: 2, arbitrary: fc.constant<VisitEvent>({ type: 'stepped_outside' }) },
  { weight: 2, arbitrary: fc.constant<VisitEvent>({ type: 'idea_opened' }) },
  { weight: 2, arbitrary: fc.constant<VisitEvent>({ type: 'idea_closed' }) },
  { weight: 3, arbitrary: fc.constant<VisitEvent>({ type: 'mansion_opened' }) },
  { weight: 2, arbitrary: fc.constant<VisitEvent>({ type: 'mansion_left' }) },
)

/**
 * Zero to forty events. `size: 'max'` matters: without it fast-check stops at
 * ten however large `maxLength` is. Two traces in three start with the list
 * loading, as a real page does, so most of the trace is spent at the Gate, in
 * the hall and in a mansion; the third is any order at all and spends a while
 * on the loading page. One array, so a failure shrinks to its shortest trace.
 */
const traceArb: fc.Arbitrary<VisitEvent[]> = fc
  .tuple(fc.option(listLoadedArb, { nil: null, freq: 3 }), fc.array(eventArb, { maxLength: 40, size: 'max' }))
  .map(([first, rest]) => (first === null ? rest : [first, ...rest].slice(0, 40)))

describe('the visit', () => {
  // Feature: warden-guide-and-first-visit, Property 8: The visit never moves without a press
  it('Property 8: the visit never moves without a press', () => {
    const cells = new Set<string>()
    let longest = 0
    fc.assert(
      fc.property(fc.boolean(), traceArb, (replay, events) => {
        const end = walk(replay, events, cells)
        longest = Math.max(longest, events.length)
        // The same events from the same start end in the same state.
        expect(walk(replay, events)).toStrictEqual(end)
      }),
      { numRuns: 300 },
    )
    // Events arrived in every place, live and replay, and traces ran far past ten events, never past forty.
    const places = new Set([...cells].map((cell) => cell.slice(0, cell.lastIndexOf(' '))))
    expect(places.size).toBe(2 * VISIT_PLACES.length)
    expect(longest).toBeGreaterThan(30)
    expect(longest).toBeLessThanOrEqual(40)
  })

  it('takes every event in every place, live and replay', () => {
    const empty: VisitEvent = { type: 'list_loaded', mansionCount: 0 }
    const ada: VisitEvent = { type: 'knocked', name: 'Ada' }
    const routes: readonly (readonly VisitEvent[])[] = [
      // Still loading.
      [],
      // At the Gate.
      [empty],
      // Live: a returning visitor in the hall. Replay: the Gate all the same.
      [{ type: 'list_loaded', mansionCount: 2 }],
      // In the hall after a knock: a live hall is asking, a recording is not.
      [empty, ada],
      // In the hall with the question put away.
      [empty, ada, { type: 'idea_closed' }],
      // In a mansion, by way of the hall and straight from the Gate.
      [empty, ada, { type: 'mansion_opened' }],
      [empty, { type: 'mansion_opened' }],
      // Back at the Gate, and back in the hall from a mansion.
      [empty, ada, { type: 'stepped_outside' }],
      [empty, ada, { type: 'mansion_opened' }, { type: 'mansion_left' }],
    ]
    const presses: readonly VisitEvent[] = [
      empty,
      { type: 'list_loaded', mansionCount: 3 },
      { type: 'knocked', name: '' },
      { type: 'knocked', name: ' Grace \n Hopper ' },
      { type: 'stepped_outside' },
      { type: 'idea_opened' },
      { type: 'idea_closed' },
      { type: 'mansion_opened' },
      { type: 'mansion_left' },
    ]
    const cells = new Set<string>()
    for (const replay of [false, true]) {
      for (const route of routes) {
        for (const press of presses) walk(replay, [...route, press], cells)
      }
    }
    // Two modes, four places, seven events.
    expect(cells.size).toBe(2 * VISIT_PLACES.length * 7)
  })

  it('walks a first visit, a return and a recording', () => {
    // A first visit: the Gate, a knock with a name, the question, a mansion, the hall again, and outside.
    const first = walk(false, [{ type: 'list_loaded', mansionCount: 0 }])
    expect(first).toStrictEqual({ place: 'gate', visitorName: '', firstTime: false, idea: false, replay: false, cameFrom: 'hall' })
    const admitted = visitReducer(first, { type: 'knocked', name: '  Ada\tLovelace ' })
    expect(admitted).toStrictEqual({ place: 'hall', visitorName: 'Ada Lovelace', firstTime: true, idea: true, replay: false, cameFrom: 'hall' })
    const inside = visitReducer(admitted, { type: 'mansion_opened' })
    expect(inside).toStrictEqual({ place: 'mansion', visitorName: 'Ada Lovelace', firstTime: true, idea: false, replay: false, cameFrom: 'hall' })
    const back = visitReducer(inside, { type: 'mansion_left' })
    expect(back).toStrictEqual({ place: 'hall', visitorName: 'Ada Lovelace', firstTime: true, idea: false, replay: false, cameFrom: 'hall' })
    expect(visitReducer(back, { type: 'stepped_outside' })).toStrictEqual(first)

    // A return: the hall at once, no Gate, no question until it is asked for.
    const returning = walk(false, [{ type: 'list_loaded', mansionCount: 1 }])
    expect(returning).toStrictEqual({ place: 'hall', visitorName: '', firstTime: false, idea: false, replay: false, cameFrom: 'hall' })
    expect(visitReducer(returning, { type: 'idea_opened' })).toStrictEqual({ ...returning, idea: true })
    expect(visitReducer(returning, { type: 'knocked', name: 'Ada' })).toBe(returning)

    // A recording: the Gate whatever the list holds, an empty name accepted, and nothing to build.
    const recording = walk(true, [{ type: 'list_loaded', mansionCount: 1 }])
    expect(recording).toStrictEqual({ place: 'gate', visitorName: '', firstTime: false, idea: false, replay: true, cameFrom: 'hall' })
    const watching = visitReducer(recording, { type: 'knocked', name: '' })
    expect(watching).toStrictEqual({ place: 'hall', visitorName: '', firstTime: true, idea: false, replay: true, cameFrom: 'hall' })
    expect(visitReducer(watching, { type: 'idea_opened' })).toBe(watching)
  })
})
