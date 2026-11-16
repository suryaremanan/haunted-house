// Feature: doors-and-guardrails, Property 13: Non-decision UI activity cannot approve a proposal
//
// For any UI projection and sequence of navigation, views, timers, `chat_done`,
// Ghost results, refreshes, or unknown UI events without an acknowledged
// approval domain record, every pending proposal remains unapproved.
//
// **Validates: Requirements 9.9**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { makeEvent } from '../test/seance-arbitraries'
import { projectionArb } from '../test/workflow-arbitraries'
import { INITIAL_HOUSE_STATE, authorizeCommand, reduceHouse, type HouseAction, type HouseUiState } from './house-reducer'
import {
  ROOM_IDS,
  deriveAuthority,
  doorDecisionView,
  houseRooms,
  needsYou,
  riskyDecisionView,
  type CanonicalHealth,
} from './house-view'
import type { AppEvent, AppEventCandidate, EventType, JsonValue } from './seance-event'
import { projectEvents } from './seance-log'
import type { WorkflowProjection } from './workflow-projection'

const RUNS = 300

/** A canonical ghost fact: a Crew turn that ended, or a run the house settled. */
function ghostFact(eventType: EventType, payload: JsonValue, sequence: number, ghost: string): AppEvent {
  const candidate: AppEventCandidate = {
    schema_version: 1,
    event_type: eventType,
    scope: { mansion_id: 'demo-mansion', ghost_id: ghost, session_slot: `hh-${ghost}`, run_id: 'run-1', run_sequence: 0 },
    source: {
      origin: eventType === 'crew_turn_ended' ? 'crew' : 'house',
      source_type: eventType === 'crew_turn_ended' ? 'chat_done' : eventType,
      identity_parts: [`${eventType}-${sequence}`],
      revision: 0,
      generation: '',
      source_sequence: 0,
    },
    caused_by: [],
    occurred_at_ms: null,
    payload,
  }
  return makeEvent(candidate, sequence)
}

type Step =
  | { readonly kind: 'action'; readonly action: HouseAction }
  /** A re-read of the same canonical history: same proposals, possibly a newer version. */
  | { readonly kind: 'refresh'; readonly versionBump: number }
  | { readonly kind: 'ghost'; readonly eventType: 'crew_turn_ended' | 'run_completed' | 'run_failed' | 'run_started'; readonly ghost: string }
  | { readonly kind: 'unknown'; readonly type: string; readonly extra: unknown }

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  // Moving between rooms and opening or closing one is not an action of this reducer at all
  // (Spec 6: the Mansion Shell holds it); a stray navigation-shaped action is ignored whole.
  fc.constantFrom('room_focused', 'room_opened', 'room_moved', 'room_closed').map((type): Step => ({ kind: 'unknown', type, extra: 'study' })),
  fc.string({ maxLength: 20 }).map((id): Step => ({ kind: 'action', action: { type: 'proposal_viewed', id } })),
  fc.constant<Step>({ kind: 'action', action: { type: 'timer_elapsed' } }),
  fc.constant<Step>({ kind: 'action', action: { type: 'ghost_activity' } }),
  fc.constant<Step>({ kind: 'action', action: { type: 'notice_dismissed' } }),
  fc.constant<Step>({ kind: 'action', action: { type: 'projection_refused' } }),
  fc.constant<Step>({ kind: 'action', action: { type: 'projection_unavailable' } }),
  fc.integer({ min: 0, max: 5 }).map((versionBump): Step => ({ kind: 'refresh', versionBump })),
  fc
    .tuple(
      fc.constantFrom('crew_turn_ended', 'run_completed', 'run_failed', 'run_started'),
      fc.constantFrom('archivist', 'draughtsman', 'tinker-1', 'tinker-2'),
    )
    .map(([eventType, ghost]): Step => ({ kind: 'ghost', eventType: eventType as 'run_completed', ghost })),
  fc
    .tuple(
      fc.constantFrom('chat_done', 'approve', 'approved', 'door_approved', 'risky_action_approved', 'decision', 'keydown', ''),
      fc.anything(),
    )
    .map(([type, extra]): Step => ({ kind: 'unknown', type, extra })),
)

const HEALTHY: CanonicalHealth = { loaded: true, catchingUp: false, highestSequence: 0, diagnostic: null }

function pendingIds(projection: WorkflowProjection): string[] {
  return [
    ...projection.phases.flatMap((phase) =>
      phase.door.status === 'waiting' && phase.door.proposal?.status === 'pending' ? [`door:${phase.door.proposal.proposalId}`] : [],
    ),
    ...projection.riskyProposals.filter((proposal) => proposal.status === 'pending').map((proposal) => `risky:${proposal.proposalId}`),
  ]
}

