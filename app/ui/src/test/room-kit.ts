// Builders for Room Ghosts UI tests: one Room Ghosts answer about the synthetic
// "guest book" plan of fixtures/room-ghosts/task-plan-valid.md, and small
// helpers to vary it. Not shipped.
import {
  emptyRoomGhosts,
  type ArtifactState,
  type DocumentPhase,
  type RoomDocument,
  type RoomGhosts,
  type RunState,
  type TaskState,
} from '../core/room-projection'
import { MANSION, SHA_A, SHA_B } from './workflow-arbitraries'

export const SPEC = 'demo'
export const SHA_C = 'c'.repeat(64)

export const REQUIREMENTS_TEXT = [
  '# Requirements Document',
  '',
  '## Introduction',
  '',
  'A guest book that keeps entries in the order they were written.',
  '',
  '## Requirements',
  '',
  '### Requirement 1: Keep entries',
  '',
  '1. WHEN a guest signs, THE Guest_Book SHALL store the entry.',
  '2. THE Guest_Book SHALL keep entries in insertion order.',
  '',
].join('\n')

export function artifact(overrides: Partial<ArtifactState> = {}): ArtifactState {
  return {
    artifactRevision: { revision: 1, sha256: SHA_A, sizeBytes: 1200 },
    validated: true,
    content: REQUIREMENTS_TEXT,
    findings: [],
    ...overrides,
  }
}

export function document(phase: DocumentPhase, overrides: Partial<RoomDocument> = {}): RoomDocument {
  const documentPath = `.kiro/specs/${SPEC}/${phase}.md`
  return { phase, documentPath, writeScope: [documentPath], artifact: null, ...overrides }
}

export function task(taskId: string, overrides: Partial<TaskState> = {}): TaskState {
  return {
    taskId,
    title: `Task ${taskId}`,
    optional: false,
    complete: false,
    requirements: ['1.1'],
    writes: [`src/task-${taskId.replace('.', '-')}.py`],
    wave: 0,
    selected: false,
    outcome: null,
    backpressure: null,
    ...overrides,
  }
}

export function run(overrides: Partial<RunState> = {}): RunState {
  return {
    runId: 'requirements-1',
    runSequence: 0,
    ghostId: 'archivist',
    sessionSlot: 'hh-archivist-requirements-1',
    phase: 'requirements',
    taskId: null,
    attempt: 1,
    canCancel: false,
    cancelRequested: false,
    canRetry: false,
    sessionLink: null,
    summary: null,
    reasonCode: null,
    claimPaths: [],
    ...overrides,
  }
}

/** The five leaf tasks of the guest book plan: one complete, two in wave 0, two in wave 1. */
export const GUEST_BOOK_TASKS: readonly TaskState[] = [
  task('1.1', { title: 'Create the entry model', complete: true, requirements: ['1.1', '1.2'], writes: ['src/guestbook/model.py'], wave: null }),
  task('1.2', {
    title: 'Implement the entry store',
    requirements: ['1.3', '2.1', '2.2', '2.3'],
    writes: ['src/guestbook/store.py'],
    wave: 0,
  }),
  task('1.3', {
    title: 'Write the property test for store ordering',
    optional: true,
    requirements: ['1.3'],
    writes: ['tests/test_store_order.py'],
    wave: 1,
  }),
  task('2.1', {
    title: 'Implement the page renderer',
    requirements: ['3.1', '3.2'],
    writes: ['src/guestbook/render.py', 'src/guestbook/templates/*.html'],
    wave: 0,
  }),
  task('2.2', { title: 'Write renderer unit tests', optional: true, requirements: ['3.1', '3.2'], writes: ['tests/render/**'], wave: 1 }),
]

export const GUEST_BOOK_WAVES: readonly (readonly string[])[] = [
  ['1.2', '2.1'],
  ['1.3', '2.2'],
]

/** A Room Ghosts answer for the test Mansion. Everything not given is the empty answer. */
export function roomGhosts(overrides: Partial<RoomGhosts> = {}): RoomGhosts {
  return emptyRoomGhosts(MANSION, SPEC, { version: 10, ...overrides })
}

