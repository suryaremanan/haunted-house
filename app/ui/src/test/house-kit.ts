// Shared helpers for house DOM tests: canonical ghost facts and a small
// in-memory backend that answers the séance and workflow routes.
import { appEventToJson, type AppEvent, type AppEventCandidate, type EventType, type JsonValue } from '../core/seance-event'
import { workflowProjectionToJson, type WorkflowProjection } from '../core/workflow-projection'
import { makeEvent } from './seance-arbitraries'
import { MANSION } from './workflow-arbitraries'

export const BASE = `/apps/haunted-house/api/mansions/${MANSION}`

/** One canonical record of a ghost: a house run fact or a Crew fact the backend normalized. */
export function ghostEvent(
  sequence: number,
  ghost: string,
  eventType: EventType,
  payload: JsonValue,
  origin: 'house' | 'crew' = 'house',
): AppEvent {
  const candidate: AppEventCandidate = {
    schema_version: 1,
    event_type: eventType,
    scope: { mansion_id: MANSION, ghost_id: ghost, session_slot: `hh-${ghost}`, run_id: `${ghost}-run`, run_sequence: 0 },
    source: {
      origin,
      source_type: origin === 'crew' ? 'crew_fact' : eventType,
      identity_parts: [`${eventType}-${sequence}`],
      revision: eventType === 'approval_decided' ? 2 : eventType === 'approval_requested' ? 1 : 0,
      generation: '',
      source_sequence: 0,
    },
    caused_by: [],
    occurred_at_ms: null,
    payload,
  }
  return makeEvent(candidate, sequence)
}

export const wire = (projection: WorkflowProjection): unknown => JSON.parse(JSON.stringify(workflowProjectionToJson(projection)))

export function httpError(status: number, body: unknown = {}): Error {
  return Object.assign(new Error(`API ${status}`), { status, body: JSON.stringify(body) })
}

export interface PostCall {
  readonly path: string
  readonly body: unknown
}

/** A backend double. Tests change `workflow` and `log` and answer workflow POSTs through `onPost`. */
export class FakeHouseBackend {
  workflow: WorkflowProjection | unknown
  log: AppEvent[] = []
  /** Workflow POSTs seen, in order. Séance ingest calls are kept apart. */
  readonly posts: PostCall[] = []
  readonly ingests: PostCall[] = []
  workflowReads = 0
  onPost: (call: PostCall) => unknown = () => {
    throw httpError(500)
  }
  /** Canonical records the next ingest acknowledges (and appends to the log). */
  nextIngest: AppEvent[] = []

  constructor(workflow: WorkflowProjection) {
    this.workflow = workflow
  }

  get = async (path: string): Promise<unknown> => {
    if (path.startsWith(`${BASE}/seance/events`)) {
      const after = Number(new URL(path, 'http://x').searchParams.get('after_sequence') ?? '0')
      return {
        events: this.log.filter((event) => event.sequence > after).map(appEventToJson),
        highest_sequence: this.log.at(-1)?.sequence ?? 0,
        diagnostics: [],
      }
    }
    if (path === `${BASE}/workflow`) {
      this.workflowReads += 1
      const current = this.workflow
      if (current instanceof Error) throw current
      return typeof current === 'object' && current !== null && 'mansionId' in current ? wire(current as WorkflowProjection) : current
    }
    throw httpError(404)
  }

  post = async (path: string, body?: unknown): Promise<unknown> => {
    if (path === `${BASE}/seance/ingest`) {
      this.ingests.push({ path, body })
      const acknowledged = this.nextIngest
      this.nextIngest = []
      this.log.push(...acknowledged)
      return {
        events: acknowledged.map(appEventToJson),
        highest_sequence: this.log.at(-1)?.sequence ?? 0,
        diagnostics: [],
      }
    }
    const call = { path, body }
    this.posts.push(call)
    return this.onPost(call)
  }
}
