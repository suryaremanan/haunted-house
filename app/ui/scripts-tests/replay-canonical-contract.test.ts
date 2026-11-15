// @vitest-environment node
// RS-S0 canonical replay composition harness (replay-and-submission task 1.1).
// Runs the spike probe on the real upstream seams and on damaged copies of
// its inputs. The probe creates no log, parser, reducer or snapshot.
// **Validates: Requirements 1.1, 1.2, 1.3, 1.6, 1.7, 11.3**
import { describe, expect, it } from 'vitest'
import {
  REQUIRED_SEAMS,
  RESULT_PATH,
  evaluate,
  loadSeams,
  renderResult,
  type ProbeInputs,
  type SeamModule,
  type Seams,
} from '../../../spikes/replay-canonical-contract/probe'
import { readInputs, readRepoFile } from '../../../spikes/replay-canonical-contract/repo'
import * as ghostState from '../src/core/ghost-state'
import * as ghostStatus from '../src/core/ghost-status'
import * as houseView from '../src/core/house-view'
import * as replayReducer from '../src/core/replay-reducer'
import * as replayTimeline from '../src/core/replay-timeline'
import * as seanceEvent from '../src/core/seance-event'
import * as seanceLog from '../src/core/seance-log'
import * as workflowFold from '../src/core/workflow-fold'
import * as workflowProjection from '../src/core/workflow-projection'

const MODULES: Record<SeamModule, Record<string, unknown>> = {
  'core/seance-event': seanceEvent,
  'core/seance-log': seanceLog,
  'core/ghost-state': ghostState,
  'core/workflow-fold': workflowFold,
  'core/workflow-projection': workflowProjection,
  'core/house-view': houseView,
  'core/ghost-status': ghostStatus,
  'core/replay-timeline': replayTimeline,
  'core/replay-reducer': replayReducer,
}

const SEAMS: Seams = await loadSeams(async (module) => MODULES[module])
const INPUTS: ProbeInputs = readInputs(SEAMS)
const failed = (inputs: ProbeInputs) =>
  evaluate(inputs)
    .checks.filter((check) => !check.pass)
    .map((check) => check.id)

