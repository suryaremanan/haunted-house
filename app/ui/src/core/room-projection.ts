// Strict parsing of the Room Ghosts read route (Spec 5 design "Backend API
// extensions" and "Joined room projection"; Requirements 10.4, 10.6, 11.1).
// The body of `GET /api/mansions/{mansion}/specs/{spec}/room-ghosts` is
// untrusted until it passes this parser. A value that does not match exactly
// is refused whole, so a malformed answer can never enable a room control.
//
// The route carries only what Room Ghosts owns: the room documents with their
// validation findings, the task plan with claims and outcomes, the runs with
// their recovery state, and the stretch review. Ghost state stays with Spec 2
// and phase, Door and approval state with Spec 4; `room-view.ts` joins them.
// This file folds nothing and holds no state. No SDK, React, network, or clock.

import { MANSION_ID_PATTERN, MAX_MANSION_ID_LENGTH, type JsonValue } from './seance-event'
import { INTEGRITY_STATES, PHASES, type ArtifactRevision, type Integrity, type Phase } from './workflow-projection'

export const ROOM_GHOSTS_SCHEMA_VERSION = 1 as const

/** The phases that produce one Spec_Document each, in workflow order. */
export const DOCUMENT_PHASES = ['requirements', 'design', 'tasks'] as const
export type DocumentPhase = (typeof DOCUMENT_PHASES)[number]

export const TASK_OUTCOME_STATUSES = ['queued', 'active', 'complete', 'failed', 'cancelled', 'blocked', 'skipped'] as const
export type TaskOutcomeStatus = (typeof TASK_OUTCOME_STATUSES)[number]

export const BACKPRESSURE_REASONS = ['crew_capacity', 'local_capacity', 'claim_busy'] as const
export type BackpressureReason = (typeof BACKPRESSURE_REASONS)[number]

