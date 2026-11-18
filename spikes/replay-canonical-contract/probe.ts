// RS-S0: canonical replay composition probe (replay-and-submission task 1.1;
// Requirements 1.1, 1.2, 1.3, 1.6, 1.7, 11.3).
//
// Question: do the implemented specs expose ONE spec 2 Event_Log, ONE
// Canonical_Parser and selector, and live and replay folds that agree, so the
// Attic can replay without a log, parser, reducer or state store of its own?
//
//   bun spikes/replay-canonical-contract/probe.ts           print the result
//   bun spikes/replay-canonical-contract/probe.ts --check   exit 1 unless it passes and equals the recorded result
//   bun spikes/replay-canonical-contract/probe.ts --write   refresh spikes/fixtures/replay-canonical-contract.json
//
// The probe imports the real public seams and drives the synthetic replay
// fixture through them. It creates no compatibility log, parser, reducer or
// snapshot. The result holds schema versions, type names, seam names and
// booleans only: no record, payload, path of this machine or secret.
//
// `evaluate` is pure, so the UI test suite runs it too
// (app/ui/scripts-tests/replay-canonical-contract.test.ts).


/** The demo recording's held moment: every Ghost_State at once, one proposal waiting. */
const HELD_MOMENT_RECORDS = 64
export const RESULT_PATH = 'spikes/fixtures/replay-canonical-contract.json'

/** module -> the exports replay composes. A missing one means `contract_unavailable`. */
export const REQUIRED_SEAMS = {
  'core/seance-event': ['EVENT_TYPES', 'SCHEMA_VERSION', 'parseAppEventLine', 'serializeAppEvent', 'canonicalJson'],
  'core/seance-log': ['parseEventLog', 'projectEvents', 'projectLog', 'mergeAcknowledged', 'EMPTY_LOG'],
  'core/ghost-state': ['selectEvents', 'foldGhostEvents', 'GHOST_STATES'],
  'core/workflow-fold': ['foldWorkflow', 'readDomainRecord', 'GUARDRAIL_KINDS', 'GUARDRAIL_DOMAIN'],
  'core/workflow-projection': ['workflowProjectionToJson', 'PHASES'],
  'core/house-view': ['needsYou', 'houseRooms', 'ROOMS'],
  'core/ghost-status': ['ghostRows'],
  'core/replay-timeline': ['CANONICAL_REPLAY_PORT', 'buildReplayModel', 'parseCanonicalLog', 'foldReplay', 'foldLive', 'replayFoldFor', 'workflowOf'],
  'core/replay-reducer': ['initialReplayState', 'reduceReplayCommand', 'nextDelayMs', 'REPLAY_SPEEDS'],
} as const

export type SeamModule = keyof typeof REQUIRED_SEAMS
// The probe checks at run time that each export exists, so seams are untyped here on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Seams = Partial<Record<SeamModule, Record<string, any>>>

export interface ProbeInputs {
  readonly seams: Seams
  /** fixtures/replay/demo.jsonl */
  readonly log: string
  /** fixtures/replay/demo.workflow.json: the backend workflow projection after each step. */
  readonly backendSteps: { readonly steps: readonly { readonly sequence: number; readonly workflow: unknown }[] }
  /** fixtures/replay/demo.expected.json: the backend's selection and final projection. */
  readonly backendFinal: {
    readonly mansion_id: string
    readonly selected_record_ids: readonly string[]
    readonly projection: { readonly ghosts: unknown; readonly transitions: unknown; readonly workflow: unknown }
  }
  /** Non-test UI sources, repo-relative path -> text. */
  readonly uiSources: Readonly<Record<string, string>>
  /** Backend package sources, repo-relative path -> text. */
  readonly backendSources: Readonly<Record<string, string>>
}

export interface SpikeCheck {
  readonly id: string
  readonly pass: boolean
}

export interface SpikeResult {
  readonly spike: 'RS-S0'
  readonly schemaVersion: 1
  readonly result: 'pass' | 'contract_unavailable'
  readonly eventSchemaVersion: number | null
  readonly eventTypes: readonly string[]
  readonly guardrailKinds: readonly string[]
  readonly ghostStates: readonly string[]
  readonly eventLog: { readonly file: string | null; readonly owners: readonly string[] }
  readonly seams: Readonly<Record<string, readonly string[]>>
  readonly projectionFields: readonly string[]
  readonly replayStateFields: readonly string[]
  readonly checks: readonly SpikeCheck[]
}

const plain = (value: unknown): string => JSON.stringify(value)

function missingSeams(seams: Seams): string[] {
  const missing: string[] = []
  for (const [module, names] of Object.entries(REQUIRED_SEAMS) as [SeamModule, readonly string[]][]) {
    for (const name of names) {
      if (seams[module]?.[name] === undefined) missing.push(`${module}#${name}`)
    }
  }
  return missing
}