describe('Property 13: Non-decision UI activity cannot approve a proposal', () => {
  it('keeps every pending proposal pending, shows no outcome, and issues no command', () => {
    fc.assert(
      fc.property(projectionArb(), fc.array(stepArb, { maxLength: 40 }), (initial, steps) => {
        let acknowledged = initial
        let state: HouseUiState = reduceHouse(INITIAL_HOUSE_STATE, { type: 'projection_received', projection: initial })
        const expectedPending = pendingIds(initial)
        const ghostEvents: AppEvent[] = []

        for (const step of steps) {
          switch (step.kind) {
            case 'action':
              state = reduceHouse(state, step.action)
              break
            case 'refresh':
              // No approval record was acknowledged, so the backend folds the same proposals.
              acknowledged = { ...acknowledged, version: acknowledged.version + step.versionBump }
              state = reduceHouse(state, { type: 'projection_received', projection: acknowledged })
              break
            case 'ghost': {
              const payload: JsonValue =
                step.eventType === 'crew_turn_ended'
                  ? { generation: 'g', continuing: false, needs_input: false }
                  : { reason: 'requirements.md is ready for review' }
              ghostEvents.push(ghostFact(step.eventType, payload, ghostEvents.length + 1, step.ghost))
              state = reduceHouse(state, { type: 'ghost_activity' })
              break
            }
            case 'unknown': {
              const action = { type: step.type, payload: step.extra, decision: 'approve', approved: true } as unknown as HouseAction
              state = reduceHouse(state, action)
              break
            }
          }

          // The projection on screen is the acknowledged one, untouched.
          expect(state.projection).toEqual(acknowledged)
          const projection = state.projection!
          expect(pendingIds(projection)).toEqual(expectedPending)
          // No command is in flight: only an explicit press reaches authorizeCommand, and none happened.
          expect(state.inFlight).toBeNull()

          const snapshots = projectEvents(ghostEvents).snapshots
          const authority = deriveAuthority({
            projection,
            projectionStatus: state.projectionStatus,
            canonical: { ...HEALTHY, highestSequence: projection.version },
          })
          for (const phase of projection.phases) {
            const view = doorDecisionView(projection, phase, authority, state.inFlight)
            if (view !== null && phase.door.status === 'waiting') {
              expect(view.state).toBe('pending')
              expect(view.outcomeText).toBeNull()
            }
          }
          for (const proposal of projection.riskyProposals) {
            if (proposal.status !== 'pending') continue
            const view = riskyDecisionView(projection, proposal, authority, state.inFlight)
            expect(view.status).toBe('pending')
            expect(view.outcomeText).toBeNull()
          }
          // Needs You still lists each of them, whatever the ghosts did meanwhile.
          const waiting = needsYou(projection).map((item) => item.id)
          expect(waiting).toEqual(expectedPending)
          expect(houseRooms(projection, snapshots).reduce((sum, room) => sum + room.needsYou, 0)).toBe(expectedPending.length)
        }
      }),
      { numRuns: RUNS },
    )
  })

  it('refuses any command that does not name exactly the pending proposal on screen', () => {
    fc.assert(
      fc.property(
        projectionArb({ riskyStatuses: ['pending'] }),
        fc.constantFrom('version', 'digest', 'proposal', 'incomplete-approve', 'in-flight', 'authority'),
        (projection, tamper) => {
          const proposal = projection.riskyProposals[0]
          fc.pre(proposal !== undefined)
          const ready = reduceHouse(INITIAL_HOUSE_STATE, { type: 'projection_received', projection })
          const authority = deriveAuthority({
            projection,
            projectionStatus: 'ready',
            canonical: { ...HEALTHY, highestSequence: projection.version },
          })
          fc.pre(authority.canDecide)
          const exact = {
            kind: 'decide_risky',
            decision: 'reject',
            proposalId: proposal.proposalId,
            actionDigest: proposal.actionDigest,
            expectedVersion: projection.version,
          } as const
          expect(authorizeCommand(ready, authority, exact)).toEqual(exact)

          switch (tamper) {
            case 'version':
              expect(authorizeCommand(ready, authority, { ...exact, expectedVersion: projection.version + 1 })).toBeNull()
              break
            case 'digest':
              expect(authorizeCommand(ready, authority, { ...exact, actionDigest: 'f'.repeat(64) === exact.actionDigest ? '0'.repeat(64) : 'f'.repeat(64) })).toBeNull()
              break
            case 'proposal':
              expect(authorizeCommand(ready, authority, { ...exact, proposalId: `${exact.proposalId}-other-zz` })).toBeNull()
              break
            case 'incomplete-approve': {
              const hidden = { ...projection, riskyProposals: [{ ...proposal, descriptor: null }, ...projection.riskyProposals.slice(1)] }
              const state = reduceHouse(INITIAL_HOUSE_STATE, { type: 'projection_received', projection: hidden })
              expect(authorizeCommand(state, authority, { ...exact, decision: 'approve' })).toBeNull()
              expect(authorizeCommand(state, authority, exact)).toEqual(exact)
              break
            }
            case 'in-flight':
              expect(authorizeCommand(reduceHouse(ready, { type: 'command_sent', target: 'phase:design' }), authority, exact)).toBeNull()
              break
            case 'authority':
              expect(
                authorizeCommand(ready, deriveAuthority({ projection, projectionStatus: 'ready', canonical: { ...HEALTHY, catchingUp: true } }), exact),
              ).toBeNull()
              break
          }
        },
      ),
      { numRuns: RUNS },
    )
  })
})