/** Requirements and design written and valid, the task plan approved, two Tinkers at work. */
export function workshopAtWork(version = 10): RoomGhosts {
  return roomGhosts({
    version,
    documents: [
      document('requirements', { artifact: artifact() }),
      document('design', { artifact: artifact({ artifactRevision: { revision: 2, sha256: SHA_B, sizeBytes: 4871 }, content: '# Design Document\n\n## Overview\n\nOne module, one store.\n' }) }),
      document('tasks', { artifact: artifact({ artifactRevision: { revision: 1, sha256: SHA_C, sizeBytes: 912 }, content: '# Implementation Plan: Guest Book\n' }) }),
    ],
    taskPlan: {
      tasks: GUEST_BOOK_TASKS.map((item) => {
        if (item.taskId === '1.2') {
          return { ...item, selected: true, outcome: { status: 'active', attempt: 1, runId: 'task-1-2-a1', reasonCode: null } }
        }
        if (item.taskId === '2.1') {
          return {
            ...item,
            selected: true,
            outcome: { status: 'queued', attempt: 0, runId: null, reasonCode: null },
            backpressure: { dispatchFailures: 2, nextDelaySeconds: 4, lastReason: 'crew_capacity' },
          }
        }
        return item.taskId === '1.3' ? { ...item, selected: true, outcome: { status: 'queued', attempt: 0, runId: null, reasonCode: null } } : item
      }),
      waves: GUEST_BOOK_WAVES,
      findings: [],
    },
    runs: [
      run({
        runId: 'task-1-2-a1',
        ghostId: 'tinker-1',
        sessionSlot: 'hh-tinker-1-task-1-2-a1',
        phase: 'implementation',
        taskId: '1.2',
        canCancel: true,
        claimPaths: ['src/guestbook/store.py'],
      }),
    ],
  })
}

// ---------------------------------------------------------------------------
// Joined projections for component tests.

import type { GhostSnapshot, GhostState } from '../core/ghost-state'
import { houseRooms, type Authority, type RoomId } from '../core/house-view'
import { joinRoomProjection, type RoomGhostsStatus, type RoomProjection } from '../core/room-view'
import type { WorkflowProjection } from '../core/workflow-projection'
import { decision, doorProposal, projection } from './workflow-arbitraries'

export const CAN_DECIDE: Authority = { canDecide: true, block: null, text: null }
export const CANNOT_DECIDE: Authority = { canDecide: false, block: 'stale', text: 'Something changed in the house. Refreshing before you decide.' }

export function snapshot(ghostId: string, state: GhostState, runId: string | null = `${ghostId}-run`): GhostSnapshot {
  return {
    mansion_id: MANSION,
    ghost_id: ghostId,
    run_id: runId,
    run_sequence: 0,
    state,
    pending_approvals: [],
    open_tools: [],
    latest_event_id: null,
    latest_sequence: 1,
    reason: null,
  }
}

export interface JoinOptions {
  workflow?: WorkflowProjection | null
  answer?: RoomGhosts | null
  status?: RoomGhostsStatus
  authority?: Authority
  snapshots?: readonly GhostSnapshot[]
  inFlight?: string | null
}

/** The joined projection of one room, with every source defaulted to a quiet, agreeing house. */
export function joinRoom(roomId: RoomId, options: JoinOptions = {}): RoomProjection {
  const workflow = options.workflow === undefined ? projection() : options.workflow
  const snapshots = new Map((options.snapshots ?? []).map((item) => [item.ghost_id, item]))
  const room = houseRooms(workflow, snapshots.values()).find((item) => item.id === roomId)!
  const answer = options.answer === undefined ? roomGhosts() : options.answer
  return joinRoomProjection({
    room,
    specName: SPEC,
    projection: workflow,
    snapshots,
    roomGhosts: answer,
    roomGhostsStatus: options.status ?? (answer === null ? 'unavailable' : 'ready'),
    authority: options.authority ?? CAN_DECIDE,
    inFlight: options.inFlight ?? null,
  })
}

/** Requirements written and waiting at their Door (version 10). */
export const REQUIREMENTS_WAITING: WorkflowProjection = projection({
  waitingCount: 1,
  phaseOverrides: {
    requirements: {
      status: 'waiting',
      ghostIds: ['archivist'],
      door: { status: 'waiting', proposal: doorProposal('requirements', { artifactRevision: { revision: 1, sha256: SHA_A, sizeBytes: 1200 } }) },
    },
  },
})

/** The Room Ghosts answer that agrees with `REQUIREMENTS_WAITING`. */
export function requirementsWritten(overrides: Partial<RoomGhosts> = {}): RoomGhosts {
  return roomGhosts({
    documents: [document('requirements', { artifact: artifact() }), document('design'), document('tasks')],
    runs: [run({ summary: 'Wrote 2 EARS criteria and a glossary.' })],
    ...overrides,
  })
}

/** Requirements, design and tasks approved; implementation ready to start (version 10). */
export const TASKS_APPROVED: WorkflowProjection = projection({
  phaseOverrides: {
    requirements: { status: 'approved', ghostIds: ['archivist'], door: { status: 'open', proposal: doorProposal('requirements', { status: 'approved', decision: decision('approved', 4) }) } },
    design: { status: 'approved', ghostIds: ['draughtsman'], door: { status: 'open', proposal: doorProposal('design', { status: 'approved', artifactRevision: { revision: 2, sha256: SHA_B, sizeBytes: 4871 }, decision: decision('approved', 6) }) } },
    tasks: { status: 'approved', ghostIds: ['foreman'], door: { status: 'open', proposal: doorProposal('tasks', { status: 'approved', artifactRevision: { revision: 1, sha256: SHA_C, sizeBytes: 912 }, decision: decision('approved', 9) }) } },
    implementation: { status: 'ready' },
  },
})