/** Files of `sources` whose text matches, sorted. */
function filesWith(sources: Readonly<Record<string, string>>, pattern: RegExp): string[] {
  return Object.keys(sources)
    .filter((path) => pattern.test(sources[path]))
    .sort()
}

export function evaluate(inputs: ProbeInputs): SpikeResult {
  const checks: SpikeCheck[] = []
  const check = (id: string, test: () => boolean) => {
    let pass = false
    try {
      pass = test() === true
    } catch {
      // A seam that throws is an incompatible seam.
      pass = false
    }
    checks.push({ id, pass })
  }

  const missing = missingSeams(inputs.seams)
  check('every_public_seam_is_present', () => missing.length === 0)

  // One physical Event_Log with one writer owner in the backend.
  const logFiles = new Set<string>()
  for (const text of Object.values(inputs.backendSources)) {
    for (const match of text.matchAll(/["']([A-Za-z0-9._-]+\.jsonl)["']/g)) logFiles.add(match[1])
  }
  const logOwners = filesWith(inputs.backendSources, /["'][A-Za-z0-9._-]+\.jsonl["']/)
  check('one_canonical_event_log', () => logFiles.size === 1 && logOwners.length === 1)

  // One parser, one selector and one fold per language: definitions, not call sites.
  check('one_canonical_parser', () =>
    plain(filesWith(inputs.uiSources, /export function parseEventLog\b/)) === plain(['app/ui/src/core/seance-log.ts']) &&
    plain(filesWith(inputs.uiSources, /\bparseAppEventLine\(/)) === plain(['app/ui/src/core/seance-event.ts', 'app/ui/src/core/seance-log.ts']) &&
    filesWith(inputs.backendSources, /^def parse_event_log\b/m).length === 1,
  )
  check('one_event_selector', () =>
    plain(filesWith(inputs.uiSources, /export function selectEvents\b/)) === plain(['app/ui/src/core/ghost-state.ts']) &&
    filesWith(inputs.backendSources, /^def select_events\b/m).length === 1,
  )
  check('one_fold_per_projection', () =>
    plain(filesWith(inputs.uiSources, /export function foldGhostEvents\b/)) === plain(['app/ui/src/core/ghost-state.ts']) &&
    plain(filesWith(inputs.uiSources, /export function foldWorkflow\b/)) === plain(['app/ui/src/core/workflow-fold.ts']),
  )
  // Replay keeps nothing between page loads: no file of the replay path stores state.
  check('no_alternate_attic_authority_store', () =>
    filesWith(inputs.uiSources, /\b(?:localStorage|sessionStorage|indexedDB)\b/).filter((path) => /replay|attic/i.test(path)).length === 0,
  )

  const seams = inputs.seams
  if (missing.length > 0) return result(inputs, checks, logFiles, logOwners, [], [])
  try {
    const timeline = seams['core/replay-timeline']!
    const reducer = seams['core/replay-reducer']!
    const port = timeline.CANONICAL_REPLAY_PORT
    const selection = port.parse(inputs.log)
    const model = timeline.buildReplayModel(selection)
    const records: readonly { record_id: string; event_type: string; scope: { ghost_id: string; mansion_id: string }; payload: unknown }[] =
      model.records
    const total = records.length
    const fold = timeline.replayFoldFor(model)
    const full = fold(records)
    const mansionId = inputs.backendFinal.mansion_id
    // Two projections are equal when their canonical JSON is: key order is not part of a value.
    const canonical = (value: unknown): string => seams['core/seance-event']!.canonicalJson(JSON.parse(JSON.stringify(value)))
    const wire = (projection: unknown) => {
      const workflow = timeline.workflowOf(projection, mansionId)
      // `read_only` is replay-only presentation the backend never sends.
      return workflow === null ? null : seams['core/workflow-projection']!.workflowProjectionToJson({ ...workflow, readOnly: false })
    }

    check('fixture_parses_through_the_canonical_parser', () =>
      total > 0 && selection.integrityOk === true && selection.diagnostics.length === 0 &&
      plain(records) === plain(seams['core/seance-log']!.parseEventLog(inputs.log).events),
    )
    check('selection_equals_the_backend_selection', () =>
      plain(records.map((record) => record.record_id)) === plain(inputs.backendFinal.selected_record_ids),
    )

    // The synthetic history RS-S0 asks for.
    const types = new Set(records.map((record) => record.event_type))
    const kinds = new Set(
      records.map((record) => seams['core/workflow-fold']!.readDomainRecord(record)).filter((fact) => fact !== null && typeof fact !== 'string').map((fact) => fact.kind),
    )
    check('history_has_a_door_decision', () => kinds.has('door_approved') || kinds.has('door_rejected'))
    check('history_has_a_tool_approval', () => types.has('tool_started') && types.has('approval_requested') && types.has('approval_decided'))
    check('history_has_a_terminal_result', () => types.has('run_completed') && types.has('tool_finished'))
    check('history_has_a_failure_and_a_denial', () => types.has('run_failed') && (types.has('run_blocked') || kinds.has('phase_start_denied')))
    check('history_has_several_ghosts', () => new Set(records.map((record) => record.scope.ghost_id)).size >= 2)

    // One live/replay fold contract and equal full projections.
    check('live_and_replay_projections_are_equal', () => {
      const redelivered = [...records].reverse().concat(records.slice(0, Math.ceil(total / 2)))
      return canonical(port.foldLive(redelivered)) === canonical(port.fold(records)) && canonical(port.fold(records)) === canonical(full)
    })
    check('every_prefix_equals_the_backend_workflow', () =>
      inputs.backendSteps.steps.length > 1 &&
      inputs.backendSteps.steps.every(
        (step) => step.sequence === 0 || canonical(wire(fold(records.slice(0, step.sequence)))) === canonical(step.workflow),
      ),
    )
    check('final_projection_equals_the_backend_projection', () =>
      canonical(full.ghosts) === canonical(inputs.backendFinal.projection.ghosts) &&
      canonical(full.transitions) === canonical(inputs.backendFinal.projection.transitions) &&
      canonical(wire(full)) === canonical(inputs.backendFinal.projection.workflow),
    )

    // The engine adds presentation state only, and the house reads its projection as it reads the live one.
    const initial = reducer.initialReplayState(model, fold)
    const final = reducer.reduceReplayCommand(model, initial, { kind: 'seek', cursor: total }, fold)
    check('engine_final_cursor_equals_the_full_fold', () =>
      final.cursor === total && final.status === 'complete' && canonical(final.projection) === canonical(full) &&
      initial.status === 'paused' && initial.cursor === 0,
    )
    check('house_view_reads_the_replay_projection', () => {
      // Read at the recording's held moment (record 64), when something waits on the owner.
      const held = fold(records.slice(0, Math.min(total, HELD_MOMENT_RECORDS)))
      const workflow = timeline.workflowOf(held, mansionId)
      const rooms = seams['core/house-view']!.ROOMS as readonly unknown[]
      const waiting = seams['core/house-view']!.needsYou(workflow) as readonly unknown[]
      return (
        workflow !== null && workflow.readOnly === true &&
        // A Crew prompt that belongs to a pending proposal is one Needs You item, not two.
        waiting.length >= 1 && waiting.length <= workflow.waitingCount &&
        rooms.length > 0 && held.ghosts.length >= 2
      )
    })

    checks.push({ id: 'seams_compose_without_error', pass: true })
    return result(inputs, checks, logFiles, logOwners, Object.keys(full).sort(), Object.keys(final).sort())
  } catch {
    // A seam that throws while composing is an incompatible seam; nothing of the error is recorded.
    checks.push({ id: 'seams_compose_without_error', pass: false })
    return result(inputs, checks, logFiles, logOwners, [], [])
  }
}

function result(
  inputs: ProbeInputs,
  checks: readonly SpikeCheck[],
  logFiles: ReadonlySet<string>,
  logOwners: readonly string[],
  projectionFields: readonly string[],
  replayStateFields: readonly string[],
): SpikeResult {
  const seams = inputs.seams
  return {
    spike: 'RS-S0',
    schemaVersion: 1,
    result: checks.every((entry) => entry.pass) ? 'pass' : 'contract_unavailable',
    eventSchemaVersion: seams['core/seance-event']?.SCHEMA_VERSION ?? null,
    eventTypes: [...(seams['core/seance-event']?.EVENT_TYPES ?? [])],
    guardrailKinds: [...(seams['core/workflow-fold']?.GUARDRAIL_KINDS ?? [])],
    ghostStates: [...(seams['core/ghost-state']?.GHOST_STATES ?? [])],
    eventLog: { file: logFiles.size === 1 ? [...logFiles][0] : null, owners: logOwners },
    seams: Object.fromEntries(Object.entries(REQUIRED_SEAMS).map(([module, names]) => [`app/ui/src/${module}.ts`, [...names]])),
    projectionFields,
    replayStateFields,
    checks,
  }
}

/** Canonical bytes of a result: two-space JSON and one final newline. */
export function renderResult(value: SpikeResult): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Imports each seam module; a module that cannot be imported is left out. */
export async function loadSeams(importer: (module: SeamModule) => Promise<Record<string, unknown>>): Promise<Seams> {
  const seams: Seams = {}
  for (const module of Object.keys(REQUIRED_SEAMS) as SeamModule[]) {
    try {
      seams[module] = await importer(module)
    } catch {
      // Left out: `evaluate` reports every export of it as missing.
    }
  }
  return seams
}
