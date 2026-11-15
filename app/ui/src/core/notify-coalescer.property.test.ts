// Feature: doors-and-guardrails, Property 14: Waiting notifications obey the interruption window
//
// For any time-ordered waiting, blocked, and failed transitions, the coalescer
// emits at most one toast per Ghost in each 10-second window, while Needs You
// equals current unresolved operator actions.
//
// **Validates: Requirements 9.5, 9.6**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { projectionArb } from '../test/workflow-arbitraries'
import { GHOST_STATES, ghostTransitionId, type GhostSnapshot, type GhostState, type GhostTransition } from './ghost-state'
import { houseRooms, needsYou } from './house-view'
import {
  COALESCE_WINDOW_MS,
  EMPTY_COALESCER,
  collectInterruptions,
  flushCoalescer,
  nextFlushAtMs,
  offerInterruption,
  type CoalescerState,
  type Interruption,
  type Toast,
} from './notify-coalescer'
import type { EventId } from './seance-event'
import type { WorkflowProjection } from './workflow-projection'

const RUNS = 300
const GHOSTS = ['archivist', 'tinker-1', 'tinker-2'] as const

type Step =
  | { readonly kind: 'offer'; readonly gapMs: number; readonly ghost: (typeof GHOSTS)[number]; readonly state: 'waiting' | 'blocked' | 'failed' }
  | { readonly kind: 'tick'; readonly gapMs: number }

const gap = fc.oneof(fc.integer({ min: 0, max: 3_000 }), fc.integer({ min: 0, max: 25_000 }))
const stepArb: fc.Arbitrary<Step> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant('offer' as const), gapMs: gap, ghost: fc.constantFrom(...GHOSTS), state: fc.constantFrom('waiting' as const, 'blocked' as const, 'failed' as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('tick' as const), gapMs: gap }) },
)

function interruption(index: number, ghost: string, kind: Interruption['kind']): Interruption {
  return { id: `fact-${index}`, ghostKey: JSON.stringify(['demo-mansion', ghost]), ghostName: ghost, kind, text: `${ghost} is ${kind}.` }
}

/** Independent count of what the Operator must act on. */
function unresolved(projection: WorkflowProjection): number {
  const doors = projection.phases.filter((phase) => phase.door.status === 'waiting' && phase.door.proposal?.status === 'pending').length
  const risky = projection.riskyProposals.filter((proposal) => proposal.status === 'pending')
  const riskyIds = new Set(risky.map((proposal) => proposal.proposalId))
  const prompts = projection.pendingPermissions.filter((permission) => permission.proposalId === null || !riskyIds.has(permission.proposalId)).length
  return doors + risky.length + prompts
}

