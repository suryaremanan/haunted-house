// Builders for House Projection tests (Spec 6). They compose the real upstream
// seams (Spec 4 `deriveAuthority` and `houseRooms`, Spec 5 `joinRoomProjection`)
// so a test input is what the live page would hand over. Not shipped.
import type { GhostSnapshot, GhostState } from '../core/ghost-state'
import type { UpstreamHouseInput, UpstreamReplay } from '../core/house-projection'
import { deriveAuthority, houseRooms, type Authority, type CanonicalHealth, type ProjectionStatus } from '../core/house-view'
import type { MansionDescriptor } from '../core/mansion-api'
import type { RoomGhosts } from '../core/room-projection'
import { joinRoomProjection, type RoomGhostsStatus, type RoomProjection } from '../core/room-view'
import type { WorkflowProjection } from '../core/workflow-projection'
import { SPEC } from './room-kit'
import { MANSION } from './workflow-arbitraries'

export const MANSION_DESCRIPTOR: MansionDescriptor = {
  name: MANSION,
  projectSpec: SPEC,
  displayPath: `~/workspace/haunted-house/mansions/${MANSION}`,
  status: 'ready',
}

export function snapshot(ghostId: string, state: GhostState, overrides: Partial<GhostSnapshot> = {}): GhostSnapshot {
  return {
    mansion_id: MANSION,
    ghost_id: ghostId,
    run_id: `${ghostId}-run`,
    run_sequence: 0,
    state,
    pending_approvals: [],
    open_tools: [],
    latest_event_id: null,
    latest_sequence: 1,
    reason: null,
    ...overrides,
  }
}

export function snapshotMap(snapshots: readonly GhostSnapshot[]): ReadonlyMap<string, GhostSnapshot> {
  return new Map(snapshots.map((item) => [item.ghost_id, item]))
}

export const VALID_REPLAY: UpstreamReplay = { integrity: 'valid', validRecordCount: 0, diagnostics: [] }

/** A canonical log that is loaded, current and has no problem at the given version. */
export function healthyCanonical(version: number): CanonicalHealth {
  return { loaded: true, catchingUp: false, highestSequence: version, diagnostic: null }
}

export interface ComposeOptions {
  readonly workflow: WorkflowProjection | null
  readonly workflowStatus?: ProjectionStatus
  readonly canonical?: CanonicalHealth
  readonly snapshots?: readonly GhostSnapshot[]
  /** The Spec 5 answer. `undefined` leaves the joined rooms out, as before Spec 5 answered at all. */
  readonly roomGhosts?: RoomGhosts | null
  readonly roomGhostsStatus?: RoomGhostsStatus
  readonly replay?: UpstreamReplay
  readonly mansion?: MansionDescriptor
  readonly readOnly?: boolean
  readonly ghostNames?: Readonly<Record<string, string>>
}

export interface Composed {
  readonly input: UpstreamHouseInput
  readonly authority: Authority
  readonly joined: ReadonlyMap<string, RoomProjection>
}

/** Runs the upstream derivations the live page runs and returns the House Projection input. */
export function composeUpstream(options: ComposeOptions): Composed {
  const workflow = options.workflow
  const workflowStatus = options.workflowStatus ?? (workflow === null ? 'loading' : 'ready')
  const ghosts = snapshotMap(options.snapshots ?? [])
  const authority = deriveAuthority({
    projection: workflow,
    projectionStatus: workflowStatus,
    canonical: options.canonical ?? healthyCanonical(workflow?.version ?? 0),
    readOnly: options.readOnly,
  })
  const joined = new Map<string, RoomProjection>()
  if (options.roomGhosts !== undefined) {
    for (const room of houseRooms(workflow, ghosts.values(), options.ghostNames)) {
      joined.set(
        room.id,
        joinRoomProjection({
          room,
          specName: SPEC,
          projection: workflow,
          snapshots: ghosts,
          roomGhosts: options.roomGhosts,
          roomGhostsStatus: options.roomGhostsStatus ?? (options.roomGhosts === null ? 'loading' : 'ready'),
          authority,
          inFlight: null,
          names: options.ghostNames,
        }),
      )
    }
  }
  return {
    authority,
    joined,
    input: {
      mansion: options.mansion ?? MANSION_DESCRIPTOR,
      workflow,
      authority,
      ghosts,
      rooms: joined,
      replay: options.replay ?? VALID_REPLAY,
      ghostNames: options.ghostNames,
    },
  }
}