export const REVIEW_STATUSES = ['reviewing', 'pass', 'changes_requested', 'blocked'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export const REPAIR_STATUSES = ['proposed', 'approved', 'rejected'] as const
export type RepairStatus = (typeof REPAIR_STATUSES)[number]

export const MAX_TINKERS = 3
export const MAX_ATTEMPTS = 3
export const MAX_REVIEW_CYCLES = 3
export const MAX_CONTENT_CHARACTERS = 512 * 1024
export const MAX_FINDINGS = 50
export const MAX_TASKS = 200
export const MAX_RUNS = 64
export const MAX_PATHS = 32
export const MAX_REQUIREMENT_REFS = 64
export const MAX_SUMMARY_CHARACTERS = 1000
export const MAX_TITLE_CHARACTERS = 200
export const MAX_PATH_CHARACTERS = 1024
export const MAX_ID_CHARACTERS = 160
export const MAX_REVIEW_FINDINGS = 50

/** One deterministic validation result: stable code, safe location, bounded message. */
export interface FindingView {
  readonly code: string
  readonly location: string
  readonly message: string
}

/** The current bytes of one room document, as the backend validated them. */
export interface ArtifactState {
  readonly artifactRevision: ArtifactRevision
  /** True when the deterministic validator accepted exactly this revision. */
  readonly validated: boolean
  /** The document text, or null when the backend withheld it (too large, unreadable, a recording). */
  readonly content: string | null
  readonly findings: readonly FindingView[]
}

export interface RoomDocument {
  readonly phase: DocumentPhase
  readonly documentPath: string
  /** The Mansion-relative paths this room's ghost may write. */
  readonly writeScope: readonly string[]
  /** Null until the ghost has written the document. */
  readonly artifact: ArtifactState | null
}

export interface TaskOutcome {
  readonly status: TaskOutcomeStatus
  readonly attempt: number
  readonly runId: string | null
  readonly reasonCode: string | null
}

export interface Backpressure {
  readonly dispatchFailures: number
  readonly nextDelaySeconds: number
  readonly lastReason: BackpressureReason
}

export interface TaskState {
  readonly taskId: string
  readonly title: string
  readonly optional: boolean
  /** The checkbox in tasks.md. */
  readonly complete: boolean
  readonly requirements: readonly string[]
  /** The Path_Claim: what this task may write. */
  readonly writes: readonly string[]
  /** The wave of the Task Dependency Graph, or null for a task no wave lists (a complete one). */
  readonly wave: number | null
  /** True when the Operator selected this task for the Workshop. */
  readonly selected: boolean
  readonly outcome: TaskOutcome | null
  readonly backpressure: Backpressure | null
}

export interface TaskPlanState {
  readonly tasks: readonly TaskState[]
  readonly waves: readonly (readonly string[])[]
  readonly findings: readonly FindingView[]
}

export interface RunState {
  readonly runId: string
  readonly runSequence: number
  readonly ghostId: string
  readonly sessionSlot: string
  readonly phase: Phase
  /** The one Selected_Task of a Tinker run. Null for a phase run. */
  readonly taskId: string | null
  readonly attempt: number
  /** The backend offers cancellation for this run right now. */
  readonly canCancel: boolean
  /** A cancellation was asked for and is not confirmed yet. */
  readonly cancelRequested: boolean
  /** The backend offers an explicit fresh attempt for this run. */
  readonly canRetry: boolean
  /**
   * The slot key of the run's existing Crew session, or null while opening an
   * existing session from the app is not a verified contract (RG-S4).
   */
  readonly sessionLink: string | null
  /** The bounded summary of the run's Ghost_Result, once it has one. */
  readonly summary: string | null
  readonly reasonCode: string | null
  /** The active task claim of a Tinker run: what this run may write. */
  readonly claimPaths: readonly string[]
}

export interface ReviewFinding {
  readonly findingId: string
  readonly requirementIds: readonly string[]
  readonly paths: readonly string[]
  readonly summary: string
}

export interface RepairProposal {
  readonly taskId: string
  readonly findingId: string
  readonly title: string
  readonly writes: readonly string[]
  readonly status: RepairStatus
}

/** The stretch Séance Room review. Absent (null) whenever the Séance Room is off. */
export interface ReviewState {
  readonly cycle: number
  readonly status: ReviewStatus
  /** The reviewing ghost. */
  readonly ghostId: string
  /** The slot key of the Medium's existing Crew session, or null: same rule as a run's link. */
  readonly sessionLink: string | null
  readonly findings: readonly ReviewFinding[]
  readonly repairs: readonly RepairProposal[]
}

export interface RoomGhosts {
  readonly mansionId: string
  readonly specName: string
  /** The highest canonical Sequence this answer folded: the same number as the workflow Projection_Version. */
  readonly version: number
  readonly integrity: Integrity
  /** True only for an answer the replay stand-in built from a recording. */
  readonly readOnly: boolean
  /** The stretch Séance Room. Off unless the backend says otherwise. */
  readonly seanceEnabled: boolean
  /** Exactly the three room documents, in workflow order. */
  readonly documents: readonly [RoomDocument, RoomDocument, RoomDocument]
  /** The parsed task plan, or null until a valid tasks.md exists. */
  readonly taskPlan: TaskPlanState | null
  readonly runs: readonly RunState[]
  readonly review: ReviewState | null
}

export type RoomGhostsParseResult =
  | { readonly ok: true; readonly roomGhosts: RoomGhosts }
  | { readonly ok: false; readonly path: string }

class Refused extends Error {
  constructor(readonly path: string) {
    super('refused')
  }
}

function refuse(path: string): never {
  throw new Refused(path)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A record with exactly these keys; `optional` keys may be absent. */
function exact(value: unknown, path: string, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!isRecord(value)) refuse(path)
  for (const key of Object.keys(value)) {
    if (!keys.includes(key) && !optional.includes(key)) refuse(path)
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) refuse(`${path}.${key}`)
  }
  return value
}

function oneOf<T extends string>(value: unknown, choices: readonly T[], path: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) refuse(path)
  return value as T
}

function count(value: unknown, path: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) refuse(path)
  return value
}

function flag(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') refuse(path)
  return value
}

function list(value: unknown, path: string, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) refuse(path)
  return value
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/
/** Control characters other than tab and line feed, which prose may contain. */
const CONTROL_IN_PROSE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/