describe('Property 14: Waiting notifications obey the interruption window', () => {
  it('raises at most one toast per ghost per 10 seconds, loses nothing, and never touches Needs You', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 60 }), projectionArb(), fc.boolean(), (steps, generated, prompts) => {
        // Crew prompts: one that belongs to the first proposal, one no proposal accounts for.
        const projection: WorkflowProjection = prompts
          ? {
              ...generated,
              pendingPermissions: [
                ...generated.riskyProposals.slice(0, 1).map((proposal) => ({
                  slot: proposal.sessionSlot,
                  mid: 'mid-matched',
                  requestedSequence: 1,
                  toolName: 'execute_approved_action',
                  actionDigest: proposal.actionDigest,
                  proposalId: proposal.proposalId,
                })),
                { slot: 'hh-other', mid: 'mid-unmatched', requestedSequence: 9, toolName: 'fs_write', actionDigest: null, proposalId: null },
              ],
            }
          : generated
        let state: CoalescerState = EMPTY_COALESCER
        let now = 1_000_000
        const toasts: Toast[] = []
        let offered = 0
        const offeredByGhost = new Map<string, number>()

        steps.forEach((step, index) => {
          now += step.gapMs
          if (step.kind === 'offer') {
            const item = interruption(index, step.ghost, step.state)
            offered += 1
            offeredByGhost.set(item.ghostKey, (offeredByGhost.get(item.ghostKey) ?? 0) + 1)
            const result = offerInterruption(state, item, now)
            state = result.state
            toasts.push(...result.toasts)
          } else {
            const result = flushCoalescer(state, now)
            state = result.state
            toasts.push(...result.toasts)
          }
          // The next deadline is never in the past by more than the step just taken, and never further than one window.
          const next = nextFlushAtMs(state)
          if (next !== null) expect(next - now).toBeLessThanOrEqual(COALESCE_WINDOW_MS)

          // Needs You is a function of the projection alone: toasts held or shown do not change it.
          expect(needsYou(projection)).toHaveLength(unresolved(projection))
        })

        // Let every open window run out.
        for (let round = 0; round < 3; round += 1) {
          now += COALESCE_WINDOW_MS
          const result = flushCoalescer(state, now)
          state = result.state
          toasts.push(...result.toasts)
        }
        expect(nextFlushAtMs(state)).toBeNull()

        // At most one toast per ghost in any 10-second window.
        const lastAt = new Map<string, number>()
        for (const toast of toasts) {
          const previous = lastAt.get(toast.ghostKey)
          if (previous !== undefined) expect(toast.atMs - previous).toBeGreaterThanOrEqual(COALESCE_WINDOW_MS)
          lastAt.set(toast.ghostKey, toast.atMs)
          expect(toast.count).toBeGreaterThanOrEqual(1)
          expect(toast.text).not.toBe('')
        }
        // Every interruption is in exactly one toast of its own ghost.
        expect(toasts.reduce((sum, toast) => sum + toast.count, 0)).toBe(offered)
        for (const [ghostKey, count] of offeredByGhost) {
          expect(toasts.filter((toast) => toast.ghostKey === ghostKey).reduce((sum, toast) => sum + toast.count, 0)).toBe(count)
        }
        // The first interruption of a quiet ghost is shown at once.
        if (steps[0]?.kind === 'offer') expect(toasts[0].atMs).toBe(1_000_000 + steps[0].gapMs)

        const rooms = houseRooms(projection, [])
        expect(rooms.reduce((sum, room) => sum + room.needsYou, 0)).toBeLessThanOrEqual(unresolved(projection))
      }),
      { numRuns: RUNS },
    )
  })

  it('offers only transitions into waiting, blocked or failed that still hold', () => {
    const transitionArb = fc.record({
      ghost: fc.constantFrom(...GHOSTS),
      from: fc.constantFrom(...GHOST_STATES),
      to: fc.constantFrom(...GHOST_STATES),
    })
    fc.assert(
      fc.property(fc.array(transitionArb, { maxLength: 30 }), (raw) => {
        const transitions: GhostTransition[] = raw.map((item, index) => {
          const eventId: EventId = `e1:${index.toString(16).padStart(64, '0')}`
          return {
            transition_id: ghostTransitionId(eventId, 'demo-mansion', item.ghost, item.to),
            causing_event_id: eventId,
            causing_sequence: index + 1,
            mansion_id: 'demo-mansion',
            ghost_id: item.ghost,
            from_state: item.from,
            to_state: item.to,
          }
        })
        const finalState = new Map<string, GhostState>()
        for (const transition of transitions) {
          if (transition.from_state !== transition.to_state) finalState.set(transition.ghost_id, transition.to_state)
        }
        const snapshots: GhostSnapshot[] = Array.from(finalState, ([ghost, state]) => ({
          mansion_id: 'demo-mansion',
          ghost_id: ghost,
          run_id: 'run',
          run_sequence: 0,
          state,
          pending_approvals: [],
          open_tools: [],
          latest_event_id: null,
          latest_sequence: 1,
          reason: null,
        }))

        const first = collectInterruptions({ mansionId: 'demo-mansion', transitions, snapshots, items: [], seen: new Set() })
        expect(first.seen).toHaveLength(new Set(transitions.map((transition) => transition.transition_id)).size)
        for (const item of first.interruptions) expect(['waiting', 'blocked', 'failed']).toContain(item.kind)
        // Exactly the ghosts that are now waiting, blocked or failed, once each.
        const expected = Array.from(finalState)
          .filter(([, state]) => state === 'waiting' || state === 'blocked' || state === 'failed')
          .map(([ghost]) => JSON.stringify(['demo-mansion', ghost]))
          .sort()
        expect(first.interruptions.map((item) => item.ghostKey).sort()).toEqual(expected)
        // Nothing is offered a second time.
        const again = collectInterruptions({ mansionId: 'demo-mansion', transitions, snapshots, items: [], seen: new Set(first.seen) })
        expect(again).toEqual({ seen: [], interruptions: [] })
      }),
      { numRuns: RUNS },
    )
  })
})
