// State-machine property test of the Interruption Policy (Spec 6 task 2.10).
// The policy is run against a small reference burst model written here from
// the requirements; the model shares nothing with the policy but its input
// types and the 10-second constant.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { GHOST_STATES, type GhostState } from './ghost-state'
import type { RoomId } from './house-registry'
import {
  EMPTY_INTERRUPTION_STATE,
  INTERRUPTION_BURST_MS,
  flushInterruption,
  nextInterruptionFlushAtMs,
  reduceInterruption,
  type CanonicalGhostTransition,
  type InterruptionEffect,
} from './interruption-policy'

// --- Reference model -------------------------------------------------------

const REFERENCE_ROOM_ORDER: readonly RoomId[] = ['foyer', 'study', 'drafting-room', 'workshop', 'attic', 'seance-room']
const REFERENCE_ELIGIBLE: readonly GhostState[] = ['waiting', 'blocked', 'failed']
const LIMIT = 240

interface Accepted {
  readonly id: string
  readonly ghost: string
  readonly name: string
  readonly room: RoomId
  readonly state: GhostState
}

interface ReferenceBurst {
  last: number
  readonly items: Accepted[]
}

interface ReferenceSummary {
  readonly text: string
  readonly eventIds: readonly string[]
}

function referenceName(raw: string): string {
  const words = raw.split(/[\u0000-\u001f\u007f-\u009f\s]+/).filter((word) => word !== '')
  if (words.length === 0) return 'A ghost'
  const points = [...words.join(' ')]
  return points.length <= 60 ? points.join('') : `${points.slice(0, 59).join('').trimEnd()}…`
}

function referenceSentence(item: Accepted): string {
  const name = referenceName(item.name)
  if (item.state === 'waiting') return `${name} is waiting for your approval.`
  if (item.state === 'blocked') return `${name} is blocked.`
  return `${name} failed.`
}

function referenceSummary(burst: ReferenceBurst): ReferenceSummary {
  const firstSeen: string[] = []
  const latest: Record<string, Accepted> = {}
  for (const item of burst.items) {
    if (!firstSeen.includes(item.ghost)) firstSeen.push(item.ghost)
    latest[`g:${item.ghost}`] = item
  }
  const ordered = firstSeen
    .map((ghost, appearance) => ({ item: latest[`g:${ghost}`], appearance }))
    .sort(
      (left, right) =>
        REFERENCE_ROOM_ORDER.indexOf(left.item.room) - REFERENCE_ROOM_ORDER.indexOf(right.item.room) || left.appearance - right.appearance,
    )
  let text = ordered.map((entry) => referenceSentence(entry.item)).join(' ')
  if (burst.items.length > 1) text += ` ${burst.items.length} events.`
  if ([...text].length > LIMIT) {
    text = ordered.length === 1 ? '1 ghost needs attention. Open Needs you for details.' : `${ordered.length} ghosts need attention. Open Needs you for details.`
  }
  return { text, eventIds: burst.items.map((item) => item.id) }
}

class ReferenceModel {
  readonly seen: string[] = []
  burst: ReferenceBurst | null = null

  offer(event: CanonicalGhostTransition): ReferenceSummary[] {
    if (event.kind !== 'transition') return []
    if (event.fromState === event.toState || !REFERENCE_ELIGIBLE.includes(event.toState)) return []
    if (this.seen.includes(event.eventId)) return []
    this.seen.push(event.eventId)
    const item: Accepted = { id: event.eventId, ghost: event.ghostId, name: event.ghostName, room: event.roomId, state: event.toState }
    if (this.burst === null) {
      this.burst = { last: event.observedAtMs, items: [item] }
      return []
    }
    const at = Math.max(event.observedAtMs, this.burst.last)
    if (at - this.burst.last < INTERRUPTION_BURST_MS) {
      this.burst.items.push(item)
      this.burst.last = at
      return []
    }
    const closed = referenceSummary(this.burst)
    this.burst = { last: at, items: [item] }
    return [closed]
  }

  flush(now: number): ReferenceSummary[] {
    if (this.burst === null || now - this.burst.last < INTERRUPTION_BURST_MS) return []
    const closed = referenceSummary(this.burst)
    this.burst = null
    return [closed]
  }
}

// --- Generators ------------------------------------------------------------

type Command =
  | { readonly type: 'offer'; readonly gap: number; readonly make: (atMs: number) => CanonicalGhostTransition }
  | { readonly type: 'flush'; readonly gap: number }

/** Gaps crowd the boundary; a few step back in time. */
const gap = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(0, 1, 9_999, 10_000, 10_001) },
  // Crowded moments, so several ghosts land in one burst and long copy overflows.
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 200 }) },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 12_000 }) },
  { weight: 2, arbitrary: fc.integer({ min: 9_990, max: 10_010 }) },
  { weight: 1, arbitrary: fc.integer({ min: -5_000, max: 40_000 }) },
)