/** Bounded, non-empty, single-line text with no control characters. */
function text(value: unknown, path: string, limit = MAX_ID_CHARACTERS): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > limit || CONTROL.test(value)) refuse(path)
  return value
}

function nullable<T>(value: unknown, parse: (value: unknown) => T): T | null {
  return value === null ? null : parse(value)
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/

function identifier(value: unknown, path: string): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) refuse(path)
  return value
}

const CODE = /^[a-z][a-z0-9_]{0,63}$/

function code(value: unknown, path: string): string {
  if (typeof value !== 'string' || !CODE.test(value)) refuse(path)
  return value
}

const DECIMAL_ID = /^[1-9][0-9]{0,3}\.[1-9][0-9]{0,3}$/

function decimalId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !DECIMAL_ID.test(value)) refuse(path)
  return value
}

/** The slot key of an app-owned session, in the charset that is its own key (RG-S4 guidance). */
const SLOT_KEY = /^[A-Za-z0-9-]{1,160}$/

/** A Mansion-relative path or claim pattern: slash-separated, no dot segments, never absolute. */
function projectPath(value: unknown, path: string): string {
  const raw = text(value, path, MAX_PATH_CHARACTERS)
  if (raw.startsWith('/') || raw.includes('\\') || raw.startsWith('~')) refuse(path)
  for (const part of raw.split('/')) {
    if (part === '' || part === '.' || part === '..') refuse(path)
  }
  return raw
}

function unique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) refuse(path)
}

function pathList(value: unknown, path: string): string[] {
  const paths = list(value, path, MAX_PATHS).map((item, index) => projectPath(item, `${path}[${index}]`))
  unique(paths, path)
  return paths
}

function prose(value: unknown, path: string, limit: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > limit || CONTROL_IN_PROSE.test(value)) refuse(path)
  return value
}

function parseRevision(value: unknown, path: string): ArtifactRevision {
  const record = exact(value, path, ['revision', 'sha256', 'size_bytes'])
  if (typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(record.sha256)) refuse(`${path}.sha256`)
  return {
    revision: count(record.revision, `${path}.revision`, 1),
    sha256: record.sha256,
    sizeBytes: count(record.size_bytes, `${path}.size_bytes`),
  }
}

function parseFindings(value: unknown, path: string): FindingView[] {
  return list(value, path, MAX_FINDINGS).map((item, index) => {
    const at = `${path}[${index}]`
    const record = exact(item, at, ['code', 'location', 'message'])
    return {
      code: code(record.code, `${at}.code`),
      location: text(record.location, `${at}.location`, 96),
      message: text(record.message, `${at}.message`, 200),
    }
  })
}

function parseArtifact(value: unknown, path: string): ArtifactState {
  const record = exact(value, path, ['artifact_revision', 'validated', 'content', 'findings'])
  const content = record.content
  if (content !== null && (typeof content !== 'string' || content.length > MAX_CONTENT_CHARACTERS)) refuse(`${path}.content`)
  return {
    artifactRevision: parseRevision(record.artifact_revision, `${path}.artifact_revision`),
    validated: flag(record.validated, `${path}.validated`),
    content,
    findings: parseFindings(record.findings, `${path}.findings`),
  }
}

function parseDocument(value: unknown, path: string, phase: DocumentPhase, specName: string): RoomDocument {
  const record = exact(value, path, ['phase', 'document_path', 'write_scope', 'artifact'])
  if (record.phase !== phase) refuse(`${path}.phase`)
  const documentPath = projectPath(record.document_path, `${path}.document_path`)
  // The document of a phase has one fixed place; any other path is not this room's document.
  if (documentPath !== `.kiro/specs/${specName}/${phase}.md`) refuse(`${path}.document_path`)
  return {
    phase,
    documentPath,
    writeScope: pathList(record.write_scope, `${path}.write_scope`),
    artifact: nullable(record.artifact, (item) => parseArtifact(item, `${path}.artifact`)),
  }
}

