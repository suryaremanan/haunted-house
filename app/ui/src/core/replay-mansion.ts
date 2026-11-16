// Pure replay model of the Mansion API. The replay stand-in (adapters/sdk-shim)
// answers list, create, and open calls from this model instead of a backend.
// It holds an in-memory registry only: no SDK, React, network, filesystem,
// storage, or clock access, and it never edits the fixture it was built from.
//
// Replies follow the live HTTP contract (design.md, "HTTP API"), so the live
// parsers in mansion-api.ts and the Foyer reducer handle them unchanged.
import {
  MANSION_SCHEMA_VERSION,
  isMansionName,
  normalizeMansionBrief,
  parseMansionListResponse,
  type MansionApiErrorCode,
  type MansionDescriptor,
} from './mansion-api'

/** App-backend paths the Foyer calls. Kept equal to the live adapter's by a test. */
export const REPLAY_MANSIONS_PATH = '/apps/haunted-house/api/mansions'
export const REPLAY_OPEN_MANSION_PATH = '/apps/haunted-house/api/mansions/open'

/** Home-relative display root for mansions created during a replay. Presentation only. */
export const REPLAY_MANSION_ROOT = '~/workspace/haunted-house/mansions'

export type ReplayMansionOperation =
  | { readonly kind: 'list' }
  | { readonly kind: 'create'; readonly body: unknown }
  | { readonly kind: 'open'; readonly body: unknown }

/** What the live backend would answer: an HTTP status and a JSON body. */
export interface ReplayMansionReply {
  readonly status: number
  readonly body: unknown
}

/** The in-memory registry: unique descriptors sorted by name. */
export interface ReplayMansionState {
  readonly mansions: readonly MansionDescriptor[]
}

export interface ReplayMansionStep {
  readonly state: ReplayMansionState
  readonly reply: ReplayMansionReply
}

/** A stateful registry for one replay session. Each instance is independent. */
export interface ReplayMansionModel {
  request: (operation: ReplayMansionOperation) => ReplayMansionReply
  /** The current registry, as a copy. */
  snapshot: () => MansionDescriptor[]
}

const ERROR_STATUS: Record<MansionApiErrorCode, number> = {
  invalid_request: 400,
  invalid_mansion_name: 422,
  unsafe_mansion_root: 500,
  symlink_escape: 409,
  mansion_conflict: 409,
  mansion_missing: 409,
  mansion_not_registered: 404,
  metadata_unavailable: 500,
  filesystem_error: 500,
}

const ERROR_MESSAGE: Record<MansionApiErrorCode, string> = {
  invalid_request: 'Request body must be a JSON object with a string name and, on create only, a string brief.',
  invalid_mansion_name: 'Mansion name must be kebab-case and at most 40 characters.',
  unsafe_mansion_root: 'Mansion storage is not configured safely.',
  symlink_escape: 'The mansion path is not safe to use.',
  mansion_conflict: 'Existing content conflicts with this mansion. Nothing was changed.',
  mansion_missing: 'This mansion is missing from storage.',
  mansion_not_registered: 'This mansion is not registered.',
  metadata_unavailable: 'Mansion records are unavailable.',
  filesystem_error: 'Mansion storage could not be accessed.',
}

function compareNames(left: MansionDescriptor, right: MansionDescriptor): number {
  if (left.name < right.name) return -1
  if (left.name > right.name) return 1
  return 0
}

function copyDescriptor({ name, projectSpec, displayPath, status }: MansionDescriptor): MansionDescriptor {
  return { name, projectSpec, displayPath, status }
}

function errorReply(code: MansionApiErrorCode): ReplayMansionReply {
  return { status: ERROR_STATUS[code], body: { error: { code, message: ERROR_MESSAGE[code] } } }
}

/**
 * The exact request shapes of the live API: open takes `{name}`; create takes
 * `{name}` or `{name, brief}` with a brief the backend's normaliser accepts
 * (design decision 2026-11-16). Anything else is null (`invalid_request`).
 * The replay keeps no brief: it has no mansion folder to write one into.
 */