describe('RS-S0 canonical replay composition', () => {
  it('passes on the implemented upstream seams', () => {
    const result = evaluate(INPUTS)
    expect(failed(INPUTS)).toEqual([])
    expect(result.result).toBe('pass')
    expect(result.checks.length).toBeGreaterThanOrEqual(19)
    expect(result.eventLog).toEqual({
      file: 'events.v1.jsonl',
      owners: ['app/backend/haunted_house/adapters/seance_log_store.py'],
    })
    expect(result.eventSchemaVersion).toBe(1)
  })

  it('equals the recorded machine-readable result', () => {
    expect(renderResult(evaluate(INPUTS))).toBe(readRepoFile(RESULT_PATH))
  })

  it('records type and schema metadata only', () => {
    const text = readRepoFile(RESULT_PATH)
    expect(text).not.toMatch(/[er]1:[0-9a-f]{8}/)
    expect(text).not.toMatch(/\/(?:Users|home)\//)
    expect(text).not.toContain('demo-mansion')
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(
      ['checks', 'eventLog', 'eventSchemaVersion', 'eventTypes', 'ghostStates', 'guardrailKinds', 'projectionFields', 'replayStateFields', 'result', 'schemaVersion', 'seams', 'spike'],
    )
  })

  it('keeps replay state to presentation fields around one projection', () => {
    const result = evaluate(INPUTS)
    expect(result.replayStateFields).toEqual(['commandError', 'cursor', 'generation', 'projection', 'speed', 'status'])
    expect(result.projectionFields).toEqual(['diagnostics', 'ghosts', 'integrity', 'transitions', 'validRecordCount', 'workflows'])
  })

  it.each(Object.keys(REQUIRED_SEAMS) as SeamModule[])('returns contract_unavailable when %s is absent', (module) => {
    const seams = { ...SEAMS }
    delete seams[module]
    const result = evaluate({ ...INPUTS, seams })
    expect(result.result).toBe('contract_unavailable')
    expect(result.checks.find((check) => check.id === 'every_public_seam_is_present')?.pass).toBe(false)
  })

  it('returns contract_unavailable when one export is missing', () => {
    const seams: Seams = { ...SEAMS, 'core/ghost-state': { ...ghostState, selectEvents: undefined } }
    expect(evaluate({ ...INPUTS, seams }).result).toBe('contract_unavailable')
  })

  it('returns contract_unavailable when live and replay folds disagree', () => {
    const port = replayTimeline.CANONICAL_REPLAY_PORT
    const seams: Seams = {
      ...SEAMS,
      'core/replay-timeline': {
        ...replayTimeline,
        CANONICAL_REPLAY_PORT: { ...port, foldLive: (records: Parameters<typeof port.foldLive>[0]) => port.foldLive(records.slice(1)) },
      },
    }
    expect(failed({ ...INPUTS, seams })).toEqual(['live_and_replay_projections_are_equal'])
  })

  it('returns contract_unavailable when a seam throws', () => {
    const seams: Seams = {
      ...SEAMS,
      'core/replay-timeline': {
        ...replayTimeline,
        replayFoldFor: () => () => {
          throw new Error('incompatible')
        },
      },
    }
    const result = evaluate({ ...INPUTS, seams })
    expect(result.result).toBe('contract_unavailable')
    expect(result.checks.at(-1)).toEqual({ id: 'seams_compose_without_error', pass: false })
    expect(JSON.stringify(result)).not.toContain('incompatible')
  })

  it('refuses a second physical log in the backend', () => {
    const backendSources = { ...INPUTS.backendSources, 'app/backend/haunted_house/adapters/doors_log.py': '_LOG = "seance.jsonl"\n' }
    expect(failed({ ...INPUTS, backendSources })).toEqual(['one_canonical_event_log'])
  })

  it('refuses a second parser, selector or fold in the UI', () => {
    const extra = (text: string) => ({ ...INPUTS.uiSources, 'app/ui/src/rooms/attic/own-replay.ts': text })
    expect(failed({ ...INPUTS, uiSources: extra('export function parseEventLog(text: string) { return [] }\n') })).toEqual(['one_canonical_parser'])
    expect(failed({ ...INPUTS, uiSources: extra('const line = parseAppEventLine(raw, 1)\n') })).toEqual(['one_canonical_parser'])
    expect(failed({ ...INPUTS, uiSources: extra('export function selectEvents(events: unknown[]) { return events }\n') })).toEqual(['one_event_selector'])
    expect(failed({ ...INPUTS, uiSources: extra('export function foldWorkflow() { return null }\n') })).toEqual(['one_fold_per_projection'])
  })

  it('refuses an Attic or replay file that stores state in the browser', () => {
    const uiSources = { ...INPUTS.uiSources, 'app/ui/src/rooms/attic/snapshot.ts': "localStorage.setItem('attic', '{}')\n" }
    expect(failed({ ...INPUTS, uiSources })).toEqual(['no_alternate_attic_authority_store'])
  })

  it('refuses a history without the required narrative or with a damaged record', () => {
    const lines = INPUTS.log.split('\n')
    expect(failed({ ...INPUTS, log: `${lines.slice(0, 3).join('\n')}\n` })).toEqual(
      expect.arrayContaining(['selection_equals_the_backend_selection', 'history_has_a_door_decision', 'history_has_a_tool_approval']),
    )
    expect(failed({ ...INPUTS, log: [lines[0], 'not json', ...lines.slice(1)].join('\n') })).toContain(
      'fixture_parses_through_the_canonical_parser',
    )
  })

  it('refuses a backend projection that the TypeScript fold does not reach', () => {
    const steps = INPUTS.backendSteps.steps.map((step, index) => (index === 2 ? { ...step, workflow: { changed: true } } : step))
    expect(failed({ ...INPUTS, backendSteps: { steps } })).toEqual(['every_prefix_equals_the_backend_workflow'])
    const backendFinal = { ...INPUTS.backendFinal, projection: { ...INPUTS.backendFinal.projection, ghosts: [] } }
    expect(failed({ ...INPUTS, backendFinal })).toEqual(['final_projection_equals_the_backend_projection'])
  })
})