function parseOutcome(value: unknown, path: string): TaskOutcome {
  const record = exact(value, path, ['status', 'attempt', 'run_id', 'reason_code'])
  return {
    status: oneOf(record.status, TASK_OUTCOME_STATUSES, `${path}.status`),
    attempt: count(record.attempt, `${path}.attempt`, 0, MAX_ATTEMPTS),
    runId: nullable(record.run_id, (item) => identifier(item, `${path}.run_id`)),
    reasonCode: nullable(record.reason_code, (item) => code(item, `${path}.reason_code`)),
  }
}

function parseBackpressure(value: unknown, path: string): Backpressure {
  const record = exact(value, path, ['dispatch_failures', 'next_delay_seconds', 'last_reason'])
  return {
    dispatchFailures: count(record.dispatch_failures, `${path}.dispatch_failures`, 0, 1_000_000),
    // Delays are 1, 2, 4, 8 and 15 seconds, then stay at 15.
    nextDelaySeconds: count(record.next_delay_seconds, `${path}.next_delay_seconds`, 0, 15),
    lastReason: oneOf(record.last_reason, BACKPRESSURE_REASONS, `${path}.last_reason`),
  }
}

function parseTask(value: unknown, path: string): TaskState {
  const record = exact(value, path, [
    'task_id',
    'title',
    'optional',
    'complete',
    'requirements',
    'writes',
    'wave',
    'selected',
    'outcome',
    'backpressure',
  ])
  const requirements = list(record.requirements, `${path}.requirements`, MAX_REQUIREMENT_REFS).map((item, index) =>
    decimalId(item, `${path}.requirements[${index}]`),
  )
  unique(requirements, `${path}.requirements`)
  const complete = flag(record.complete, `${path}.complete`)
  const outcome = nullable(record.outcome, (item) => parseOutcome(item, `${path}.outcome`))
  // A task is complete only once its checkbox is written: the two must agree.
  if (outcome?.status === 'complete' && !complete) refuse(`${path}.outcome`)
  if (complete && outcome !== null && outcome.status !== 'complete') refuse(`${path}.outcome`)
  return {
    taskId: decimalId(record.task_id, `${path}.task_id`),
    title: text(record.title, `${path}.title`, MAX_TITLE_CHARACTERS),
    optional: flag(record.optional, `${path}.optional`),
    complete,
    requirements,
    writes: pathList(record.writes, `${path}.writes`),
    wave: nullable(record.wave, (item) => count(item, `${path}.wave`, 0, MAX_TASKS)),
    selected: flag(record.selected, `${path}.selected`),
    outcome,
    backpressure: nullable(record.backpressure, (item) => parseBackpressure(item, `${path}.backpressure`)),
  }
}

function parseTaskPlan(value: unknown, path: string): TaskPlanState {
  const record = exact(value, path, ['tasks', 'waves', 'findings'])
  const tasks = list(record.tasks, `${path}.tasks`, MAX_TASKS).map((item, index) => parseTask(item, `${path}.tasks[${index}]`))
  unique(tasks.map((task) => task.taskId), `${path}.tasks`)
  const known = new Map(tasks.map((task) => [task.taskId, task]))
  const waves = list(record.waves, `${path}.waves`, MAX_TASKS).map((wave, waveIndex) =>
    list(wave, `${path}.waves[${waveIndex}]`, MAX_TASKS).map((item, index) => {
      const at = `${path}.waves[${waveIndex}][${index}]`
      const taskId = decimalId(item, at)
      // A wave may only name a task of this plan, and that task must say the same wave.
      if (known.get(taskId)?.wave !== waveIndex) refuse(at)
      return taskId
    }),
  )
  unique(waves.flat(), `${path}.waves`)
  const listed = new Set(waves.flat())
  for (const [index, task] of tasks.entries()) {
    if (task.wave !== null && !listed.has(task.taskId)) refuse(`${path}.tasks[${index}].wave`)
  }
  // The Workshop never runs more than three Tinkers; an answer that says otherwise is not trusted.
  if (tasks.filter((task) => task.outcome?.status === 'active').length > MAX_TINKERS) refuse(`${path}.tasks`)
  return { tasks, waves, findings: parseFindings(record.findings, `${path}.findings`) }
}

