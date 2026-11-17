// @vitest-environment node
// HUI-S0: characterization of the upstream seams the House UI composes (Spec 6
// task 1.1; see spikes/house-ui-upstream-contract/README.md). It imports the
// public seams of specs 2 to 5 as they are in the tree, proves that each kind
// of authoritative state has exactly one owner, and records only field names
// and type categories of synthetic values in a scrubbed fixture.
//
// Fail closed: a missing module fails the import; a second owner of the same
// state, or a House UI core module that reaches outside `core/`, fails a test.
// Set HUI_S0_RECORD=1 to rewrite the fixture after an intended upstream change.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as ghostState from '../src/core/ghost-state'
import { buildHouseProjection } from '../src/core/house-projection'
import * as houseReducer from '../src/core/house-reducer'
import * as houseView from '../src/core/house-view'
import * as mansionApi from '../src/core/mansion-api'
import * as replayTimeline from '../src/core/replay-timeline'
import * as roomView from '../src/core/room-view'
import * as seanceLog from '../src/core/seance-log'
import * as workflowFold from '../src/core/workflow-fold'
import * as workflowProjection from '../src/core/workflow-projection'
import { composeUpstream, snapshot } from '../src/test/house-projection-kit'
import { artifact, document, roomGhosts, run } from '../src/test/room-kit'
import { MANSION, doorProposal, projection, riskyProposal } from '../src/test/workflow-arbitraries'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORE = path.join(HERE, '../src/core')
const REPO = path.join(HERE, '../../..')
const FIXTURE = path.join(REPO, 'spikes/fixtures/house-ui-upstream-contract.json')
const DEMO_LOG = path.join(REPO, 'fixtures/replay/demo.jsonl')

/** The House UI core modules of this feature. They may read upstream core modules and nothing else. */
const HOUSE_UI_CORE = [
  'house-registry.ts',
  'house-projection.ts',
  'motion-policy.ts',
  'interruption-policy.ts',
  // Spec 8: the guide, its words, its layout table, the first visit and the built view.
  'house-guide.ts',
  'house-words.ts',
  'guide-layout.ts',
  'first-visit.ts',
  'house-built.ts',
]

function coreSources(): Map<string, string> {
  const sources = new Map<string, string>()
  for (const name of readdirSync(CORE)) {
    if (name.endsWith('.ts') && !name.endsWith('.test.ts')) sources.set(name, readFileSync(path.join(CORE, name), 'utf8'))
  }
  return sources
}

/** Files in `core/` that declare an exported function of this name. */
function ownersOf(functionName: string, sources: ReadonlyMap<string, string>): string[] {
  const declaration = new RegExp(`export\\s+function\\s+${functionName}\\b`)
  return [...sources].filter(([, text]) => declaration.test(text)).map(([name]) => name).sort()
}

/** The type category of a value: never the value itself. */
function shape(value: unknown): unknown {
  if (value === null) return 'null'
  if (Array.isArray(value)) return value.length === 0 ? 'array' : ['array', shape(value[0])]
  if (value instanceof Map) return 'map'
  if (value instanceof Set) return 'set'
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((key) => [key, shape((value as Record<string, unknown>)[key])]),
    )
  }
  return typeof value
}

// One synthetic house: a Door waiting, a risky proposal, a failed run that can be retried.
const WORKFLOW = projection({
  version: 12,
  phaseOverrides: {
    requirements: { status: 'waiting', ghostIds: ['archivist'], door: { status: 'waiting', proposal: doorProposal('requirements') } },
    implementation: { status: 'working', ghostIds: ['tinker-2'] },
  },
  riskyProposals: [riskyProposal()],
})
const SNAPSHOTS = [snapshot('archivist', 'waiting'), snapshot('tinker-2', 'failed', { run_id: 'task-1' })]
const ROOM_GHOSTS = roomGhosts({
  version: 12,
  documents: [document('requirements', { artifact: artifact() }), document('design'), document('tasks')],
  runs: [run({ runId: 'task-1', ghostId: 'tinker-2', phase: 'implementation', taskId: '1.2', canRetry: true })],
})

