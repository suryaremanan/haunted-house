// Feature: replay-and-submission, Property 1: Canonical replay and live folding agree
//
// For all finite supported Canonical_Record collections, including exact
// duplicates, conflicting variants, and delivery-order permutations,
// constructing a Replay_Model through the spec 2 Event_Selector and moving to
// the final Cursor produces the same selected Record_ID sequence, complete
// workflow, Door, Ghost, waiting-item, and integrity projection as Live_Fold
// over the same selected records; no unselected record, raw Crew frame, saved
// snapshot, or external state affects the result.
//
// **Validates: Requirements 1.2, 1.3, 1.6, 2.9, 11.3**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { canonicalRecordsArb, deliveryArb } from '../test/replay-arbitraries'
import { deepFreeze, referenceSelect, referenceSnapshots } from '../test/seance-arbitraries'
import { initialReplayState, reduceReplayCommand } from './replay-reducer'
import { CANONICAL_REPLAY_PORT, buildReplayModel } from './replay-timeline'
import { EMPTY_LOG, mergeAcknowledged, projectLog } from './seance-log'
import { foldWorkflow } from './workflow-fold'

const RUNS = 200
// Each run folds many prefixes; the whole suite may run beside it.
const TIMEOUT_MS = 60_000
const port = CANONICAL_REPLAY_PORT

const scenarioArb = canonicalRecordsArb().chain((records) =>
  fc.record({
    delivered: deliveryArb(records),
    redelivered: deliveryArb(records),
    // Where the live page's acknowledgment batches are cut.
    cuts: fc.array(fc.nat(), { maxLength: 5 }),
  }),
)

describe('Property 1: Canonical replay and live folding agree', () => {
  it('reaches at the final Cursor the projection live folding reaches, whatever was delivered', () => {
    fc.assert(
      fc.property(scenarioArb, ({ delivered, redelivered, cuts }) => {
        deepFreeze(delivered)
        const model = buildReplayModel(port.select(delivered))
        const total = model.records.length

        // The Spec 2 selector decides what is replayed and in which order.
        const reference = referenceSelect(delivered)
        expect(model.records.map((record) => record.record_id)).toEqual(reference.events.map((record) => record.record_id))
        expect(model.timeline.map((entry) => entry.recordId)).toEqual(model.records.map((record) => record.record_id))

        // Replay: move to the final Cursor through the engine.
        const fold = port.fold
        const final = reduceReplayCommand(model, initialReplayState(model, fold), { kind: 'seek', cursor: total }, fold)
        expect(final.cursor).toBe(total)
        expect(final.status).toBe('complete')

        // Live: acknowledged batches merged at most once per Record_ID, then the live projection.
        expect(final.projection).toEqual(port.foldLive(model.records))
        expect(final.projection).toEqual(port.foldLive(delivered))
        let log = EMPTY_LOG
        const bounds = [...new Set(cuts.map((cut) => cut % (delivered.length + 1)))].sort((a, b) => a - b)
        let start = 0
        for (const bound of [...bounds, delivered.length]) {
          log = mergeAcknowledged(log, delivered.slice(start, bound)).log
          start = bound
        }
        const live = projectLog(log)
        expect(final.projection.ghosts).toEqual(live.snapshots)
        expect(final.projection.transitions).toEqual(live.transitions)
        expect(live.events.map((record) => record.record_id)).toEqual(model.records.map((record) => record.record_id))

        // Ghosts match the independent six-state reference; workflows match the upstream fold of the Mansion's log.
        expect(final.projection.ghosts).toEqual(referenceSnapshots(reference.events))
        const mansions = [...new Set(delivered.map((record) => record.scope.mansion_id))]
        expect(final.projection.workflows.map((workflow) => workflow.mansionId).sort()).toEqual([...mansions].sort())
        for (const workflow of final.projection.workflows) {
          const upstream = foldWorkflow(live.events, { mansionId: workflow.mansionId, readOnly: true }).projection
          expect(workflow).toEqual(upstream)
        }
        expect(final.projection.validRecordCount).toBe(total)

        // Unselected records and delivery order change nothing.
        expect(port.fold(delivered)).toEqual(final.projection)
        expect(buildReplayModel(port.select(redelivered))).toEqual(model)
      }),
      { numRuns: RUNS },
    )
  }, TIMEOUT_MS)
})