function parseRun(value: unknown, path: string): RunState {
  const record = exact(value, path, [
    'run_id',
    'run_sequence',
    'ghost_id',
    'session_slot',
    'phase',
    'task_id',
    'attempt',
    'can_cancel',
    'cancel_requested',
    'can_retry',
    'session_link',
    'summary',
    'reason_code',
    'claim_paths',
  ])
  const phase = oneOf(record.phase, PHASES, `${path}.phase`)
  const taskId = nullable(record.task_id, (item) => decimalId(item, `${path}.task_id`))
  // Only a Tinker run carries a task, and it carries exactly one.
  if ((taskId !== null) !== (phase === 'implementation')) refuse(`${path}.task_id`)
  const attempt = count(record.attempt, `${path}.attempt`, 1, MAX_ATTEMPTS)
  const canCancel = flag(record.can_cancel, `${path}.can_cancel`)
  const canRetry = flag(record.can_retry, `${path}.can_retry`)
  // A run is cancelled while it is active and retried after it ended: never both.
  if (canCancel && canRetry) refuse(`${path}.can_retry`)
  // There is no fourth attempt.
  if (canRetry && attempt >= MAX_ATTEMPTS) refuse(`${path}.can_retry`)
  const sessionSlot = text(record.session_slot, `${path}.session_slot`)
  const sessionLink = record.session_link
  if (sessionLink !== null && (typeof sessionLink !== 'string' || !SLOT_KEY.test(sessionLink))) refuse(`${path}.session_link`)
  const claimPaths = pathList(record.claim_paths, `${path}.claim_paths`)
  if (claimPaths.length > 0 && taskId === null) refuse(`${path}.claim_paths`)
  return {
    runId: identifier(record.run_id, `${path}.run_id`),
    runSequence: count(record.run_sequence, `${path}.run_sequence`, 0, 1_000_000),
    ghostId: text(record.ghost_id, `${path}.ghost_id`),
    sessionSlot,
    phase,
    taskId,
    attempt,
    canCancel,
    cancelRequested: flag(record.cancel_requested, `${path}.cancel_requested`),
    canRetry,
    sessionLink,
    summary: nullable(record.summary, (item) => prose(item, `${path}.summary`, MAX_SUMMARY_CHARACTERS)),
    reasonCode: nullable(record.reason_code, (item) => code(item, `${path}.reason_code`)),
    claimPaths,
  }
}

function parseReview(value: unknown, path: string): ReviewState {
  const record = exact(value, path, ['cycle', 'status', 'ghost_id', 'session_link', 'findings', 'repairs'])
  const sessionLink = record.session_link
  if (sessionLink !== null && (typeof sessionLink !== 'string' || !SLOT_KEY.test(sessionLink))) refuse(`${path}.session_link`)
  const findings = list(record.findings, `${path}.findings`, MAX_REVIEW_FINDINGS).map((item, index) => {
    const at = `${path}.findings[${index}]`
    const finding = exact(item, at, ['finding_id', 'requirement_ids', 'paths', 'summary'])
    const requirementIds = list(finding.requirement_ids, `${at}.requirement_ids`, MAX_REQUIREMENT_REFS).map((ref, refIndex) =>
      decimalId(ref, `${at}.requirement_ids[${refIndex}]`),
    )
    unique(requirementIds, `${at}.requirement_ids`)
    return {
      findingId: identifier(finding.finding_id, `${at}.finding_id`),
      requirementIds,
      paths: pathList(finding.paths, `${at}.paths`),
      summary: prose(finding.summary, `${at}.summary`, MAX_SUMMARY_CHARACTERS),
    }
  })
  unique(findings.map((finding) => finding.findingId), `${path}.findings`)
  const repairs = list(record.repairs, `${path}.repairs`, MAX_REVIEW_FINDINGS).map((item, index) => {
    const at = `${path}.repairs[${index}]`
    const repair = exact(item, at, ['task_id', 'finding_id', 'title', 'writes', 'status'])
    const findingId = identifier(repair.finding_id, `${at}.finding_id`)
    // Each repair answers one finding of this review.
    if (!findings.some((finding) => finding.findingId === findingId)) refuse(`${at}.finding_id`)
    return {
      taskId: decimalId(repair.task_id, `${at}.task_id`),
      findingId,
      title: text(repair.title, `${at}.title`, MAX_TITLE_CHARACTERS),
      writes: pathList(repair.writes, `${at}.writes`),
      status: oneOf(repair.status, REPAIR_STATUSES, `${at}.status`),
    }
  })
  // One repair proposal per finding, at most.
  unique(repairs.map((repair) => repair.findingId), `${path}.repairs`)
  unique(repairs.map((repair) => repair.taskId), `${path}.repairs`)
  const status = oneOf(record.status, REVIEW_STATUSES, `${path}.status`)
  // A pass has nothing to repair.
  if (status === 'pass' && (findings.length > 0 || repairs.length > 0)) refuse(`${path}.findings`)
  return {
    cycle: count(record.cycle, `${path}.cycle`, 1, MAX_REVIEW_CYCLES),
    status,
    ghostId: text(record.ghost_id, `${path}.ghost_id`),
    sessionLink,
    findings,
    repairs,
  }
}