const eventId = fc.oneof(fc.integer({ min: 0, max: 11 }).map((index) => `t1:${index}`), fc.string({ maxLength: 12 }))
const ghostId = fc.constantFrom('archivist', 'draughtsman', 'foreman', 'tinker-1', 'tinker-2', 'tinker-3', 'medium')
const roomId = fc.constantFrom<RoomId>('foyer', 'study', 'drafting-room', 'workshop', 'attic', 'seance-room')
const ghostState = fc.constantFrom<GhostState>(...GHOST_STATES)
const ghostName = fc.oneof(
  { weight: 2, arbitrary: fc.constantFrom('The Archivist', 'Tinker 2', '', '  \n\t ', 'Ὀδυσσεύς the Draughtsman', '幽霊 👻 の番人', 'a\u0000b\u0085c') },
  { weight: 1, arbitrary: fc.string({ unit: 'grapheme', maxLength: 30 }) },
  { weight: 3, arbitrary: fc.string({ unit: 'grapheme', minLength: 55, maxLength: 140 }) },
)

const offer: fc.Arbitrary<Command> = fc
  .record({
    gap,
    kind: fc.constantFrom('transition', 'transition', 'transition', 'routine'),
    eventId,
    ghostId,
    ghostName,
    roomId,
    fromState: ghostState,
    // Bias toward the three eligible destinations so bursts form.
    toState: fc.oneof(fc.constantFrom<GhostState>('waiting', 'blocked', 'failed'), ghostState),
  })
  .map((drawn) => ({
    type: 'offer' as const,
    gap: drawn.gap,
    make: (atMs: number): CanonicalGhostTransition =>
      drawn.kind === 'routine'
        ? { kind: 'routine', eventId: drawn.eventId, observedAtMs: atMs }
        : {
            kind: 'transition',
            eventId: drawn.eventId,
            ghostId: drawn.ghostId,
            ghostName: drawn.ghostName,
            roomId: drawn.roomId,
            fromState: drawn.fromState,
            toState: drawn.toState,
            observedAtMs: atMs,
          },
  }))

const flush: fc.Arbitrary<Command> = gap.map((value) => ({ type: 'flush' as const, gap: value }))

const commands = fc.array(fc.oneof({ weight: 4, arbitrary: offer }, { weight: 1, arbitrary: flush }), { maxLength: 40 })

function summaries(effects: readonly InterruptionEffect[]): ReferenceSummary[] {
  return effects.flatMap((effect) => (effect.kind === 'summary' ? [{ text: effect.text, eventIds: effect.eventIds }] : []))
}

describe('interruption policy state machine', () => {
  // Feature: house-ui-and-accessibility, Property 6: Interruption filtering, deduplication, and burst summaries follow the reference policy
  // Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
  it('Property 6: Interruption filtering, deduplication, and burst summaries follow the reference policy', () => {
    fc.assert(
      fc.property(commands, (sequence) => {
        const reference = new ReferenceModel()
        let state = EMPTY_INTERRUPTION_STATE
        let clock = 1_000
        const emitted: ReferenceSummary[] = []

        for (const command of sequence) {
          clock += command.gap
          const before = state
          const step = command.type === 'offer' ? reduceInterruption(state, command.make(clock)) : flushInterruption(state, clock)
          const expected = command.type === 'offer' ? reference.offer(command.make(clock)) : reference.flush(clock)
          state = step.state

          // The same summaries, with the same words and evidence, at the same step.
          expect(summaries(step.effects)).toEqual(expected)
          expect(step.effects.length).toBeLessThanOrEqual(1)
          emitted.push(...expected)

          // Inputs are never mutated; a step that accepted and closed nothing returns the state it was given.
          const acceptedNow = reference.seen.length !== before.seenEventIds.size
          if (!acceptedNow && expected.length === 0) expect(state).toBe(before)

          // The policy holds exactly the reference's open burst and memory of ids.
          expect([...state.seenEventIds]).toEqual(reference.seen)
          expect(state.burst?.events.map((event) => event.eventId) ?? null).toEqual(reference.burst?.items.map((item) => item.id) ?? null)
          expect(state.burst?.lastAcceptedAtMs ?? null).toEqual(reference.burst?.last ?? null)
          expect(nextInterruptionFlushAtMs(state)).toEqual(reference.burst === null ? null : reference.burst.last + INTERRUPTION_BURST_MS)
          // Only waiting, blocked and failed are ever held.
          for (const event of state.burst?.events ?? []) expect(['waiting', 'blocked', 'failed']).toContain(event.state)
        }

        // The open burst is silent 1 ms before its deadline and emits exactly at it: once, within 10 seconds.
        if (state.burst !== null) {
          const deadline = state.burst.lastAcceptedAtMs + INTERRUPTION_BURST_MS
          const early = flushInterruption(state, deadline - 1)
          expect(early.effects).toEqual([])
          expect(early.state).toBe(state)
          const closing = flushInterruption(state, deadline)
          expect(summaries(closing.effects)).toEqual(reference.flush(deadline))
          emitted.push(...summaries(closing.effects))
          state = closing.state
          expect(flushInterruption(state, deadline + 100_000).effects).toEqual([])
        }
        expect(state.burst).toBeNull()

        // Every accepted event id is reported exactly once overall, in acceptance order; nothing else is.
        expect(emitted.flatMap((summary) => summary.eventIds)).toEqual(reference.seen)
        expect(new Set(reference.seen).size).toBe(reference.seen.length)
        for (const summary of emitted) {
          expect(summary.eventIds.length).toBeGreaterThan(0)
          expect([...summary.text].length).toBeLessThanOrEqual(LIMIT)
          expect(summary.text).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
        }
      }),
      { numRuns: 300 },
    )
  })
})