function requestedName(body: unknown, allowBrief: boolean): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  const keys = Object.keys(record)
  if (!keys.includes('name') || typeof record.name !== 'string') return null
  if (keys.length === 1) return record.name
  if (!allowBrief || keys.length !== 2 || !keys.includes('brief')) return null
  const brief = record.brief
  return typeof brief === 'string' && normalizeMansionBrief(brief).ok ? record.name : null
}

/**
 * Builds the starting registry from a recorded `GET /api/mansions` reply. The
 * fixture goes through the live list parser, so a malformed fixture throws
 * MansionApiParseError instead of producing replies the live build never could.
 * The fixture is copied, never kept or edited.
 */
export function createReplayMansionState(fixture: unknown): ReplayMansionState {
  const { mansions } = parseMansionListResponse(fixture)
  return { mansions: mansions.map(copyDescriptor).sort(compareNames) }
}

/** Applies one operation. Returns the next registry and the reply; the input state is unchanged. */
export function replayMansionStep(
  state: ReplayMansionState,
  operation: ReplayMansionOperation,
): ReplayMansionStep {
  if (operation.kind === 'list') {
    return {
      state,
      reply: {
        status: 200,
        body: { schemaVersion: MANSION_SCHEMA_VERSION, mansions: state.mansions.map(copyDescriptor) },
      },
    }
  }

  const name = requestedName(operation.body, operation.kind === 'create')
  if (name === null) return { state, reply: errorReply('invalid_request') }
  if (!isMansionName(name)) return { state, reply: errorReply('invalid_mansion_name') }
  const existing = state.mansions.find((mansion) => mansion.name === name)

  if (operation.kind === 'open') {
    if (existing === undefined) return { state, reply: errorReply('mansion_not_registered') }
    if (existing.status === 'missing') return { state, reply: errorReply('mansion_missing') }
    if (existing.status === 'conflict') return { state, reply: errorReply('mansion_conflict') }
    return { state, reply: { status: 200, body: { mansion: copyDescriptor(existing) } } }
  }

  // create: mirrors the live planner. A ready project is returned unchanged, a
  // conflicting one is refused, and an absent or missing one is created.
  if (existing?.status === 'ready') {
    return {
      state,
      reply: { status: 200, body: { outcome: 'existing_compatible', mansion: copyDescriptor(existing) } },
    }
  }
  if (existing?.status === 'conflict') return { state, reply: errorReply('mansion_conflict') }

  const created: MansionDescriptor = {
    name,
    projectSpec: name,
    displayPath: `${REPLAY_MANSION_ROOT}/${name}`,
    status: 'ready',
  }
  const mansions = [...state.mansions.filter((mansion) => mansion.name !== name), created].sort(compareNames)
  return {
    state: { mansions },
    reply: { status: 201, body: { outcome: 'created', mansion: copyDescriptor(created) } },
  }
}

/** One replay session's registry, started from `fixture`. */
export function createReplayMansionModel(fixture: unknown): ReplayMansionModel {
  let state = createReplayMansionState(fixture)
  return {
    request(operation) {
      const step = replayMansionStep(state, operation)
      state = step.state
      return step.reply
    },
    snapshot: () => state.mansions.map(copyDescriptor),
  }
}

/**
 * Maps an SDK-style call to a replay operation. Returns null for every method
 * and path outside the three live routes, so the stand-in refuses it.
 */
export function replayMansionOperation(
  method: string,
  path: string,
  body?: unknown,
): ReplayMansionOperation | null {
  if (method === 'GET' && path === REPLAY_MANSIONS_PATH) return { kind: 'list' }
  if (method === 'POST' && path === REPLAY_MANSIONS_PATH) return { kind: 'create', body }
  if (method === 'POST' && path === REPLAY_OPEN_MANSION_PATH) return { kind: 'open', body }
  return null
}