const SPEC_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Validates one Room Ghosts answer. `expectedMansionId` and `expectedSpecName`,
 * when given, must be what the request named: an answer about another Mansion
 * or spec is refused.
 */
export function parseRoomGhosts(value: unknown, expectedMansionId?: string, expectedSpecName?: string): RoomGhostsParseResult {
  try {
    const record = exact(
      value,
      '$',
      ['schema_version', 'mansion_id', 'spec_name', 'version', 'integrity', 'seance_enabled', 'documents', 'task_plan', 'runs', 'review'],
      ['read_only'],
    )
    if (record.schema_version !== ROOM_GHOSTS_SCHEMA_VERSION) refuse('$.schema_version')
    if (record.read_only !== undefined && typeof record.read_only !== 'boolean') refuse('$.read_only')
    const mansion = record.mansion_id
    if (typeof mansion !== 'string' || mansion.length > MAX_MANSION_ID_LENGTH || !MANSION_ID_PATTERN.test(mansion)) refuse('$.mansion_id')
    if (expectedMansionId !== undefined && mansion !== expectedMansionId) refuse('$.mansion_id')
    const specName = record.spec_name
    if (typeof specName !== 'string' || specName.length > MAX_MANSION_ID_LENGTH || !SPEC_NAME.test(specName)) refuse('$.spec_name')
    if (expectedSpecName !== undefined && specName !== expectedSpecName) refuse('$.spec_name')

    if (!Array.isArray(record.documents) || record.documents.length !== DOCUMENT_PHASES.length) refuse('$.documents')
    const documents = DOCUMENT_PHASES.map((phase, index) =>
      parseDocument((record.documents as unknown[])[index], `$.documents[${index}]`, phase, specName),
    )
    const runs = list(record.runs, '$.runs', MAX_RUNS).map((item, index) => parseRun(item, `$.runs[${index}]`))
    unique(runs.map((run) => run.runId), '$.runs')
    const seanceEnabled = flag(record.seance_enabled, '$.seance_enabled')
    const review = nullable(record.review, (item) => parseReview(item, '$.review'))
    // The stretch review exists only where the Séance Room is on.
    if (review !== null && !seanceEnabled) refuse('$.review')

    return {
      ok: true,
      roomGhosts: {
        mansionId: mansion,
        specName,
        version: count(record.version, '$.version'),
        integrity: oneOf(record.integrity, INTEGRITY_STATES, '$.integrity'),
        readOnly: record.read_only === true,
        seanceEnabled,
        documents: documents as unknown as RoomGhosts['documents'],
        taskPlan: nullable(record.task_plan, (item) => parseTaskPlan(item, '$.task_plan')),
        runs,
        review,
      },
    }
  } catch (error) {
    if (error instanceof Refused) return { ok: false, path: error.path }
    throw error
  }
}

