// Builders and a harness for Mansion Shell DOM tests (Spec 6). The projection
// comes from the real upstream derivations (`house-projection-kit`), so a test
// fixture is what the live page would hand the shell. Not shipped.
import type { ReactNode } from 'react'
import { MansionShell, type MansionShellProps, type SurfaceApi } from '../components/MansionShell'
import type { GhostSnapshot, GhostState, GhostTransition } from '../core/ghost-state'
import {
  buildHouseProjection,
  houseRoomOfGhost,
  type HouseOptions,
  type HouseProjection,
  type HouseSurfaceTarget,
  type OpenSurface,
  type RoomPresentation,
} from '../core/house-projection'
import type { PresentationDoorState, PresentationGhostState, RoomId } from '../core/house-registry'
import { PHASE_NAMES } from '../core/house-view'
import { composeUpstream, snapshot, snapshotMap, type ComposeOptions } from './house-projection-kit'
import { MANSION, doorProposal, projection as workflowProjection, riskyProposal } from './workflow-arbitraries'

export const LIVE: HouseOptions = { seanceRoom: 'locked', mode: 'live' }

/** A House Projection of a composed upstream state. */
export function houseOf(options: Partial<ComposeOptions> = {}, house: Partial<HouseOptions> = {}): HouseProjection {
  const workflow = options.workflow === undefined ? workflowProjection({ version: 20 }) : options.workflow
  return buildHouseProjection(composeUpstream({ ...options, workflow }).input, { ...LIVE, ...house })
}

/** Requirements wait at their Door (Archivist waiting); Tinker 2 asked for a risky command and is blocked. */
export const WAITING_WORKFLOW = workflowProjection({
  version: 20,
  waitingCount: 2,
  phaseOverrides: {
    requirements: { status: 'waiting', ghostIds: ['archivist'], door: { status: 'waiting', proposal: doorProposal('requirements', { createdSequence: 12 }) } },
    implementation: { status: 'working', ghostIds: ['tinker-2'] },
  },
  riskyProposals: [riskyProposal({ createdSequence: 15 })],
})
export const WAITING_SNAPSHOTS: readonly GhostSnapshot[] = [snapshot('archivist', 'done'), snapshot('tinker-2', 'waiting')]

export function waitingHouse(house: Partial<HouseOptions> = {}): HouseProjection {
  return houseOf({ workflow: WAITING_WORKFLOW, snapshots: WAITING_SNAPSHOTS }, house)
}

/** A quiet house: nothing started, nothing needs the Operator. */
export function quietHouse(house: Partial<HouseOptions> = {}): HouseProjection {
  return houseOf({}, house)
}

/** One room of a projection with its headline Door and ghost replaced, for state-cue matrices. */
export function withRoomState(
  base: HouseProjection,
  roomId: RoomId,
  change: { door?: PresentationDoorState; ghost?: PresentationGhostState },
): HouseProjection {
  const rooms = base.rooms.map((room): RoomPresentation => {
    if (room.roomId !== roomId) return room
    const door = change.door ?? room.door
    const ghost = change.ghost ?? room.ghost
    return {
      ...room,
      door,
      ghost,
      doors:
        door === 'not_applicable'
          ? []
          : [{ phase: 'design', phaseName: PHASE_NAMES.design, state: door, text: `Door text ${door}`, hint: `Door hint ${door}`, proposalId: null, phaseStatus: null, phaseText: null }],
      ghosts: ghost === 'not_applicable' ? [] : [{ ghostId: 'draughtsman', name: 'Draughtsman', state: ghost, reason: null, pendingText: null }],
    }
  })
  return { ...base, rooms }
}

let serial = 0
export function transition(ghostId: string, from: GhostState, to: GhostState): GhostTransition {
  serial += 1
  return {
    transition_id: `shell-t-${serial}` as GhostTransition['transition_id'],
    causing_event_id: `shell-e-${serial}` as GhostTransition['causing_event_id'],
    causing_sequence: serial,
    mansion_id: MANSION,
    ghost_id: ghostId,
    from_state: from,
    to_state: to,
  }
}

const NAMES: Readonly<Record<string, string>> = { archivist: 'Archivist', draughtsman: 'Draughtsman', foreman: 'Foreman', 'tinker-1': 'Tinker 1', 'tinker-2': 'Tinker 2' }
export const roomOf = (ghostId: string): RoomId | null => houseRoomOfGhost(ghostId, null)
export const nameOf = (ghostId: string): string => NAMES[ghostId] ?? ghostId

export function hostFacts(transitions: readonly GhostTransition[] = [], snapshots: readonly GhostSnapshot[] = []): MansionShellProps['host'] {
  return { mansionId: MANSION, active: true, transitions, snapshots: snapshotMap(snapshots), roomOf, nameOf, now: () => Date.now() }
}

/** Calls a test can count: a surface body offers one "decide" button per surface, and nothing else can decide. */
export interface Recorded {
  readonly decisions: HouseSurfaceTarget[]
  readonly surfaces: OpenSurface[]
}

/** A surface body with a nested opener and one explicit decision control. */
export function surfaceBody(recorded: Recorded) {
  return (surface: OpenSurface, api: SurfaceApi): ReactNode => {
    recorded.surfaces.push(surface)
    const target = surface.target
    return (
      <div data-test-body={target.kind}>
        <p>Details of {target.kind}</p>
        {target.kind === 'room' ? null : (
          <button type="button" data-opener-key={`nested:room:${target.roomId}`} onClick={(event) => api.openNested({ kind: 'room', roomId: target.roomId }, event.currentTarget)}>
            Open its room
          </button>
        )}
        {target.kind === 'room' && target.roomId === 'study' ? (
          <article data-proposal="door-requirements-1" aria-label="Requirements door">
            <button type="button" data-guide-control="approve:door-requirements-1" onClick={() => recorded.decisions.push(target)}>
              Approve
            </button>
          </article>
        ) : null}
      </div>
    )
  }
}

export function Shell({ projection, recorded, ...props }: { projection: HouseProjection; recorded: Recorded } & Partial<MansionShellProps>) {
  return <MansionShell projection={projection} renderSurface={surfaceBody(recorded)} host={hostFacts()} {...props} />
}

export const newRecorded = (): Recorded => ({ decisions: [], surfaces: [] })

/** A controllable `matchMedia` for the reduced-motion query. */
export function installMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<(event: { matches: boolean }) => void>()
  const list = {
    get matches() {
      return matches
    },
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
  }
  const original = window.matchMedia
  window.matchMedia = (() => list) as unknown as typeof window.matchMedia
  return {
    set(next: boolean) {
      matches = next
      for (const listener of [...listeners]) listener({ matches })
    },
    listeners,
    restore() {
      window.matchMedia = original
    },
  }
}
