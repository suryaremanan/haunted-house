// Properties 1 to 3 of practice-house, over generated canonical logs (real
// demo and vector records mixed with synthetic ones).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { canonicalRecordsArb } from '../test/replay-arbitraries'
import { decisionPoints, logNumbers, nextDecision, practiceAnswer } from './practice'
import { readDomainRecord } from './workflow-fold'

const RUNS = { numRuns: 200 }
const DECISION_KINDS = new Set(['door_approved', 'door_rejected', 'risky_action_approved', 'risky_action_rejected'])

describe('practice-house properties', () => {
  it('Property 1: every Decision Point is an owner decision in the log, in order, once per proposal', () => {
    fc.assert(
      fc.property(canonicalRecordsArb(), (events) => {
        const points = decisionPoints(events)
        const byId = new Map(events.map((event) => [event.event_id as string, event]))
        for (const point of points) {
          const record = readDomainRecord(byId.get(point.eventId)!)
          expect(record !== null && typeof record !== 'string' && DECISION_KINDS.has(record.kind)).toBe(true)
          expect(point.choices).toHaveLength(2)
        }
        expect(points.map((point) => point.sequence)).toEqual([...points.map((point) => point.sequence)].sort((a, b) => a - b))
        expect(new Set(points.map((point) => point.proposalId)).size).toBe(points.length)
      }),
      RUNS,
    )
  })

  it('Property 2: playback in practice never passes an unanswered decision, and an answer never claims to be the recording', () => {
    fc.assert(
      fc.property(canonicalRecordsArb(), fc.nat(200), fc.constantFrom('approved' as const, 'rejected' as const), (events, cursor, choice) => {
        const points = decisionPoints(events)
        const next = nextDecision(points, cursor)
        const later = points.filter((point) => point.sequence > cursor)
        expect(next).toBe(later.length === 0 ? null : later[0])
        for (const point of points) {
          const answer = practiceAnswer(point, choice)
          expect(answer.same).toBe(choice === point.recorded)
          expect(answer.recorded.startsWith('In the recording, the owner chose: ')).toBe(true)
        }
      }),
      RUNS,
    )
  })

  it('Property 3: the numbers are counted from the log', () => {
    fc.assert(
      fc.property(canonicalRecordsArb(), (events) => {
        const numbers = logNumbers(events)
        expect(numbers.records).toBe(events.length)
        expect(numbers.waits).toBeLessThanOrEqual(events.length)
        expect(numbers.ghosts).toBe(new Set(events.map((event) => event.scope.ghost_id).filter((id) => id !== '')).size)
      }),
      RUNS,
    )
  })
})
