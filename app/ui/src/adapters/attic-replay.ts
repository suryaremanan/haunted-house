// The Attic's replay of one Mansion (replay-and-submission task 4.2;
// Requirements 1.1 to 1.5, 3.8, 4.1): canonical source, Replay Model and
// Replay Controller, joined once for the Mansion Shell.
//
// The shell calls `useAtticReplay` once for the open Mansion, so playback
// outlives the Attic panel, and hands the result to `AtticPanel`. In Crew the
// house stays live and the Attic alone shows the replayed prefix. In the
// static replay build the recording is the only state there is: `house` then
// carries the upstream folds of the current prefix for the shell to show, and
// the Cursor is told to the stand-in so its read routes serve the same prefix.
//
// Everything visible is `fold(records.slice(0, cursor))` of the Spec 2 log.
// Nothing here writes, approves, navigates, announces or stores.
import { useEffect, useMemo, useRef } from 'react'
import type { GhostSnapshot, GhostTransition } from '../core/ghost-state'
import type { UpstreamReplay } from '../core/house-projection'
import type { ReplayCommand, ReplayState } from '../core/replay-reducer'
import {
  buildReplayModel,
  replayFoldFor,
  unavailableReplayModel,
  workflowOf,
  type ReplayIntegrity,
  type ReplayModel,
  type ReplayProjection,
} from '../core/replay-timeline'
import { foldWorkflow } from '../core/workflow-fold'
import type { WorkflowProjection } from '../core/workflow-projection'
import { useAtticLog, type AtticLogStatus } from './attic-log-source'
import { useReplayController, type ReplayScheduler } from './replay-controller'
import { REPLAY_RECORDING } from './sdk'

/** What the house shows at the current Cursor of a recording. Read-only by construction. */
export interface ReplayHouseSources {
  /** The Spec 4 workflow fold of the prefix, marked read-only. */
  readonly workflow: WorkflowProjection
  /** The Spec 2 ghost snapshots of the prefix, by ghost id. */
  readonly snapshots: ReadonlyMap<string, GhostSnapshot>
  /** Every derived ghost transition of the prefix, in Canonical_Order. */
  readonly transitions: readonly GhostTransition[]
  /** Sequence of the last record of the prefix, or zero. */
  readonly highestSequence: number
}

export interface AtticReplay {
  readonly mansionId: string
  /** `replay`: the static build, where nothing can be changed. `live`: inside Crew. */
  readonly mode: 'live' | 'replay'
  /** True when no action of the page may reach Crew: always in the static build. */
  readonly readOnly: boolean
  /** The state of the one Event_Log read. */
  readonly source: AtticLogStatus
  readonly model: ReplayModel
  readonly state: ReplayState
  readonly command: (command: ReplayCommand) => void
  /** Reads the Event_Log again from its one source. A log that only grew keeps the Cursor. */
  readonly refresh: () => void
  /**
   * The replay facts for the House Projection. `validRecordCount` is the
   * number of records in the log, not the Cursor, so the map's Attic label
   * does not change while a replay plays.
   */
  readonly upstream: UpstreamReplay
  /** The house at the current Cursor in the static build; null in Crew, where the house is live. */
  readonly house: ReplayHouseSources | null
}

const EMPTY_MODEL: ReplayModel = { records: [], timeline: [], diagnostics: [], integrityOk: true }
const FAILED_MODEL = unavailableReplayModel('fixture_unavailable')

/** True when two models hold the same records, diagnostics and integrity verdict. */
function sameLog(left: ReplayModel, right: ReplayModel): boolean {
  return (
    left.integrityOk === right.integrityOk &&
    left.records.length === right.records.length &&
    left.records.every((record, index) => record.record_id === right.records[index].record_id) &&
    left.diagnostics.length === right.diagnostics.length &&
    left.diagnostics.every((diagnostic, index) => {
      const other = right.diagnostics[index]
      return diagnostic.code === other.code && diagnostic.line === other.line && diagnostic.recordId === other.recordId
    })
  )
}

/** The house inputs of one Mansion at one projection. Pure. */
export function replayHouseSources(model: ReplayModel, projection: ReplayProjection, mansionId: string): ReplayHouseSources {
  const workflow =
    workflowOf(projection, mansionId) ??
    // A prefix without a record of the Mansion: the same fold over nothing.
    foldWorkflow([], { mansionId, integrity: projection.integrity === 'incompatible' ? 'corrupt' : 'valid', readOnly: true })
      .projection
  return {
    workflow,
    snapshots: new Map(
      projection.ghosts.filter((ghost) => ghost.mansion_id === mansionId).map((ghost) => [ghost.ghost_id, ghost] as const),
    ),
    transitions: projection.transitions,
    highestSequence: projection.validRecordCount === 0 ? 0 : (model.records[projection.validRecordCount - 1]?.sequence ?? 0),
  }
}

/** The replay facts of a model at one projection, for `buildHouseProjection`. Pure. */
export function upstreamReplay(model: ReplayModel, projection: ReplayProjection): UpstreamReplay {
  const diagnostics = [...model.diagnostics, ...projection.diagnostics]
  const integrity: ReplayIntegrity =
    projection.integrity === 'incompatible' || !model.integrityOk ? 'incompatible' : diagnostics.length > 0 ? 'diagnostic' : 'valid'
  return { integrity, validRecordCount: model.records.length, diagnostics }
}

/**
 * The replay of one Mansion. Loads its Event_Log once, starts paused at Cursor
 * zero and never plays by itself. `scheduler` is for tests.
 */
export function useAtticReplay(mansionId: string, scheduler?: ReplayScheduler): AtticReplay {
  const log = useAtticLog(mansionId)
  const { result } = log

  // While the log is read again the last model stays, so a refresh does not empty the Attic.
  const lastReady = useRef<{ mansionId: string; model: ReplayModel } | null>(null)
  const model = useMemo(() => {
    if (result.status === 'ready' && result.selection !== null) {
      const built = buildReplayModel(result.selection)
      const previous = lastReady.current
      // The same log read again is the same model: playback goes on undisturbed.
      if (previous !== null && previous.mansionId === mansionId && sameLog(previous.model, built)) return previous.model
      lastReady.current = { mansionId, model: built }
      return built
    }
    if (result.status === 'error') {
      lastReady.current = null
      return FAILED_MODEL
    }
    return lastReady.current?.mansionId === mansionId ? lastReady.current.model : EMPTY_MODEL
  }, [result, mansionId])
  const fold = useMemo(() => replayFoldFor(model), [model])
  const controller = useReplayController(model, fold, scheduler)
  const { state } = controller

  // Static build: the stand-in's read routes serve exactly the prefix the Cursor names.
  useEffect(() => {
    REPLAY_RECORDING?.present(mansionId, state.cursor)
  }, [mansionId, state.cursor])

  const mode = log.mode
  const upstream = useMemo(() => upstreamReplay(controller.model, state.projection), [controller.model, state.projection])
  const house = useMemo(
    () => (mode === 'replay' ? replayHouseSources(controller.model, state.projection, mansionId) : null),
    [mode, controller.model, state.projection, mansionId],
  )

  return useMemo(
    () => ({
      mansionId,
      mode,
      readOnly: mode === 'replay',
      source: result.status,
      model: controller.model,
      state,
      command: controller.command,
      refresh: log.reload,
      upstream,
      house,
    }),
    [mansionId, mode, result.status, controller.model, state, controller.command, log.reload, upstream, house],
  )
}