describe('HUI-S0 upstream composition', () => {
  const sources = coreSources()

  it('finds every upstream seam the house composes', () => {
    // Mansion lifecycle (Spec 3).
    expect(typeof mansionApi.parseOpenMansionResponse).toBe('function')
    // Séance log and ghost state (Spec 2).
    expect(typeof ghostState.foldGhostEvents).toBe('function')
    expect(typeof seanceLog.projectEvents).toBe('function')
    expect(typeof replayTimeline.foldReplay).toBe('function')
    expect(typeof replayTimeline.foldLive).toBe('function')
    // Doors and guardrails (Spec 4).
    expect(typeof workflowProjection.parseWorkflowProjection).toBe('function')
    expect(typeof workflowFold.foldWorkflow).toBe('function')
    expect(typeof houseView.deriveAuthority).toBe('function')
    expect(typeof houseView.needsYou).toBe('function')
    expect(typeof houseReducer.authorizeCommand).toBe('function')
    // Room ghosts (Spec 5).
    expect(typeof roomView.joinRoomProjection).toBe('function')
    expect(typeof roomView.authorizeRoomCommand).toBe('function')
  })

  it('has exactly one owner for each kind of authoritative state', () => {
    const owners = {
      // One canonical Ghost_Snapshot source.
      foldGhostEvents: ownersOf('foldGhostEvents', sources),
      reduceGhostSnapshot: ownersOf('reduceGhostSnapshot', sources),
      // One workflow, Door and proposal fold, and one strict parser of the backend's projection.
      foldWorkflow: ownersOf('foldWorkflow', sources),
      parseWorkflowProjection: ownersOf('parseWorkflowProjection', sources),
      // One decision gate each for Spec 4 commands and Spec 5 commands.
      deriveAuthority: ownersOf('deriveAuthority', sources),
      authorizeCommand: ownersOf('authorizeCommand', sources),
      authorizeRoomCommand: ownersOf('authorizeRoomCommand', sources),
      // One selection of open workflow decisions.
      needsYou: ownersOf('needsYou', sources),
      // One joined artifact and task projection.
      joinRoomProjection: ownersOf('joinRoomProjection', sources),
      // One replay fold.
      foldReplay: ownersOf('foldReplay', sources),
    }
    expect(owners).toEqual({
      foldGhostEvents: ['ghost-state.ts'],
      reduceGhostSnapshot: ['ghost-state.ts'],
      foldWorkflow: ['workflow-fold.ts'],
      parseWorkflowProjection: ['workflow-projection.ts'],
      deriveAuthority: ['house-view.ts'],
      authorizeCommand: ['house-reducer.ts'],
      authorizeRoomCommand: ['room-view.ts'],
      needsYou: ['house-view.ts'],
      joinRoomProjection: ['room-view.ts'],
      foldReplay: ['replay-timeline.ts'],
    })
  })

  it('keeps the House UI core modules free of state ownership and of everything outside core', () => {
    for (const name of HOUSE_UI_CORE) {
      const source = sources.get(name)
      expect(source, name).toBeDefined()
      // Code only: the header comments describe what the module must not do.
      const text = source!.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      const imports = [...text.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
      // Only sibling core modules: no React, SDK, adapter, component, or Node module.
      for (const imported of imports) expect(imported, `${name} imports ${imported}`).toMatch(/^\.\/[a-z-]+$/)
      // No reducer over canonical records, no command, no transport, no clock, no timer, no storage.
      expect(text, name).not.toMatch(/\bfoldGhostEvents\b|\bfoldWorkflow\b|\breduceGhostSnapshot\b|\bparseAppEvent\b/)
      expect(text, name).not.toMatch(/\bfetch\s*\(|\bWebSocket\b|\bXMLHttpRequest\b|\bEventSource\b|\/api\//)
      expect(text, name).not.toMatch(/\bDate\.now\b|\bnew Date\b|\bsetTimeout\b|\bsetInterval\b|\bperformance\.now\b/)
      expect(text, name).not.toMatch(/\blocalStorage\b|\bsessionStorage\b|\bdocument\.|\bwindow\./)
      expect(text, name).not.toMatch(/\bAudio\b|\bAudioContext\b/)
    }
    // The house projection sends nothing: it builds no command and names no approval.
    const house = sources.get('house-projection.ts')!
    expect(house).not.toMatch(/\bdecide_door\b|\bdecide_risky\b|\bstart_phase\b|\bretry_run\b|\bcancel_run\b|expectedVersion/)
  })

  it('composes one Mansion identity, one ghost source, one decision selection and one joined room projection', () => {
    const { input, authority, joined } = composeUpstream({ workflow: WORKFLOW, snapshots: SNAPSHOTS, roomGhosts: ROOM_GHOSTS })
    const house = buildHouseProjection(input, { seanceRoom: 'hidden', mode: 'live' })

    // One active-Mansion identity across every source.
    expect(new Set([input.mansion.name, WORKFLOW.mansionId, ROOM_GHOSTS.mansionId, ...SNAPSHOTS.map((item) => item.mansion_id)])).toEqual(new Set([MANSION]))
    expect(workflowProjection.parseWorkflowProjection(workflowProjection.workflowProjectionToJson(WORKFLOW), 'another-mansion').ok).toBe(false)
    // A ghost of another Mansion never enters this house.
    const stray = composeUpstream({ workflow: WORKFLOW, snapshots: [snapshot('archivist', 'failed', { mansion_id: 'another-mansion' })] })
    expect(buildHouseProjection(stray.input, { seanceRoom: 'hidden', mode: 'live' }).rooms[1].ghost).toBe('not_applicable')

    // Ghost and Door states are the upstream values.
    expect(house.rooms.map((room) => [room.roomId, room.door, room.ghost])).toEqual([
      ['foyer', 'not_applicable', 'not_applicable'],
      ['study', 'waiting', 'waiting'],
      ['drafting-room', 'sealed', 'not_applicable'],
      ['workshop', 'sealed', 'failed'],
      ['attic', 'not_applicable', 'not_applicable'],
    ])
    // Open decisions are exactly Spec 4's selection; the one addition is Spec 5's offered retry.
    const upstream = houseView.needsYou(WORKFLOW).map((item) => item.id)
    expect(house.needsYou.filter((item) => item.kind !== 'failed-run-recovery').map((item) => item.id).sort()).toEqual([...upstream].sort())
    expect(house.needsYou.filter((item) => item.kind === 'failed-run-recovery').map((item) => item.id)).toEqual(['task-1'])
    // Mutation follows the upstream gates and nothing else.
    expect(authority.canDecide).toBe(true)
    for (const room of house.rooms.filter((candidate) => joined.has(candidate.roomId))) {
      expect(room.mutatingActionsEnabled, room.roomId).toBe(joined.get(room.roomId)!.gate.allowed)
    }
  })

  it('never shows a document as valid before the backend validated exactly those bytes', () => {
    const unvalidated = roomGhosts({
      version: 12,
      documents: [document('requirements', { artifact: artifact({ validated: false, findings: [{ code: 'missing_section', location: 'Requirements', message: 'No requirement found.' }] }) }), document('design'), document('tasks')],
    })
    const { joined, input } = composeUpstream({ workflow: WORKFLOW, snapshots: [snapshot('archivist', 'working')], roomGhosts: unvalidated })
    expect(joined.get('study')!.documents[0].validation).not.toBe('valid')
    // A working ghost is shown as working: the house adds no success of its own.
    expect(buildHouseProjection(input, { seanceRoom: 'hidden', mode: 'live' }).rooms[1].ghost).toBe('working')
  })

  it('reaches the same ghosts and workflows from the live fold and the replay fold of one recording', () => {
    const selection = replayTimeline.parseCanonicalLog(readFileSync(DEMO_LOG, 'utf8'))
    const records = selection.records
    expect(records.length).toBeGreaterThan(0)
    const replay = replayTimeline.foldReplay(records)
    const live = replayTimeline.foldLive([...records].reverse())
    expect(live).toEqual(replay)
    expect(replayTimeline.CANONICAL_REPLAY_PORT.fold).toBe(replayTimeline.foldReplay)
    // A replayed workflow is read-only: authority is withheld by the upstream gate.
    for (const workflow of replay.workflows) {
      expect(houseView.deriveAuthority({ projection: workflow, projectionStatus: 'ready', canonical: { loaded: true, catchingUp: false, highestSequence: workflow.version, diagnostic: null } }).block).toBe('read_only')
    }
  })

  it('matches the recorded field and type metadata of each seam', () => {
    const { input, authority, joined } = composeUpstream({ workflow: WORKFLOW, snapshots: SNAPSHOTS, roomGhosts: ROOM_GHOSTS })
    const house = buildHouseProjection(input, { seanceRoom: 'locked', mode: 'live' })
    const study = joined.get('study')!
    const recorded = {
      description:
        'HUI-S0 scrubbed contract: field names and type categories of synthetic values at the upstream seams the House UI composes. No path, credential, or recorded content.',
      seams: {
        'mansion-lifecycle': { module: 'core/mansion-api.ts', MansionDescriptor: shape(input.mansion) },
        'seance-log-and-ghost-state': { module: 'core/ghost-state.ts', GhostSnapshot: shape(SNAPSHOTS[0]) },
        'doors-and-guardrails': {
          modules: ['core/workflow-projection.ts', 'core/house-view.ts', 'core/house-reducer.ts'],
          WorkflowProjection: Object.keys(WORKFLOW).sort(),
          PhaseView: Object.keys(WORKFLOW.phases[0]).sort(),
          Authority: shape(authority),
          NeedsYouItem: shape(houseView.needsYou(WORKFLOW)[0]),
        },
        'room-ghosts': {
          modules: ['core/room-projection.ts', 'core/room-view.ts'],
          RoomProjection: Object.keys(study).sort(),
          RoomGate: shape(study.gate),
          RunView: Object.keys(joined.get('workshop')!.runs[0]).sort(),
        },
        replay: { module: 'core/replay-timeline.ts', ReplayProjection: Object.keys(replayTimeline.foldReplay([])).sort() },
      },
      houseProjection: {
        module: 'core/house-projection.ts',
        HouseProjection: Object.keys(house).sort(),
        RoomPresentation: Object.keys(house.rooms[0]).sort(),
        NeedsYouItem: shape(house.needsYou[0]),
        roomOrder: house.rooms.map((room) => room.roomId),
      },
    }
    const text = `${JSON.stringify(recorded, null, 2)}\n`
    // Scrubbed: nothing that looks like a home path, a credential, or a digest.
    expect(JSON.stringify([recorded.seams, recorded.houseProjection])).not.toMatch(/\/Users\/|\/home\/|~\/|[0-9a-f]{32,}|token|secret|password/i)
    if (process.env.HUI_S0_RECORD === '1') writeFileSync(FIXTURE, text)
    expect(JSON.parse(readFileSync(FIXTURE, 'utf8'))).toEqual(JSON.parse(text))
  })
})