/** The answer before any ghost wrote anything: three unwritten documents and nothing else. */
export function emptyRoomGhosts(mansionId: string, specName: string, overrides: Partial<RoomGhosts> = {}): RoomGhosts {
  const document = (phase: DocumentPhase): RoomDocument => {
    const documentPath = `.kiro/specs/${specName}/${phase}.md`
    return { phase, documentPath, writeScope: [documentPath], artifact: null }
  }
  return {
    mansionId,
    specName,
    version: 0,
    integrity: 'valid',
    readOnly: false,
    seanceEnabled: false,
    documents: [document('requirements'), document('design'), document('tasks')],
    taskPlan: null,
    runs: [],
    review: null,
    ...overrides,
  }
}

function findingsToJson(findings: readonly FindingView[]): JsonValue {
  return findings.map((finding) => ({ code: finding.code, location: finding.location, message: finding.message }))
}

/** The wire form `parseRoomGhosts` accepts. Used by the replay stand-in and by tests. */
export function roomGhostsToJson(value: RoomGhosts): { readonly [key: string]: JsonValue } {
  return {
    schema_version: ROOM_GHOSTS_SCHEMA_VERSION,
    mansion_id: value.mansionId,
    spec_name: value.specName,
    version: value.version,
    integrity: value.integrity,
    seance_enabled: value.seanceEnabled,
    documents: value.documents.map((document) => ({
      phase: document.phase,
      document_path: document.documentPath,
      write_scope: [...document.writeScope],
      artifact:
        document.artifact === null
          ? null
          : {
              artifact_revision: {
                revision: document.artifact.artifactRevision.revision,
                sha256: document.artifact.artifactRevision.sha256,
                size_bytes: document.artifact.artifactRevision.sizeBytes,
              },
              validated: document.artifact.validated,
              content: document.artifact.content,
              findings: findingsToJson(document.artifact.findings),
            },
    })),
    task_plan:
      value.taskPlan === null
        ? null
        : {
            tasks: value.taskPlan.tasks.map((task) => ({
              task_id: task.taskId,
              title: task.title,
              optional: task.optional,
              complete: task.complete,
              requirements: [...task.requirements],
              writes: [...task.writes],
              wave: task.wave,
              selected: task.selected,
              outcome:
                task.outcome === null
                  ? null
                  : {
                      status: task.outcome.status,
                      attempt: task.outcome.attempt,
                      run_id: task.outcome.runId,
                      reason_code: task.outcome.reasonCode,
                    },
              backpressure:
                task.backpressure === null
                  ? null
                  : {
                      dispatch_failures: task.backpressure.dispatchFailures,
                      next_delay_seconds: task.backpressure.nextDelaySeconds,
                      last_reason: task.backpressure.lastReason,
                    },
            })),
            waves: value.taskPlan.waves.map((wave) => [...wave]),
            findings: findingsToJson(value.taskPlan.findings),
          },
    runs: value.runs.map((run) => ({
      run_id: run.runId,
      run_sequence: run.runSequence,
      ghost_id: run.ghostId,
      session_slot: run.sessionSlot,
      phase: run.phase,
      task_id: run.taskId,
      attempt: run.attempt,
      can_cancel: run.canCancel,
      cancel_requested: run.cancelRequested,
      can_retry: run.canRetry,
      session_link: run.sessionLink,
      summary: run.summary,
      reason_code: run.reasonCode,
      claim_paths: [...run.claimPaths],
    })),
    review:
      value.review === null
        ? null
        : {
            cycle: value.review.cycle,
            status: value.review.status,
            ghost_id: value.review.ghostId,
            session_link: value.review.sessionLink,
            findings: value.review.findings.map((finding) => ({
              finding_id: finding.findingId,
              requirement_ids: [...finding.requirementIds],
              paths: [...finding.paths],
              summary: finding.summary,
            })),
            repairs: value.review.repairs.map((repair) => ({
              task_id: repair.taskId,
              finding_id: repair.findingId,
              title: repair.title,
              writes: [...repair.writes],
              status: repair.status,
            })),
          },
    ...(value.readOnly ? { read_only: true } : {}),
  }
}
